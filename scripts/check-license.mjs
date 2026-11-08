import assert from 'node:assert/strict';
import fs from 'node:fs';
const license = fs.readFileSync('LICENSE', 'utf8');
assert.equal(license, fs.readFileSync('LICENSE.md', 'utf8'), 'LICENSE.md must match authoritative LICENSE exactly');
assert(license.includes(fs.readFileSync('licenses/LEGACY_MIT.txt', 'utf8').replaceAll('\r\n', '\n')));
for (const file of ['package.json', 'package-lock.json']) {
    const data = JSON.parse(fs.readFileSync(file));
    assert.equal((data.packages?.[''] || data).license, 'SEE LICENSE IN LICENSE');
}
assert.equal(JSON.parse(fs.readFileSync('package.json')).private, true);
const manifest = JSON.parse(fs.readFileSync('release/static-artifact.json'));
for (const path of ['LICENSE', 'LICENSE.md', 'docs/THIRD_PARTY_NOTICES.md', 'licenses/LEGACY_MIT.txt']) assert(manifest.files.includes(path));
for (const path of manifest.files) assert(!path.startsWith('commercial/') && !path.startsWith('runtime/'));
assert(license.includes('Jean-Christophe Arcaz') && license.includes('arcazj@gmail.com'));
assert(license.includes('Accuracy, reliance and limitation of liability'));
assert(license.includes('Nothing in this notice excludes or limits liability that cannot lawfully be'));
assert(!license.includes('DRAFT FOR OWNER'));
console.log('Commercial notices agree; licensor/contact, accuracy limitations and historical MIT retained.');
