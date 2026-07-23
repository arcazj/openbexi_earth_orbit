import assert from 'assert';
import fs from 'fs';
import {
  DEFAULT_STAR_MAGNITUDE_LIMIT,
  GAIA_EXTERNAL_ONLY_MAGNITUDE_LIMIT,
  MAX_INTEGRATED_STAR_MAGNITUDE_LIMIT,
  MAX_BROWSER_STAR_MAGNITUDE_LIMIT,
  buildStarBufferData,
  filterStarsByMagnitude,
  raDecToCartesian
} from '../js/starSkyUtils.js';
import { BRIGHT_STARS_DEMO } from '../data/stars/bright-stars-demo.js';

function closeTo(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function run() {
  const html = fs.readFileSync('Earth_Stars_MilkyWay.html', 'utf8');
  const preprocessor = fs.readFileSync('tools/preprocess_star_catalog.py', 'utf8');

  assert.strictEqual(DEFAULT_STAR_MAGNITUDE_LIMIT, 10, 'default browser star magnitude limit is <10');
  assert.strictEqual(MAX_BROWSER_STAR_MAGNITUDE_LIMIT, 11.5, 'browser slider caps at <11.5');
  assert.strictEqual(MAX_INTEGRATED_STAR_MAGNITUDE_LIMIT, 13, 'future integrated star magnitude cap remains available for larger local catalogs');
  assert.strictEqual(GAIA_EXTERNAL_ONLY_MAGNITUDE_LIMIT, 18, 'magnitude <18 is documented as external-only');

  const ra0 = raDecToCartesian({ raDeg: 0, decDeg: 0, radius: 1 });
  closeTo(ra0.x, 1, 1e-12, 'RA 0 Dec 0 maps to +X');
  closeTo(ra0.y, 0, 1e-12, 'RA 0 Dec 0 y');
  closeTo(ra0.z, 0, 1e-12, 'RA 0 Dec 0 z');

  const ra6h = raDecToCartesian({ raHours: 6, decDeg: 0, radius: 1 });
  closeTo(ra6h.x, 0, 1e-12, 'RA 6h Dec 0 x');
  closeTo(ra6h.z, -1, 1e-12, 'RA 6h Dec 0 maps to -Z');

  const northPole = raDecToCartesian({ raDeg: 123, decDeg: 90, radius: 1 });
  closeTo(northPole.y, 1, 1e-12, 'Dec 90 maps to +Y');

  const sirius = BRIGHT_STARS_DEMO.find(star => star.name === 'Sirius');
  const polaris = BRIGHT_STARS_DEMO.find(star => star.name === 'Polaris');
  const proxima = BRIGHT_STARS_DEMO.find(star => star.name === 'Proxima Centauri');
  assert(sirius && polaris && proxima, 'reference stars exist in demo catalog');
  const polarisPosition = raDecToCartesian({ raHours: polaris.raHours, decDeg: polaris.decDeg, radius: 1 });
  assert(polarisPosition.y > 0.999, 'Polaris appears near the north celestial pole');

  const defaultStars = filterStarsByMagnitude(BRIGHT_STARS_DEMO, DEFAULT_STAR_MAGNITUDE_LIMIT);
  const maxStars = filterStarsByMagnitude(BRIGHT_STARS_DEMO, MAX_BROWSER_STAR_MAGNITUDE_LIMIT);
  assert(defaultStars.some(star => star.name === 'Barnard Star'), 'default <10 includes Barnard Star');
  assert(!defaultStars.some(star => star.name === 'Proxima Centauri'), 'default <10 excludes Proxima Centauri');
  assert(maxStars.some(star => star.name === 'Proxima Centauri'), 'slider <11.5 includes Proxima Centauri');

  const buffers = buildStarBufferData(BRIGHT_STARS_DEMO, { magnitudeLimit: DEFAULT_STAR_MAGNITUDE_LIMIT });
  assert.strictEqual(buffers.positions.length, defaultStars.length * 3, 'position buffer matches filtered count');
  assert.strictEqual(buffers.colors.length, defaultStars.length * 3, 'color buffer matches filtered count');
  assert.strictEqual(buffers.sizes.length, defaultStars.length, 'size buffer matches filtered count');
  const fullCatalogBuffers = buildStarBufferData(BRIGHT_STARS_DEMO, { magnitudeLimit: Number.POSITIVE_INFINITY });
  assert.strictEqual(BRIGHT_STARS_DEMO.length, 46, 'bundled reference catalog currently contains 46 stars');
  assert.strictEqual(fullCatalogBuffers.stars.length, BRIGHT_STARS_DEMO.length, 'unbounded magnitude renders all bundled reference stars');

  assert(html.includes('<title>OpenBEXI Earth Stars Milky Way</title>'), 'page has the expected title');
  assert(html.includes('id="magnitudeSlider" type="range" min="4" max="11.5" value="10"'), 'page has the recommended magnitude slider');
  assert(html.includes('Magnitude &lt;18 is not loaded directly'), 'page documents Gaia/deep catalog limitation');
  assert(html.includes('Gaia DR3 contains about 1.8 billion sources'), 'page explains why <18 is external-only');
  assert(html.includes('https://www.cosmos.esa.int/web/gaia/dr3'), 'page links Gaia DR3 source reference');
  assert(html.includes('https://heasarc.gsfc.nasa.gov/W3Browse/all/tycho2.html'), 'page links Tycho-2 source reference');
  assert(html.includes('Solarsystemscope_texture_2k_stars_milky_way.jpg'), 'page links optional Milky Way texture source reference');
  assert(html.includes('obj/Textures/starmap-4k.jpg'), 'page attempts a local Milky Way texture');
  assert(html.includes('makeMilkyWayFallbackTexture'), 'page has a procedural Milky Way fallback');
  assert(html.includes('THREE.BackSide'), 'Milky Way is rendered inside a celestial sphere');
  assert(html.includes('buildStarBufferData(STAR_CATALOG'), 'page uses reusable RA/Dec star buffer generation');
  assert(html.includes('astronomy-engine'), 'page documents optional astronomy-engine use for epoch transforms');
  assert(!html.includes('mag: 18'), 'page does not inline a magnitude <18 catalog');
  assert(!html.includes('index.html'), 'standalone page does not modify or depend on index.html navigation');

  assert(preprocessor.includes('--limit'), 'preprocessor supports magnitude limit');
  assert(preprocessor.includes('tile-deg'), 'preprocessor supports RA tiling');
  assert(preprocessor.includes('Tycho-2'), 'preprocessor documents Tycho-2-style use');
  assert(preprocessor.includes('Gaia DR3'), 'preprocessor documents Gaia DR3 external LOD use');

  console.log('Earth Stars Milky Way tests passed');
}

run();
