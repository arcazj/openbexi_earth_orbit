import assert from 'assert';
import fs from 'fs';

function run() {
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const moduleStart = indexHtml.indexOf('id="openbexi-main-module" type="text/openbexi-module"');
  assert(moduleStart >= 0, 'index.html contains the deferred main module template');
  assert(indexHtml.includes('openbexiBootFromTemplate'), 'index.html boots the deferred module after dependency resolution');
  assert(indexHtml.includes('content="packaged-first-with-cdn-fallback"'), 'source entrypoint explicitly declares its local-first dependency policy');
  assert(indexHtml.includes('./vendor/three/0.184.0/build/three.module.js'), 'index.html declares packaged Three.js');
  assert(indexHtml.includes('https://unpkg.com/three@0.184.0/build/three.module.js'), 'source policy retains an exact Three.js CDN fallback');
  assert(indexHtml.includes('./vendor/satellite.js/6.0.2/satellite.min.js'), 'index.html declares packaged satellite.js');
  assert(indexHtml.includes('https://unpkg.com/satellite.js@6.0.2/dist/satellite.min.js'), 'source policy retains an exact satellite.js CDN fallback');
  const dependencyBootstrap = fs.readFileSync('js/dependencyBootstrap.js', 'utf8');
  const staticBuilder = fs.readFileSync('scripts/build-static.mjs', 'utf8');
  assert(dependencyBootstrap.includes("throw new Error('Three.js sources are unavailable.')"), 'dependency bootstrap fails closed when neither exact source loads');
  assert(dependencyBootstrap.includes("const sources = [['local', options.local]]"), 'dependency bootstrap tries packaged dependencies first');
  assert(dependencyBootstrap.includes('await runTemplateModule(options.templateId, options.moduleLabel)'), 'dependency bootstrap observes module-graph failures');
  assert(indexHtml.includes('id="startupFailure" hidden'), 'index.html has a dedicated startup failure surface');
  assert(staticBuilder.includes('STATIC_RUNTIME_REPLACEMENTS'), 'static builder owns the packaged runtime URL policy');
  assert(staticBuilder.includes('https://raw.githubusercontent.com/arcazj/openbexi_earth_orbit/master/'), 'static builder removes the mutable raw-GitHub fallback');

  const startFunction = indexHtml.indexOf('async function start()');
  assert(startFunction >= 0, 'index.html defines async start()');

  const firstAnimationStart = indexHtml.indexOf('startAnimationLoopOnce();', startFunction);
  const tleAwait = indexHtml.indexOf('await setupTLESatellites(scene', startFunction);
  const firstInteractiveUi = indexHtml.indexOf("startupPerf.markOnce('first-interactive-ui'", startFunction);
  const serverStatusCheck = indexHtml.indexOf('checkServerConnectionStatusOnly', startFunction);
  const startCall = indexHtml.indexOf('\n    start();', startFunction);
  const startBody = indexHtml.slice(startFunction, startCall);
  assert(firstAnimationStart > startFunction, 'start() starts the animation loop');
  assert(tleAwait > firstAnimationStart, 'first render starts before awaiting TLE setup');
  assert(
    !startBody.includes('await checkAndLoadServerTleData()'),
    'initial startup does not block on live server TLE loading'
  );
  assert(
    serverStatusCheck > firstInteractiveUi,
    'server status check runs after first interactive satellite UI'
  );

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
  const reentryReady = indexHtml.indexOf("startupPerf.mark('reentry-timeline-ready'");
  const decayEstimatesStart = indexHtml.indexOf("startupPerf.mark('decay-estimates-start'");
  assert(reentryReady > 0, 're-entry timeline has a ready startup mark');
  assert(decayEstimatesStart > 0, 'decay prediction has a startup mark');
  assert(reentryReady < decayEstimatesStart, 'confirmed re-entry timeline is ready before active decay prediction starts');
  assert(indexHtml.includes('predictionCandidates'), 'decay prediction runs over filtered candidates');
  const tleLoader = fs.readFileSync('js/satelliteTLELoader.js', 'utf8');
  assert(tleLoader.includes('resolveCatalogRuntimePolicy'), 'catalog loading is deployment-policy aware');
  assert(tleLoader.includes('static deployment prohibits remote fallback'), 'static catalog failure does not fall back to a remote origin');

  console.log('startupStructure tests passed');
}

run();
