import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildTrackedFacetOptions,
  createTrackedObjectCatalogLoader,
  isHistoricalTrackedRecord,
  isTrackedRecordPropagatable
} from '../js/trackedObjectCatalog.js';

const manifestPath = 'json/tracked/TRACKED.manifest.json';
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

assert.equal(manifest.invariants?.catalog_partition_holds, true);
assert.equal(manifest.invariants?.current_chunk_count_holds, true);
assert.equal(manifest.invariants?.history_chunk_count_holds, true);
assert.equal(
  manifest.counts.total,
  manifest.counts.current + manifest.counts.history_total,
  'the packaged current/history populations partition the provider snapshot'
);
assert.equal(
  manifest.counts.total,
  manifest.counts.propagatable + manifest.counts.metadata_only,
  'the packaged propagatable/metadata-only populations partition the tracked catalog'
);
assert(manifest.counts.current >= 30_000, 'the current tracked catalog is not a small demonstration fixture');
assert(manifest.counts.history_total >= 30_000, 'the historical tracked catalog is retained separately');

async function fileResponse(url) {
  const requested = String(url).replace(/^\.\//, '');
  const resolved = path.resolve(requested);
  const workspace = `${path.resolve('.')}${path.sep}`;
  if (!resolved.startsWith(workspace)) return { ok: false, status: 403 };
  try {
    const body = await fs.readFile(resolved, 'utf8');
    return {
      ok: true,
      status: 200,
      text: async () => body,
      json: async () => JSON.parse(body)
    };
  } catch {
    return { ok: false, status: 404 };
  }
}

const debrisDescriptor = manifest.chunks.find(chunk => chunk.object_type === 'DEBRIS');
assert(debrisDescriptor, 'the real current manifest declares a Debris chunk');
const debrisLoader = createTrackedObjectCatalogLoader({ fetchImpl: fileResponse });
const debrisSnapshot = await debrisLoader.load({ objectTypes: ['DEBRIS'] });
const smallRcsDebris = debrisSnapshot.records.filter(record => record.rcs_m2 !== null && record.rcs_m2 < 0.1).length;
const missingRcsDebris = debrisSnapshot.records.filter(record => record.rcs_m2 === null).length;
const debrisFacetOptions = buildTrackedFacetOptions(debrisSnapshot.records, {});
const positionedCurrentDebris = debrisSnapshot.records.filter(isTrackedRecordPropagatable);
const metadataOnlyCurrentDebris = debrisSnapshot.records.filter(record => !isTrackedRecordPropagatable(record));
const gpCatalog = JSON.parse(await fs.readFile('json/gp/GP.json', 'utf8'));
const gpNoradIds = new Set(gpCatalog.map(record => String(record.norad_id)));

assert.equal(debrisSnapshot.state, 'ready');
assert.equal(debrisSnapshot.records.length, debrisDescriptor.count);
assert(debrisSnapshot.records.every(record => record.object_type === 'DEBRIS'));
assert(debrisSnapshot.records.every(record => !isHistoricalTrackedRecord(record)));
assert.equal(debrisSnapshot.quarantine.length, 0);
assert(positionedCurrentDebris.every(record =>
  record.has_current_elements === true &&
  record.metadata_only !== true &&
  String(record.element_reference?.norad_id) === String(record.norad_id) &&
  gpNoradIds.has(String(record.norad_id))
), 'every positioned debris record has an exact current GP join');
assert(metadataOnlyCurrentDebris.every(record =>
  record.metadata_only === true && record.has_current_elements === false && !isTrackedRecordPropagatable(record)
),
  'metadata-only debris remains non-renderable');
assert.equal(
  positionedCurrentDebris.length + metadataOnlyCurrentDebris.length,
  debrisSnapshot.records.length,
  'positioned and metadata-only debris exactly partition current debris matches'
);
const debrisHistoryLoader = createTrackedObjectCatalogLoader({ fetchImpl: fileResponse });
const debrisWithHistory = await debrisHistoryLoader.load({ objectTypes: ['DEBRIS'], includeHistorical: true });
const historicalDebrisRecords = debrisWithHistory.records.filter(isHistoricalTrackedRecord);
const debrisHistoryFacetOptions = buildTrackedFacetOptions(debrisWithHistory.records, {});
assert.equal(
  historicalDebrisRecords.length,
  manifest.history_chunks.find(chunk => chunk.object_type === 'DEBRIS')?.count,
  'the loaded historical debris count reconciles to its manifest descriptor'
);
assert(historicalDebrisRecords.every(record => !isTrackedRecordPropagatable(record)),
  'historical debris is never renderable even if an old element flag is retained');
for (const key of ['owner', 'launchSite', 'status']) {
  assert.equal(
    debrisHistoryFacetOptions[key].reduce((sum, entry) => sum + entry.count, 0),
    debrisWithHistory.records.length,
    `${key} options, including UNKNOWN, exhaustively partition current and historical debris`
  );
}
assert(smallRcsDebris > 1_000, 'small-RCS debris remains included');
assert(missingRcsDebris > 1_000, 'debris with missing RCS remains included');
assert(debrisFacetOptions.launchYear.length > 50, 'real launch-year facets retain the provider history range');
assert.equal(
  debrisFacetOptions.position.find(entry => entry.value === 'METADATA_ONLY')?.count,
  metadataOnlyCurrentDebris.length,
  'the current-debris metadata-only facet reconciles to propagation availability'
);
assert.equal(
  debrisFacetOptions.position.find(entry => entry.value === 'POSITIONED')?.count,
  positionedCurrentDebris.length,
  'the current-debris positioned facet reconciles to exact GP joins'
);
assert.equal(
  debrisFacetOptions.rcs.find(entry => entry.value === 'UNKNOWN')?.count,
  missingRcsDebris,
  'the RCS unavailable facet reconciles to null provider values'
);

const unknownCurrent = manifest.chunks.find(chunk => chunk.object_type === 'UNKNOWN');
const unknownHistory = manifest.history_chunks.find(chunk => chunk.object_type === 'UNKNOWN');
assert(unknownCurrent && unknownHistory, 'the real manifest declares independent current/history Unknown chunks');
const historyLoader = createTrackedObjectCatalogLoader({ fetchImpl: fileResponse });
const historySnapshot = await historyLoader.load({ objectTypes: ['UNKNOWN'], includeHistorical: true });
assert.equal(historySnapshot.records.length, unknownCurrent.count + unknownHistory.count);
assert.equal(
  historySnapshot.records.filter(isHistoricalTrackedRecord).length,
  unknownHistory.count,
  'history opt-in loads the historical chunk without changing current membership semantics'
);

console.log('[tracked-catalog-real-manifest]', JSON.stringify({
  revision: manifest.catalog_revision,
  total: manifest.counts.total,
  current: manifest.counts.current,
  history: manifest.counts.history_total,
  propagatable: manifest.counts.propagatable,
  metadata_only: manifest.counts.metadata_only,
  current_debris: debrisSnapshot.records.length,
  positioned_debris_current: positionedCurrentDebris.length,
  metadata_only_debris_current: metadataOnlyCurrentDebris.length,
  debris_small_rcs_current: smallRcsDebris,
  debris_missing_rcs_current: missingRcsDebris,
  quarantine: debrisSnapshot.quarantine.length
}));
console.log('tracked object catalog real-manifest tests passed');
