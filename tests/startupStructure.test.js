import assert from 'assert';
import fs from 'fs';

function run() {
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const moduleStart = indexHtml.indexOf('<script type="module">');
  assert(moduleStart >= 0, 'index.html contains the main module script');

  const startFunction = indexHtml.indexOf('async function start()');
  assert(startFunction >= 0, 'index.html defines async start()');

  const firstAnimationStart = indexHtml.indexOf('startAnimationLoopOnce();', startFunction);
  const tleAwait = indexHtml.indexOf('await setupTLESatellites(scene', startFunction);
  assert(firstAnimationStart > startFunction, 'start() starts the animation loop');
  assert(tleAwait > firstAnimationStart, 'first render starts before awaiting TLE setup');

  assert(
    indexHtml.includes('startupPerf.markOnce(\'first-visible-globe-render\')'),
    'first visible globe render is instrumented'
  );
  assert(
    indexHtml.includes('scheduleDeferredStartupWork();'),
    'timeline and decay work are scheduled after first interactive UI'
  );
  assert(
    indexHtml.includes('SATELLITE_SETUP_CHUNK_SIZE'),
    'TLE sprite setup uses a named chunk size'
  );
  assert(
    indexHtml.includes('DECAY_ESTIMATE_CHUNK_SIZE'),
    'deferred decay estimates use a named chunk size'
  );

  console.log('startupStructure tests passed');
}

run();
