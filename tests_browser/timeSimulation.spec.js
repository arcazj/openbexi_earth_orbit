import { expect, test } from '@playwright/test';

const ENFORCE_TIMING_BUDGETS = process.env.OPENBEXI_ENFORCE_TIMING_BUDGETS === '1';

const GP_METADATA = {
  catalog_revision: 'sha256:time-simulation-gp',
  fetched_at: '2026-08-23T00:00:00Z',
  last_success_at: '2026-08-23T00:00:00Z',
  last_status: 'ok',
  source_status: 'COMPLETE',
  partial_update: false,
  source_urls: ['local:test-fixture'],
  counts: { rejected: 0, total: 2, fetched: 2 }
};

const EMPTY_TRACKED_MANIFEST = {
  schema_version: '2.3.0',
  catalog_revision: 'sha256:time-simulation-tracked-empty',
  generated_at: '2026-08-23T00:00:00Z',
  default_membership: 'CURRENT',
  counts: { total: 0, current: 0, historical: 0, history_total: 0, quarantined: 0 },
  chunks: [],
  history_chunks: [],
  quarantine: { count: 0 }
};

function ommRecord(noradId, name, meanAnomaly) {
  return {
    satellite_name: name,
    norad_id: String(noradId),
    object_id: `2026-${String(noradId).slice(-3)}A`,
    object_type: 'PAYLOAD',
    lifecycle_status: 'ACTIVE',
    orbit_class: 'MEO',
    launch_date: '2026-08-18',
    source_format: 'CCSDS_OMM_JSON',
    element_set: {
      format: 'OMM',
      epoch: '2026-08-22T20:00:00Z',
      time_scale: 'UTC',
      native_frame: 'TEME',
      propagation_theory: 'SGP4',
      omm: {
        CCSDS_OMM_VERS: '2.0',
        OBJECT_NAME: name,
        OBJECT_ID: `2026-${String(noradId).slice(-3)}A`,
        CENTER_NAME: 'EARTH',
        REF_FRAME: 'TEME',
        TIME_SYSTEM: 'UTC',
        MEAN_ELEMENT_THEORY: 'SGP4',
        EPOCH: '2026-08-22T20:00:00Z',
        MEAN_MOTION: 2.0056,
        ECCENTRICITY: 0.01,
        INCLINATION: 55,
        RA_OF_ASC_NODE: 120,
        ARG_OF_PERICENTER: 45,
        MEAN_ANOMALY: meanAnomaly,
        EPHEMERIS_TYPE: 0,
        NORAD_CAT_ID: String(noradId),
        ELEMENT_SET_NO: 1,
        REV_AT_EPOCH: 10,
        BSTAR: 0.000001,
        MEAN_MOTION_DOT: 0,
        MEAN_MOTION_DDOT: 0
      }
    }
  };
}

const GP_CATALOG = [
  ommRecord('100011', 'TIME MEO ALPHA', 20),
  ommRecord('100012', 'TIME MEO BRAVO', 210)
];

async function routeJson(page, patterns, value) {
  for (const pattern of patterns) {
    await page.route(pattern, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(value)
    }));
  }
}

async function bootTimeFixture(page, requestCounts) {
  await page.route('**/api/health', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'offline' })
  }));
  for (const pattern of ['**/json/gp/GP.json', '**/api/gp', '**/api/satellites']) {
    await page.route(pattern, route => {
      requestCounts.gp += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(GP_CATALOG)
      });
    });
  }
  await routeJson(page, ['**/json/gp/GP.meta.json', '**/api/gp-metadata'], GP_METADATA);
  await routeJson(page, ['**/json/launches/launches.json', '**/api/launches'], []);
  await routeJson(page, ['**/json/launches/launches.meta.json'], {
    catalog_revision: 'sha256:time-launch',
    last_status: 'ok',
    counts: { records: 0 }
  });
  await routeJson(page, ['**/json/decayed/decayed.json', '**/api/decayed'], {});
  await routeJson(page, ['**/json/decayed/decayed.meta.json'], {
    catalog_revision: 'sha256:time-decay',
    last_status: 'ok',
    counts: { records: 0 }
  });
  for (const pattern of [
    '**/json/tracked/TRACKED.manifest.json',
    '**/api/tracked-objects/manifest',
    '**/api/tracked-objects'
  ]) {
    await page.route(pattern, route => {
      requestCounts.trackedManifest += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_TRACKED_MANIFEST)
      });
    });
  }

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    window.openbexiStartupPerformance
      ?.summary()
      .some(entry => entry.name === 'first-interactive-ui') &&
    typeof window.openbexiSimulation?.snapshot === 'function'
  ));
  await expect.poll(() => requestCounts.trackedManifest).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#trackedCatalogStatus').getAttribute('data-state'))
    .not.toBe('loading');
}

function vectorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test('Time x keeps selected satellite fluid and drives bounded Solar System ephemeris motion', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const requestCounts = { gp: 0, trackedManifest: 0 };
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await bootTimeFixture(page, requestCounts);

  await page.locator('#orbitTypeFilter [data-orbit-filter="ALL"]').click();
  const search = page.locator('#satelliteSearchInput');
  await expect(search).toBeEnabled();
  await search.fill('100011');
  await page.locator('#satelliteSearchResults [data-norad-id="100011"]').click();
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().selectedNoradId === '100011');

  const originalFilters = await page.locator('#orbitTypeFilter button[aria-pressed="true"]')
    .evaluateAll(buttons => buttons.map(button => button.dataset.orbitFilter));
  const gpRequestsAfterStartup = requestCounts.gp;
  await page.evaluate(() => window.openbexiSimulation.setTime('2026-08-23T00:00:00Z'));
  const identityBefore = await page.evaluate(() => window.openbexiSimulation.snapshot());

  const timeSlider = page.locator('#timeWarpSlider');
  await timeSlider.fill('20');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().rate === 20);
  await expect(timeSlider).toHaveAttribute('aria-valuetext', '20 times, forward');
  await page.waitForTimeout(150);
  await page.locator('#timeWarpPause').click();
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().rate === 0);
  await expect(timeSlider).toHaveValue('0');
  const pausedFrames = await page.evaluate(() => new Promise(resolve => {
    const frames = [];
    const collect = () => {
      const state = window.openbexiSimulation.snapshot();
      frames.push({ timeMs: state.timeMs, position: state.selectedPosition });
      if (frames.length >= 12) resolve(frames);
      else requestAnimationFrame(collect);
    };
    requestAnimationFrame(collect);
  }));
  expect(new Set(pausedFrames.map(frame => frame.timeMs)).size).toBe(1);
  pausedFrames.forEach(frame => {
    expect(vectorDistance(frame.position, pausedFrames[0].position)).toBeLessThan(1e-9);
  });

  await timeSlider.fill('-30');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().rate === -30);
  await expect(timeSlider).toHaveAttribute('aria-valuetext', '-30 times, reverse');
  const reverseFrames = await page.evaluate(() => new Promise(resolve => {
    const frames = [];
    const collect = timestamp => {
      const state = window.openbexiSimulation.snapshot();
      frames.push({ timestamp, timeMs: state.timeMs, position: state.selectedPosition });
      if (frames.length >= 30) resolve(frames);
      else requestAnimationFrame(collect);
    };
    requestAnimationFrame(collect);
  }));
  await timeSlider.fill('0');
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().rate === 0);
  const reverseSteps = reverseFrames.slice(1).map((frame, index) => ({
    timeDeltaMs: frame.timeMs - reverseFrames[index].timeMs,
    distance: vectorDistance(frame.position, reverseFrames[index].position)
  }));
  expect(reverseSteps.filter(step => step.timeDeltaMs < 0).length).toBeGreaterThanOrEqual(25);
  expect(reverseSteps.filter(step => step.distance > 0).length).toBeGreaterThanOrEqual(25);
  const normalizedReverseSpeeds = reverseSteps
    .filter(step => step.timeDeltaMs < 0 && step.distance > 0)
    .map(step => step.distance / Math.abs(step.timeDeltaMs))
    .sort((a, b) => a - b);
  const medianReverseSpeed = normalizedReverseSpeeds[Math.floor(normalizedReverseSpeeds.length / 2)];
  expect(Math.max(...normalizedReverseSpeeds)).toBeLessThan(medianReverseSpeed * 3);

  await page.waitForTimeout(2000);
  await page.evaluate(() => window.openbexiSimulation.setRate(30));
  const motionFrames = await page.evaluate(() => new Promise(resolve => {
    const frames = [];
    let previousTimestamp = null;
    const collect = timestamp => {
      const state = window.openbexiSimulation.snapshot();
      frames.push({
        frameGapMs: previousTimestamp == null ? 0 : timestamp - previousTimestamp,
        timeMs: state.timeMs,
        position: state.selectedPosition,
        mesh: state.selectedMeshUuid,
        material: state.selectedMaterialUuid
      });
      previousTimestamp = timestamp;
      if (frames.length >= 30) resolve(frames);
      else requestAnimationFrame(collect);
    };
    requestAnimationFrame(collect);
  }));
  await page.evaluate(() => window.openbexiSimulation.setRate(0));

  expect(new Set(motionFrames.map(frame => frame.position.map(value => value.toFixed(7)).join(','))).size)
    .toBeGreaterThanOrEqual(25);
  expect(new Set(motionFrames.map(frame => frame.mesh))).toEqual(new Set([identityBefore.selectedMeshUuid]));
  expect(new Set(motionFrames.map(frame => frame.material))).toEqual(new Set([identityBefore.selectedMaterialUuid]));
  const forwardSteps = motionFrames.slice(1).map((frame, index) => ({
    timeDeltaMs: frame.timeMs - motionFrames[index].timeMs,
    distance: vectorDistance(frame.position, motionFrames[index].position)
  }));
  expect(forwardSteps.filter(step => step.timeDeltaMs > 0).length).toBeGreaterThanOrEqual(25);
  expect(forwardSteps.filter(step => step.distance > 0).length).toBeGreaterThanOrEqual(25);
  const normalizedForwardSpeeds = forwardSteps
    .filter(step => step.timeDeltaMs > 0 && step.distance > 0)
    .map(step => step.distance / step.timeDeltaMs)
    .sort((a, b) => a - b);
  const medianForwardSpeed = normalizedForwardSpeeds[Math.floor(normalizedForwardSpeeds.length / 2)];
  expect(Math.max(...normalizedForwardSpeeds)).toBeLessThan(medianForwardSpeed * 3);
  const sortedFrameGaps = motionFrames.slice(1).map(frame => frame.frameGapMs).sort((a, b) => a - b);
  const frameCadence = {
    p95FrameGapMs: sortedFrameGaps[Math.floor(sortedFrameGaps.length * 0.95)],
    maximumFrameGapMs: Math.max(...sortedFrameGaps),
    timingBudgetEnforced: ENFORCE_TIMING_BUDGETS
  };
  await testInfo.attach('time-simulation-frame-cadence', {
    body: Buffer.from(JSON.stringify(frameCadence, null, 2)),
    contentType: 'application/json'
  });
  console.log(`[time-simulation-frame-cadence] ${JSON.stringify(frameCadence)}`);
  if (ENFORCE_TIMING_BUDGETS) {
    expect(frameCadence.p95FrameGapMs).toBeLessThan(100);
    expect(frameCadence.maximumFrameGapMs).toBeLessThan(250);
  }

  await page.evaluate(() => window.openbexiSimulation.setTime('2026-08-23T00:00:00Z'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const originalPosition = (await page.evaluate(() => window.openbexiSimulation.snapshot())).selectedPosition;
  await page.evaluate(() => window.openbexiSimulation.setTime('2026-08-23T00:10:00Z'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const futurePosition = (await page.evaluate(() => window.openbexiSimulation.snapshot())).selectedPosition;
  expect(vectorDistance(originalPosition, futurePosition)).toBeGreaterThan(0.01);
  await page.evaluate(() => window.openbexiSimulation.setTime('2026-08-23T00:00:00Z'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const returnedPosition = (await page.evaluate(() => window.openbexiSimulation.snapshot())).selectedPosition;
  expect(vectorDistance(originalPosition, returnedPosition)).toBeLessThan(1e-9);

  await page.locator('#solarSystemOverviewToggle').check();
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().ephemerisMode === 'JPL-derived ephemeris');
  await page.evaluate(() => window.openbexiSimulation.setTime('2026-08-23T00:00:00Z'));
  const planets = ['Mercury', 'Venus', 'Earth', 'Moon', 'Mars', 'Jupiter', 'Saturn', 'Uranus'];
  const planetPositionsBefore = await page.evaluate(names => Object.fromEntries(
    names.map(name => [name, window.openbexiSimulation.planetPosition(name)])
  ), planets);
  await page.evaluate(() => window.openbexiSimulation.setRate(60));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.openbexiSimulation.setRate(0));
  const planetPositionsAfter = await page.evaluate(names => Object.fromEntries(
    names.map(name => [name, window.openbexiSimulation.planetPosition(name)])
  ), planets);
  planets.forEach(name => expect(vectorDistance(planetPositionsBefore[name], planetPositionsAfter[name])).toBeGreaterThan(1e-8));
  await page.evaluate(() => window.openbexiSimulation.setTime('2026-08-23T00:00:00Z'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const planetPositionsReturned = await page.evaluate(names => Object.fromEntries(
    names.map(name => [name, window.openbexiSimulation.planetPosition(name)])
  ), planets);
  planets.forEach(name => expect(vectorDistance(planetPositionsBefore[name], planetPositionsReturned[name])).toBeLessThan(1e-9));

  await page.locator('#solarSystemOverviewToggle').uncheck();
  await page.waitForFunction(() => {
    const snapshot = window.openbexiSimulation.snapshot();
    return snapshot.drawnNoradIds.includes('100011') && window.openbexiSimulation.markerState('100011')?.visible === true;
  });
  await page.locator('#solarSystemOverviewToggle').check();
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().ephemerisMode === 'JPL-derived ephemeris');

  await page.evaluate(() => window.openbexiSimulation.setTime('2035-12-30T23:59:55Z'));
  await page.evaluate(() => window.openbexiSimulation.setRate(60));
  await page.waitForFunction(() => window.openbexiSimulation.snapshot().boundary === 'end');
  const boundary = await page.evaluate(() => window.openbexiSimulation.snapshot());
  expect(boundary.dateUtc).toBe('2035-12-31T00:00:00.000Z');
  expect(boundary.rate).toBe(0);
  expect(boundary.ephemerisMode).toContain('range boundary');
  await expect(page.locator('#timeWarpStatus')).toContainText('Ephemeris end reached; paused');
  await page.evaluate(() => window.openbexiSimulation.setRate(-60));
  await page.waitForFunction(endTime => window.openbexiSimulation.snapshot().timeMs < endTime, boundary.timeMs);
  expect((await page.evaluate(() => window.openbexiSimulation.snapshot())).boundary).toBeNull();

  const filtersAfter = await page.locator('#orbitTypeFilter button[aria-pressed="true"]')
    .evaluateAll(buttons => buttons.map(button => button.dataset.orbitFilter));
  expect(filtersAfter).toEqual(originalFilters);
  expect(requestCounts.gp).toBe(gpRequestsAfterStartup);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileTimeControls = await page.locator('#timeWarpBox').evaluate(box => {
    const bounds = box.getBoundingClientRect();
    const status = box.querySelector('#timeWarpStatus');
    const controls = Array.from(box.querySelectorAll('label, input, button, span'))
      .map(element => element.getBoundingClientRect());
    return {
      viewportWidth: window.innerWidth,
      bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
      statusFits: status.scrollWidth <= status.clientWidth,
      controlsFit: controls.every(rect => (
        rect.left >= bounds.left - 0.5 && rect.right <= bounds.right + 0.5 &&
        rect.top >= bounds.top - 0.5 && rect.bottom <= bounds.bottom + 0.5
      ))
    };
  });
  expect(mobileTimeControls.bounds.left).toBeGreaterThanOrEqual(0);
  expect(mobileTimeControls.bounds.right).toBeLessThanOrEqual(mobileTimeControls.viewportWidth);
  expect(mobileTimeControls.statusFits).toBe(true);
  expect(mobileTimeControls.controlsFit).toBe(true);
  expect(pageErrors).toEqual([]);
});
