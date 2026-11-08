import { expect, test } from '@playwright/test';

test('moved Help pages resolve links and retain accuracy and upstream notices', async ({ page, request }) => {
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto('/markdown_viewer.html?source=docs/RELEASE_NOTES.md');
    const content = page.locator('#markdownContent');
    await expect(content).toContainText('v2.5');
    const license = content.getByRole('link', { name: 'license', exact: true });
    const licenseUrl = await license.getAttribute('href');
    expect(new URL(licenseUrl).searchParams.get('source')).toBe('LICENSE.md');
    await page.goto(licenseUrl);
    await expect(content).toContainText('Accuracy, reliance and limitation of liability');
    await expect(content).toContainText('Jean-Christophe Arcaz');
    await expect(content).toContainText('Nothing in this notice excludes or limits liability');
    await page.goto('/markdown_viewer.html?source=docs/THIRD_PARTY_NOTICES.md');
    await expect(content).toContainText('Historical MIT notice');
    for (const url of ['/docs/SWAGGER.md', '/licenses/LEGACY_MIT.txt', '/vendor/three/0.184.0/LICENSE', '/vendor/satellite.js/6.0.2/LICENSE.md']) {
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
