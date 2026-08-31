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
  if (Number.isFinite(group.maxFileBytes)) {
    for (const file of files) {
      const bytes = fs.statSync(file).size;
      if (bytes > group.maxFileBytes) {
        failures.push(`${name}/${file.replaceAll('\\', '/')}: ${bytes} bytes exceeds per-file ${group.maxFileBytes}`);
      }
    }
  }
}

if (policy.trackedCatalog) {
  const manifestPath = policy.trackedCatalog.manifest;
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    failures.push(`trackedCatalog manifest is missing: ${manifestPath || '<unset>'}`);
  } else {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const descriptors = [
        ...(Array.isArray(manifest.chunks) ? manifest.chunks : []),
        ...(Array.isArray(manifest.history_chunks) ? manifest.history_chunks : []),
        ...(manifest.quarantine && typeof manifest.quarantine === 'object' ? [manifest.quarantine] : [])
      ];
      const paths = new Set([manifestPath, policy.trackedCatalog.metadata].filter(Boolean));
      for (const descriptor of descriptors) {
        const relative = String(descriptor?.path ?? '').replaceAll('\\', '/');
        if (!/^json\/tracked\/chunks\/[a-f0-9]{64}-[a-z0-9-]+\.json$/.test(relative)) {
          failures.push(`trackedCatalog has an invalid content-addressed path: ${relative || '<missing>'}`);
          continue;
        }
        paths.add(relative);
      }
      let totalBytes = 0;
      for (const file of paths) {
        if (!fs.existsSync(file)) {
          failures.push(`trackedCatalog referenced file is missing: ${file}`);
          continue;
        }
        const bytes = fs.statSync(file).size;
        totalBytes += bytes;
        if (file.includes('/chunks/') && bytes > policy.trackedCatalog.maxChunkBytes) {
          failures.push(`trackedCatalog/${file}: ${bytes} bytes exceeds per-chunk ${policy.trackedCatalog.maxChunkBytes}`);
        }
      }
      if (totalBytes > policy.trackedCatalog.maxTotalBytes) {
        failures.push(`trackedCatalog: ${totalBytes} bytes exceeds ${policy.trackedCatalog.maxTotalBytes}`);
      }
    } catch (error) {
      failures.push(`trackedCatalog budget could not be evaluated: ${error.message}`);
    }
  }
}

if (failures.length) {
  failures.forEach(message => console.error(`Asset budget: ${message}`));
  process.exit(1);
}

console.log('Asset regression ceilings passed');
