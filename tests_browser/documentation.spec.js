import { expect, test } from '@playwright/test';
import { APP_VERSION } from '../js/releaseVersion.js';

test('Kuiper flight inventory opens from packaged Help with its tables, image and model links', async ({page}) => {
    await page.goto('/markdown_viewer.html?source=README.md');
    const report = page.getByRole('link', {name:'Kuiper flight inventory', exact:true});
    const link = new URL(await report.getAttribute('href'));
    expect(link.origin).toBe(new URL(page.url()).origin);
    expect(link.searchParams.get('source')).toBe('docs/KUIPER_MODEL_REVIEW.md');
    await page.goto(link.href);
    const content = page.locator('#markdownContent');
    const prototype = content.getByRole('row').filter({has: page.getByRole('link', {name:'58013', exact:true})});
    await expect(prototype).toContainText('KuiperSat-2');
    await expect(prototype).toContainText('2025-04-29');
    await expect(prototype.getByRole('link', {name:'58013'})).toHaveAttribute('href', /display_satellite\.html\?norad=58013$/);
    const le04 = content.getByRole('row').filter({hasText:'2026-264AD'});
    await expect(le04).toContainText('101486');
    await expect(content.locator('tbody tr').filter({has:page.locator('a[href*="satcat/records.php?CATNR="]')})).toHaveCount(434);
    await expect.poll(() => content.locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
});

test('moved Help pages resolve links and retain accuracy and upstream notices', async ({ page, request }) => {
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto('/markdown_viewer.html?source=docs/RELEASE_NOTES.md');
    const content = page.locator('#markdownContent');
    await expect(content.getByRole('heading', { level: 2 }).first()).toContainText(`v${APP_VERSION}`);
    const modelViewer = await content.getByRole('link', { name: 'Satellite Model Viewer', exact: true }).getAttribute('href');
    expect(new URL(modelViewer).pathname).toBe('/display_satellite.html');
    expect((await request.head(modelViewer)).status()).toBe(200);
    const license = content.getByRole('link', { name: 'license', exact: true });
    const licenseUrl = await license.getAttribute('href');
    expect(new URL(licenseUrl).searchParams.get('source')).toBe('LICENSE.md');
    await page.goto(licenseUrl);
    await expect(content).toContainText('Accuracy, reliance and limitation of liability');
    await expect(content).toContainText('Jean-Christophe Arcaz');
    await expect(content).toContainText('Nothing in this notice excludes or limits liability');
    await page.goto('/markdown_viewer.html?source=docs/THIRD_PARTY_NOTICES.md');
    await expect(content).toContainText('Historical MIT notice');
    await page.goto('/markdown_viewer.html?source=docs/SWAGGER.md');
    const apiReference = await content.getByRole('link', { name: 'Rendered local Markdown reference' }).getAttribute('href');
    await page.goto(apiReference);
    await expect(page.locator('#rawDocumentLink')).toHaveAttribute('href', 'docs/SWAGGER.md');
    await expect(content.getByRole('heading', { name: 'Satellite model manifest' })).toBeVisible();
    await page.goto('/swagger.html');
    const catalogReference = page.locator('#catalog-models');
    const schemaUrl = await catalogReference.getByRole('link', { name: 'OpenAPI contract' }).getAttribute('href');
    const schema = await (await request.get(schemaUrl)).json();
    const live = await (await request.get('/openapi.json')).json();
    for (const [path, definition] of Object.entries(schema.paths)) {
        expect(live.paths[path]).toEqual(definition);
        await expect(catalogReference.getByText(path, { exact: true })).toBeVisible();
    }
    const operation = page.locator('details.operation').filter({ has: page.getByText('/api/display-satellite-models', { exact: true }) });
    const example = JSON.parse(await operation.locator('pre code').textContent());
    const manifestResponse = await request.get('/api/display-satellite-models');
    expect(manifestResponse.status()).toBe(200);
    const manifest = await manifestResponse.json();
    expect(example.basePath).toBe(manifest.basePath);
    expect(example.models.length).toBeGreaterThan(0);
    for (const profile of example.models) {
        expect(manifest.models.find(entry => entry.id === profile.id)?.files, profile.id).toEqual(profile.files);
    }
    for (const url of ['/docs/SWAGGER.md', '/licenses/LEGACY_MIT.txt', '/vendor/three/0.187.0/LICENSE', '/vendor/satellite.js/7.1.0/LICENSE.md']) {
        expect((await request.get(url)).status(), url).toBe(200);
    }
    for (const url of ['/ROADMAP.md', '/PROMPT_History.md', '/docs/engineering/THREAT_MODEL.md', '/commercial/COMMERCIAL_AGREEMENT_DRAFT.md']) {
        expect((await request.get(url)).status(), url).toBe(404);
    }
    await page.goto('/markdown_viewer.html?source=../../.git/config');
    await expect(page.locator('#rawDocumentLink')).toHaveAttribute('href', 'README.md');
    await expect(content).toContainText('OpenBEXI Earth Orbit');
    expect(failures).toEqual([]);
});
