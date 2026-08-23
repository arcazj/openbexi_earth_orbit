import assert from 'node:assert/strict';
import {
  SATELLITE_CATEGORY_OPTIONS,
  isAllSatelliteCategorySelection,
  isDebrisSatellite,
  normalizeSatelliteCategorySelection,
  satelliteCategory,
  satelliteMatchesCategorySelection,
  toggleSatelliteCategorySelection
} from '../js/satelliteCategoryFilter.js';

assert.deepEqual(
  normalizeSatelliteCategorySelection('ALL'),
  ['ALL'],
  'ALL stays a single exclusive state'
);
assert.equal(isAllSatelliteCategorySelection(SATELLITE_CATEGORY_OPTIONS), true);

let selection = ['MEO'];
selection = toggleSatelliteCategorySelection(selection, 'LEO');
assert.deepEqual(selection, ['MEO', 'LEO'], 'specific categories form a union');
selection = toggleSatelliteCategorySelection(selection, 'DEBRIS');
assert.deepEqual(selection, ['MEO', 'LEO', 'DEBRIS'], 'debris participates in the same union');
selection = toggleSatelliteCategorySelection(['MEO'], 'MEO');
assert.deepEqual(selection, ['ALL'], 'deselecting the final category restores ALL');
assert.deepEqual(
  toggleSatelliteCategorySelection(['ALL'], 'GEO'),
  ['GEO'],
  'choosing a specific category while ALL is active makes it exclusive'
);

const leoPayload = { orbitType: 'LEO', object_type: 'PAYLOAD', satellite_name: 'ACTIVE PAYLOAD' };
const leoDebris = { orbitType: 'LEO', object_type: 'DEBRIS', satellite_name: 'ACTIVE PAYLOAD' };
const rocketBody = { orbit_class: 'LEO', object_type: 'ROCKET_BODY', satellite_name: 'UPPER BODY' };
const namedDebris = { orbitType: 'MEO', satellite_name: 'OBJECT 123 DEB' };
const nestedDebris = {
  orbitType: 'LEO',
  object_type: 'UNKNOWN',
  catalogObject: { object_type: 'ROCKET_BODY' },
  satellite_name: 'NEUTRAL OBJECT'
};
const payloadWithRocketBodyName = {
  orbitType: 'LEO',
  object_type: 'PAYLOAD',
  satellite_name: 'RS-44 & BREEZE-KM R/B'
};
const otherTypeWithRocketBodyName = {
  orbitType: 'LEO',
  object_type: 'OTHER',
  satellite_name: 'NAMED R/B BUT STRUCTURED'
};

assert.equal(satelliteCategory(leoPayload), 'LEO');
assert.equal(satelliteCategory(leoDebris), 'DEBRIS', 'debris classification takes precedence over orbit class');
assert.equal(satelliteCategory(rocketBody), 'DEBRIS');
assert.equal(satelliteCategory(namedDebris), 'DEBRIS');
assert.equal(satelliteCategory(nestedDebris), 'DEBRIS', 'known nested object type wins over a top-level UNKNOWN value');
assert.equal(
  satelliteCategory(payloadWithRocketBodyName),
  'LEO',
  'authoritative PAYLOAD object type wins over debris-like name text'
);
assert.equal(satelliteCategory(otherTypeWithRocketBodyName), 'LEO', 'any known structured object type blocks name heuristics');
assert.equal(isDebrisSatellite(leoPayload), false);
assert.equal(satelliteCategory({ orbitType: 'HRO' }), 'HEO', 'legacy HRO values normalize to HEO');
assert.equal(satelliteCategory({ orbitType: 'UNKNOWN' }), 'OTHER', 'unknown orbit classes map to OTHER');
assert.equal(satelliteCategory({}), 'OTHER', 'missing orbit classes map to OTHER');

assert.equal(satelliteMatchesCategorySelection(leoPayload, ['LEO', 'MEO']), true);
assert.equal(satelliteMatchesCategorySelection(leoDebris, ['LEO', 'MEO']), false, 'LEO excludes debris by precedence');
assert.equal(satelliteMatchesCategorySelection(leoDebris, ['LEO', 'DEBRIS']), true);
assert.equal(satelliteMatchesCategorySelection(leoDebris, ['ALL']), true, 'ALL includes debris');
assert.equal(satelliteMatchesCategorySelection({ orbitType: 'UNKNOWN' }, ['ALL']), true, 'ALL includes other');

console.log('satelliteCategoryFilter tests passed');
