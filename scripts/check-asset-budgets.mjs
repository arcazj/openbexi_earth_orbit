import fs from 'node:fs';
import path from 'node:path';

const policy = JSON.parse(fs.readFileSync('release/asset-budgets.json', 'utf8'));
const failures = [];

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

for (const [file, maxBytes] of Object.entries(policy.files || {})) {
  if (!fs.existsSync(file)) {
    failures.push(`${file} is missing`);
    continue;
  }
  const actual = fs.statSync(file).size;
  if (actual > maxBytes) failures.push(`${file}: ${actual} bytes exceeds ${maxBytes}`);
}

for (const [name, group] of Object.entries(policy.groups || {})) {
  const extensions = new Set(group.extensions || []);
  const excluded = new Set((group.exclude || []).map(file => file.replaceAll('\\', '/')));
  const files = (group.roots || [])
    .flatMap(filesUnder)
    .filter(file => extensions.has(path.extname(file)))
    .filter(file => !excluded.has(file.replaceAll('\\', '/')));
  const actual = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  if (actual > group.maxBytes) failures.push(`${name}: ${actual} bytes exceeds ${group.maxBytes}`);
}

if (failures.length) {
  failures.forEach(message => console.error(`Asset budget: ${message}`));
  process.exit(1);
}

console.log('Asset regression ceilings passed');
