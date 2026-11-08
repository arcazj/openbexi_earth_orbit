import fs from 'node:fs';
import crypto from 'node:crypto';
const root = 'validation/v2.5.0';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const manifestPath = `${root}/manifest.json`;
if (fs.existsSync(manifestPath)) throw new Error('A sealed corpus is immutable; create a new corpus version for corrections.');
const files = ['horizons-round-1.json', 'sgp4-holdouts.json', 'PYTHON_SGP4_LICENSE.txt'];
const manifest = {
    schemaVersion: 1, corpusVersion: '2.5.0', releaseVersion: '2.5.0', publicationState: 'development',
    scientificMaturity: 'experimental', safetyClass: 'non-operational', independentReview: 'pending',
    acceptanceRound: 1, samples: { playback: 288, guides: 256, sgp4: 48 },
    thresholds: { playbackPositionKm: .1, playbackVelocityKmS: .0001, guidePositionKm: 100, sgp4PositionKm: .005, sgp4VelocityKmS: .000005 },
    samplingPolicy: '32 stratified off-grid epochs/body/purpose; original guide midpoint tuning samples excluded; no acceptance-driven tuning was needed.',
    sourceRights: { horizons: 'NASA/JPL attribution, exact-scope commercial redistribution review pending', sgp4: 'MIT implementation; original synthetic OMM inputs', historicalReferences: 'Retained unchanged; upstream AGPL applicability remains pending' },
    artifacts: files.map(name => { const bytes = fs.readFileSync(`${root}/${name}`); return { path: name, bytes: bytes.length, sha256: sha(bytes) }; }),
    generators: ['tools/generate_v25_acceptance.py', 'tools/generate_v25_sgp4.py'].map(path => ({ path, sha256: sha(fs.readFileSync(path)) })),
    command: 'node tests/v25ScientificAcceptance.test.js'
};
const body = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(manifestPath, body);
fs.writeFileSync(`${root}/manifest.sha256`, `${sha(body)}  manifest.json\n`);
console.log(`Sealed 2.5 corpus: ${sha(body)}`);
