import assert from 'assert';
import {
  computeLookGeometry,
  geodeticToEcfKm,
  lonLatFromMercatorPixel,
  mercatorPixelFromLonLat,
  orbitClassFromMeanMotion,
  WEB_MERCATOR_MAX_LAT_DEG,
  WGS84_B_KM,
  ecfToGeodeticWgs84
} from '../js/orbit/orbitLinkGeometry.js';

function closeTo(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function run() {
  const ground = geodeticToEcfKm(0, 0, 0);
  closeTo(ground.x, 6378.137, 1e-6, 'ground x');
  closeTo(ground.y, 0, 1e-6, 'ground y');
  closeTo(ground.z, 0, 1e-6, 'ground z');

  const northPole = geodeticToEcfKm(90, 0, 0);
  closeTo(northPole.x, 0, 1e-6, 'north pole x');
  closeTo(northPole.y, 0, 1e-6, 'north pole y');
  closeTo(northPole.z, WGS84_B_KM, 1e-6, 'north pole z uses WGS84 semi-minor axis');

  const overheadSat = geodeticToEcfKm(0, 0, 550);
  const look = computeLookGeometry(overheadSat, 0, 0);
  closeTo(look.rangeKm, 550, 1e-6, 'overhead range');
  closeTo(look.elevationDeg, 90, 1e-6, 'overhead elevation');

  const highLatSat = geodeticToEcfKm(80, 20, 550);
  const highLatLook = computeLookGeometry(highLatSat, 80, 20);
  closeTo(highLatLook.rangeKm, 550, 1e-6, 'high-latitude overhead range');
  closeTo(highLatLook.elevationDeg, 90, 1e-6, 'high-latitude overhead elevation');
  const roundTrip = ecfToGeodeticWgs84(highLatSat);
  closeTo(roundTrip.latDeg, 80, 1e-8, 'WGS84 inverse latitude');
  closeTo(roundTrip.lonDeg, 20, 1e-8, 'WGS84 inverse longitude');
  closeTo(roundTrip.altitudeKm, 550, 1e-6, 'WGS84 inverse altitude');

  const px = mercatorPixelFromLonLat(-122.4194, 37.7749, 1024, 512);
  const ll = lonLatFromMercatorPixel(px.x, px.y, 1024, 512);
  closeTo(ll.lonDeg, -122.4194, 1e-9, 'mercator lon round trip');
  closeTo(ll.latDeg, 37.7749, 1e-9, 'mercator lat round trip');

  const highMercator = mercatorPixelFromLonLat(12, 89.5, 1024, 512);
  const highMercatorLl = lonLatFromMercatorPixel(highMercator.x, highMercator.y, 1024, 512);
  assert(Number.isFinite(highMercator.y), 'high-latitude Web Mercator y is finite');
  closeTo(highMercatorLl.latDeg, WEB_MERCATOR_MAX_LAT_DEG, 1e-9, 'Web Mercator clamps latitude limit');

  assert.strictEqual(orbitClassFromMeanMotion(15.5), 'LEO');
  assert.strictEqual(orbitClassFromMeanMotion(1.0027, { eccentricity: 0.0001, inclinationDeg: 0.1 }), 'GEO');
  assert.strictEqual(orbitClassFromMeanMotion(4.0), 'MEO');
  assert.strictEqual(orbitClassFromMeanMotion(2.0), 'OTHER');
  assert.strictEqual(orbitClassFromMeanMotion(2.0, { eccentricity: 0.65, inclinationDeg: 63.4, periodMinutes: 720 }), 'HEO');
  assert.strictEqual(orbitClassFromMeanMotion(-1), 'UNKNOWN');

  console.log('Orbit geometry tests passed');
}

run();
