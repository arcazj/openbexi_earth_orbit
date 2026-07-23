import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['js', 'scripts', 'tests', 'tests_browser'];
const files = ['playwright.config.js'].filter(fs.existsSync);

function collect(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(target);
    else if (entry.isFile() && ['.js', '.mjs'].includes(path.extname(target))) files.push(target);
  }
}

roots.forEach(collect);
files.sort();
for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`Checked JavaScript syntax in ${files.length} files`);
