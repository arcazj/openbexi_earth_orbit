// Public health contract v1. Source age always uses wall UTC, never simulation time.
const LABELS = { gp: 'GP / OMM', tle: 'TLE', satcat: 'SATCAT', tracked: 'Tracked objects', launch: 'Launches', decay: 'Confirmed decays' };
const REASONS = {
    source_revalidated: 'The exact accepted inputs were revalidated; derived content is unchanged.',
    source_revision_mismatch: 'This derived dataset uses an older source revision and needs rebuilding.',
    storage_unavailable: 'Source metadata could not be read from storage. An operator should check disk access and capacity.',
    invalid_metadata: 'Source metadata failed validation; no freshness claim is available.',
    provider_paused: 'Provider updates are paused. An operator must review the failure and explicitly resume requests.',
    missing_revision: 'No accepted source revision.', check_time_unknown: 'Last successful check is unknown.',
    refresh_overdue: 'The successful check is older than its freshness threshold.',
    update_failed: 'The last update failed; accepted data is retained.',
    partial_source: 'Some source records or elements are unavailable.',
    admitted_source_checked: 'The admitted source was checked; global completeness is not asserted.',
    source_dependency_unhealthy: 'A source used to build this dataset needs attention.'
};
const stamp = value => typeof value === 'string' && value.length <= 40 && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const age = (value, now) => value ? Math.max(0, (now - Date.parse(value)) / 3600000) : null;

export function staticDataHealth(metadata, policy, now = Date.now()) {
    const datasets = {};
    for (const [key, label] of Object.entries(LABELS)) {
        const meta = metadata[key] || {};
        const candidate = meta.catalog_revision || meta.dataset_hash || meta.manifest_hash;
        const revision = typeof candidate === 'string' && /^(?:sha256:)?[a-f0-9]{64}$/.test(candidate) ? candidate : null;
        const contentAt = stamp(meta.content_timestamp || meta.fetched_at || meta.retrieval_timestamp || meta.built_at || meta.derived_at);
        const checkedAt = stamp(meta.last_success_at || meta.revalidated_at);
        const thresholdHours = policy?.thresholdHours?.[key] ?? null;
        const checkAgeHours = age(checkedAt, now);
        const partial = meta.partial_update === true || meta.source_status === 'PARTIAL';
        const failed = !!meta.last_error || ['failed', 'failure', 'error', 'degraded'].includes(meta.last_status);
        const state = !revision ? 'unavailable' : !checkedAt || !thresholdHours ? 'unknown'
            : checkAgeHours > thresholdHours ? 'stale' : failed ? 'degraded' : partial ? 'partial' : 'current';
        datasets[key] = { label, revision, contentAt, checkedAt, attemptedAt: stamp(meta.last_attempt_at),
            nextPermittedAttemptAt: null, nextScheduledCheckAt: null, thresholdHours, checkAgeHours, contentAgeHours: age(contentAt, now),
            coverage: revision ? partial ? 'partial' : 'limited' : 'unknown', state,
            coverageScope: 'Admitted provider records; global completeness is not asserted.', updateState: failed ? 'degraded' : 'idle',
            reason: state === 'stale' ? 'refresh_overdue' : state === 'degraded' ? 'update_failed' : state === 'partial' ? 'partial_source'
                : state === 'unavailable' ? 'missing_revision' : state === 'unknown' ? 'check_time_unknown' : 'admitted_source_checked',
            dependencies: policy?.dependencies?.[key] || [] };
    }
    for (const [name, row] of Object.entries(datasets)) {
        if (!row.dependencies.length) continue;
        const meta = metadata[name] || {};
        const mismatches = row.dependencies.filter(key => meta[`source_${key}_revision`] && datasets[key]?.revision && meta[`source_${key}_revision`] !== datasets[key].revision);
        const verified = !!row.revision && row.dependencies.every(key => datasets[key]?.revision && meta[`source_${key}_revision`] === datasets[key].revision);
        row.lineageState = mismatches.length ? 'mismatch' : verified ? 'verified' : 'unknown';
        row.freshnessAt = row.checkedAt; row.freshnessAgeHours = row.checkAgeHours;
        if (verified && row.dependencies.every(key => datasets[key].checkedAt)) {
            const checked = row.dependencies.map(key => datasets[key].checkedAt).sort()[0];
            if (row.checkedAt && checked > row.checkedAt) {
                row.freshnessAt = checked; row.freshnessAgeHours = age(checked, now);
                if (row.state === 'stale' && row.freshnessAgeHours <= row.thresholdHours) {
                    row.state = meta.last_error || ['failed', 'failure', 'error', 'degraded'].includes(meta.last_status) ? 'degraded' : row.coverage === 'partial' ? 'partial' : 'current';
                    row.reason = row.state === 'degraded' ? 'update_failed' : 'source_revalidated';
                }
            }
        }
        row.dependencyIssues = [...new Set([...mismatches, ...row.dependencies.filter(key => ['stale', 'unavailable', 'unknown', 'degraded'].includes(datasets[key]?.state))])];
        if (row.dependencyIssues.length && !['stale', 'unavailable', 'unknown'].includes(row.state)) {
            row.state = 'degraded'; row.reason = mismatches.length ? 'source_revision_mismatch' : 'source_dependency_unhealthy';
        }
    }
    const diagnostics = Object.entries(datasets).filter(([, row]) => row.state !== 'current').map(([dataset, row]) => ({ dataset, code: row.reason, state: row.state }));
    return { schemaVersion: 1, observedAt: new Date(now).toISOString(), clock: 'wall-utc', mode: 'snapshot', state: 'snapshot', datasets, diagnostics };
}

