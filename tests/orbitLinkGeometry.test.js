import assert from 'assert';
import {
  computeLookGeometry,
  geodeticToEcfKm,
  lonLatFromMercatorPixel,
  mercatorPixelFromLonLat,
  orbitClassFromMeanMotion
} from '../js/orbit/orbitLinkGeometry.js';

function closeTo(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function run() {
  const ground = geodeticToEcfKm(0, 0, 0);
  closeTo(ground.x, 6378.137, 1e-6, 'ground x');
  closeTo(ground.y, 0, 1e-6, 'ground y');
  closeTo(ground.z, 0, 1e-6, 'ground z');

  const overheadSat = geodeticToEcfKm(0, 0, 550);
  const look = computeLookGeometry(overheadSat, 0, 0);
  closeTo(look.rangeKm, 550, 1e-6, 'overhead range');
  closeTo(look.elevationDeg, 90, 1e-6, 'overhead elevation');

  const px = mercatorPixelFromLonLat(-122.4194, 37.7749, 1024, 512);
  const ll = lonLatFromMercatorPixel(px.x, px.y, 1024, 512);
  closeTo(ll.lonDeg, -122.4194, 1e-9, 'mercator lon round trip');
  closeTo(ll.latDeg, 37.7749, 1e-9, 'mercator lat round trip');

  assert.strictEqual(orbitClassFromMeanMotion(15.5), 'LEO');
  assert.strictEqual(orbitClassFromMeanMotion(2.0), 'GEO');
  assert.strictEqual(orbitClassFromMeanMotion(4.0), 'MEO');

  console.log('Orbit geometry tests passed');
}

run();
