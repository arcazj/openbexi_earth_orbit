import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const testsDir = path.resolve('tests');
const testFiles = fs.readdirSync(testsDir)
  .filter(file => file.endsWith('.test.js'))
  .sort();
const failures = [];

for (const file of testFiles) {
  try {
    await import(pathToFileURL(path.join(testsDir, file)).href);
  } catch (error) {
    failures.push({ file, error });
    console.error(`[FAIL] ${file}`);
    console.error(error?.stack || error);
  }
}

const passed = testFiles.length - failures.length;
console.log(`Ran ${testFiles.length} test files: ${passed} passed, ${failures.length} failed`);

if (failures.length) {
  console.error('\nFailed test files:');
  failures.forEach(({ file, error }) => {
    console.error(`- ${file}: ${error?.message || error}`);
  });
  process.exitCode = 1;
}
