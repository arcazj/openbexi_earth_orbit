import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync(new URL('../docs/catalog-api.openapi.json', import.meta.url)));
const page = new URL('../swagger.html', import.meta.url);
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function table(headings, rows) {
  const heading = headings.map(value => '<th scope="col">' + escape(value) + '</th>').join('');
  const body = rows.map(cells => '            <tr>' + cells.map(value => '<td>' + escape(value) + '</td>').join('') + '</tr>');
  return ['          <table class="response-table"><thead><tr>' + heading + '</tr></thead><tbody>',
    ...body, '          </tbody></table>'].join('\n');
}

const sections = ['    <section id="catalog-models" class="tag-section" aria-labelledby="catalog-models-title">',
  '      <h2 id="catalog-models-title" class="tag-title">Catalog and models <span>Read-only local API</span></h2>',
  '      <p>Open the <a href="docs/catalog-api.openapi.json">OpenAPI contract</a> for field types and units, or the <a href="markdown_viewer.html?source=docs/SWAGGER.md&amp;title=Swagger%20API">Python walkthrough</a>.</p>'];
for (const [route, operation] of Object.entries(contract.paths)) {
  const parameters = operation.parameters.map(({ name, in: location, schema, description }) => {
    const constraints = [schema.enum?.join(', '), schema.minimum !== undefined && (schema.minimum + '–' + schema.maximum),
      schema.default !== undefined && ('Default ' + schema.default)].filter(Boolean).join('. ');
    return [name, location, description + (constraints ? ' ' + constraints + '.' : '')];
  });
  const responses = Object.entries(operation.get.responses).map(([code, response]) => [code, response.description]);
  sections.push('      <details class="operation get">',
    '        <summary><span class="method get">GET</span><span class="path">' + escape(route) +
      '</span><span class="summary-text">' + escape(operation.get.summary) + '</span></summary>',
    '        <div class="operation-body"><p>' + escape(operation.get.description) + '</p>',
    '          <h3>Parameters</h3>', table(['Name', 'Location', 'Description'], parameters),
    '          <h3>Responses</h3>', table(['HTTP status', 'Description'], responses),
    '        </div>', '      </details>');
}
sections.push('    </section>');
const begin = '    <!-- Catalog API reference start -->';
const end = '    <!-- Catalog API reference end -->';
const source = fs.readFileSync(page, 'utf8');
const first = source.indexOf(begin);
const last = source.indexOf(end);
if (first < 0 || last < first) throw new Error('Catalog API reference markers are missing.');
const newline = source.includes('\r\n') ? '\r\n' : '\n';
const updated = source.slice(0, first) + [begin, ...sections, ''].join('\n').replaceAll('\n', newline) + source.slice(last);
if (process.argv.includes('--check')) {
  if (source !== updated) throw new Error('Refresh the Swagger catalog reference with node scripts/sync-catalog-reference.mjs.');
} else if (source !== updated) {
  fs.writeFileSync(page, updated);
}
