import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0'))]
  .filter(file => file && fs.existsSync(file));
const exactPaths = new Set(files);
const markdown = files.filter(file => /\.md$/i.test(file) && !file.startsWith('vendor/'));
const rootExceptions = new Set(['README.md', 'LICENSE.md', 'PROMPT_History.md', 'ROADMAP.md', 'CLAUDE.md']);
const failures = [];
for (const file of markdown) {
  if (!file.startsWith('docs/') && !rootExceptions.has(file)) failures.push(`${file}: Markdown belongs under docs/`);
  const source = fs.readFileSync(file, 'utf8').replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '');
  for (const [, destination] of source.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(destination)) continue;
    const relative = decodeURIComponent(destination.split(/[?#]/, 1)[0]);
    if (!relative) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), relative));
    if (!exactPaths.has(target) && !files.some(candidate => candidate.startsWith(`${target}/`))) failures.push(`${file}: unresolved or wrong-case link ${destination}`);
  }
}
assert(!files.some(file => /^(?:commercial\/|PROMPT_IMPLEMENT_V2_5_DELIVERY_1\.md$)/.test(file)), 'Private agreement/internal prompt must not be present in publication source');
const artifact = JSON.parse(fs.readFileSync('release/static-artifact.json'));
for (const name of ['docs/RELEASE_NOTES.md', 'docs/SWAGGER.md', 'docs/THIRD_PARTY_NOTICES.md']) assert(artifact.files.includes(name), `Missing public Help file: ${name}`);
for (const item of [...artifact.files, ...artifact.trees.map(tree => tree.path)]) {
  assert(!/^(?:runtime|commercial|artifacts|tests|validation)(?:\/|$)/i.test(item), `Private/development path in app artifact: ${item}`);
  assert(!/^(?:PROMPT_|ROADMAP)/.test(item), `Source-only document in app artifact: ${item}`);
}
assert(!artifact.trees.some(tree => tree.path === 'docs'), 'Docs must be explicitly allowlisted, not recursively published');
assert.equal(failures.length, 0, failures.join('\n'));
console.log(`Documentation paths and publication boundaries verified: ${markdown.length} authored Markdown files.`);
