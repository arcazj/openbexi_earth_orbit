import { expect, test } from '@playwright/test';
import path from 'node:path';

const EPOCH = '2026-08-23T00:00:00Z';
const LIGHTWEIGHT_DETAILED_MODEL_FIXTURE = path.resolve('obj/starlink_v2.glb');

function ommRecord({
  noradId,
  name,
  orbitClass,
  objectType = 'PAYLOAD',
  company,
  meanMotion,
  eccentricity = 0.001,
  inclination = 45,
  bstar = 0.00008,
  meanMotionDot = 0.00005
}) {
  const suffix = String(Number(noradId) - 110000).padStart(3, '0');
  const objectId = `2026-${suffix}A`;
  return {
    company,
    satellite_name: name,
    norad_id: String(noradId),
    object_id: objectId,
    international_designator: objectId,
    object_type: objectType,
    lifecycle_status: 'ACTIVE',
    orbit_class: orbitClass,
    type: orbitClass,
    inclination_deg: inclination,
    eccentricity,
    mean_motion: meanMotion,
    launch_date: '2026-08-20',
    source_format: 'CCSDS_OMM_JSON',
    tle_line1: null,
    tle_line2: null,
    element_set: {
      format: 'OMM',
      epoch: EPOCH,
      time_scale: 'UTC',
      native_frame: 'TEME',
      propagation_theory: 'SGP4',
      omm: {
        CCSDS_OMM_VERS: '2.0',
        OBJECT_NAME: name,
        OBJECT_ID: objectId,
        OBJECT_TYPE: objectType,
        CENTER_NAME: 'EARTH',
        REF_FRAME: 'TEME',
        TIME_SYSTEM: 'UTC',
        MEAN_ELEMENT_THEORY: 'SGP4',
        EPOCH,
        MEAN_MOTION: meanMotion,
        ECCENTRICITY: eccentricity,
        INCLINATION: inclination,
        RA_OF_ASC_NODE: 120.25,
        ARG_OF_PERICENTER: 80.5,
        MEAN_ANOMALY: 15.75,
        EPHEMERIS_TYPE: 0,
        NORAD_CAT_ID: String(noradId),
        ELEMENT_SET_NO: 1,
        REV_AT_EPOCH: 10,
        BSTAR: bstar,
        MEAN_MOTION_DOT: meanMotionDot,
        MEAN_MOTION_DDOT: 0
      }
    }
  };
}

function categoryCatalog() {
  return [
    ommRecord({
      noradId: '110001', name: 'DUPLICATE GP NAME', orbitClass: 'GEO', company: 'GEO OPS',
      meanMotion: 1.0027, eccentricity: 0.0001, inclination: 0.1
    }),
    ommRecord({
      noradId: '110002', name: 'DUPLICATE GP NAME', orbitClass: 'MEO', company: 'MEO OPS',
      meanMotion: 2.05, eccentricity: 0.01, inclination: 55
    }),
    ommRecord({
      noradId: '110003', name: 'ISS (ZARYA)', orbitClass: 'LEO', company: 'LEO OPS',
      meanMotion: 15.1, eccentricity: 0.0004, inclination: 53.1
    }),
    ommRecord({
      noradId: '110004', name: 'HEO FIXTURE', orbitClass: 'HEO', company: 'HEO OPS',
      meanMotion: 1, eccentricity: 0.95, inclination: 63.4, bstar: 0.01, meanMotionDot: 0.1
    }),
    ommRecord({
      noradId: '110005', name: 'NEUTRAL OBJECT', orbitClass: 'LEO', objectType: 'DEBRIS',
      company: 'DEBRIS OPS', meanMotion: 14.8, eccentricity: 0.01, inclination: 71
    }),
    ommRecord({
      noradId: '110006', name: 'UNKNOWN ORBIT FIXTURE', orbitClass: 'UNKNOWN', company: 'OTHER OPS',
      meanMotion: 3.2, eccentricity: 0.02, inclination: 32
    }),
    ommRecord({
      noradId: '110007', name: 'STARLINK RS-44 & BREEZE-KM R/B', orbitClass: 'LEO', objectType: 'PAYLOAD',
      company: 'LEO OPS', meanMotion: 14.9, eccentricity: 0.002, inclination: 82.5
    }),
    ommRecord({
      noradId: '110008', name: 'GPS BIIR-2', orbitClass: 'MEO', company: 'GEO',
      meanMotion: 2.0056, eccentricity: 0.01, inclination: 55
    }),
    ommRecord({
      noradId: '110009', name: 'GOES 19', orbitClass: 'GEO', company: 'NOAA',
      meanMotion: 1.0027, eccentricity: 0.0001, inclination: 0.1
    })
  ];
}

