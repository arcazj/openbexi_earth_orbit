import assert from 'assert';
import {
  modelAssetPaths,
  normalizeModelKey,
  resolveSatelliteModel,
  verifyResolvedModelAsset
} from '../js/satelliteModelResolver.js';

function assertResolved(sat, expectedAssetId, message) {
  const resolution = resolveSatelliteModel(sat);
  assert.strictEqual(resolution.found, true, `${message}: expected a model mapping`);
  assert.strictEqual(resolution.assetId, expectedAssetId, `${message}: unexpected asset`);
  assert(resolution.reason, `${message}: expected diagnostic reason`);
  assert(resolution.attemptedPaths.length > 0, `${message}: expected attempted paths`);
  return resolution;
}

async function run() {
  assert.strictEqual(normalizeModelKey('starlink_spacex_satellite.glb'), 'starlinkspacexsatellite');
  assert.strictEqual(normalizeModelKey('One Web-0012'), 'oneweb0012');

  const starlink = assertResolved({
    norad_id: '44714',
    satellite_name: 'STARLINK-1008',
    company: 'STARLINK'
  }, 'starlink_V1', 'Starlink alias');
  assert.deepStrictEqual(modelAssetPaths(starlink.entry), ['obj/starlink_V1.obj', 'obj/starlink_V1.mtl']);

  assertResolved({
    norad_id: '44073',
    satellite_name: 'ONEWEB-0012',
    company: 'ONEWEB'
  }, 'oneweb', 'OneWeb alias');

  assertResolved({
    norad_id: '39188',
    satellite_name: 'O3B FM5',
    company: 'O3B'
  }, 'o3b', 'O3b alias');

  const iss = assertResolved({
    norad_id: '25544',
    satellite_name: 'ISS (ZARYA)'
  }, 'ISS.glb', 'ISS alias');
  assert.deepStrictEqual(modelAssetPaths(iss.entry), ['obj/ISS.glb']);

  assertResolved({
    norad_id: '41866',
    satellite_name: 'G-16',
    company: 'GOES'
  }, 'SSL_1300.glb', 'SSL 1300 GOES fallback');

  assertResolved({
    norad_id: '4321',
    satellite_name: 'IS-20',
    company: 'Intelsat'
  }, 'SSL_1300.glb', 'SSL 1300 Intelsat fallback');

  const unknown = resolveSatelliteModel({
    norad_id: '99999',
    satellite_name: 'UNMAPPED TEST SATELLITE'
  });
  assert.strictEqual(unknown.found, false, 'unknown satellite should fall back to sprite');
  assert.match(unknown.reason, /No local model mapping/);

  const verifiedObj = await verifyResolvedModelAsset(starlink, async path => path.endsWith('.obj'));
  assert.strictEqual(verifiedObj.exists, true, 'OBJ/MTL resolution only requires the OBJ to exist');
  assert.strictEqual(verifiedObj.checkedPaths.length, 2);

  const missingObj = await verifyResolvedModelAsset(starlink, async () => false);
  assert.strictEqual(missingObj.exists, false, 'missing OBJ should reject the detailed model');

  const verifiedGlb = await verifyResolvedModelAsset(iss, async path => path === 'obj/ISS.glb');
  assert.strictEqual(verifiedGlb.exists, true, 'GLB resolution requires the GLB asset to exist');

  console.log('modelResolver tests passed');
}

await run();
