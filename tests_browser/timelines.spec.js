import { expect, test } from '@playwright/test';

const GP_METADATA = Object.freeze({
  catalog_revision: 'sha256:gp-one',
  fetched_at: '2026-08-22T20:42:00Z',
  last_success_at: '2026-08-22T20:42:00Z',
  last_status: 'ok',
  source_status: 'COMPLETE',
  partial_update: false,
  source_urls: ['https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'],
  counts: { rejected: 0 }
});

const EMPTY_TRACKED_MANIFEST = Object.freeze({
  schema_version: '2.3.0',
  catalog_revision: 'sha256:timeline-tracked-empty',
  generated_at: '2026-08-23T00:00:00Z',
  default_membership: 'CURRENT',
  counts: {
    total: 0,
    current: 0,
    historical: 0,
    history_total: 0,
    quarantined: 0
  },
  chunks: [],
  history_chunks: [],
  quarantine: { count: 0 }
});

const OMM_CATALOG = Object.freeze([{
  satellite_name: 'OMM ACTIVE 100001',
  norad_id: '100001',
  object_id: '2026-100A',
  object_type: 'PAYLOAD',
  lifecycle_status: 'ACTIVE',
  orbit_class: 'LEO',
  launch_date: '2026-08-18',
  source_format: 'CCSDS_OMM_JSON',
  tle_line1: null,
  tle_line2: null,
  element_set: {
    format: 'OMM',
    epoch: '2026-08-22T20:00:00Z',
    time_scale: 'UTC',
    native_frame: 'TEME',
    propagation_theory: 'SGP4',
    omm: {
      CCSDS_OMM_VERS: '2.0',
      OBJECT_NAME: 'OMM ACTIVE 100001',
      OBJECT_ID: '2026-100A',
      CENTER_NAME: 'EARTH',
      REF_FRAME: 'TEME',
      TIME_SYSTEM: 'UTC',
      MEAN_ELEMENT_THEORY: 'SGP4',
      EPOCH: '2026-08-22T20:00:00Z',
      MEAN_MOTION: 15.1,
      ECCENTRICITY: 0.0004,
      INCLINATION: 53.1,
      RA_OF_ASC_NODE: 307.2,
      ARG_OF_PERICENTER: 316.1,
      MEAN_ANOMALY: 44,
      EPHEMERIS_TYPE: 0,
      NORAD_CAT_ID: '100001',
      ELEMENT_SET_NO: 1,
      REV_AT_EPOCH: 10,
      BSTAR: 0.00008,
      MEAN_MOTION_DOT: 0.00005,
      MEAN_MOTION_DDOT: 0
    }
  }
}]);

const LAUNCH_CATALOG = Object.freeze([{
  norad_id: '100401',
  satellite_name: 'QPS-SAR-18',
  object_id: '2026-190A',
  object_type: 'PAY',
  launch_date: '2026-08-20',
  launch_site: 'VOSTO',
  lifecycle_status: 'ACTIVE'
}]);

const DECAY_CATALOG = Object.freeze({
  'DECAYED TEST 100402': [{
    OBJECT_NAME: 'DECAYED TEST 100402',
    OBJECT_ID: '2026-191A',
    NORAD_CAT_ID: '100402',
    OBJECT_TYPE: 'PAY',
    LAUNCH_DATE: '2026-08-19',
    LAUNCH_SITE: 'AFWTR',
    DECAY_DATE: '2026-08-20'
  }]
});

const REVISED_LAUNCH_CATALOG = Object.freeze([{
  norad_id: '100403',
  satellite_name: 'REVISION LAUNCH 100403',
  object_id: '2026-192A',
  object_type: 'PAYLOAD',
  launch_date: '2026-08-23',
  launch_site: 'AFETR',
  operational_status: '+'
}]);

const REVISED_DECAY_CATALOG = Object.freeze({
  'REVISION DECAY 100404': [{
    OBJECT_NAME: 'REVISION DECAY 100404',
    OBJECT_ID: '2026-193A',
    NORAD_CAT_ID: '100404',
    OBJECT_TYPE: 'PAYLOAD',
    LAUNCH_DATE: '2026-08-21',
    LAUNCH_SITE: 'AFWTR',
    DECAY_DATE: '2026-08-23'
  }]
});