function gpMetadata(revision, count = 9) {
  return {
    catalog_revision: revision,
    fetched_at: EPOCH,
    last_success_at: EPOCH,
    last_status: 'ok',
    source_status: 'COMPLETE',
    partial_update: false,
    source_urls: ['https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'],
    counts: { records: count, rejected: 0 }
  };
}

function staticMetadata(revision, count = 0) {
  return {
    schema_version: '2.2.0',
    catalog_revision: revision,
    built_at: EPOCH,
    last_status: 'ok',
    counts: { records: count }
  };
}

function fixtureState() {
  return {
    gpCatalog: categoryCatalog(),
    gpMetadata: gpMetadata('sha256:filter-gp-one'),
    launchCatalog: [{
      norad_id: '119001',
      satellite_name: 'LAYERING LAUNCH',
      object_id: '2026-090A',
      object_type: 'PAYLOAD',
      launch_date: '2026-08-20',
      launch_site: 'AFETR'
    }],
    launchMetadata: staticMetadata('sha256:filter-launch-one', 1),
    decayCatalog: {},
    decayMetadata: staticMetadata('sha256:filter-decay-one'),
    decayMetadataRequests: 0
  };
}

async function routeJson(page, patterns, payload) {
  for (const pattern of patterns) {
    await page.route(pattern, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(typeof payload === 'function' ? payload(route.request()) : payload)
    }));
  }
}

function monitorBrowserErrors(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

function unexpectedConsoleErrors(messages) {
  return messages.filter(message => !/^Failed to load resource: the server responded with a status of 503 /.test(message));
}

async function bootFilterFixture(page, state, url = '/index.html') {
  await page.route('**/node_modules/**', route => route.abort('blockedbyclient'));
  await page.route('**/obj/ISS.glb', route => route.fulfill({
    contentType: 'model/gltf-binary',
    path: LIGHTWEIGHT_DETAILED_MODEL_FIXTURE
  }));
  await page.route('**/api/health', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'offline' })
  }));
  await routeJson(page, ['**/json/gp/GP.json', '**/api/gp', '**/api/satellites'], () => state.gpCatalog);
  await routeJson(page, ['**/json/gp/GP.meta.json', '**/api/gp-metadata'], () => state.gpMetadata);
  await routeJson(page, ['**/json/launches/launches.json', '**/api/launches'], () => state.launchCatalog);
  await routeJson(page, ['**/json/launches/launches.meta.json'], () => state.launchMetadata);
  await routeJson(page, ['**/json/decayed/decayed.json', '**/api/decayed'], () => state.decayCatalog);
  await routeJson(page, ['**/json/decayed/decayed.meta.json'], () => {
    state.decayMetadataRequests += 1;
    return state.decayMetadata;
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    window.openbexiStartupPerformance?.summary().some(entry => entry.name === 'first-interactive-ui') &&
    typeof window.openbexiSimulation?.snapshot === 'function' &&
    typeof window.openbexiServerConnection?.checkForDataUpdates === 'function'
  ));
  await expect(page.locator('#satelliteSearchInput')).toBeEnabled();
  await expect(page.locator('#launchTimelineToggle')).toBeEnabled();
  await expect.poll(() => state.decayMetadataRequests).toBeGreaterThan(0);
  await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
}

async function pressedCategories(page) {
  return page.locator('#orbitTypeFilter [data-orbit-filter]').evaluateAll(buttons => buttons
    .filter(button => button.getAttribute('aria-pressed') === 'true')
    .map(button => button.dataset.orbitFilter));
}