export function renderDataHealth(health, documentObj = globalThis.document) {
    if (health?.schemaVersion !== 1) return null;
    const entries = Object.entries(health.datasets || {}).filter(([key]) => key in LABELS);
    const stale = entries.some(([, row]) => row.state === 'stale');
    const issue = entries.some(([, row]) => ['unavailable', 'unknown', 'degraded'].includes(row.state));
    const summary = health.mode === 'snapshot' ? `Packaged snapshot${stale ? ' · some sources are old' : ''}.`
        : stale ? 'Some sources are old; saved data is in use.'
        : issue ? 'Some sources need attention; saved data is in use.'
        : 'Sources checked · coverage is limited.';
    const container = documentObj?.getElementById('dataHealthRows');
    const panel = container?.parentElement;
    if (panel && !panel.dataset.keyboardBound) {
        panel.dataset.keyboardBound = 'true';
        panel.addEventListener('keydown', event => {
            if (event.target !== panel) return;
            const movement = { ArrowDown: 48, ArrowUp: -48, PageDown: panel.clientHeight * .85, PageUp: -panel.clientHeight * .85 };
            if (event.key in movement || ['Home', 'End'].includes(event.key)) {
                event.preventDefault();
                panel.scrollTop = event.key === 'Home' ? 0 : event.key === 'End' ? panel.scrollHeight : panel.scrollTop + movement[event.key];
            }
        });
    }
    if (container) {
        const signature = JSON.stringify(entries.map(([key, row]) => [key, row.state, row.revision, row.contentAt, row.checkedAt, row.freshnessAt, row.lineageState, Math.floor(row.checkAgeHours ?? -1), row.attemptedAt, row.nextPermittedAttemptAt, row.nextScheduledCheckAt, row.thresholdHours, row.reason, row.coverage]));
        if (container.dataset.signature !== signature) {
            const nodes = entries.map(([key, row]) => {
                const section = documentObj.createElement('section');
                const heading = documentObj.createElement('h3');
                heading.textContent = `${LABELS[key]} · ${row.state} · ${row.coverage} coverage`;
                section.append(heading);
                const fields = [
                    ['Content obtained', row.contentAt], ['Successful check', row.checkedAt],
                    ['Age since check', Number.isFinite(row.checkAgeHours) ? `${Math.floor(row.checkAgeHours)} hours` : null],
                    ...(row.dependencies?.length ? [['Source linkage', row.lineageState || 'Unknown'], ['Freshness verified', row.freshnessAt]] : []),
                    ['Last attempt', row.attemptedAt], ['Next permitted attempt', health.mode === 'snapshot' ? 'No scheduled updates in static mode' : row.nextPermittedAttemptAt],
                    ['Next scheduled check', health.mode === 'snapshot' ? 'None' : row.nextScheduledCheckAt],
                    ['Freshness threshold', row.thresholdHours ? `${row.thresholdHours} hours` : null],
                    ['Revision', row.revision], ['Status', REASONS[row.reason] || 'Source state is unknown.']
                ];
                const list = documentObj.createElement('dl');
                for (const [name, value] of fields) {
                    const term = documentObj.createElement('dt'), description = documentObj.createElement('dd');
                    term.textContent = name; description.textContent = value || 'Unknown'; list.append(term, description);
                }
                section.append(list); return section;
            });
            container.replaceChildren(...nodes); container.dataset.signature = signature;
        }
    }
    return { summary, warning: stale || issue };
}
