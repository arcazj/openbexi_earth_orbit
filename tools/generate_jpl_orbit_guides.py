"""Build JPL trajectory guides without changing the validated playback table.

Per-body cadences are refined against independent off-grid Horizons samples.
Requests are serial, cached for resumability, and split into <=100-year spans.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from .generate_jpl_ephemeris import BODIES, EPHEMERIS_FILE, HORIZONS_URL, ROOT, parse_horizons_csv
except ImportError:
    from generate_jpl_ephemeris import BODIES, EPHEMERIS_FILE, HORIZONS_URL, ROOT, parse_horizons_csv

PERIOD_DAYS = dict(zip(
    ('mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'),
    (87.969, 224.701, 365.256, 686.98, 4332.59, 10759.22, 30685.4, 60189.0)))
INITIAL_STEP_DAYS = dict(zip(PERIOD_DAYS, (2, 4, 4, 8, 8, 16, 32, 32)))
GUIDE_ERROR_KM = 100.0  # Display-guide sampled regression limit, not playback accuracy.


def utc(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def stamp(value):
    return value.strftime('%Y-%m-%dT%H:%M:%SZ')


def request_spans(start, stop, step_days):
    """Align adjacent chunks to the same sampling grid; overlap one endpoint."""
    span = timedelta(days=math.floor(36525 / step_days) * step_days)
    while start < stop:
        end = min(stop, start + span)
        yield start, end
        start = end


def query(command, cache, refresh=False, **times):
    params = dict(format='json', COMMAND=command, EPHEM_TYPE='VECTORS', CENTER='500@10',
                  VEC_TABLE='2', CSV_FORMAT='YES', OUT_UNITS='KM-S', REF_SYSTEM='ICRF',
                  REF_PLANE='ECLIPTIC', TIME_TYPE='UT', CAL_TYPE='GREGORIAN', VEC_CORR='NONE', **times)
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
    path = cache / f'{key}.json'
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding='utf-8'))
    url = HORIZONS_URL + '?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=120) as response:
        payload = json.load(response)
    if payload.get('error') or 'result' not in payload:
        raise RuntimeError(f'Horizons rejected guide query: {payload.get("error", payload)}')
    rows = parse_horizons_csv(payload['result'])
    cache.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, separators=(',', ':')), encoding='utf-8')
    return rows


def fetch_table(command, start, stop, step_days, cache, refresh):
    rows = []
    for lo, hi in request_spans(start, stop, step_days):
        part = query(command, cache, refresh, START_TIME=f"'{stamp(lo)}'", STOP_TIME=f"'{stamp(hi)}'",
                     STEP_SIZE=f"'{round(step_days * 24)}h'")
        if utc(part[0]['dateUtc']) != lo or utc(part[-1]['dateUtc']) != hi:
            raise RuntimeError('Horizons did not return the complete requested guide span')
        if rows:
            if rows[-1] != part[0]:
                raise RuntimeError('Adjacent Horizons guide chunks disagree')
            part = part[1:]
        rows.extend(part)
    expected = (stop - start).total_seconds() / (step_days * 86400) + 1
    if len(rows) != round(expected):
        raise RuntimeError('Guide sampling grid is incomplete')
    return rows


def hermite_position(left, right, time):
    seconds = (utc(right['dateUtc']) - utc(left['dateUtc'])).total_seconds()
    t = (time - utc(left['dateUtc'])).total_seconds() / seconds
    a, b = left['vector'], right['vector']
    return [(2*t**3-3*t*t+1)*a[i] + (t**3-2*t*t+t)*seconds*a[i+3]
            + (-2*t**3+3*t*t)*b[i] + (t**3-t*t)*seconds*b[i+3] for i in range(3)]


def validate_samples(command, rows, cache, refresh):
    indices = sorted({round((len(rows)-2)*i/16) for i in range(17)})
    dates = [utc(rows[i]['dateUtc']) + (utc(rows[i+1]['dateUtc'])-utc(rows[i]['dateUtc']))/2 for i in indices]
    samples = query(command, cache, refresh, TLIST_TYPE='CAL',
                    TLIST=' '.join("'" + date.strftime('%Y-%b-%d %H:%M:%S') + "'" for date in dates))
    if [row['dateUtc'] for row in samples] != [stamp(date) for date in dates]:
        raise RuntimeError('Independent guide reference epochs do not match')
    errors = [math.dist(hermite_position(rows[i], rows[i+1], date), sample['vector'][:3])
              for i, date, sample in zip(indices, dates, samples)]
    return samples, max(errors)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--playback', type=Path, default=EPHEMERIS_FILE)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'data/ephemeris/orbits')
    parser.add_argument('--cache-dir', type=Path, default=ROOT / 'runtime/jpl-orbit-guides')
    parser.add_argument('--refresh', action='store_true', help='Requery Horizons instead of reusing generation cache')
    args = parser.parse_args()
    playback = json.loads(args.playback.read_text(encoding='utf-8'))
    start, stop = utc(playback['times'][0]), utc(playback['times'][-1])
    manifest = {'schemaVersion': 1, 'source': HORIZONS_URL, 'purpose': 'orbit-guides-only',
                'playbackCoverage': {'startUtc': stamp(start), 'stopUtc': stamp(stop)}, 'bodies': {}}
    pending = []
    for key, name, command, category in BODIES:
        if key == 'moon':
            continue
        step = INITIAL_STEP_DAYS[key]
        for attempt in range(5):
            # Padding also covers nonuniform angular motion in eccentric orbits.
            lo = start - timedelta(days=math.ceil(PERIOD_DAYS[key] * .75))
            duration = (stop - lo).total_seconds()/86400 + PERIOD_DAYS[key]*.75
            hi = lo + timedelta(days=math.ceil(duration/step)*step)
            print(f'{name}: {stamp(lo)} to {stamp(hi)}, {step:g}-day samples', flush=True)
            rows = fetch_table(command, lo, hi, step, args.cache_dir, args.refresh)
            references, error = validate_samples(command, rows, args.cache_dir, args.refresh)
            print(f'  {len(rows)} vectors; {len(references)} off-grid samples, worst {error:.3f} km', flush=True)
            if error <= GUIDE_ERROR_KM:
                break
            step /= 2
        else:
            raise RuntimeError(f'{name} guide did not satisfy its sampled interpolation limit')
        data = {
            'metadata': {'purpose': 'orbit-guides-only', 'source': 'NASA/JPL Horizons API', 'sourceUrl': HORIZONS_URL,
                         'generatedAtUtc': stamp(datetime.now(timezone.utc)), 'bodyKey': key,
                         'dateRange': {'startUtc': rows[0]['dateUtc'], 'stopUtc': rows[-1]['dateUtc']},
                         'referenceFrame': 'ICRF', 'referencePlane': 'ECLIPTIC', 'center': '500@10',
                         'timeScale': 'UTC (Horizons TIME_TYPE=UT)', 'vectorCorrection': 'NONE',
                         'sampleStepDays': step, 'nominalPeriodDays': PERIOD_DAYS[key],
                         'units': 'km and km/s', 'runtimeRemoteFetch': False},
            'times': [row['dateUtc'] for row in rows],
            'bodies': {key: {'name': name, 'horizonsCommand': command, 'category': category,
                             'vectors': [row['vector'] for row in rows]}},
            'validation': {'purpose': 'Sampled display-guide interpolation regression, not a global accuracy bound',
                           'positionLimitKm': GUIDE_ERROR_KM, 'worstSampledErrorKm': error, 'samples': references}}
        payload = json.dumps(data, separators=(',', ':')).encode('utf-8')
        digest = hashlib.sha256(payload).hexdigest()
        filename = f'{key}-{digest[:16]}.json'
        manifest['bodies'][key] = {'file': filename, 'sha256': digest, 'bytes': len(payload)}
        pending.append((filename, payload))
    # Publish the manifest last, retaining the previous complete guide set on request failures.
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for filename, payload in pending:
        (args.output_dir / filename).write_bytes(payload)
    temporary = args.output_dir / 'manifest.json.tmp'
    temporary.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    temporary.replace(args.output_dir / 'manifest.json')
    print(f'Published {len(pending)} guide files, {sum(len(payload) for _, payload in pending):,} bytes', flush=True)


if __name__ == '__main__':
    main()