async function visibleNoradIds(page) {
  await expect.poll(() => page.evaluate(async () => {
    const diagnostics = (await import('/js/satelliteTLELoader.js')).getSatellitePointCloudDiagnostics();
    const snapshot = window.openbexiSimulation.snapshot();
    const visible = [...snapshot.visibleNoradIds].sort();
    const uploaded = [...diagnostics.uploadedNoradIds].sort();
    const rendered = [...uploaded];
    if (snapshot.selectedDetailedModelVisible && snapshot.selectedNoradId) rendered.push(snapshot.selectedNoradId);
    return diagnostics.drawnCount === snapshot.drawnNoradIds.length &&
      diagnostics.matchedPositionCount === diagnostics.drawnCount &&
      JSON.stringify(uploaded) === JSON.stringify([...snapshot.drawnNoradIds].sort()) &&
      JSON.stringify(rendered.sort()) === JSON.stringify(visible);
  })).toBe(true);
  return page.evaluate(() => [...window.openbexiSimulation.snapshot().visibleNoradIds].sort());
}

async function clickCategory(page, category) {
  await page.locator(`#orbitTypeFilter [data-orbit-filter="${category}"]`).click();
}

async function expectCatalogCount(page, filtered, total = 9) {
  const count = page.locator('#satelliteCountDisplay');
  await expect(count).toHaveText(`${filtered} / ${total}`);
  await expect(count).toHaveAttribute(
    'aria-label',
    `${filtered} satellites match active filters out of ${total} total satellites.`
  );
}

async function selectSatellite(page, noradId) {
  const search = page.locator('#satelliteSearchInput');
  await search.fill(noradId);
  const option = page.locator(`#satelliteSearchResults [data-norad-id="${noradId}"]`);
  await expect(option).toBeVisible();
  await option.click();
  await page.waitForFunction(id => window.openbexiSimulation.snapshot().selectedNoradId === id, noradId);
}

