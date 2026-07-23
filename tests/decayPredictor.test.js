import assert from 'assert';
import fs from 'fs';
import {
  flattenDecayData,
  normalizeDecayRecord,
  parseDecayDate
} from '../js/decayPredictor.js';

function run() {
  const iso = parseDecayDate('2023-12-18');
  assert(iso, 'ISO YYYY-MM-DD decay date parses');
  assert.strictEqual(iso.iso, '2023-12-18', 'ISO decay date is preserved');

  const mdy = parseDecayDate('12/18/2023');
  assert(mdy, 'legacy MM/DD/YYYY decay date parses');
  assert.strictEqual(mdy.iso, '2023-12-18', 'legacy decay date normalizes to ISO');

  assert.strictEqual(parseDecayDate('2023-02-30'), null, 'invalid ISO day is rejected');
  assert.strictEqual(parseDecayDate('13/18/2023'), null, 'invalid legacy month is rejected');

  const decayed = JSON.parse(fs.readFileSync('json/decayed/decayed.json', 'utf8'));
  const record41732 = decayed['3CAT-2']?.find((record) => String(record.NORAD_CAT_ID) === '41732');
  assert(record41732, 'fixture includes NORAD 41732');

  const warnings = [];
  const normalized = normalizeDecayRecord(record41732, (message) => warnings.push(message));
  assert(normalized, 'NORAD 41732 normalized successfully');
  assert.strictEqual(normalized.noradId, '41732', 'NORAD 41732 id is preserved');
  assert.strictEqual(normalized.decayDateIso, '2023-12-18', 'NORAD 41732 decay date is parsed from bundled ISO data');
  assert.deepStrictEqual(warnings, [], 'NORAD 41732 does not emit invalid DECAY_DATE warning');

  const flattened = flattenDecayData({ '3CAT-2': [record41732] });
  assert.strictEqual(flattened.length, 1, 'flattened decay data keeps NORAD 41732');
  assert.strictEqual(flattened[0].decayDateIso, '2023-12-18', 'flattened NORAD 41732 has parsed decay date');

  console.log('decayPredictor tests passed');
}

run();
