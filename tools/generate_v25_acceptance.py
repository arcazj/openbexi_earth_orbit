"""Freeze disjoint, off-grid Horizons holdouts. Network access is generation-only.

Run serially; failed requests retain a resumable private response cache. A new
round is required after tuning against a failed acceptance round.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from generate_jpl_ephemeris import BODIES, EPHEMERIS_FILE, HORIZONS_URL, ROOT, parse_horizons_csv
from generate_jpl_orbit_guides import stamp, utc


def digest(data):
    return hashlib.sha256(data).hexdigest()


def epochs(times, body, purpose, round_number):
    # Independent of runtime values and the 17 midpoint tuning samples. Cover
    # both edge intervals and 30 strata, with deterministic subinterval offsets.
    count = len(times) - 1
    result = []
    for index in range(32):
        seed = hashlib.sha256(f'v25:{round_number}:{purpose}:{body}:{index}'.encode()).digest()
        fraction = .11 + int.from_bytes(seed[:4], 'big') / 2**32 * .78
        interval = 0 if index == 0 else count - 1 if index == 31 else min(count - 1, int((index - .5) * count / 30))
        left, right = utc(times[interval]), utc(times[interval + 1])
        seconds = max(1, round((right - left).total_seconds() * fraction))
        result.append(stamp(left + timedelta(seconds=seconds)))
    if len(set(result)) != 32 or any(value in set(times) for value in result):
        raise ValueError('Holdout epochs must be distinct and off grid')
    return sorted(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--round', type=int, default=1)
    args = parser.parse_args()
    destination = ROOT / f'validation/v2.5.0/horizons-round-{args.round}.json'
    if destination.exists():
        raise SystemExit('Frozen output already exists; use a new round, never overwrite it.')
    cache = ROOT / 'runtime/v25-horizons-cache'
    cache.mkdir(parents=True, exist_ok=True)
    playback = json.loads(EPHEMERIS_FILE.read_text(encoding='utf-8'))
    guide_root = ROOT / 'data/ephemeris/orbits'
    guide_manifest = json.loads((guide_root / 'manifest.json').read_text(encoding='utf-8'))
    output = dict(schemaVersion=1, round=args.round, purpose='untuned acceptance holdouts',
                  generatedAt=stamp(datetime.now(timezone.utc)), provider=HORIZONS_URL,
                  referenceSeparation='Separate queries to the same JPL physical model; not independent scientific approval.',
                  reviewStatus='pending', frames='Sun-centered ICRF, ECLIPTIC, geometric',
                  timeScale='UTC (Horizons UT)', units='km and km/s', requests=[], samples=[])
    for purpose in ('playback', 'guide'):
        for body, name, command, _category in BODIES:
            if purpose == 'guide' and body == 'moon':
                continue
            path = EPHEMERIS_FILE if purpose == 'playback' else guide_root / guide_manifest['bodies'][body]['file']
            table = playback if purpose == 'playback' else json.loads(path.read_text(encoding='utf-8'))
            dates = epochs(table['times'], body, purpose, args.round)
            params = dict(format='json', COMMAND=command, EPHEM_TYPE='VECTORS', CENTER='500@10',
                          VEC_TABLE='2', CSV_FORMAT='YES', OUT_UNITS='KM-S', REF_SYSTEM='ICRF',
                          REF_PLANE='ECLIPTIC', TIME_TYPE='UT', CAL_TYPE='GREGORIAN', VEC_CORR='NONE',
                          TIME_DIGITS='SECONDS', TLIST_TYPE='CAL',
                          TLIST=' '.join("'" + utc(date).strftime('%Y-%b-%d %H:%M:%S') + "'" for date in dates))
            request_hash = digest(json.dumps(params, sort_keys=True).encode())
            cached = cache / (request_hash + '.json')
            print(f'{purpose}: {name}, 32 off-grid epochs', flush=True)
            if not cached.exists():
                with urllib.request.urlopen(HORIZONS_URL + '?' + urllib.parse.urlencode(params), timeout=120) as response:
                    raw = response.read()
                payload = json.loads(raw)
                if payload.get('error') or 'result' not in payload:
                    raise RuntimeError(f'Horizons rejected query for {body}')
                cached.write_bytes(raw)
            raw = cached.read_bytes()
            payload = json.loads(raw)
            rows = parse_horizons_csv(payload['result'])
            if [row['dateUtc'] for row in rows] != dates:
                raise RuntimeError(f'Reference times differ for {body}')
            output['requests'].append(dict(body=body, purpose=purpose, parameters=params, signature=payload.get('signature'),
                                           requestSha256=request_hash, responseSha256=digest(raw),
                                           providerHeader=payload['result'].split('$$SOE')[0],
                                           tablePath=path.relative_to(ROOT).as_posix(), tableSha256=digest(path.read_bytes())))
            output['samples'].extend(dict(body=body, purpose=purpose, **row) for row in rows)
    destination.parent.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(output, indent=2) + '\n').encode()
    destination.write_bytes(encoded)
    destination.with_suffix('.sha256').write_text(digest(encoded) + '  ' + destination.name + '\n', encoding='utf-8')
    print(f'Frozen {len(output["samples"])} samples: {destination.name}', flush=True)


if __name__ == '__main__':
    main()