async function setCheckbox(page, selector, checked) {
  await page.locator(selector).evaluate((element, nextChecked) => {
    element.checked = nextChecked;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, checked);
  if (checked) await expect(page.locator(selector)).toBeChecked();
  else await expect(page.locator(selector)).not.toBeChecked();
}

test('category unions, dependent tags, counts, selection, and GP revisions stay coherent', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The full filter transition matrix runs once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState();
  await bootFilterFixture(page, state);

  expect(await pressedCategories(page)).toEqual(['MEO']);
  await expectCatalogCount(page, 2);
  expect(await visibleNoradIds(page)).toEqual(['110002', '110008']);
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().orbitTypeFilter)).toEqual(['MEO']);
  await expect(page.locator('#selectFirstStarlinkButton')).toBeDisabled();
  await expect(page.locator('#selectIssButton')).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Geosynchronous group', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'GEO', exact: true })).toHaveCount(0);
  await setCheckbox(page, '#companyFilter input[value="GEO"]', true);
  expect(await pressedCategories(page)).toEqual(['MEO']);
  await expectCatalogCount(page, 1);
  expect(await visibleNoradIds(page)).toEqual(['110008']);
  await setCheckbox(page, '#companyFilter input[value="ALL COMPANY"]', true);
  await expectCatalogCount(page, 2);
  expect(await visibleNoradIds(page)).toEqual(['110002', '110008']);
  await selectSatellite(page, '110002');
  await page.waitForFunction(() => {
    const position = window.openbexiSimulation.snapshot().selectedPosition;
    return Array.isArray(position) && Math.hypot(...position) > 6.4;
  });
  expect(await page.evaluate(() => Math.hypot(...window.openbexiSimulation.snapshot().selectedPosition))).toBeGreaterThan(6.4);
  await setCheckbox(page, '#showOnlySelectedSatellite', false);

  await clickCategory(page, 'GEO');
  expect(await pressedCategories(page)).toEqual(['GEO', 'MEO']);
  await expectCatalogCount(page, 4);
  expect(await visibleNoradIds(page)).toEqual(['110001', '110002', '110008', '110009']);

  await clickCategory(page, 'DEBRIS');
  expect(await pressedCategories(page)).toEqual(['GEO', 'MEO', 'DEBRIS']);
  await expectCatalogCount(page, 5);
  expect(await visibleNoradIds(page)).toEqual(['110001', '110002', '110005', '110008', '110009']);

  const allInteractionLatency = await page.locator('#orbitTypeFilter [data-orbit-filter="ALL"]').evaluate(button => {
    const startedAt = performance.now();
    button.click();
    const handlerMs = performance.now() - startedAt;
    return new Promise(resolve => requestAnimationFrame(() => resolve({
      handlerMs,
      settledMs: performance.now() - startedAt
    })));
  });
  expect(allInteractionLatency.handlerMs).toBeLessThan(200);
  expect(allInteractionLatency.settledMs).toBeLessThan(500);
  expect(await pressedCategories(page)).toEqual(['ALL']);
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().orbitTypeFilter)).toEqual(['ALL']);
  await expectCatalogCount(page, 9);
  await expect(page.locator('#satelliteSelect option')).toHaveCount(2);
  await expect(page.locator('#satelliteSelect option:checked')).toHaveAttribute('data-norad-id', '110002');

  await clickCategory(page, 'LEO');
  expect(await pressedCategories(page)).toEqual(['LEO']);
  await expectCatalogCount(page, 2);
  expect(await visibleNoradIds(page)).toEqual(['110003', '110007']);
  await expect(page.locator('#selectFirstStarlinkButton')).toBeEnabled();
  await expect(page.locator('#selectIssButton')).toBeEnabled();
  await page.locator('#selectFirstStarlinkButton').click();
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === '110007');
  expect(await pressedCategories(page)).toEqual(['LEO']);
  await page.locator('#selectIssButton').click();
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === '110003');
  expect(await pressedCategories(page)).toEqual(['LEO']);
  await page.waitForFunction(
    () => window.openbexiSimulation.snapshot().selectedDetailedModelVisible,
    null,
    { timeout: 45_000 }
  );
  await setCheckbox(page, '#showOnlySelectedSatellite', false);
  await page.evaluate(() => new Promise(resolve => {
    let remainingFrames = 5;
    const waitForFrame = () => {
      remainingFrames -= 1;
      if (remainingFrames <= 0) resolve();
      else requestAnimationFrame(waitForFrame);
    };
    requestAnimationFrame(waitForFrame);
  }));
  expect(await page.evaluate(() => window.openbexiSimulation.markerState('110003'))).toMatchObject({
    filterVisible: true,
    visible: false
  });

  await clickCategory(page, 'DEBRIS');
  expect(await pressedCategories(page)).toEqual(['LEO', 'DEBRIS']);
  await expectCatalogCount(page, 3);
  expect(await visibleNoradIds(page)).toEqual(['110003', '110005', '110007']);
  await clickCategory(page, 'LEO');
  expect(await pressedCategories(page)).toEqual(['DEBRIS']);
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === null);
  expect(await visibleNoradIds(page)).toEqual(['110005']);
  await clickCategory(page, 'DEBRIS');
  expect(await pressedCategories(page)).toEqual(['ALL']);

  await selectSatellite(page, '110002');
  expect(await page.evaluate(() => document.querySelector('#satelliteSelect').value)).toBe('110002');
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId)).toBe('110002');
  await expect(page.locator('#satelliteSelect option')).toHaveCount(2);
  await expect(page.locator('#satelliteSelect option:checked')).toHaveAttribute('data-norad-id', '110002');

  const heoButton = page.locator('#orbitTypeFilter [data-orbit-filter="HEO"]');
  await expect(heoButton).toHaveText('HRO');
  await heoButton.click();
  expect(await pressedCategories(page)).toEqual(['HEO']);
  expect(await visibleNoradIds(page)).toEqual(['110004']);
  await clickCategory(page, 'OTHER');
  expect(await pressedCategories(page)).toEqual(['HEO', 'OTHER']);
  expect(await visibleNoradIds(page)).toEqual(['110004', '110006']);
  await clickCategory(page, 'HEO');
  expect(await pressedCategories(page)).toEqual(['OTHER']);
  expect(await visibleNoradIds(page)).toEqual(['110006']);
  await clickCategory(page, 'OTHER');
  expect(await pressedCategories(page)).toEqual(['ALL']);

  const search = page.locator('#satelliteSearchInput');
  await search.fill('BREEZE');
  await expect(page.locator('#satelliteSearchResults [data-norad-id="110007"]')).toBeVisible();
  await expect(page.locator('#satelliteCountDisplay')).toHaveText('1 search | 9 / 9');
  await expect(page.locator('#satelliteCountDisplay')).toHaveAttribute(
    'aria-label',
    '1 satellites match the search query; 9 match active filters out of 9 total satellites.'
  );
  await page.locator('#satelliteSearchClear').click();
  await expectCatalogCount(page, 9);

  await clickCategory(page, 'LEO');
  const leoTag = page.getByRole('checkbox', { name: 'LEO OPS' });
  await setCheckbox(page, '#companyFilter input[value="LEO OPS"]', true);
  await expect(page.getByRole('checkbox', { name: 'All tags' })).not.toBeChecked();
  await clickCategory(page, 'GEO');
  await clickCategory(page, 'LEO');
  expect(await pressedCategories(page)).toEqual(['GEO']);
  await expect(page.getByRole('checkbox', { name: 'All tags' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'LEO OPS' })).toHaveCount(0);
  await expectCatalogCount(page, 2);

  await clickCategory(page, 'ALL');
  await selectSatellite(page, '110003');
  const detailPanel = page.locator('#selectedSatelliteDetailPanel');
  const canonicalDetails = detailPanel.locator('.selected-satellite-data-section');
  const ommDetails = detailPanel.locator('.selected-satellite-omm-section');
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel.locator('.selected-satellite-detail-header strong')).toHaveText('ISS (ZARYA)');
  await expect(detailPanel.getByText('ISS (ZARYA)', { exact: true })).toHaveCount(1);
  await expect(canonicalDetails.locator('th', { hasText: /^Name$/ })).toHaveCount(0);
  await expect(canonicalDetails.locator('th', { hasText: /^International designator$/ })).toHaveCount(1);
  await expect(canonicalDetails.locator('th', { hasText: /^Object ID$/ })).toHaveCount(0);
  await expect(detailPanel.locator('td', { hasText: /^2026-003A$/ })).toHaveCount(1);
  for (const absentLabel of ['Launch site', 'Decay status', 'Decay date', 'App satellite id']) {
    await expect(canonicalDetails.locator('th', { hasText: new RegExp(`^${absentLabel}$`) })).toHaveCount(0);
  }
  await expect(detailPanel.locator('td', { hasText: /^110003$/ })).toHaveCount(1);
  await expect(detailPanel.locator('td', { hasText: /^53\.1$/ })).toHaveCount(1);
  await expect(detailPanel.locator('td', { hasText: /^0\.0004$/ })).toHaveCount(1);
  await expect(detailPanel.locator('td', { hasText: /^15\.1$/ })).toHaveCount(1);
  for (const key of ['OBJECT_NAME', 'OBJECT_ID', 'NORAD_CAT_ID', 'EPOCH', 'INCLINATION', 'ECCENTRICITY', 'MEAN_MOTION']) {
    await expect(ommDetails.locator('th', { hasText: new RegExp(`^${key}$`) })).toHaveCount(0);
  }
  await expect(ommDetails).toContainText('RA_OF_ASC_NODE');
  await expect(ommDetails).toContainText('BSTAR');

  await setCheckbox(page, '#showOrbitToggle', true);
  await clickCategory(page, 'LEO');
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId)).toBe('110003');
  await expect(page.locator('#showOrbitToggle')).toBeChecked();
  await expect(detailPanel).toBeVisible();
  await clickCategory(page, 'GEO');
  await clickCategory(page, 'LEO');
  expect(await pressedCategories(page)).toEqual(['GEO']);
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === null);
  await expect(detailPanel).toBeHidden();
  await expect(detailPanel).toBeEmpty();
  await expect(page.locator('#selectedSatelliteControls')).toBeHidden();
  await expect(page.locator('#showOnlySelectedSatellite')).not.toBeChecked();
  await expect(page.locator('#showOrbitToggle')).toBeChecked();
  await expect(search).toHaveValue('');
  expect(await visibleNoradIds(page)).toEqual(['110001', '110009']);
  await expectCatalogCount(page, 2);

  await selectSatellite(page, '110001');
  const geoTag = page.getByRole('checkbox', { name: 'GEO OPS' });
  await setCheckbox(page, '#companyFilter input[value="GEO OPS"]', true);
  const selectedMeshBefore = await page.evaluate(() => window.openbexiSimulation.snapshot().selectedMeshUuid);
  state.gpCatalog = state.gpCatalog.map(record => record.norad_id === '110001'
    ? { ...record, satellite_name: 'GEO FIXTURE REVISION' }
    : record);
  state.gpMetadata = gpMetadata('sha256:filter-gp-two');
  const firstRefresh = await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
  expect(firstRefresh.changed).toBe(true);
  await page.waitForFunction(() => document.querySelector('#selectedSatelliteDetailPanel')?.textContent.includes('GEO FIXTURE REVISION'));
  expect(await pressedCategories(page)).toEqual(['GEO']);
  await expect(page.getByRole('checkbox', { name: 'GEO OPS' })).toBeChecked();
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().selectedNoradId)).toBe('110001');
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().selectedMeshUuid)).not.toBe(selectedMeshBefore);
  await expectCatalogCount(page, 1);

  state.gpCatalog = state.gpCatalog.map(record => record.norad_id === '110001'
    ? { ...record, orbit_class: 'MEO', type: 'MEO', company: 'MEO OPS' }
    : record);
  state.gpMetadata = gpMetadata('sha256:filter-gp-three');
  const secondRefresh = await page.evaluate(() => window.openbexiServerConnection.checkForDataUpdates());
  expect(secondRefresh.changed).toBe(true);
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === null);
  expect(await pressedCategories(page)).toEqual(['GEO']);
  await expect(page.getByRole('checkbox', { name: 'All tags' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'GEO OPS' })).toHaveCount(0);
  await expect(detailPanel).toBeHidden();
  await expect(search).toHaveValue('');
  expect(await visibleNoradIds(page)).toEqual(['110009']);
  await expectCatalogCount(page, 1);

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('shared category and tag filters restore as the same visible catalog', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Share-state restoration is covered once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState();
  const sharedUrl = '/index.html?share=1&view3D=1&mercator=0&orbit=LEO%2CDEBRIS&tags=LEO%20OPS';
  await bootFilterFixture(page, state, sharedUrl);

  expect(await pressedCategories(page)).toEqual(['LEO', 'DEBRIS']);
  expect(await page.evaluate(() => window.openbexiSimulation.snapshot().orbitTypeFilter))
    .toEqual(['LEO', 'DEBRIS']);
  await expect(page.getByRole('checkbox', { name: 'LEO OPS' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'All tags' })).not.toBeChecked();
  expect(await visibleNoradIds(page)).toEqual(['110003', '110007']);
  await expectCatalogCount(page, 2);
  expect(new URL(page.url()).searchParams.has('debris')).toBe(false);

  await page.goto('/index.html?share=1&view3D=1&mercator=0&orbit=MEO&tags=GEO', {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForFunction(() => (
    window.openbexiStartupPerformance?.summary().some(entry => entry.name === 'first-interactive-ui') &&
    typeof window.openbexiSimulation?.snapshot === 'function'
  ));
  expect(await pressedCategories(page)).toEqual(['MEO']);
  await expect(page.getByRole('checkbox', { name: 'Geosynchronous group', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'GEO', exact: true })).toHaveCount(0);
  expect(await visibleNoradIds(page)).toEqual(['110008']);
  await expectCatalogCount(page, 1);
  expect(new URL(page.url()).searchParams.get('tags')).toBe('GEO');

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('known MEO and GEO markers have finite orbital radii and invalid selection is absent from Mercator', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Marker propagation diagnostics are covered once on desktop Chromium.');
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState();
  await bootFilterFixture(page, state);

  await page.waitForFunction(() => {
    const marker = window.openbexiSimulation.markerState('110008');
    return marker?.visible && Number.isFinite(marker.radius) && marker.radius > 20 && marker.radius < 35;
  });
  await clickCategory(page, 'GEO');
  await page.waitForFunction(() => {
    const marker = window.openbexiSimulation.markerState('110009');
    return marker?.visible && Number.isFinite(marker.radius) && marker.radius > 35 && marker.radius < 50;
  });
  const knownMarkers = await page.evaluate(() => ({
    gps: window.openbexiSimulation.markerState('110008'),
    goes: window.openbexiSimulation.markerState('110009')
  }));
  expect(knownMarkers.gps.position.every(Number.isFinite)).toBe(true);
  expect(knownMarkers.gps.propagationInvalid).toBe(false);
  expect(knownMarkers.goes.position.every(Number.isFinite)).toBe(true);
  expect(knownMarkers.goes.propagationInvalid).toBe(false);

  await clickCategory(page, 'ALL');
  await clickCategory(page, 'HEO');
  await selectSatellite(page, '110004');
  await setCheckbox(page, '#viewMercatorToggle', true);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#mercatorCanvas');
    return canvas?.dataset.selectedMarkerNoradId === '110004' &&
      canvas.dataset.selectedMarkerRendered === 'true';
  });

  await page.evaluate(() => window.openbexiSimulation.setTime('2029-05-19T00:00:00.000Z'));
  await page.waitForFunction(() => window.openbexiSimulation.markerState('110004')?.propagationInvalid === true);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#mercatorCanvas');
    return canvas?.dataset.selectedMarkerNoradId === '110004' &&
      canvas.dataset.selectedMarkerRendered === 'false' &&
      canvas.dataset.renderedMarkerCount === '0';
  });

  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});