const TLE_CATALOG = Object.freeze([{
  satellite_name: 'LEGACY TLE 44714',
  norad_id: '44714',
  object_type: 'PAYLOAD',
  lifecycle_status: 'ACTIVE',
  orbit_class: 'LEO',
  launch_date: '2019-11-11',
  source_format: 'TLE_JSON',
  tle_line1: '1 44714U 19074B   26193.55886833  .00056372  00000+0  87819-3 0  9996',
  tle_line2: '2 44714  53.1517 306.9551 0004043 312.7639  47.3031 15.53348743368159'
}]);

const TLE_METADATA = Object.freeze({
  catalog_revision: 'sha256:tle-one',
  fetched_at: '2026-08-22T20:42:00Z',
  last_success_at: '2026-08-22T20:42:00Z',
  last_status: 'ok',
  source_status: 'COMPLETE',
  partial_update: false,
  source_urls: ['https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'],
  counts: { rejected: 0 }
});

function staticMetadata(revision, newestField, newestValue) {
  return {
    schema_version: '2.2.0',
    catalog_revision: revision,
    built_at: '2026-08-23T00:00:00Z',
    last_status: 'ok',
    [newestField]: newestValue,
    counts: { records: 1 }
  };
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

function unexpectedConsoleErrors(messages, allowedStatuses) {
  const allowed = new Set(allowedStatuses);
  return messages.filter(message => {
    const match = /^Failed to load resource: the server responded with a status of (\d{3}) /.exec(message);
    return !match || !allowed.has(Number(match[1]));
  });
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

async function routeEmptyTrackedCatalog(page) {
  await routeJson(page, [
    '**/json/tracked/TRACKED.manifest.json',
    '**/api/tracked-objects',
    '**/api/tracked-objects/manifest'
  ], EMPTY_TRACKED_MANIFEST);
}

function createTimelineFixtureState() {
  return {
    gpCatalog: OMM_CATALOG,
    gpMetadata: { ...GP_METADATA },
    launchCatalog: LAUNCH_CATALOG,
    launchMetadata: staticMetadata('sha256:launch-one', 'newest_launch_date', '2026-08-20'),
    decayCatalog: DECAY_CATALOG,
    decayMetadata: staticMetadata('sha256:decay-one', 'newest_confirmed_decay_date', '2026-08-20'),
    decayMetadataRequests: 0
  };
}

async function bootTimelineFixture(page, state) {
  await page.route('**/node_modules/**', route => route.abort('blockedbyclient'));
  await page.route('**/api/health', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'offline' })
  }));
  await routeJson(page, [
    '**/json/gp/GP.json',
    '**/api/gp',
    '**/api/satellites'
  ], () => state.gpCatalog);
  await routeJson(page, [
    '**/json/gp/GP.meta.json',
    '**/api/gp-metadata'
  ], () => state.gpMetadata);
  await routeJson(page, [
    '**/json/launches/launches.json',
    '**/api/launches'
  ], () => state.launchCatalog);
  await routeJson(page, [
    '**/json/launches/launches.meta.json'
  ], () => state.launchMetadata);
  await routeJson(page, [
    '**/json/decayed/decayed.json',
    '**/api/decayed'
  ], () => state.decayCatalog);
  await routeJson(page, [
    '**/json/decayed/decayed.meta.json'
  ], () => {
    state.decayMetadataRequests += 1;
    return state.decayMetadata;
  });
  await routeEmptyTrackedCatalog(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    window.openbexiStartupPerformance
      ?.summary()
      .some(entry => entry.name === 'first-interactive-ui')
  ));
  await expect(page.locator('#launchTimelineToggle')).toBeEnabled();
  await expect(page.locator('#reentryTimelineToggle')).toBeEnabled();
  await expect.poll(() => state.decayMetadataRequests).toBeGreaterThan(0);
  await page.waitForFunction(() => (
    typeof window.openbexiServerConnection?.checkForDataUpdates === 'function'
  ));
}

async function timelineHasPaint(canvas) {
  return canvas.evaluate(element => {
    const context = element.getContext('2d');
    if (!context || element.width < 1 || element.height < 1) return false;
    const pixels = context.getImageData(0, 0, element.width, element.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] || pixels[index + 1] || pixels[index + 2]) return true;
    }
    return false;
  });
}

