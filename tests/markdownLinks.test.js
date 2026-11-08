import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const viewer = fs.readFileSync('markdown_viewer.html', 'utf8');
const functionSource = viewer.slice(viewer.indexOf('    function safeMarkdownHref('), viewer.indexOf('    function renderMarkdownInline('));
const context = vm.createContext({
  URL,
  window: { location: { href: 'https://example.test/openbexi/markdown_viewer.html?source=docs/SWAGGER.md' } },
  source: 'docs/SWAGGER.md',
  ALLOWED_MARKDOWN_SOURCES: new Map([['README.md', 'README'], ['docs/RELEASE_NOTES.md', 'Releases'], ['LICENSE.md', 'License'], ['docs/SWAGGER.md', 'API'], ['docs/THIRD_PARTY_NOTICES.md', 'Notices']])
});
vm.runInContext(functionSource, context);
const href = value => context.safeMarkdownHref(value);
assert.equal(href('../swagger.html'), 'https://example.test/openbexi/swagger.html');
assert.equal(new URL(href('../LICENSE.md')).searchParams.get('source'), 'LICENSE.md');
assert.equal(new URL(href('RELEASE_NOTES.md')).searchParams.get('source'), 'docs/RELEASE_NOTES.md');
assert.equal(href('engineering/DATA_HEALTH_V1.md'), 'https://github.com/arcazj/openbexi_earth_orbit/blob/master/docs/engineering/DATA_HEALTH_V1.md');
assert.equal(href('../release/evidence/v2.5.0-scientific-results.json'), 'https://github.com/arcazj/openbexi_earth_orbit/blob/master/release/evidence/v2.5.0-scientific-results.json');
assert.equal(href('mailto:arcazj@gmail.com'), 'mailto:arcazj@gmail.com');
for (const denied of ['javascript:alert(1)', 'data:text/html,hello', 'file:///private', 'vbscript:msgbox(1)']) assert.equal(href(denied), '');
assert.equal(href('https://example.org/reference'), 'https://example.org/reference');
console.log('Markdown relative-link and protocol regressions passed');
