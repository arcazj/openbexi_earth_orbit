import assert from 'assert';
import fs from 'fs';
import * as satellite from 'satellite.js';
import {
  createSatelliteMotionController,
  hermiteInterpolatePosition,
  satelliteInterpolationWindowMs,
  satelliteMarkerDiagnostics,
  satelliteMarkerState
} from '../js/orbit/satelliteMotionInterpolator.js';

function positionObject(x = 0, y = 0, z = 0) {
  return {
    x,
    y,
    z,
    set(nextX, nextY, nextZ) {
      this.x = nextX;
      this.y = nextY;
      this.z = nextZ;
      return this;
    }
  };
}

function createScheduler() {
  let nextId = 1;
  const queue = [];
  return {
    schedule(callback) {
      const task = { id: nextId++, callback, cancelled: false };
      queue.push(task);
      return task.id;
    },
    cancel(id) {
      const task = queue.find(item => item.id === id);
      if (task) task.cancelled = true;
    },
    flush({ includeCancelled = false } = {}) {
      while (queue.length) {
        const task = queue.shift();
        if (!task.cancelled || includeCancelled) task.callback();
      }
    },
    size() {
      return queue.length;
    }
  };
}

function run() {
  const output = { x: 0, y: 0, z: 0 };
  hermiteInterpolatePosition(
    output,
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 20, z: 30 },
    { x: 0.01, y: 0.02, z: 0.03 },
    { x: 0.01, y: 0.02, z: 0.03 },
    0.5,
    1000
  );
  assert.deepStrictEqual(output, { x: 5, y: 10, z: 15 }, 'Hermite interpolation preserves constant-velocity motion');

  const propagationFixtures = [
    {
      orbit: 'LEO',
      line1: '1 44714U 19074B   26204.36464777  .00027142  00000+0  41251-3 0  9990',
      line2: '2 44714  53.1491 254.9265 0005630 347.9654  12.1222 15.54373498369838'
    },
    {
      orbit: 'MEO',
      line1: '1 39188U 13031A   26204.42005668 -.00000024  00000+0  00000+0 0  9997',
      line2: '2 39188   0.0939 332.7202 0002774 134.0305 253.2776  5.00115721238857'
    },
    {
      orbit: 'GEO',
      line1: '1 26900U 01039A   26204.08169595 -.00000284  00000+0  00000+0 0  9990',
      line2: '2 26900   6.2041  71.3386 0004265  50.8048 157.9936  1.00272197 91056'
    }
  ];
  const fixtureStartMs = Date.parse('2026-07-23T12:00:00Z');
  const interpolationWindows = {};
  propagationFixtures.forEach(fixture => {
    const satrec = satellite.twoline2satrec(fixture.line1, fixture.line2);
    const windowMs = satelliteInterpolationWindowMs(satrec);
    interpolationWindows[fixture.orbit] = windowMs;
    const startState = satellite.propagate(satrec, new Date(fixtureStartMs));
    const endState = satellite.propagate(satrec, new Date(fixtureStartMs + windowMs));
    const exactMidpoint = satellite.propagate(satrec, new Date(fixtureStartMs + windowMs / 2));
    const midpoint = { x: 0, y: 0, z: 0 };
    hermiteInterpolatePosition(
      midpoint,
      startState.position,
      endState.position,
      {
        x: startState.velocity.x / 1000,
        y: startState.velocity.y / 1000,
        z: startState.velocity.z / 1000
      },
      {
        x: endState.velocity.x / 1000,
        y: endState.velocity.y / 1000,
        z: endState.velocity.z / 1000
      },
      0.5,
      windowMs
    );
    const errorKm = Math.hypot(
      midpoint.x - exactMidpoint.position.x,
      midpoint.y - exactMidpoint.position.y,
      midpoint.z - exactMidpoint.position.z
    );
    assert(errorKm < 1, `${fixture.orbit} curvature-bounded midpoint error is below 1 km (actual ${errorKm.toFixed(6)} km)`);
  });
  assert(interpolationWindows.LEO < interpolationWindows.MEO, 'LEO interpolation window is shorter than MEO');
  assert(interpolationWindows.MEO < interpolationWindows.GEO, 'MEO interpolation window is shorter than GEO');

  const epoch = Date.parse('2026-08-23T00:00:00Z');
  let realTimeMs = 0;
  let propagationCalls = 0;
  const scheduler = createScheduler();
  const propagate = (satrec, date) => {
    propagationCalls += 1;
    const elapsedMs = date.getTime() - epoch;
    const phase = satrec.phase + elapsedMs / 120_000;
    return {
      position: { x: 10 * Math.cos(phase), y: 10 * Math.sin(phase), z: satrec.phase },
      velocity: {
        x: -10 * Math.sin(phase) / 120_000,
        y: 10 * Math.cos(phase) / 120_000,
        z: 0
      }
    };
  };
  const toSceneSample = (state, position, velocity) => {
    if (!state?.position || !state?.velocity) return false;
    Object.assign(position, state.position);
    Object.assign(velocity, state.velocity);
    return true;
  };
  const controller = createSatelliteMotionController({
    propagate,
    toSceneSample,
    now: () => realTimeMs,
    schedule: callback => scheduler.schedule(callback),
    cancelSchedule: id => scheduler.cancel(id),
    maxSamplesPerBatch: 2,
    propagationBudgetMs: 100,
    minWindowMs: 120_000,
    maxWindowMs: 120_000,
    correctionBlendMs: 100
  });
  const materialA = { id: 'material-a' };
  const materialB = { id: 'material-b' };
  const satellites = [
    { satrec: { phase: 0 }, mesh: { visible: true, position: positionObject(), material: materialA } },
    { satrec: { phase: 1 }, mesh: { visible: true, position: positionObject(), material: materialB } }
  ];
  const selected = satellites[0];
  const selectedMesh = selected.mesh;
  const selectedMaterial = selected.mesh.material;
  const selectedPosition = selected.mesh.position;

  const firstStats = controller.update(satellites, {
    selectedObject: selected,
    simTimeMs: epoch,
    rate: 1,
    realTimeMs
  });
  assert.strictEqual(scheduler.size(), 1, 'catalog propagation is scheduled outside the visual update');
  scheduler.flush();
  assert(propagationCalls <= 3, 'the first sampling job obeys the configured propagation batch bound');
  assert(
    Math.hypot(satellites[1].mesh.position.x, satellites[1].mesh.position.y, satellites[1].mesh.position.z) > 0,
    'paused startup applies the first valid sampled position instead of leaving the marker at Earth center'
  );
  const nonSelectedMotionState = controller.stateFor(satellites[1]);
  const nonSelectedRenderedPosition = nonSelectedMotionState?.renderedPosition;

  const interpolatedPositions = [];
  for (let frame = 1; frame <= 8; frame += 1) {
    realTimeMs = frame * 16;
    const stats = controller.update(satellites, {
      selectedObject: selected,
      simTimeMs: epoch + frame * 1000,
      rate: 1,
      realTimeMs
    });
    assert.strictEqual(stats, firstStats, 'motion diagnostics reuse one stable object per frame');
    assert.strictEqual(controller.stateFor(satellites[1]), nonSelectedMotionState, 'per-object interpolation state is reused between frames');
    assert.strictEqual(controller.stateFor(satellites[1]).renderedPosition, nonSelectedRenderedPosition, 'interpolation writes into one stable render vector');
    interpolatedPositions.push(satellites[1].mesh.position.x);
  }
  assert(new Set(interpolatedPositions.map(value => value.toFixed(8))).size >= 7, 'non-selected motion changes on nearly every rendered frame');
  const jumps = interpolatedPositions.slice(1).map((value, index) => Math.abs(value - interpolatedPositions[index]));
  assert(Math.max(...jumps) < 0.2, 'interpolated frame-to-frame motion has no large snap');
  assert.strictEqual(selected.mesh, selectedMesh, 'selected satellite mesh identity remains stable');
  assert.strictEqual(selected.mesh.material, selectedMaterial, 'selected satellite material identity remains stable');
  assert.strictEqual(selected.mesh.position, selectedPosition, 'selected satellite position vector is updated in place');

  const originalSelectedX = selected.mesh.position.x;
  realTimeMs += 16;
  controller.update(satellites, {
    selectedObject: selected,
    simTimeMs: epoch + 20_000,
    rate: 1,
    realTimeMs
  });
  assert.notStrictEqual(selected.mesh.position.x, originalSelectedX, 'selected satellite advances from exact per-frame propagation');
  realTimeMs += 16;
  controller.update(satellites, {
    selectedObject: selected,
    simTimeMs: epoch,
    rate: -1,
    realTimeMs
  });
  assert(Math.abs(selected.mesh.position.x - 10) < 1e-12, 'returning to the original UTC instant restores the exact selected position');

  assert(scheduler.size() > 0, 'a sampling job is pending before direction changes');
  realTimeMs += 16;
  controller.update(satellites, {
    selectedObject: selected,
    simTimeMs: epoch - 1000,
    rate: -1,
    realTimeMs
  });
  scheduler.flush({ includeCancelled: true });
  assert.strictEqual(selected.propagationInvalid, false, 'reverse exact propagation remains valid');

  const staleBeforeClockChange = controller.diagnostics().staleJobsDiscarded;
  realTimeMs += 16;
  controller.update(satellites, {
    selectedObject: selected,
    simTimeMs: epoch,
    rate: 1,
    clockGeneration: 10,
    realTimeMs
  });
  realTimeMs += 16;
  controller.update(satellites, {
    selectedObject: selected,
    simTimeMs: epoch + 1000,
    rate: 2,
    clockGeneration: 11,
    realTimeMs
  });
  scheduler.flush({ includeCancelled: true });
  assert(
    controller.diagnostics().staleJobsDiscarded > staleBeforeClockChange,
    'same-direction rate or manual-clock changes cancel queued samples by clock generation'
  );

  scheduler.flush();
  realTimeMs += 16;
  controller.update(satellites, {
    selectedObject: selected,
    simTimeMs: epoch + 1000,
    rate: 0,
    clockGeneration: 11,
    realTimeMs
  });
  assert.strictEqual(scheduler.size(), 0, 'paused fully covered catalogs do not schedule empty propagation scans');

  const callsBeforeSameTimeInvalidation = propagationCalls;
  controller.invalidate();
  assert.strictEqual(controller.isRenderReady(selected, epoch + 1000), false);
  realTimeMs += 16;
  controller.update(satellites, {
    selectedObject: selected,
    simTimeMs: epoch + 1000,
    rate: 0,
    clockGeneration: 11,
    realTimeMs
  });
  assert.strictEqual(propagationCalls, callsBeforeSameTimeInvalidation + 1, 'same-time invalidation repropagates the selected object');
  assert.strictEqual(controller.isRenderReady(selected, epoch + 1000), true, 'same-time selected propagation restores render readiness');

  let invalidNowMs = 0;
  let propagationAvailable = false;
  const invalidScheduler = createScheduler();
  const invalidObject = {
    satrec: { phase: 2 },
    mesh: {
      visible: true,
      userData: { filterVisible: true },
      position: positionObject()
    }
  };
  const invalidController = createSatelliteMotionController({
    propagate: (satrec, date) => propagationAvailable ? propagate(satrec, date) : null,
    toSceneSample,
    now: () => invalidNowMs,
    schedule: callback => invalidScheduler.schedule(callback),
    cancelSchedule: id => invalidScheduler.cancel(id),
    propagationBudgetMs: 100,
    failureRetryMs: 1000
  });
  const invalidCatalog = [invalidObject];
  invalidController.update(invalidCatalog, { simTimeMs: epoch, rate: 0, realTimeMs: invalidNowMs });
  invalidScheduler.flush();
  assert.strictEqual(invalidObject.mesh.visible, false, 'a never-valid catalog marker is hidden instead of rendered at Earth center');
  assert.strictEqual(invalidObject.propagationInvalid, true, 'failed catalog propagation is explicit');
  assert.strictEqual(invalidObject.motionPositionReady, false, 'failed propagation cannot be reported as render-ready');
  invalidNowMs = 500;
  invalidController.update(invalidCatalog, { simTimeMs: epoch, rate: 0, realTimeMs: invalidNowMs });
  assert.strictEqual(invalidScheduler.size(), 0, 'failed catalog propagation respects the retry backoff');
  propagationAvailable = true;
  invalidNowMs = 1100;
  invalidController.update(invalidCatalog, { simTimeMs: epoch, rate: 0, realTimeMs: invalidNowMs });
  invalidScheduler.flush();
  assert.strictEqual(invalidObject.mesh.visible, true, 'a recovered catalog marker is restored when its filter still allows it');
  assert.strictEqual(invalidObject.propagationInvalid, false, 'recovered catalog propagation clears degraded state');
  assert.strictEqual(invalidObject.motionPositionReady, true, 'a finite committed position makes the marker render-ready');
  assert.notEqual(invalidObject.mesh.position.x, 0, 'paused recovery commits a finite sampled position immediately');

  propagationAvailable = false;
  invalidNowMs = 1200;
  invalidController.update(invalidCatalog, {
    selectedObject: invalidObject,
    simTimeMs: epoch + 1,
    rate: 0,
    realTimeMs: invalidNowMs
  });
  assert.strictEqual(invalidObject.mesh.visible, false, 'invalid exact selected propagation hides the selected marker');
  propagationAvailable = true;
  const selectedRetryDeadline = invalidController.stateFor(invalidObject).retryAfterRealMs;
  for (const frameTime of [1500, 1800, 2100]) {
    invalidNowMs = frameTime;
    invalidController.update(invalidCatalog, {
      selectedObject: invalidObject,
      simTimeMs: epoch + 1,
      rate: 1,
      realTimeMs: invalidNowMs
    });
    assert.equal(
      invalidController.stateFor(invalidObject).retryAfterRealMs,
      selectedRetryDeadline,
      'intermediate animation frames do not postpone selected propagation retry'
    );
  }
  invalidNowMs = 2300;
  invalidController.update(invalidCatalog, {
    selectedObject: invalidObject,
    simTimeMs: epoch + 1,
    rate: 0,
    realTimeMs: invalidNowMs
  });
  assert.strictEqual(invalidObject.mesh.visible, true, 'selected marker recovers at the same UTC instant after retry');

  const jumpScheduler = createScheduler();
  const jumpObject = {
    satrec: {},
    mesh: { visible: true, userData: { filterVisible: true }, position: positionObject() }
  };
  const hiddenJumpObject = {
    satrec: {},
    mesh: { visible: true, userData: { filterVisible: true }, position: positionObject() }
  };
  const jumpController = createSatelliteMotionController({
    propagate: (_satrec, date) => ({
      position: { x: 7000 + (date.getTime() - epoch) / 1000, y: 0, z: 0 },
      velocity: { x: 0.001, y: 0, z: 0 }
    }),
    toSceneSample,
    now: () => realTimeMs,
    schedule: callback => jumpScheduler.schedule(callback),
    cancelSchedule: id => jumpScheduler.cancel(id),
    propagationBudgetMs: 100,
    correctionBlendMs: 100
  });
  const jumpCatalog = [jumpObject, hiddenJumpObject];
  jumpController.update(jumpCatalog, {
    simTimeMs: epoch,
    rate: 0,
    clockGeneration: 1,
    realTimeMs
  });
  jumpScheduler.flush();
  assert(Math.abs(jumpObject.mesh.position.x - 7000) < 1e-9, 'paused catalog starts at its exact sampled instant');
  hiddenJumpObject.mesh.userData.filterVisible = false;
  hiddenJumpObject.mesh.visible = false;
  realTimeMs += 16;
  jumpController.update([jumpObject], {
    simTimeMs: epoch + 86_400_000,
    rate: 0,
    clockGeneration: 2,
    realTimeMs
  });
  jumpScheduler.flush();
  assert(Math.abs(jumpObject.mesh.position.x - 93_400) < 1e-9, 'paused discontinuous UTC jump commits the new sampled state');
  hiddenJumpObject.mesh.userData.filterVisible = true;
  assert.strictEqual(
    jumpController.isRenderReady(hiddenJumpObject, epoch + 86_400_000),
    false,
    'a hidden old-epoch sample is not render-ready when its filter is re-admitted after a jump'
  );
  hiddenJumpObject.mesh.visible = jumpController.isRenderReady(hiddenJumpObject, epoch + 86_400_000);
  assert.strictEqual(hiddenJumpObject.mesh.visible, false);
  jumpController.update(jumpCatalog, {
    simTimeMs: epoch + 86_400_000,
    rate: 0,
    clockGeneration: 2,
    realTimeMs
  });
  jumpScheduler.flush();
  assert.strictEqual(jumpController.isRenderReady(hiddenJumpObject, epoch + 86_400_000), true);
  assert(Math.abs(hiddenJumpObject.mesh.position.x - 93_400) < 1e-9, 're-admitted marker appears only after its current-epoch sample commits');
  realTimeMs += 16;
  jumpController.update(jumpCatalog, {
    simTimeMs: epoch + 86_400_000,
    rate: 0,
    clockGeneration: 2,
    realTimeMs
  });
  assert(Math.abs(jumpObject.mesh.position.x - 93_400) < 1e-9, 'paused resample remains stable after the async job');

  const diagnosticCatalog = [
    {
      norad_id: '1',
      motionPositionReady: true,
      mesh: { visible: true, userData: { filterVisible: true }, position: { x: 8, y: 0, z: 0, toArray: () => [8, 0, 0] } }
    },
    {
      norad_id: '2',
      motionPositionReady: false,
      mesh: { visible: true, userData: { filterVisible: true }, position: { x: 0, y: 0, z: 0, toArray: () => [0, 0, 0] } }
    },
    {
      norad_id: '3',
      motionPositionReady: false,
      mesh: { visible: false, userData: { filterVisible: true }, position: { x: 0, y: 0, z: 0, toArray: () => [0, 0, 0] } }
    }
  ];
  assert.deepStrictEqual(satelliteMarkerDiagnostics(diagnosticCatalog, 3), {
    visibleNoradIds: ['1', '2', '3'],
    drawnNoradIds: ['1'],
    unreadyVisibleNoradIds: ['2'],
    visibleOriginNoradIds: ['2']
  }, 'diagnostics distinguish filter membership from finite rendered markers');
  assert.deepStrictEqual(satelliteMarkerState(diagnosticCatalog, '1'), {
    noradId: '1',
    position: [8, 0, 0],
    radius: 8,
    filterVisible: true,
    visible: true,
    propagationInvalid: false
  });

  const indexHtml = fs.readFileSync('index.html', 'utf8');
  assert(indexHtml.includes('satelliteMotionController.update(renderableSatellites'), 'per-frame interpolation scales with visible satellites');
  assert(indexHtml.includes('selectedPropagation = motion.selectedPropagation'), 'one selected propagation state feeds the frame');
  assert(indexHtml.includes('applySelectedSatelliteNadirOrientation(selectedPropagation)'), 'selected orientation reuses the exact propagated state');
  assert.strictEqual(
    (indexHtml.match(/propagation: selectedPropagation/g) || []).length,
    3,
    '3D and both Mercator footprint paths reuse the exact selected propagation state'
  );
  assert(indexHtml.includes('Catalog markers cadence-limited; selected satellite remains exact'), 'high Time x reports curvature-limited catalog cadence');
  assert(!indexHtml.includes('visibleSatelliteFrameProcessor'), 'obsolete staggered sprite snapping is removed');

  console.log('Satellite motion interpolation tests passed');
}

run();
