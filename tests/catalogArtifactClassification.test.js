import assert from 'node:assert/strict';
import fs from 'node:fs';

function loadCatalog(path) {
  const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
  assert(Array.isArray(payload) && payload.length > 0, `${path} is a non-empty array`);
  return payload;
}

function byNorad(catalog) {
  return new Map(catalog.map((record) => [String(record.norad_id), record]));
}

const gp = loadCatalog('json/gp/GP.json');
const tle = loadCatalog('json/tle/TLE.json');
const gpByNorad = byNorad(gp);
const tleByNorad = byNorad(tle);

for (const [label, catalog, index] of [
  ['GP', gp, gpByNorad],
  ['TLE fallback', tle, tleByNorad]
]) {
  assert.equal(index.size, catalog.length, `${label} has unique full-string NORAD identifiers`);
  for (const norad of ['24876', '37846', '32275', '39188']) {
    assert.equal(index.get(norad)?.orbit_class, 'MEO', `${label} classifies navigation/MEO object ${norad} as MEO`);
  }
  assert.equal(index.get('41866')?.orbit_class, 'GEO', `${label} keeps GOES 16 in GEO`);
}

const orbitCounts = Object.create(null);
const companyCounts = Object.create(null);
for (const record of gp) {
  orbitCounts[record.orbit_class] = (orbitCounts[record.orbit_class] || 0) + 1;
  companyCounts[record.company] = (companyCounts[record.company] || 0) + 1;
}

assert(orbitCounts.LEO > 10_000, 'shipped GP catalog contains a substantial LEO population');
assert(orbitCounts.MEO > 150, 'shipped GP catalog contains the navigation/MEO population');
assert(orbitCounts.GEO > 400, 'shipped GP catalog contains the geosynchronous population');
assert(orbitCounts.HEO > 20, 'shipped GP catalog contains highly elliptical objects');
assert(companyCounts.STARLINK > 10_000, 'shipped GP catalog exposes the Starlink tag');
assert(companyCounts.ONEWEB > 500, 'shipped GP catalog exposes the OneWeb tag');
assert(Object.keys(companyCounts).length > 20, 'shipped GP catalog exposes useful tag choices');
assert((companyCounts.ACTIVE || 0) < gp.length / 4, 'ACTIVE is only the unmatched fallback, not the entire tag catalog');
assert.equal(gpByNorad.get('37846')?.company, 'GALILEO', 'group enrichment is joined by full NORAD identity');

console.log('catalog artifact classification tests passed');
