import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { interpolateBodyVectorKm, parseSolarSystemEphemerisData } from '../js/solarSystemEphemeris.js';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
export function checkHorizons(round = 1) {
    const path = `validation/v2.5.0/horizons-round-${round}.json`;
    const bytes = fs.readFileSync(path);
    assert.equal(sha(bytes), fs.readFileSync(path.replace('.json', '.sha256'), 'utf8').split(' ')[0]);
    const corpus = JSON.parse(bytes), report = [];
    assert.equal(corpus.requests.length, 17);
    for (const request of corpus.requests) {
        const tableBytes = fs.readFileSync(request.tablePath);
        assert.equal(sha(tableBytes), request.tableSha256, 'reference round is bound to its exact interpolation inputs');
        const table = parseSolarSystemEphemerisData(JSON.parse(tableBytes));
        const samples = corpus.samples.filter(s => s.body === request.body && s.purpose === request.purpose);
        assert.equal(samples.length, 32);
        assert.equal(new Set(samples.map(s => s.dateUtc)).size, 32);
        const positions = [], velocities = [];
        for (const sample of samples) {
            assert(!table.timeMs.includes(Date.parse(sample.dateUtc)), 'acceptance sample must be off grid');
            const actual = interpolateBodyVectorKm(table, sample.body, sample.dateUtc);
            assert.equal(actual.status, 'ok');
            positions.push(Math.hypot(...sample.vector.slice(0, 3).map((v, i) => v - actual.vector[i])));
            velocities.push(Math.hypot(...sample.vector.slice(3).map((v, i) => v - actual.vector[i + 3])));
        }
        const positionLimitKm = request.purpose === 'playback' ? .1 : 100;
        const velocityLimitKmS = request.purpose === 'playback' ? .0001 : null;
        const maxPositionKm = Math.max(...positions), maxVelocityKmS = Math.max(...velocities);
        report.push({ body: request.body, purpose: request.purpose, count: samples.length,
            maxPositionKm, p95PositionKm: percentile(positions, .95), maxVelocityKmS,
            p95VelocityKmS: percentile(velocities, .95), positionLimitKm, velocityLimitKmS,
            status: maxPositionKm <= positionLimitKm && (velocityLimitKmS === null || maxVelocityKmS <= velocityLimitKmS) ? 'passed' : 'failed' });
    }
    return { schemaVersion: 1, round, independentReview: 'pending', results: report,
        status: report.every(row => row.status === 'passed') ? 'passed' : 'failed' };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const report = checkHorizons(Number(process.argv[2] || 1));
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'passed') process.exitCode = 1;
}
