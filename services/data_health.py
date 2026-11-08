"""Public health observations, never a competing provider scheduler.

Only allowlisted values leave this boundary; errors are codes, not exceptions.
"""
from __future__ import annotations

import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path

POLICY = json.loads((Path(__file__).resolve().parents[1] / 'data/health/policy.json').read_text(encoding='utf-8'))
PATHS = {'gp': 'gp/GP.meta.json', 'tle': 'tle/TLE.meta.json', 'satcat': 'satcat.meta.json',
         'tracked': 'tracked/TRACKED.meta.json', 'launch': 'launches/launches.meta.json', 'decay': 'decayed/decayed.meta.json'}
LABELS = dict(gp='GP / OMM', tle='TLE', satcat='SATCAT', tracked='Tracked objects', launch='Launches', decay='Confirmed decays')


def timestamp(value):
    if not isinstance(value, str) or len(value) > 40:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z') if parsed.tzinfo else None
    except ValueError:
        return None


def revision(meta):
    value = meta.get('catalog_revision') or meta.get('dataset_hash') or meta.get('manifest_hash')
    return value if isinstance(value, str) and re.fullmatch(r'(?:sha256:)?[a-f0-9]{64}', value) else None


def build_health(metadata, status=None, *, now=None, mode='live', environ=None):
    now = now or datetime.now(timezone.utc)
    environ = os.environ if environ is None else environ
    status = status or {}
    rows, diagnostics = {}, []
    for name in PATHS:
        meta = metadata.get(name) or {}
        live = (status.get('dataset_status') or {}).get({'launch': 'launches', 'decay': 'decayed'}.get(name, name)) or {}
        threshold = POLICY['thresholdHours'][name]
        try:
            configured = float(environ.get('OPENBEXI_HEALTH_' + name.upper() + '_HOURS', threshold))
            if math.isfinite(configured):
                threshold = max(POLICY['minimumThresholdHours'], min(POLICY['maximumThresholdHours'], configured))
        except (TypeError, ValueError):
            pass
        content = next((stamp for key in ('content_timestamp', 'fetched_at', 'retrieval_timestamp', 'built_at', 'derived_at')
                        if (stamp := timestamp(meta.get(key)))), None)
        checked = timestamp(meta.get('last_success_at')) or timestamp(meta.get('revalidated_at'))
        def age(stamp):
            return round(max(0, (now - datetime.fromisoformat(stamp.replace('Z', '+00:00'))).total_seconds() / 3600), 3) if stamp else None
        age_hours = age(checked)
        rev = revision(meta)
        # Live status has already validated the selected closure. A sidecar's
        # self-reported revision must never resurrect a rejected payload.
        if name in (status.get('datasets') or {}):
            rev = (status['datasets'][name] or {}).get('revision') or None
        partial = meta.get('partial_update') is True or meta.get('source_status') == 'PARTIAL'
        paused = bool((status.get('last_result') or {}).get('provider_blocked'))
        failed = paused or bool(meta.get('last_error') or live.get('last_error') or live.get('errors')) or live.get('state') in ('failed', 'degraded') or meta.get('last_status') in ('failed', 'failure', 'error', 'degraded')
        state = 'unavailable' if not rev else 'unknown' if checked is None else 'stale' if age_hours > threshold else 'degraded' if failed else 'partial' if partial else 'current'
        reason = ('missing_revision' if not rev else 'check_time_unknown' if checked is None else 'refresh_overdue' if state == 'stale'
                  else 'update_failed' if failed else 'partial_source' if partial else 'admitted_source_checked')
        if meta.get('_health_error') in ('storage_unavailable', 'invalid_metadata'):
            reason = meta['_health_error']
        rows[name] = dict(label=LABELS[name], revision=rev, contentAt=content, checkedAt=checked,
                          attemptedAt=timestamp(live.get('last_attempt_at')) or timestamp(meta.get('last_attempt_at')),
                          nextPermittedAttemptAt=None if paused else timestamp(live.get('next_allowed_at')),
                          nextScheduledCheckAt=timestamp(live.get('next_due_at')) or timestamp(status.get('next_check_at')),
                          thresholdHours=threshold, checkAgeHours=age_hours, contentAgeHours=age(content),
                          coverage='partial' if partial else 'limited' if rev else 'unknown',
                          coverageScope='Admitted provider records; global completeness is not asserted.',
                          state=state, updateState='paused' if paused else 'degraded' if failed else 'idle', reason='provider_paused' if paused else reason,
                          dependencies=POLICY['dependencies'].get(name, []))
    for name, dependencies in POLICY['dependencies'].items():
        row, meta = rows[name], metadata.get(name) or {}
        mismatches = [key for key in dependencies if meta.get('source_' + key + '_revision') and rows[key]['revision']
                      and meta['source_' + key + '_revision'] != rows[key]['revision']]
        verified = bool(row['revision']) and all(rows[key]['revision'] and meta.get('source_' + key + '_revision') == rows[key]['revision'] for key in dependencies)
        row['lineageState'] = 'mismatch' if mismatches else 'verified' if verified else 'unknown'
        row['freshnessAt'] = row['checkedAt']
        row['freshnessAgeHours'] = row['checkAgeHours']
        # Unchanged derived bytes remain valid when their exact admitted inputs
        # are revalidated. Preserve the product's own check/content timestamps.
        if verified and all(rows[key]['checkedAt'] for key in dependencies):
            instant = lambda value: datetime.fromisoformat(value.replace('Z', '+00:00'))
            source_check = min((rows[key]['checkedAt'] for key in dependencies), key=instant)
            if row['checkedAt'] and instant(source_check) > instant(row['checkedAt']):
                row['freshnessAt'] = source_check
                row['freshnessAgeHours'] = round(max(0, (now - datetime.fromisoformat(source_check.replace('Z', '+00:00'))).total_seconds() / 3600), 3)
                if row['state'] == 'stale' and row['freshnessAgeHours'] <= row['thresholdHours']:
                    row['state'] = 'degraded' if row['updateState'] != 'idle' else 'partial' if row['coverage'] == 'partial' else 'current'
                    row['reason'] = 'update_failed' if row['updateState'] != 'idle' else 'source_revalidated'
        issues = [key for key in dependencies if rows[key]['state'] in ('stale', 'unavailable', 'unknown', 'degraded')]
        row['dependencyIssues'] = sorted(set(issues + mismatches))
        if row['dependencyIssues'] and row['state'] not in ('stale', 'unavailable', 'unknown'):
            row.update(state='degraded', reason='source_revision_mismatch' if mismatches else 'source_dependency_unhealthy')
    for name, row in rows.items():
        if row['state'] != 'current':
            diagnostics.append(dict(dataset=name, code=row['reason'], state=row['state']))
    states = [row['state'] for row in rows.values()]
    state = next((key for key in ('unavailable', 'stale', 'degraded', 'unknown', 'partial') if key in states), 'current')
    return dict(schemaVersion=1, observedAt=now.isoformat().replace('+00:00', 'Z'), clock='wall-utc',
                mode=mode, state='snapshot' if mode == 'snapshot' else state, datasets=rows, diagnostics=diagnostics)


def health_from_root(root, status=None, *, snapshot=False):
    metadata = {}
    for name, path in PATHS.items():
        try:
            with (Path(root) / 'json' / path).open('rb') as handle:
                raw = handle.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ValueError('metadata too large')
            value = json.loads(raw)
            metadata[name] = value if isinstance(value, dict) else {}
        except FileNotFoundError:
            metadata[name] = {}
        except OSError:
            metadata[name] = {'_health_error': 'storage_unavailable'}
        except (ValueError, UnicodeError):
            metadata[name] = {'_health_error': 'invalid_metadata'}
    return build_health(metadata, status, mode='snapshot' if snapshot else 'live')
