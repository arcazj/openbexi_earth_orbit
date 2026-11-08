import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as satellite from 'satellite.js';
import { checkHorizons } from '../scripts/check-v25-science.mjs';

const manifestBytes = fs.readFileSync('validation/v2.5.0/manifest.json');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(digest(manifestBytes), fs.readFileSync('validation/v2.5.0/manifest.sha256', 'utf8').split(' ')[0]);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.independentReview, 'pending');
assert.equal(manifest.acceptanceRound, 1);
for (const artifact of manifest.artifacts) {
    assert(/^[a-zA-Z0-9_.-]+$/.test(artifact.path));
    const bytes = fs.readFileSync(`validation/v2.5.0/${artifact.path}`);
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(digest(bytes), artifact.sha256);
}

const report = checkHorizons();
assert.equal(report.status, 'passed', JSON.stringify(report.results.filter(row => row.status !== 'passed')));
const path = 'validation/v2.5.0/sgp4-holdouts.json';
const bytes = fs.readFileSync(path);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), fs.readFileSync(path.replace('.json', '.sha256'), 'utf8').split(' ')[0]);
const corpus = JSON.parse(bytes);
assert.equal(corpus.cases.length, 6);
let maximumPosition = 0, maximumVelocity = 0;
for (const fixture of corpus.cases) {
    assert.equal(fixture.samples.length, 8);
    for (const sample of fixture.samples) {
        // Reinitialize each comparison: deep-space integration state must not
        // depend on the preceding sample's traversal direction.
        const record = satellite.json2satrec(fixture.omm);
        const state = satellite.sgp4(record, sample.minutesSinceEpoch);
        assert.equal(record.error, 0);
        const distance = (vector, expected) => Math.hypot(...['x', 'y', 'z'].map((axis, i) => vector[axis] - expected[i]));
        const position = distance(state.position, sample.positionKm);
        const velocity = distance(state.velocity, sample.velocityKmS);
        maximumPosition = Math.max(maximumPosition, position);
        maximumVelocity = Math.max(maximumVelocity, velocity);
        assert(position <= corpus.positionLimitKm, `${fixture.name} position: ${position} km`);
        assert(velocity <= corpus.velocityLimitKmS, `${fixture.name} velocity: ${velocity} km/s`);
    }
}
console.log(`2.5 scientific holdouts passed: 544 Horizons + 48 SGP4; SGP4 maxima ${maximumPosition} km, ${maximumVelocity} km/s; external review pending.`);