async function setTimelineToggle(toggle, checked) {
  await toggle.evaluate((element, nextChecked) => {
    element.checked = nextChecked;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, checked);
  if (checked) {
    await expect(toggle).toBeChecked();
  } else {
    await expect(toggle).not.toBeChecked();
  }
}

async function selectCenteredTimelineEvent(canvas, row = 0) {
  await canvas.evaluate((element, eventRow) => {
    const rect = element.getBoundingClientRect();
    const eventInit = {
      bubbles: true,
      clientX: rect.left + (element.clientWidth / 2),
      clientY: rect.top + 16 + (eventRow * 13)
    };
    element.dispatchEvent(new MouseEvent('mousedown', eventInit));
    element.dispatchEvent(new MouseEvent('mouseup', eventInit));
  }, row);
}

test('OMM selection and static catalog revisions refresh both timelines without reload', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const browserErrors = monitorBrowserErrors(page);
  const state = createTimelineFixtureState();
  await bootTimelineFixture(page, state);

  await page.locator('#orbitTypeFilter [data-orbit-filter="ALL"]').click();
  const searchInput = page.locator('#satelliteSearchInput');
  await expect(searchInput).toBeEnabled();
  await searchInput.fill('100001');
  const ommOption = page.locator('#satelliteSearchResults [data-norad-id="100001"]');
  await expect(ommOption).toBeVisible();
  await ommOption.click();
  const selectedDetails = page.locator('#selectedSatelliteDetailPanel');
  if (testInfo.project.name === 'mobile-chromium') {
    await expect(selectedDetails).toBeHidden();
    await expect(searchInput).toHaveValue('OMM ACTIVE 100001');
  } else {
    await expect(selectedDetails).toBeVisible();
  }
  await expect(selectedDetails).toContainText('OMM ACTIVE 100001');
  await expect(selectedDetails).toContainText('OMM details');
  const canonicalDetails = selectedDetails.locator('.selected-satellite-data-section');
  const ommDetails = selectedDetails.locator('.selected-satellite-omm-section');
  await expect(canonicalDetails.locator('th', { hasText: /^NORAD ID$/ })).toHaveCount(1);
  await expect(canonicalDetails.locator('th', { hasText: /^Inclination \(deg\)$/ })).toHaveCount(1);
  await expect(canonicalDetails.locator('th', { hasText: /^Eccentricity$/ })).toHaveCount(1);
  await expect(canonicalDetails.locator('th', { hasText: /^Mean motion \(rev\/day\)$/ })).toHaveCount(1);
  await expect(
    canonicalDetails.locator('th', { hasText: /^Object type$/ }).locator('xpath=following-sibling::td')
  ).toHaveText('PAYLOAD');
  await expect(selectedDetails.locator('td', { hasText: /^100001$/ })).toHaveCount(1);
  await expect(selectedDetails.locator('td', { hasText: /^53\.1$/ })).toHaveCount(1);
  await expect(selectedDetails.locator('td', { hasText: /^0\.0004$/ })).toHaveCount(1);
  await expect(selectedDetails.locator('td', { hasText: /^15\.1$/ })).toHaveCount(1);
  for (const duplicateKey of ['OBJECT_NAME', 'OBJECT_ID', 'NORAD_CAT_ID', 'EPOCH', 'INCLINATION', 'ECCENTRICITY', 'MEAN_MOTION']) {
    await expect(ommDetails.locator('th', { hasText: new RegExp(`^${duplicateKey}$`) })).toHaveCount(0);
  }
  await expect(selectedDetails.locator('.selected-satellite-omm-section')).toContainText('MEAN_ELEMENT_THEORY');
  await expect(selectedDetails.locator('.selected-satellite-omm-section')).toContainText('RA_OF_ASC_NODE');
  await expect(selectedDetails.locator('.selected-satellite-omm-section')).toContainText('BSTAR');
  await expect(selectedDetails).toContainText('100001');

  const documentToken = await page.evaluate(() => {
    window.__openbexiTimelineDocumentToken = `timeline-${Date.now()}-${Math.random()}`;
    return window.__openbexiTimelineDocumentToken;
  });

  await page.locator('#timelinesAccordionHeader').click();
  const launchToggle = page.locator('#launchTimelineToggle');
  const reentryToggle = page.locator('#reentryTimelineToggle');

  await launchToggle.check({ force: true });
  const launchStatus = page.locator('.timeline-status-launch');
  await expect(launchStatus).toBeVisible();
  await expect(launchStatus).toContainText('Latest launch: 2026-08-20');
  await expect(launchStatus).toContainText('QPS-SAR-18');
  await expect(launchStatus).toContainText('NORAD 100401');

  const launchCanvas = launchStatus.locator('..').locator('canvas.timeline-detail');
  await expect(launchCanvas).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await timelineHasPaint(launchCanvas)).toBe(true);

  await setTimelineToggle(launchToggle, false);
  await setTimelineToggle(reentryToggle, true);
  const reentryStatus = page.locator('.timeline-status-reentry');
  await expect(reentryStatus).toBeVisible();
  await expect(reentryStatus).toContainText('Latest re-entry: 2026-08-20');
  await expect(reentryStatus).toContainText('DECAYED TEST 100402');
  await expect(reentryStatus).toContainText('NORAD 100402');

  const reentryCanvas = reentryStatus.locator('xpath=../..').locator('canvas.timeline-detail');
  await expect(reentryCanvas).toBeVisible();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await timelineHasPaint(reentryCanvas)).toBe(true);

  state.launchCatalog = REVISED_LAUNCH_CATALOG;
  state.launchMetadata = staticMetadata('sha256:launch-two', 'newest_launch_date', '2026-08-23');
  state.decayCatalog = REVISED_DECAY_CATALOG;
  state.decayMetadata = staticMetadata('sha256:decay-two', 'newest_confirmed_decay_date', '2026-08-23');
  const refreshResult = await page.evaluate(() => (
    window.openbexiServerConnection.checkForDataUpdates()
  ));
  expect(refreshResult.changed).toBe(true);
  expect(await page.evaluate(() => window.__openbexiTimelineDocumentToken)).toBe(documentToken);

  await expect(reentryStatus).toContainText('Latest re-entry: 2026-08-23');
  await expect(reentryStatus).toContainText('REVISION DECAY 100404');
  await expect(reentryStatus).toContainText('NORAD 100404');
  await expect(selectedDetails).toContainText('OMM ACTIVE 100001');
  await expect(selectedDetails).toContainText('OMM details');

  await setTimelineToggle(reentryToggle, false);
  await setTimelineToggle(launchToggle, true);
  await expect(launchStatus).toContainText('Latest launch: 2026-08-23');
  await expect(launchStatus).toContainText('REVISION LAUNCH 100403');
  await expect(launchStatus).toContainText('NORAD 100403');

  const refreshedLaunchCanvas = launchStatus.locator('..').locator('canvas.timeline-detail');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await selectCenteredTimelineEvent(refreshedLaunchCanvas, 1);
  await expect(selectedDetails).toContainText('REVISION LAUNCH 100403');
  await expect(selectedDetails).toContainText('100403');
  await expect(selectedDetails.locator('.selected-satellite-omm-section')).toHaveCount(0);
  await expect(selectedDetails.locator('.selected-satellite-tle-section')).toHaveCount(0);
  await expect(page.locator('#selectedSatelliteControls')).toBeHidden();

  const layout = await page.evaluate(() => {
    const visibleTimeline = [...document.querySelectorAll('.timeline-hud')]
      .find(element => getComputedStyle(element).display !== 'none');
    const rect = visibleTimeline?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      timelineLeft: rect?.left ?? null,
      timelineRight: rect?.right ?? null
    };
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.timelineLeft).toBeGreaterThanOrEqual(0);
  expect(layout.timelineRight).toBeLessThanOrEqual(layout.viewportWidth);
  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors, [503])).toEqual([]);

  console.log('[v2-timeline-browser-evidence]', JSON.stringify({
    profile: testInfo.project.name,
    orbitalRecord: 'OMM/NORAD 100001/selected',
    launch: '2026-08-23/NORAD 100403/revision-refreshed',
    confirmedDecay: '2026-08-23/NORAD 100404/revision-refreshed',
    sameDocument: true,
    layout
  }));
});

