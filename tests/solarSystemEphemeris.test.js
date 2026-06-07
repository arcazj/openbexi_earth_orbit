import fs from 'fs';
import assert from 'assert';
import {
  SOLAR_SYSTEM_EPHEMERIS_URL,
  createSolarSystemEphemerisState,
  daysBetweenSamples,
  ephemerisThresholdForBody,
  interpolateBodyVectorKm,
  parseSolarSystemEphemerisData,
  solarSystemScenePositionForBody,
  solarSystemEphemerisStatusText,
  vectorDistanceKm
} from '../js/solarSystemEphemeris.js';
import {
  planetPositionAtDate,
  shouldUseEphemerisOrbitPath,
  SOLAR_SYSTEM_PLANETS,
  SOLAR_SYSTEM_TEXTURE_PATHS
} from '../js/solarSystemOverviewLoader.js';

function jpegDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) offset += 1;
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    const lengthBytes = buffer.readUInt16BE(offset);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5)
      };
    }
    offset += lengthBytes;
  }
  throw new Error(`Could not read JPEG dimensions for ${filePath}`);
}

function pngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  assert.strictEqual(buffer.toString('ascii', 1, 4), 'PNG', `${filePath} is a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function imageDimensions(filePath) {
  return filePath.toLowerCase().endsWith('.png') ? pngDimensions(filePath) : jpegDimensions(filePath);
}

function run() {
  const ephemerisPath = SOLAR_SYSTEM_EPHEMERIS_URL;
  const ephemerisRaw = JSON.parse(fs.readFileSync(ephemerisPath, 'utf8'));
  const reference = JSON.parse(fs.readFileSync('data/ephemeris/solar_system_jpl_horizons_reference_samples.json', 'utf8'));
  const ephemeris = parseSolarSystemEphemerisData(ephemerisRaw);
  const loader = fs.readFileSync('js/solarSystemOverviewLoader.js', 'utf8');
  const ephemerisModule = fs.readFileSync('js/solarSystemEphemeris.js', 'utf8');
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const standalone = fs.readFileSync('SolarSystemOverview.html', 'utf8');

  assert.strictEqual(SOLAR_SYSTEM_TEXTURE_PATHS.mercury, 'textures/mercury.png', 'Mercury uses the required local PNG texture');
  assert.strictEqual(SOLAR_SYSTEM_TEXTURE_PATHS.venus, 'textures/venus.png', 'Venus uses the required local PNG texture');
  assert.strictEqual(SOLAR_SYSTEM_TEXTURE_PATHS.jupiter, 'textures/jupiter.jpg', 'Jupiter uses the required local JPEG texture');
  ['mercury', 'venus', 'jupiter'].forEach((key) => {
    const texturePath = SOLAR_SYSTEM_TEXTURE_PATHS[key];
    assert(!/^https?:\/\//i.test(texturePath), `${key} texture path is local`);
    assert(fs.existsSync(texturePath), `${key} texture file exists`);
    const { width, height } = imageDimensions(texturePath);
    assert(width <= 8192 && height <= 4096, `${key} texture dimensions are browser-safe`);
    assert(standalone.includes(`textureUrl: SOLAR_SYSTEM_TEXTURE_PATHS.${key}`), `standalone page uses shared ${key} texture constant`);
  });

  assert.strictEqual(ephemerisRaw.metadata.source, 'NASA/JPL Horizons API', 'ephemeris source is documented');
  assert.strictEqual(ephemerisRaw.metadata.runtimeRemoteFetch, false, 'ephemeris is local at runtime');
  assert.strictEqual(ephemerisRaw.metadata.sampleCadence, 'PT6H', 'ephemeris cadence is documented as 6 hours');
  assert.strictEqual(ephemerisRaw.metadata.referenceFrame, 'ICRF', 'ephemeris frame is documented');
  assert.strictEqual(ephemerisRaw.metadata.referencePlane, 'ECLIPTIC', 'ephemeris reference plane is documented');
  assert.strictEqual(ephemerisRaw.metadata.origin, 'Sun center, Horizons center 500@10', 'ephemeris origin is documented');
  assert.strictEqual(ephemerisRaw.metadata.units, 'km and km/s', 'ephemeris units are documented');
  assert(ephemerisRaw.metadata.timeScale.includes('UTC'), 'ephemeris time scale is documented');
  assert(ephemerisRaw.metadata.license.includes('NASA/JPL Horizons'), 'ephemeris license/source note is documented');
  assert.strictEqual(ephemerisRaw.metadata.dateRange.startUtc, '2020-01-01T00:00:00Z', 'ephemeris start range is documented');
  assert.strictEqual(ephemerisRaw.metadata.dateRange.stopUtc, '2035-12-31T00:00:00Z', 'ephemeris stop range is documented');
  assert.strictEqual(daysBetweenSamples(ephemeris), 0.25, 'ephemeris samples are six hours apart');

  const expectedBodies = SOLAR_SYSTEM_PLANETS.map(planet => planet.key);
  expectedBodies.forEach((key) => {
    assert(ephemeris.bodies[key], `${key} ephemeris body exists`);
    assert.strictEqual(ephemeris.bodies[key].vectors.length, ephemeris.times.length, `${key} has one vector per time sample`);
  });
  const planetByKey = Object.fromEntries(SOLAR_SYSTEM_PLANETS.map(planet => [planet.key, planet]));
  ['mercury', 'venus', 'earth', 'mars', 'jupiter'].forEach((key) => {
    assert(shouldUseEphemerisOrbitPath(planetByKey[key], ephemeris), `${key} has enough ephemeris coverage for a closed JPL-derived orbit guide`);
  });
  ['saturn', 'uranus', 'moon'].forEach((key) => {
    assert(!shouldUseEphemerisOrbitPath(planetByKey[key], ephemeris), `${key} keeps the analytical orbit guide to avoid closing an incomplete ephemeris arc`);
  });

  reference.samples.forEach((sample) => {
    const result = interpolateBodyVectorKm(ephemeris, sample.body, new Date(sample.dateUtc));
    assert.strictEqual(result.status, 'ok', `${sample.body} reference sample interpolates`);
    const errorKm = vectorDistanceKm(result.vector, sample.positionKm);
    assert(errorKm <= ephemerisThresholdForBody(ephemeris, sample.body), `${sample.body} interpolation error ${errorKm.toFixed(3)} km is within threshold`);
  });

  const date = new Date('2026-06-07T09:00:00Z');
  const moonScene = solarSystemScenePositionForBody(ephemeris, 'moon', date);
  const earthVector = interpolateBodyVectorKm(ephemeris, 'earth', date).vector;
  const moonVector = interpolateBodyVectorKm(ephemeris, 'moon', date).vector;
  assert.strictEqual(moonScene.status, 'ok', 'Moon scene position resolves from ephemeris');
  assert.deepStrictEqual(
    moonScene.relativeToEarthKm.map(value => Math.round(value)),
    moonVector.slice(0, 3).map((value, index) => Math.round(value - earthVector[index])),
    'Moon relative vector is derived from Moon minus Earth ephemeris vectors'
  );

  const earthPlanet = SOLAR_SYSTEM_PLANETS.find(planet => planet.key === 'earth');
  const planetByKeyForMotion = Object.fromEntries(SOLAR_SYSTEM_PLANETS.map(planet => [planet.key, planet]));
  const motionState = createSolarSystemEphemerisState();
  motionState.status = 'ready';
  motionState.data = ephemeris;
  const shortStart = new Date('2026-06-07T00:00:00Z');
  const shortEnd = new Date('2026-07-07T00:00:00Z');
  const longEnd = new Date('2030-06-07T00:00:00Z');
  ['mercury', 'venus', 'earth', 'mars'].forEach((key) => {
    const delta = planetPositionAtDate(planetByKeyForMotion[key], shortStart, motionState)
      .distanceTo(planetPositionAtDate(planetByKeyForMotion[key], shortEnd, motionState));
    assert(delta > 0.01, `${key} visibly moves between 2026-06-07 and 2026-07-07`);
  });
  ['jupiter', 'saturn', 'uranus'].forEach((key) => {
    const delta = planetPositionAtDate(planetByKeyForMotion[key], shortStart, motionState)
      .distanceTo(planetPositionAtDate(planetByKeyForMotion[key], longEnd, motionState));
    assert(delta > 0.01, `${key} visibly moves between 2026-06-07 and 2030-06-07`);
  });
  const moonRelativeStart = solarSystemScenePositionForBody(ephemeris, 'moon', shortStart).relativeToEarthKm;
  const moonRelativeEnd = solarSystemScenePositionForBody(ephemeris, 'moon', shortEnd).relativeToEarthKm;
  assert(vectorDistanceKm(moonRelativeStart, moonRelativeEnd) > 1000, 'Moon position changes relative to Earth between test dates');

  const outOfRangeState = createSolarSystemEphemerisState();
  outOfRangeState.status = 'ready';
  outOfRangeState.data = ephemeris;
  outOfRangeState.lastMode = 'JPL-derived ephemeris';
  planetPositionAtDate(earthPlanet, new Date('2040-01-01T00:00:00Z'), outOfRangeState);
  assert.strictEqual(outOfRangeState.lastMode, 'approximate visual fallback', 'out-of-range Solar System date marks fallback mode');
  assert(solarSystemEphemerisStatusText(outOfRangeState).includes('using approximate visual fallback'), 'out-of-range fallback is visible in ephemeris status text');

  assert(loader.includes('solarSystemScenePositionForBody'), 'Solar System loader uses ephemeris scene positions');
  assert(loader.includes('loadSolarSystemEphemeris'), 'Solar System loader loads local ephemeris data');
  assert(!loader.includes('Date.now()'), 'Solar System loader does not use Date.now for body positions');
  assert(!loader.includes('performance.now()'), 'Solar System loader does not use performance.now for body positions');
  assert(!ephemerisModule.includes('Date.now()'), 'ephemeris module does not use Date.now for body positions');
  assert(!ephemerisModule.includes('performance.now()'), 'ephemeris module does not use performance.now for body positions');
  assert(indexHtml.includes('updateSolarSystemOverview(solarSystemOverview, SIM_DATE)'), 'integrated Solar System updates from shared SIM_DATE');
  assert(indexHtml.includes('createSolarSystemOverview(scene, { renderer, camera, controls, initialDate: SIM_DATE })'), 'integrated Solar System initializes from shared SIM_DATE');

  console.log('Solar System ephemeris tests passed');
}

run();
