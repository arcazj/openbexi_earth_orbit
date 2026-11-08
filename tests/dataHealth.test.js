import assert from 'node:assert/strict';
import fs from 'node:fs';
import { staticDataHealth, renderDataHealth } from '../js/dataHealth.js';
const policy = JSON.parse(fs.readFileSync('data/health/policy.json'));
const metadata = Object.fromEntries(Object.keys(policy.thresholdHours).map(key => [key, {
    catalog_revision: `sha256:${'a'.repeat(64)}`, fetched_at: '2026-11-01T12:00:00Z', last_success_at: '2026-11-07T11:00:00Z'
}]));
const now = Date.parse('2026-11-07T12:00:00Z');
const health = staticDataHealth(metadata, policy, now);
assert.equal(health.state, 'snapshot');
assert.equal(health.datasets.gp.contentAgeHours, 144);
assert.equal(health.datasets.gp.checkAgeHours, 1);
assert.equal(health.datasets.gp.state, 'current');
assert.equal(health.datasets.gp.nextPermittedAttemptAt, null);
assert.equal(health.datasets.gp.nextScheduledCheckAt, null);
assert.equal(health.datasets.gp.updateState, 'idle');
assert(Array.isArray(health.diagnostics));
metadata.gp.last_error = 'private exception';
metadata.gp.last_success_at = '2026-10-01T00:00:00Z';
const stale = staticDataHealth(metadata, policy, now);
assert.equal(stale.datasets.gp.state, 'stale');
assert.equal(stale.datasets.tracked.state, 'degraded');
assert(!JSON.stringify(stale).includes('private exception'));
assert.match(renderDataHealth(stale, null).summary, /Packaged snapshot.*old/);
assert.equal(renderDataHealth({ schemaVersion: 99 }, null), null);
metadata.launch.last_success_at = '2026-11-01T12:00:00Z';
metadata.launch.source_satcat_revision = metadata.satcat.catalog_revision;
const derived = staticDataHealth(metadata, policy, now).datasets.launch;
assert.equal(derived.checkedAt, '2026-11-01T12:00:00.000Z');
assert.equal(derived.freshnessAt, '2026-11-07T11:00:00.000Z');
assert.equal(derived.state, 'current');
metadata.launch.last_success_at = metadata.satcat.last_success_at;
metadata.launch.source_satcat_revision = 'sha256:' + 'b'.repeat(64);
assert.equal(staticDataHealth(metadata, policy, now).datasets.launch.reason, 'source_revision_mismatch');
const invalid = staticDataHealth({ gp: { catalog_revision: 'unverified' }, tle: {
    catalog_revision: 'a'.repeat(64), last_success_at: '2026-11-07T11:00:00'
} }, policy, now);
assert.equal(invalid.datasets.gp.state, 'unavailable');
assert.equal(invalid.datasets.tle.checkedAt, null);
assert.equal(invalid.datasets.tle.state, 'unknown');
console.log('Data-health contract and static wall-clock presentation passed.');