test('unavailable GP falls back to TLE and auxiliary-only revisions avoid another GP load', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Fallback source routing runs once on desktop Chromium.');
  test.setTimeout(90_000);
  const browserErrors = monitorBrowserErrors(page);
  let gpRequests = 0;
  let launchCatalog = LAUNCH_CATALOG;
  let decayCatalog = DECAY_CATALOG;
  let launchMetadata = staticMetadata('sha256:fallback-launch-one', 'newest_launch_date', '2026-08-20');
  let decayMetadata = staticMetadata('sha256:fallback-decay-one', 'newest_confirmed_decay_date', '2026-08-20');
  let decayMetadataRequests = 0;

  await page.route('**/node_modules/**', route => route.abort('blockedbyclient'));
  await page.route('**/api/health', route => route.fulfill({ status: 503, body: '{}' }));
  for (const pattern of ['**/json/gp/GP.json', '**/api/gp', '**/api/satellites']) {
    await page.route(pattern, route => {
      gpRequests += 1;
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
  }
  await routeJson(page, ['**/json/tle/TLE.json', '**/api/tle'], TLE_CATALOG);
  await routeJson(page, ['**/json/gp/GP.meta.json', '**/api/gp-metadata'], GP_METADATA);
  await routeJson(page, ['**/json/tle/TLE.meta.json'], TLE_METADATA);
  await routeJson(page, ['**/json/launches/launches.json', '**/api/launches'], () => launchCatalog);
  await routeJson(page, ['**/json/launches/launches.meta.json'], () => launchMetadata);
  await routeJson(page, ['**/json/decayed/decayed.json', '**/api/decayed'], () => decayCatalog);
  await routeJson(page, ['**/json/decayed/decayed.meta.json'], () => {
    decayMetadataRequests += 1;
    return decayMetadata;
  });
  await routeEmptyTrackedCatalog(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    window.openbexiStartupPerformance?.summary().some(entry => entry.name === 'first-interactive-ui')
  ));
  await expect.poll(() => decayMetadataRequests).toBeGreaterThan(0);
  await page.locator('#orbitTypeFilter [data-orbit-filter="ALL"]').click();
  await page.locator('#satelliteSearchInput').fill('44714');
  const tleOption = page.locator('#satelliteSearchResults [data-norad-id="44714"]');
  await expect(tleOption).toBeVisible();
  await tleOption.click();
  await expect(page.locator('#selectedSatelliteDetailPanel')).toContainText('LEGACY TLE 44714');
  await expect(page.locator('#selectedSatelliteDetailPanel')).toContainText('TLE details');

  await page.locator('#timelinesAccordionHeader').click();
  const launchToggle = page.locator('#launchTimelineToggle');
  const reentryToggle = page.locator('#reentryTimelineToggle');
  await expect(launchToggle).toBeEnabled();
  await expect(reentryToggle).toBeEnabled();
  await launchToggle.check({ force: true });
  const launchStatus = page.locator('.timeline-status-launch');
  await expect(launchStatus).toContainText('QPS-SAR-18');
  await setTimelineToggle(launchToggle, false);
  await setTimelineToggle(reentryToggle, true);
  const reentryStatus = page.locator('.timeline-status-reentry');
  await expect(reentryStatus).toContainText('DECAYED TEST 100402');

  const requestsBeforeAuxiliaryRefresh = gpRequests;
  launchCatalog = REVISED_LAUNCH_CATALOG;
  decayCatalog = REVISED_DECAY_CATALOG;
  launchMetadata = staticMetadata('sha256:fallback-launch-two', 'newest_launch_date', '2026-08-23');
  decayMetadata = staticMetadata('sha256:fallback-decay-two', 'newest_confirmed_decay_date', '2026-08-23');
  const refreshResult = await page.evaluate(() => (
    window.openbexiServerConnection.checkForDataUpdates()
  ));
  expect(refreshResult.changed).toBe(true);
  expect(gpRequests).toBe(requestsBeforeAuxiliaryRefresh);
  await expect(reentryStatus).toContainText('REVISION DECAY 100404');
  await setTimelineToggle(reentryToggle, false);
  await setTimelineToggle(launchToggle, true);
  await expect(launchStatus).toContainText('REVISION LAUNCH 100403');
  expect(browserErrors.pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors(browserErrors.consoleErrors, [404, 503])).toEqual([]);
});
