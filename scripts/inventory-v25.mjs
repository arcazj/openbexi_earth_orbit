import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolvePythonCommand } from './python-discovery.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const locked = JSON.parse(fs.readFileSync('package-lock.json'));
const python = resolvePythonCommand({ cwd: process.cwd() });
const pythonVersion = execFileSync(python.command, [...python.prefix, '-c', 'import platform; print(platform.python_version())'], { encoding: 'utf8', windowsHide: true }).trim();
const dependencies = Object.entries(locked.packages).filter(([key]) => key).map(([key, value]) => ({
    path: key, version: value.version, license: value.license || 'review-pending',
    role: value.dev ? 'development-only' : 'browser-runtime', integrity: value.integrity || null
}));
const assets = [];
function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.posix.join(directory, entry.name);
        if (entry.isDirectory()) collect(file);
        else if (entry.isFile()) {
            const bytes = fs.readFileSync(file);
            const baselineBytes = execFileSync('git', ['show', `v2.4:${file}`], { maxBuffer: 128 * 1024 * 1024, windowsHide: true });
            const unchangedFromPublicV24 = sha(bytes) === sha(baselineBytes);
            if (!unchangedFromPublicV24) throw new Error(`Asset requires a new provenance decision: ${file}`);
            assets.push({ path: file, bytes: bytes.length, sha256: sha(bytes), unchangedFromPublicV24,
                rightsStatus: 'Legacy public asset; outside new commercial claim; asset-specific provenance/customer redistribution review incomplete' });
        }
    }
}
for (const directory of ['textures', 'icons', 'obj', 'data/stars', 'json/satellites']) if (fs.existsSync(directory)) collect(directory);
const record = {
    schemaVersion: 1, release: '2.5.0', status: 'public-source-authorized; legacy provenance limitations retained', baseline: 'f7724f5918349fbc972958f53b01732b9ea1bc2f',
    firstPartyScope: 'Diff from baseline to implementation commit; earlier MIT rights retained; author identity is not proof of ownership',
    contributorNames: [...new Set(execFileSync('git', ['log', '--format=%aN', 'HEAD'], { encoding: 'utf8' }).trim().split('\n'))],
    applicationLicense: { value: locked.packages[''].license, sha256: sha(fs.readFileSync('LICENSE')),
        licensor: 'Jean-Christophe Arcaz', contact: 'arcazj@gmail.com',
        ownerDecision: 'Public GitHub source and development prerelease authorized 2026-11-08',
        independentLegalReview: 'not claimed', scope: 'New owner-controlled material only; prior MIT and upstream terms retained' },
    dependencies,
    python: { version: pythonVersion, license: 'PSF-2.0', runtimeDependencies: 'standard library only for local server',
        optionalReferenceGenerator: { name: 'sgp4', version: '2.25', license: 'MIT', scope: 'development only; frozen outputs used offline' },
        optionalHostedRuntime: { source: 'Dockerfile', name: 'google-cloud-storage', version: '3.16.0', license: 'Apache-2.0', containerAndTransitiveAudit: 'pending; no hosted deployment authorized' } },
    historicalReference: { manifest: 'validation/v2.0.0/manifest.json', copiedMaterial: 'TLE inputs and numerical expected vectors in test literals; no upstream source imported by runtime', upstreamLicense: 'AGPL-3.0-only', applicability: 'Historical attribution preserved; outside proprietary claim; no blanket legal clearance inferred', staticArtifact: 'excluded' },
    datasets: [
        ...['GP', 'TLE', 'SATCAT', 'launches', 'confirmed decays', 'tracked objects'].map(name => ({ name, rightsStatus: 'Existing public v2.4 snapshots retained; provider terms unchanged; broader redistribution not cleared by this notice' })),
        { name: 'JPL playback/guides and holdouts', rightsStatus: 'NASA/JPL SSD identifies its data as public domain; source metadata and attribution retained', source: 'https://ssd.jpl.nasa.gov/faq.html#gen2' },
        { name: 'v2.5 synthetic SGP4 holdouts', rightsStatus: 'Original synthetic OMM inputs; MIT python-sgp4 numerical output and upstream notice retained' }
    ],
    assets
};
fs.mkdirSync('release/evidence', { recursive: true });
fs.writeFileSync('release/evidence/v2.5.0-rights-inventory.json', JSON.stringify(record, null, 2) + '\n');
console.log(`Inventoried ${dependencies.length} locked JS components and ${assets.length} unchanged legacy assets; publication scope and provenance limits recorded.`);
