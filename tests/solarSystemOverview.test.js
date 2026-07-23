import assert from 'assert';
import fs from 'fs';
import {
  SOLAR_SYSTEM_LABEL_MAX_SCREEN_PX,
  SOLAR_SYSTEM_LABEL_MIN_SCREEN_PX,
  SOLAR_SYSTEM_PLANETS,
  SOLAR_SYSTEM_TEXTURE_ATTRIBUTIONS,
  SOLAR_SYSTEM_TEXTURE_PATHS,
  advanceSolarSystemSimulationMillis,
  solarSystemLabelScaleFactorForDistance,
  solarSystemLabelScreenHeightPxForScale,
  planetPositionAtDate
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
  const html = fs.readFileSync('SolarSystemOverview.html', 'utf8');
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const menuHtml = fs.readFileSync('js/SatelliteMenuLoader.js', 'utf8');
  const loader = fs.readFileSync('js/solarSystemOverviewLoader.js', 'utf8');
  const readme = fs.readFileSync('README.md', 'utf8');
  const integration = fs.readFileSync('Test_and_Integration.md', 'utf8');

  assert(html.includes('<title>OpenBEXI Solar System Overview</title>'), 'SolarSystemOverview.html has the expected title');
  assert(html.includes('"three": "https://unpkg.com/three@0.184.0/build/three.module.js"'), 'SolarSystemOverview uses Three.js 0.184.0');
  assert(html.includes('"three/addons/": "https://unpkg.com/three@0.184.0/examples/jsm/"'), 'SolarSystemOverview uses matching Three.js addons version');
  assert(html.includes("import { OrbitControls } from 'three/addons/controls/OrbitControls.js';"), 'SolarSystemOverview imports OrbitControls');
  assert(html.includes('const PLANETS = ['), 'SolarSystemOverview defines a planet catalog');
  assert(indexHtml.includes("from './js/solarSystemOverviewLoader.js'"), 'index integrates the reusable Solar System overview module');
  assert(menuHtml.includes('id="solarSystemOverviewToggle"'), 'main menu exposes Solar System toggle');
  assert(menuHtml.includes('id="solarSystemOptions" class="solar-system-options" hidden'), 'Solar System sub-controls are hidden by default');
  assert(menuHtml.includes('solarSystemPlanetLabelsToggle'), 'Solar System labels sub-control exists');
  assert(menuHtml.includes('solarSystemOrbitPathsToggle'), 'Solar System orbit paths sub-control exists');
  assert(menuHtml.includes('solarSystemPlanetTexturesToggle'), 'Solar System textures sub-control exists');
  assert(menuHtml.includes('solarSystemSunGlowToggle'), 'Solar System sun glow sub-control exists');
  assert(!menuHtml.includes('menuTimeWarpSlider'), 'Views & Time no longer includes the menu Time x slider');

  const requiredPlanets = [
    'Mercury',
    'Venus',
    'Earth',
    'Moon',
    'Mars',
    'Jupiter',
    'Saturn',
    'Uranus'
  ];
  requiredPlanets.forEach((planet) => {
    assert(html.includes(`name: '${planet}'`), `SolarSystemOverview defines ${planet}`);
    assert(html.includes(`${planet} Orbit Path`) || html.includes('createOrbitPath(planet)'), `SolarSystemOverview supports ${planet} orbit rendering`);
  });
  assert.deepStrictEqual(SOLAR_SYSTEM_PLANETS.map(planet => planet.name), requiredPlanets, 'integrated module defines the required planet set in order');

  [
    'createOrbitPath',
    'new THREE.LineLoop',
    'createPlanetLabel',
    'updatePlanetLabelCallout',
    'Planet Label',
    'utcClock',
    'UTC',
    'createSun',
    'createGlowTexture',
    'PointLight',
    'MILKY_WAY_TEXTURE_URL',
    'createProceduralStarField',
    'solveKepler',
    'planetPositionAtDate',
    'resetCamera'
  ].forEach((needle) => {
    assert(html.includes(needle), `SolarSystemOverview includes ${needle}`);
  });

  [
    'createSolarSystemOverview',
    'setSolarSystemOverviewOptions',
    'pickSolarSystemPlanet',
    'setSolarSystemSelectedPlanet',
    'focusSolarSystemPlanet',
    'resetSolarSystemOverviewCamera',
    'solarSystemPlanetSummary',
    'solarSystemEphemerisSummary',
    'shouldUseEphemerisOrbitPath',
    'loadSolarSystemEphemeris',
    'solarSystemScenePositionForBody',
    'texture.colorSpace = THREE.SRGBColorSpace',
    'getMaxAnisotropy',
    'LABEL_BASE_SCALE',
    'updatePlanetLabelCallout',
    'SOLAR_SYSTEM_LABEL_MIN_SCREEN_PX',
    'SOLAR_SYSTEM_LABEL_PREFERRED_SCREEN_PX',
    'SOLAR_SYSTEM_LABEL_MAX_SCREEN_PX',
    'LABEL_MAX_DISTANCE_SCALE = 5.2',
    'LABEL_PIN_CENTER_X',
    'LABEL_PIN_CENTER_Y',
    'sprite.center.set(LABEL_PIN_CENTER_X, LABEL_PIN_CENTER_Y)',
    'solarSystemLabelScaleFactorForDistance',
    "ctx.font = '700 38px",
    'ctx.arc(42, 122',
    'depthTest: false',
    'new THREE.LineLoop',
    'Solar System Selected Planet Highlight',
    'fallbackMaterial'
  ].forEach((needle) => {
    assert(loader.includes(needle), `integrated Solar System loader includes ${needle}`);
  });

  Object.entries(SOLAR_SYSTEM_TEXTURE_PATHS).forEach(([key, texturePath]) => {
    assert(!/^https?:\/\//i.test(texturePath), `${key} texture is local, not remote`);
    if (key === 'milkyWay' && !fs.existsSync(texturePath)) {
      assert(loader.includes('overview.starGroup.add(createProceduralStarField())'), 'Milky Way texture has procedural fallback');
      return;
    }
    assert(fs.existsSync(texturePath), `${key} texture exists at ${texturePath}`);
    const { width, height } = imageDimensions(texturePath);
    assert(width <= 8192 && height <= 4096, `${key} texture is within browser-safe dimensions`);
  });
  SOLAR_SYSTEM_PLANETS.forEach((planet) => {
    assert(planet.textureUrl && fs.existsSync(planet.textureUrl), `${planet.name} has a local texture path`);
    const position = planetPositionAtDate(planet, new Date('2026-06-07T00:00:00Z'));
    assert(Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z), `${planet.name} approximate position is finite`);
  });
  assert.strictEqual(SOLAR_SYSTEM_TEXTURE_PATHS.earth, 'textures/earthmap1k.jpg', 'Earth reuses the existing project Earth texture');
  assert.strictEqual(SOLAR_SYSTEM_TEXTURE_PATHS.moon, 'textures/moon_map2.jpg', 'Moon reuses the existing project Moon texture');
  assert.strictEqual(SOLAR_SYSTEM_TEXTURE_PATHS.mars, 'textures/March_8k.jpg', 'Mars reuses the optimized project Mars texture');
  assert.strictEqual(SOLAR_SYSTEM_TEXTURE_PATHS.mercury, 'textures/mercury.png', 'Mercury uses the required root texture');
  assert.strictEqual(SOLAR_SYSTEM_TEXTURE_PATHS.venus, 'textures/venus.png', 'Venus uses the required root texture');
  assert.strictEqual(SOLAR_SYSTEM_TEXTURE_PATHS.jupiter, 'textures/jupiter.jpg', 'Jupiter uses the required root texture');
  assert(SOLAR_SYSTEM_TEXTURE_ATTRIBUTIONS.some(line => line.includes('project-generated procedural visual maps')), 'texture attributions document generated local planet maps');
  assert(SOLAR_SYSTEM_TEXTURE_ATTRIBUTIONS.some(line => line.includes('textures/mercury.png, textures/venus.png, and textures/jupiter.jpg')), 'texture attributions document local Mercury/Venus/Jupiter maps');

  const earth = SOLAR_SYSTEM_PLANETS.find(planet => planet.name === 'Earth');
  const moon = SOLAR_SYSTEM_PLANETS.find(planet => planet.name === 'Moon');
  const mars = SOLAR_SYSTEM_PLANETS.find(planet => planet.name === 'Mars');
  const t0 = new Date('2026-06-07T00:00:00Z');
  const t1 = new Date('2026-06-08T00:00:00Z');
  const t7 = new Date('2026-06-14T00:00:00Z');
  const earthMotionOneDay = planetPositionAtDate(earth, t0).distanceTo(planetPositionAtDate(earth, t1));
  const earthMotionSevenDays = planetPositionAtDate(earth, t0).distanceTo(planetPositionAtDate(earth, t7));
  assert(earthMotionOneDay > 0, 'Earth moves when the simulation date advances');
  assert(earthMotionSevenDays > earthMotionOneDay, 'larger simulation-time changes produce larger Earth orbital motion');
  assert(planetPositionAtDate(mars, t0).distanceTo(planetPositionAtDate(mars, t7)) > 0, 'Mars moves when the simulation date advances');
  assert(planetPositionAtDate(moon, t0).distanceTo(planetPositionAtDate(moon, t1)) > 0, 'Moon moves around Earth when the simulation date advances');
  assert.strictEqual(advanceSolarSystemSimulationMillis(1000, 10, 0), 1000, 'Time x = 0 freezes simulation milliseconds');
  assert.strictEqual(advanceSolarSystemSimulationMillis(1000, 2, 1), 121000, 'Time x = 1 advances one simulation minute per real second');
  assert.strictEqual(advanceSolarSystemSimulationMillis(1000, 2, 60), 7201000, 'Time x = 60 advances sixty simulation minutes per real second');
  assert(indexHtml.includes('advanceSolarSystemSimulationMillis(simMillis, dtReal, simParams.timeWarp)'), 'main app simulation time is driven by the Time x helper');
  assert(indexHtml.includes('updateSolarSystemOverview(solarSystemOverview, SIM_DATE)'), 'integrated Solar System updates from the shared simulation date');

  [
    { distance: 20, viewportHeight: 900 },
    { distance: 160, viewportHeight: 900 },
    { distance: 520, viewportHeight: 580 }
  ].forEach(({ distance, viewportHeight }) => {
    const scale = solarSystemLabelScaleFactorForDistance(distance, { fovDeg: 52, viewportHeight });
    const screenHeight = solarSystemLabelScreenHeightPxForScale(scale, distance, { fovDeg: 52, viewportHeight });
    assert(screenHeight >= SOLAR_SYSTEM_LABEL_MIN_SCREEN_PX - 0.01, `label at distance ${distance} is at least the minimum readable screen height`);
    assert(screenHeight <= SOLAR_SYSTEM_LABEL_MAX_SCREEN_PX + 0.01, `label at distance ${distance} stays below the maximum screen height`);
  });
  assert(
    solarSystemLabelScaleFactorForDistance(520, { fovDeg: 52, viewportHeight: 580 }) >
      solarSystemLabelScaleFactorForDistance(80, { fovDeg: 52, viewportHeight: 580 }),
    'far Solar System labels scale larger than close labels'
  );

  assert(!html.includes('TheSkyLive'), 'SolarSystemOverview does not copy TheSkyLive branding');
  assert(!html.toLowerCase().includes('watermark'), 'SolarSystemOverview does not include a third-party watermark');
  assert(!indexHtml.includes('SolarSystemOverview.html'), 'index.html does not open the standalone SolarSystemOverview page');

  const release = JSON.parse(fs.readFileSync('release/version.json', 'utf8'));
  assert(indexHtml.includes('const versionNumber = APP_VERSION;'), 'index.html uses authoritative browser release metadata');
  assert.strictEqual(release.version, '2.1.0', 'Solar System remains available during Version 2.1 development');

  assert(readme.includes('## Solar System Overview'), 'README documents the standalone Solar System Overview page');
  assert(readme.includes('http://127.0.0.1:8000/SolarSystemOverview.html'), 'README documents the local SolarSystemOverview URL');
  assert(readme.includes('Version 1.6.2 integrates `Solar System Overview`'), 'README documents integrated Solar System Overview release behavior');
  assert(readme.includes('Version 1.7 upgrades Solar System textures and uses bundled JPL-derived ephemeris data'), 'README documents Version 1.7 Solar System ephemeris release behavior');
  assert(integration.includes('### Standalone Solar System Overview'), 'integration plan documents standalone Solar System Overview checks');
  assert(integration.includes('Solar System Overview Integration'), 'integration plan documents integrated Solar System Overview checks');
  assert(indexHtml.includes('activateMoonFromSolarSystemSelection'), 'integrated Solar System maps Moon selection to the existing Moon mode');
  assert(fs.readFileSync('PROMPT_History.md', 'utf8').includes('Version 1.6.2'), 'prompt history records SolarSystemOverview as a release integration');
  assert(fs.readFileSync('PROMPT_History.md', 'utf8').includes('Version 1.7'), 'prompt history records the ephemeris release');

  console.log('Solar System Overview tests passed');
}

run();
