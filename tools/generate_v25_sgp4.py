"""Generate synthetic OMM holdouts using MIT python-sgp4 2.25, never live data.

Install with --target runtime/v25-validation-tools; runtime has no dependency.
"""
import hashlib
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'runtime/v25-validation-tools'))
import sgp4
from sgp4.api import Satrec, accelerated
from sgp4.omm import initialize

assert sgp4.__version__ == '2.25'
cases = []
for i, (name, motion, eccentricity, inclination, bstar, epoch) in enumerate([
    ('near-earth', 15.31, .0023, 51.7, .00012, '2024-02-29T23:59:59.000000'),
    ('polar-negative-bstar', 14.22, .011, 98.3, -.00003, '2056-12-31T23:59:59.000000'),
    ('deep-space-meo', 2.12, .02, 56.2, 0, '2000-02-29T00:00:00.000000'),
    ('half-day-resonance', 2.006, .71, 63.4, .000001, '2026-11-07T12:34:56.000000'),
    ('synchronous-resonance', 1.0027, .00013, .08, 0, '2020-01-01T00:00:00.000000'),
    ('eccentric-near-earth', 6.11, .5, 28.7, .00002, '2035-12-30T23:59:59.000000'),
]):
    fields = dict(OBJECT_NAME='SYNTHETIC ' + name, OBJECT_ID=f'2026-999{i:03d}A', NORAD_CAT_ID=330000+i,
                  EPOCH=epoch, MEAN_MOTION=motion, ECCENTRICITY=eccentricity, INCLINATION=inclination,
                  RA_OF_ASC_NODE=31.71+i*17, ARG_OF_PERICENTER=53.9+i*21, MEAN_ANOMALY=17.3+i*13,
                  EPHEMERIS_TYPE=0, CLASSIFICATION_TYPE='U', ELEMENT_SET_NO=1, REV_AT_EPOCH=1,
                  BSTAR=bstar, MEAN_MOTION_DOT=0, MEAN_MOTION_DDOT=0)
    sat = Satrec()
    initialize(sat, fields)
    samples = []
    for minutes in (-4320, -1440.25, -.5, 0, .5, 123.456, 1440.25, 4320):
        error, position, velocity = sat.sgp4_tsince(minutes)
        assert error == 0, (name, error)
        samples.append(dict(minutesSinceEpoch=minutes, positionKm=position, velocityKmS=velocity))
    cases.append(dict(name=name, omm=fields, samples=samples))
payload = dict(schemaVersion=1, source='python-sgp4', version=sgp4.__version__, accelerated=accelerated,
               license='MIT', sourceUrl='https://pypi.org/project/sgp4/2.25/',
               gravityModel='WGS72', operationMode='i', frame='TEME', timeScale='UTC',
               inputRights='Original synthetic project-authored OMM; no copied official reference inputs',
               independence='Separate implementation of the shared Vallado SGP4 model; not independent physical-model validation',
               positionLimitKm=.005, velocityLimitKmS=.000005, reviewStatus='pending', cases=cases)
path = ROOT / 'validation/v2.5.0/sgp4-holdouts.json'
if path.exists():
    raise SystemExit('Frozen holdouts already exist')
data = (json.dumps(payload, indent=2) + '\n').encode()
path.write_bytes(data)
path.with_suffix('.sha256').write_text(hashlib.sha256(data).hexdigest() + '  ' + path.name + '\n', encoding='utf-8')
print('Frozen 48 independent-implementation SGP4 comparisons')
