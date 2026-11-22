import { test, expect } from '@playwright/test';

test('catalog selections load Kuiper, AMC and SES-17 with their design references', async ({ page }) => {
  for (const [scope, norad, asset, source, detail] of [
    ['leo','63724','leo/kuiper-production.glb','arxiv.org','three-leaf'],
    ['leo-history','58013','leo/ref-kuiper-58013.glb','aboutamazon.com','Protoflight'],
    ['geo','33275','geo/amc-21-geostar.glb','sky-brokers.com','2.3 m'],
    ['geo','49332','geo/ses-17.glb','sky-brokers.com','46 m'],
    ['meo','32708','meo/ref-a2100axs-32708.glb','news.lockheedmartin.com','AMC-14']
  ]) {
    await page.goto(`/display_satellite.html?catalog=${scope}&norad=${norad}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#statusMessage')).toContainText('Loaded obj/' + asset, { timeout: 45000 });
    await expect(page.locator('.diagnostic-item').filter({ hasText: 'Design references' }).getByRole('link', { name: source }).first()).toBeAttached();
    await expect(page.locator('.diagnostic-item').filter({ hasText: 'Model dimensions' })).toContainText(detail);
    if (norad === '49332') {
      const diagnostics = page.locator('.diagnostics');
      const copy = diagnostics.getByRole('button', { name: 'Copy diagnostics' });
      const original = page.viewportSize();
      for (const viewport of [original, { width: 320, height: 640 }]) {
        await page.setViewportSize(viewport);
        await expect(copy).toBeVisible();
        const [meshes, materials] = await diagnostics.locator('.diagnostic-metric').evaluateAll(
          rows => rows.slice(0, 2).map(row => row.getBoundingClientRect().toJSON()));
        expect(meshes.y).toBe(materials.y);
        expect(meshes.right).toBeLessThan(materials.left);
        const box = await diagnostics.boundingBox();
        expect(box.width).toBeLessThanOrEqual(316);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(await diagnostics.evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
      }
      await page.setViewportSize(original);
    }
  }
});

test('the OBJ viewer waits for its material maps before reporting Ready', async ({ page }) => {
  const texture = '**/obj/leo/Textures/spacecraft_cells.png';
  let releaseTexture;
  const gate = new Promise(resolve => { releaseTexture = resolve; });
  await page.route(texture, async route => {
    await gate;
    await route.continue();
  });

  const requested = page.waitForRequest(texture);
  const geometry = page.waitForResponse(response => response.url().endsWith('/obj/leo/qianfan.obj'));
  try {
    await page.goto('/display_satellite.html?model=qianfan.obj', { waitUntil: 'domcontentloaded' });
    await requested;
    await (await geometry).finished();
    await expect(page.locator('#statusPill')).toHaveText('Loading');
  } finally {
    releaseTexture();
  }

  await expect(page.locator('#statusPill')).toHaveText('Ready');
  const textures = page.locator('.diagnostic-item').filter({ hasText: 'Textures loaded' });
  await expect(textures.locator('.diagnostic-value')).toHaveText('2');
  await expect(page.locator('.model-card.active')).toHaveAttribute('data-model-id', 'qianfan');
});

test('a late texture from the previous selection keeps the current model active', async ({ page }) => {
  const texture = '**/obj/leo/Textures/iridium_l_band_face.png';
  let releaseTexture;
  const gate = new Promise(resolve => { releaseTexture = resolve; });
  await page.route(texture, async route => {
    await gate;
    await route.continue();
  });
  const requested = page.waitForRequest(texture);
  try {
    await page.goto('/display_satellite.html?model=iridium', { waitUntil: 'domcontentloaded' });
    await requested;
    await page.locator('button[data-model-id="cubesat"]').click();
    await expect(page.locator('#statusMessage')).toContainText('Loaded obj/leo/cubesat.obj');
  } finally {
    releaseTexture();
  }

  await page.waitForLoadState('networkidle');
  await expect(page.locator('#statusPill')).toHaveText('Ready');
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/leo/cubesat.obj');
  await expect(page).toHaveURL(/\?model=cubesat$/);
});

test('current and historical MEO spacecraft can be browsed, searched and reopened by NORAD', async ({ page }) => {
  await page.goto('/display_satellite.html?catalog=meo&norad=40544', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/meo/galileo-foc.glb', { timeout: 45000 });
  await expect(page.locator('.model-card.active')).toContainText('GSAT0203');
  await expect(page.locator('#modelList button')).toHaveCount(40);
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('searchbox').fill('o3b');
  await expect(page.locator('#modelList .model-name > span:first-child')).toHaveText(['O3b Classic', 'O3b mPOWER']);
  await expect(page.locator('#modelCount')).toHaveText(/^2 models · [\d,]+ spacecraft$/);
  await page.getByRole('searchbox').fill('54755');
  await expect(page.locator('#modelList button')).toHaveCount(1);
  await page.locator('#modelList button').click();
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/meo/o3b_mpower.glb');
  await expect(page).toHaveURL(/catalog=meo&norad=54755/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.model-card.active')).toContainText('NORAD 54755');
  await page.locator('#catalogScope').selectOption('history');
  await page.getByRole('searchbox').fill('EXPLORER 6');
  await page.locator('#modelList button').filter({ hasText: 'NORAD 15' }).click();
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/meo/ref-able-probe-15.glb');
  await expect(page).toHaveURL(/catalog=history&norad=15/);
});

test('a Starlink search offers each model once and keeps the loaded mesh when the NORAD selection changes', async ({ page }) => {
  let v1Requests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/leo/starlink_V1.obj')) v1Requests++;
  });
  await page.goto('/display_satellite.html?catalog=leo&norad=44961', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/leo/starlink_V1.obj', { timeout: 45000 });
  const search = page.getByRole('searchbox');
  const names = page.locator('#modelList .model-name > span:first-child');
  await search.fill('starlink');
  await expect(names).toHaveText(['Starlink V1', 'Starlink V2', 'Starlink V3']);
  await expect(page.locator('#modelCount')).toHaveText(/^3 models · [\d,]+ spacecraft$/);
  await expect(page.locator('#pageControls')).toBeHidden();

  for (const [query, norad] of [['STARLINK-1090', '44968'], ['NORAD 44961', '44961']]) {
    await search.fill(query);
    await expect(names).toHaveText(['Starlink V1']);
    const card = page.locator('#modelList button');
    await expect(card).toContainText('NORAD ' + norad);
    await card.click();
    await expect(page).toHaveURL(new RegExp('catalog=leo&norad=' + norad + '$'));
    await expect(page.locator('#statusPill')).toHaveText('Ready');
  }
  expect(v1Requests).toBe(1);
  await search.fill('starlink');
  await page.locator('button[data-model-id="starlink_v2.glb"]').click();
  await expect(page).toHaveURL(/catalog=leo&model=starlink_v2\.glb$/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.model-card.active .model-name > span:first-child')).toHaveText('Starlink V2');
  await page.locator('#catalogScope').selectOption('leo-history');
  await search.fill('starlink');
  await expect(names).toHaveText(['Starlink V1', 'Starlink V2']);
});

test('library aliases across orbits open the same selectable model', async ({ page }) => {
  await page.goto('/display_satellite.html?model=leo/ref-molniya-1-9049.glb', { waitUntil: 'domcontentloaded' });
  const file = 'obj/meo/ref-molniya-1-1621.glb';
  await expect(page.locator('#statusMessage')).toContainText('Loaded ' + file);
  await page.getByRole('searchbox').fill('molniya-1');
  await expect(page.locator('.model-card').filter({ hasText: file })).toHaveCount(1);
  await page.getByRole('searchbox').fill('MOLNIYA 1-S');
  await expect(page.locator('.model-card.active')).toContainText(file);
});

test('LEO and GEO scopes include live catalog membership and retain the selected orbit when empty', async ({ page }) => {
  await page.goto('/display_satellite.html?catalog=geo&norad=41866', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/geo/goes-r.glb', { timeout: 45000 });
  const references = page.locator('.diagnostic-item').filter({ hasText: 'Design references' });
  await expect(references.getByRole('link', { name: 'ospo.noaa.gov' })).toHaveAttribute('href', /GOES-RSeriesDataBook\.pdf/);
  await expect(page.locator('.diagnostic-item').filter({ hasText: 'Model dimensions' })).toContainText(/representative/i);
  await page.getByRole('searchbox').fill('GOES-R');
  await expect(page.locator('#modelList .model-name > span:first-child')).toHaveText(['GOES-R series']);
  await page.locator('#catalogScope').selectOption('geo-history');
  await expect(page.locator('#statusMessage')).toContainText('No historical GEO');
  await expect(page).toHaveURL(/catalog=geo-history$/);
  await page.locator('#catalogScope').selectOption('leo');
  await page.getByRole('searchbox').fill('20580');
  await page.locator('#modelList button').filter({ hasText: 'NORAD 20580' }).click();
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/leo/hubble.glb');
  await expect(references).toHaveCount(0);
  await page.locator('#catalogScope').selectOption('leo-history');
  await page.getByRole('searchbox').fill('12399');
  await page.locator('#modelList button').filter({ hasText: 'NORAD 12399' }).click();
  await expect(page.locator('#statusMessage')).toContainText('Loaded obj/leo/space-shuttle.glb');
  await expect(page).toHaveURL(/catalog=leo-history&norad=12399/);
});
