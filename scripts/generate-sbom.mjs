import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const outputIndex = process.argv.indexOf('--output');
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
if (outputIndex >= 0 && !outputPath) {
  throw new Error('--output requires a file path');
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable; run this command through npm run sbom');
const raw = execFileSync(
  process.execPath,
  [npmCli, 'sbom', '--omit=dev', '--sbom-format=cyclonedx'],
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
);
const sbom = JSON.parse(raw);
const cyclonedxSerialPattern = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!cyclonedxSerialPattern.test(sbom.serialNumber ?? '')) {
  sbom.serialNumber = `urn:uuid:${randomUUID()}`;
}
const formatted = `${JSON.stringify(sbom, null, 2)}\n`;

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, formatted, 'utf8');
  console.log(`Wrote CycloneDX SBOM to ${outputPath}`);
} else {
  process.stdout.write(formatted);
}