test('Mercator overlay and fullscreen stay above operational panels with accessible exits', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = fixtureState();
  await bootFilterFixture(page, state);

  await selectSatellite(page, '110002');
  const detailPanel = page.locator('#selectedSatelliteDetailPanel');
  await page.locator('#timelinesAccordionHeader').click();
  await setCheckbox(page, '#launchTimelineToggle', true);
  await expect(page.locator('.timeline-hud:visible')).toBeVisible();
  await setCheckbox(page, '#view3DToggle', true);
  await setCheckbox(page, '#viewMercatorToggle', true);
  const mobileLayout = await page.evaluate(() => window.innerWidth <= 768);
  if (mobileLayout) {
    await page.locator('#menuToggleBtn').click();
    await expect(page.locator('#controlsContainer')).toHaveClass(/menu-hidden/);
  }
  await expect(detailPanel).toBeVisible();
  await expect(detailPanel).toContainText('DUPLICATE GP NAME');
  const mercator = page.locator('#mercatorContainer');
  await expect(mercator).toHaveClass(/globe-overlay/);
  await expect(mercator).toBeVisible();
  const globeCanvasPaint = await page.locator('body > canvas:not(#mercatorCanvas)').first().evaluate(element => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    if (!gl) return 0;
    const pixel = new Uint8Array(4);
    let painted = 0;
    for (let y = 1; y <= 5; y += 1) for (let x = 1; x <= 5; x += 1) {
      gl.readPixels(Math.floor(gl.drawingBufferWidth * x / 6), Math.floor(gl.drawingBufferHeight * y / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (pixel[3] > 0 && pixel[0] + pixel[1] + pixel[2] > 12) painted += 1;
    }
    return painted;
  });
  expect(globeCanvasPaint).toBeGreaterThan(0);
  const mercatorPaint = await page.locator('#mercatorCanvas').evaluate(element => {
    const context = element.getContext('2d');
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    let painted = 0;
    for (let offset = 3; offset < pixels.length; offset += 16) {
      if (pixels[offset] > 0) painted += 1;
    }
    return painted;
  });
  expect(mercatorPaint).toBeGreaterThan(0);
  await testInfo.attach(`mercator-overlay-${testInfo.project.name}`, {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png'
  });

  const assertMercatorLayer = async expectedClass => {
    const layer = await page.evaluate((className) => {
      const map = document.querySelector('#mercatorContainer');
      const timeline = [...document.querySelectorAll('.timeline-hud')]
        .find(element => getComputedStyle(element).display !== 'none');
      const details = document.querySelector('#selectedSatelliteDetailPanel');
      const controls = document.querySelector('#controlsContainer');
      const timeControls = document.querySelector('#timeWarpBox');
      const rect = map.getBoundingClientRect();
      const timelineRect = timeline.getBoundingClientRect();
      const overlapLeft = Math.max(rect.left, timelineRect.left);
      const overlapRight = Math.min(rect.right, timelineRect.right);
      const overlapTop = Math.max(rect.top, timelineRect.top);
      const overlapBottom = Math.min(rect.bottom, timelineRect.bottom);
      const x = overlapRight > overlapLeft ? overlapRight - 10 : rect.right - 10;
      const y = overlapBottom > overlapTop
        ? overlapTop + ((overlapBottom - overlapTop) / 2)
        : rect.top + (rect.height * 0.7);
      const topElement = document.elementFromPoint(x, y);
      const detailRect = details.getBoundingClientRect();
      const detailOverlapLeft = Math.max(rect.left, detailRect.left);
      const detailOverlapRight = Math.min(rect.right, detailRect.right);
      const detailOverlapTop = Math.max(rect.top, detailRect.top);
      const detailOverlapBottom = Math.min(rect.bottom, detailRect.bottom);
      const overlapsDetails = detailOverlapRight > detailOverlapLeft && detailOverlapBottom > detailOverlapTop;
      const detailTopElement = overlapsDetails
        ? document.elementFromPoint(
          detailOverlapLeft + ((detailOverlapRight - detailOverlapLeft) / 2),
          detailOverlapTop + ((detailOverlapBottom - detailOverlapTop) / 2)
        )
        : null;
      return {
        hasClass: map.classList.contains(className),
        mapZ: Number(getComputedStyle(map).zIndex),
        timelineZ: Number(getComputedStyle(timeline).zIndex),
        detailsZ: Number(getComputedStyle(details).zIndex),
        controlsZ: Number(getComputedStyle(controls).zIndex),
        timeControlsZ: Number(getComputedStyle(timeControls).zIndex),
        detailsVisible: !details.hidden && getComputedStyle(details).display !== 'none',
        overlapsDetails,
        detailTopIsMercator: overlapsDetails ? !!detailTopElement?.closest('#mercatorContainer') : null,
        topIsMercator: !!topElement?.closest('#mercatorContainer')
      };
    }, expectedClass);
    expect(layer.hasClass).toBe(true);
    expect(layer.mapZ).toBeGreaterThan(layer.timelineZ);
    expect(layer.mapZ).toBeGreaterThan(layer.detailsZ);
    expect(layer.detailsVisible).toBe(true);
    if (layer.overlapsDetails) expect(layer.detailTopIsMercator).toBe(true);
    if (expectedClass === 'globe-overlay') {
      expect(layer.mapZ).toBeGreaterThan(layer.controlsZ);
      expect(layer.mapZ).toBeGreaterThan(layer.timeControlsZ);
    } else {
      expect(layer.controlsZ).toBeGreaterThan(layer.mapZ);
      expect(layer.timeControlsZ).toBeGreaterThan(layer.mapZ);
    }
    expect(layer.topIsMercator).toBe(true);
  };

  await assertMercatorLayer('globe-overlay');
  await setCheckbox(page, '#view3DToggle', false);
  await expect(mercator).toHaveClass(/fullscreen/);
  await assertMercatorLayer('fullscreen');
  const exitButton = page.getByRole('button', { name: 'Exit full-screen Mercator map' });
  await expect(exitButton).toBeVisible();
  if (mobileLayout) {
    await page.locator('#menuToggleBtn').click();
    await expect(page.locator('#controlsContainer')).not.toHaveClass(/menu-hidden/);
  }
  await page.locator('#serverStatusButton').click();
  await expect(page.locator('#serverStatusPanel')).toBeVisible();
  await page.locator('#serverStatusButton').click();
  await expect(page.locator('#serverStatusPanel')).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(mercator).toHaveClass(/globe-overlay/);
  await expect(page.locator('#view3DToggle')).toBeChecked();

  await setCheckbox(page, '#view3DToggle', false);
  await expect(exitButton).toBeVisible();
  await exitButton.click();
  await expect(mercator).toHaveClass(/globe-overlay/);
  await expect(page.locator('#view3DToggle')).toBeChecked();
  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors)).toEqual([]);
});
