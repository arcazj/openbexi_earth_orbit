import assert from 'assert';
import {
  isStarlinkV2Satellite,
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
  assert.strictEqual(isStarlinkV2Satellite({ satellite_name: 'STARLINK-1008', company: 'STARLINK' }), false, 'Starlink 1008 is not classified as V2');

  const starlinkV2 = assertResolved({
    norad_id: '56287',
    satellite_name: 'STARLINK-30107',
    company: 'STARLINK',
    launch_date: '2023-04-19'
  }, 'starlink_v2.glb', 'Starlink V2 30xxx series');
  assert.strictEqual(starlinkV2.metadataId, 'starlink_v2', 'Starlink V2 uses V2 metadata');
  assert.deepStrictEqual(modelAssetPaths(starlinkV2.entry), ['obj/starlink_v2.glb']);
  assert.strictEqual(isStarlinkV2Satellite({ satellite_name: 'STARLINK-30107', company: 'STARLINK' }), true, 'Starlink 30xxx is classified as V2');

  assertResolved({
    norad_id: '56094',
    satellite_name: 'STARLINK-6109',
    company: 'STARLINK',
    launch_date: '2023-03-29'
  }, 'starlink_V1', 'Starlink non-30xxx remains V1 asset');

  assertResolved({
    satellite_name: 'STARLINK TEST',
    company: 'SpaceX',
    meta: { bus: 'Starlink V2 Mini Bus' }
  }, 'starlink_v2.glb', 'explicit Starlink V2 metadata');

  assertResolved({
    norad_id: '44073',
    satellite_name: 'ONEWEB-0012',
    company: 'ONEWEB'
  }, 'oneweb.glb', 'OneWeb alias');

  const o3b = assertResolved({
    norad_id: '39188',
    satellite_name: 'O3B FM5',
    company: 'O3B'
  }, 'o3b.glb', 'O3b alias');
  assert.strictEqual(o3b.metadataId, 'O3b', 'O3b uses existing metadata file');
  assert.deepStrictEqual(modelAssetPaths(o3b.entry), ['obj/o3b.glb']);

  assertResolved({
    norad_id: '39188',
    satellite_name: 'OB3 FM5',
    company: 'OB3'
  }, 'o3b.glb', 'OB3 typo alias');

  const iss = assertResolved({
    norad_id: '25544',
    satellite_name: 'ISS (ZARYA)'
  }, 'ISS.glb', 'ISS alias');
  assert.deepStrictEqual(modelAssetPaths(iss.entry), ['obj/ISS.glb']);

  const sslByIs20 = assertResolved({
    norad_id: '4321',
    satellite_name: 'INTELSAT 20 (IS-20)',
    company: 'Intelsat'
  }, 'SSL_1300.glb', 'SSL 1300 exact INTELSAT 20 mapping');
  assert.match(sslByIs20.reason, /exact restricted satellite name/, 'SSL 1300 diagnostic names the restricted satellite-name match');

  const sslByIs18 = assertResolved({
    norad_id: '37834',
    satellite_name: 'INTELSAT 18 (IS-18)',
    company: 'Intelsat'
  }, 'SSL_1300.glb', 'SSL 1300 exact INTELSAT 18 mapping');
  assert.match(sslByIs18.reason, /exact restricted satellite name/, 'IS-18 diagnostic names the restricted satellite-name match');

  assertResolved({
    meta: { name: 'IS-20' },
    norad_id: '4321',
    satellite_name: 'INTELSAT TEST METADATA'
  }, 'SSL_1300.glb', 'SSL 1300 exact meta IS-20 mapping');

  const goesAliasOnly = resolveSatelliteModel({
    norad_id: '41866',
    satellite_name: 'G-16',
    company: 'GOES'
  });
  assert.strictEqual(goesAliasOnly.found, false, 'GOES alias alone must not select SSL_1300');

  const intelsatAliasOnly = resolveSatelliteModel({
    norad_id: '4321',
    satellite_name: 'INTELSAT 19 (IS-19)',
    company: 'Intelsat'
  });
  assert.strictEqual(intelsatAliasOnly.found, false, 'other Intelsat satellites must not select SSL_1300');

  const appIdTwentyOnly = resolveSatelliteModel({
    satellite_id: 20,
    norad_id: '4321',
    satellite_name: 'APP ID 20 WITHOUT IS-20 NAME',
    company: 'Intelsat'
  });
  assert.strictEqual(appIdTwentyOnly.found, false, 'app satellite id 20 alone must not select SSL_1300 in Version 1.5.19');

  const noradTwentyOnly = resolveSatelliteModel({
    norad_id: '20',
    satellite_name: 'NORAD 20 TEST'
  });
  assert.strictEqual(noradTwentyOnly.found, false, 'NORAD 20 must not be confused with app satellite id 20');

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

  const verifiedO3b = await verifyResolvedModelAsset(o3b, async path => path === 'obj/o3b.glb');
  assert.strictEqual(verifiedO3b.exists, true, 'O3b GLB resolution requires the O3b GLB asset');

  const verifiedStarlinkV2 = await verifyResolvedModelAsset(starlinkV2, async path => path === 'obj/starlink_v2.glb');
  assert.strictEqual(verifiedStarlinkV2.exists, true, 'Starlink V2 GLB resolution requires the V2 GLB asset');

  console.log('modelResolver tests passed');
}

await run();
