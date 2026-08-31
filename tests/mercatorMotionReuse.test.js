import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  drawSelectedGroundTrack,
  groundTrackOptions,
  updateMercatorMap
} from '../js/mercatorMapLoader.js';

function contextStub() {
  return {
    strokeCalls: 0,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() { this.strokeCalls += 1; }
  };
}

const originalPathLen = groundTrackOptions.pathLenMin;
const originalTimeStep = groundTrackOptions.timeStepMin;
groundTrackOptions.pathLenMin = 2;
groundTrackOptions.timeStepMin = 1;

let propagationCalls = 0;
let propagationAvailable = true;
const satelliteLib = {
  propagate(_satrec, date) {
    propagationCalls += 1;
    if (!propagationAvailable) return null;
    const phase = date.getTime() / 60_000;
    return {
      position: { x: 7000, y: Math.sin(phase) * 100, z: Math.cos(phase) * 100 }
    };
  },
  jday() { return 2460000; },
  gstime() { return 0; },
  eciToGeodetic(position) {
    return { latitude: position.z / 7000, longitude: position.y / 7000 };
  }
};
const selected = {
  norad_id: '100001',
  satellite_name: 'CACHE TEST',
  satrec: {},
  mesh: { position: { x: 7000, y: 0, z: 0 }, visible: true },
  isSelected: true,
  element_set: { epoch: '2026-08-23T00:00:00Z' }
};
const source = [selected];
const ctx = contextStub();
const start = Date.parse('2026-08-23T00:00:00Z');

drawSelectedGroundTrack({
  showOrbit: true,
  timeWarp: 30,
  simDate: new Date(start),
  selectedSatelliteNoradId: '100001'
}, ctx, satelliteLib, source, { realTimeMs: 0 });
assert.equal(propagationCalls, 3, 'initial selected ground track is sampled once');

drawSelectedGroundTrack({
  showOrbit: true,
  timeWarp: 30,
  simDate: new Date(start + 60_000),
  selectedSatelliteNoradId: '100001'
}, ctx, satelliteLib, source, { realTimeMs: 100 });
assert.equal(propagationCalls, 3, 'ordinary Mercator redraw reuses the selected ground track');

drawSelectedGroundTrack({
  showOrbit: true,
  timeWarp: 30,
  simDate: new Date(start + 6 * 60_000),
  selectedSatelliteNoradId: '100001'
}, ctx, satelliteLib, source, { realTimeMs: 500 });
assert.equal(propagationCalls, 3, 'running ground-track refresh obeys its real-time cadence');

drawSelectedGroundTrack({
  showOrbit: true,
  timeWarp: 30,
  simDate: new Date(start + 6 * 60_000),
  selectedSatelliteNoradId: '100001'
}, ctx, satelliteLib, source, { realTimeMs: 1100 });
assert.equal(propagationCalls, 6, 'running ground track refreshes after both simulation and real-time thresholds');

drawSelectedGroundTrack({
  showOrbit: true,
  timeWarp: 0,
  simDate: new Date(start + 7 * 60_000),
  selectedSatelliteNoradId: '100001'
}, ctx, satelliteLib, source, { realTimeMs: 1200 });
assert.equal(propagationCalls, 9, 'paused direct time changes refresh immediately');

propagationAvailable = false;
ctx.strokeCalls = 0;
drawSelectedGroundTrack({
  showOrbit: true,
  timeWarp: 0,
  simDate: new Date(start + 8 * 60_000),
  selectedSatelliteNoradId: '100001'
}, ctx, satelliteLib, source, { realTimeMs: 1300 });
assert.equal(propagationCalls, 12, 'a failed paused-time rebuild attempts the configured track once');
assert.equal(groundTrackOptions.points.length, 0, 'a failed same-satellite rebuild clears the stale prior track');
assert.equal(ctx.strokeCalls, 0, 'no stale ground-track stroke is drawn after a failed rebuild');

drawSelectedGroundTrack({
  showOrbit: true,
  timeWarp: 0,
  simDate: new Date(start + 8 * 60_000),
  selectedSatelliteNoradId: '100001'
}, ctx, satelliteLib, source, { realTimeMs: 1400 });
assert.equal(propagationCalls, 12, 'the failed instant is cached instead of retrying every Mercator redraw');

selected.metadata_only = true;
selected.has_current_elements = false;
selected.propagation_status = 'NO_CURRENT_ELEMENTS';
groundTrackOptions.points = [{ latDeg: 1, lonDeg: 2 }];
drawSelectedGroundTrack({
  showOrbit: true,
  timeWarp: 0,
  simDate: new Date(start + 9 * 60_000),
  selectedSatelliteNoradId: '100001'
}, ctx, satelliteLib, source, { realTimeMs: 1500 });
assert.equal(propagationCalls, 12, 'metadata-only selections never rebuild a stale ground track');
assert.equal(groundTrackOptions.points.length, 0, 'metadata-only selections clear any cached ground track');

groundTrackOptions.pathLenMin = originalPathLen;
groundTrackOptions.timeStepMin = originalTimeStep;

const sourceText = fs.readFileSync('js/mercatorMapLoader.js', 'utf8');
assert(!updateMercatorMap.toString().includes('satellite.propagate'), 'Mercator markers do not run a second exact catalog propagation pass');
assert(sourceText.includes('sceneToEciVector(mercatorEciScratch, s.mesh?.position)'), 'Mercator markers reuse interpolated scene positions');
assert(sourceText.includes('MAX_MERCATOR_LABELS'), 'Mercator label collision work has a hard upper bound');
assert(sourceText.includes('satDrawData.length > 1000'), 'large Mercator catalogs switch to density markers');
assert(sourceText.includes("dataset.markerMode = densityMode ? 'density' : 'detailed'"), 'Mercator exposes its marker mode for browser diagnostics');
assert(sourceText.includes('mercatorCtx.rect(Math.round(pt.x), Math.round(pt.y), pointSize, pointSize)'), 'density mode batches compact markers in one canvas path');
assert(sourceText.includes('visual.color !== color'), 'density markers are grouped by cached canonical tracked-object color');
assert(sourceText.includes('mercatorVisualCache'), 'Mercator caches object-type classification outside the animation hot loop');
assert(sourceText.includes('isTrackedRecordPropagatable'), 'Mercator markers and ground tracks enforce current-element eligibility');
assert(sourceText.includes('dataset.debrisMarkerCount'), 'Mercator exposes a positioned-debris marker count');
assert(sourceText.includes('drawTrackedMarkerCue'), 'detailed Mercator markers include a type-specific color/shape cue');
assert(sourceText.includes("rgba(255, 255, 255, 0.98)"), 'selected Mercator markers receive a white non-debris ring');
assert(!fs.readFileSync('index.html', 'utf8').includes('drawSelectedGroundTrack(simParams, mercatorCtx)'), 'the animation loop does not draw the selected ground track twice');

console.log('Mercator motion reuse tests passed');
