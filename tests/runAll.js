import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const testsDir = path.resolve('tests');
const testFiles = fs.readdirSync(testsDir)
  .filter(file => file.endsWith('.test.js'))
  .sort();

for (const file of testFiles) {
  await import(pathToFileURL(path.join(testsDir, file)).href);
}

console.log(`Ran ${testFiles.length} test files`);
