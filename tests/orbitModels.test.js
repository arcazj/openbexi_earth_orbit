import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { orbitLibraryEntries, resolveSatelliteModel } from '../js/satelliteModelResolver.js';
import { extensionFamilies } from '../js/lifeExtensionCatalog.js';
import { trackedObjectTags } from '../js/trackedObjectCatalog.js';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const models = new Map(read('json/display_satellite_models.json').models.map(model => [model.id, model]));
const tracked = read('json/tracked/TRACKED.manifest.json');
const catalogOrbitClasses = read('json/satellites/orbit-model-index.json').catalogOrbitClasses;
const profiles = new Map();
const verifiedFiles = new Set();
const assignedFiles = new Set();
const starlinkFiles = ['obj/leo/starlink_V1.obj', 'obj/leo/starlink_v2.glb', 'obj/leo/starlink_v3.glb'];
const meshPaths = ({ files }) => files.glbs || [files.glb || files.obj];
const physicalFiles = new Set([...models.values()].flatMap(meshPaths));
const diskFiles = fs.readdirSync('obj', { recursive: true })
  .filter(file => /\.(?:obj|glb|gltf)$/i.test(file)).map(file => file.replaceAll('\\', '/'));
assert.deepEqual(new Set(diskFiles), physicalFiles, 'Every model on disk is published');
const byHash = new Map();
for (const file of physicalFiles) {
  const hash = createHash('sha256').update(fs.readFileSync('obj/' + file)).digest('hex');
  assert(!byHash.has(hash), file + ' duplicates the model at ' + byHash.get(hash));
  byHash.set(hash, file);
}
const declaredStarlink = [...physicalFiles].filter(file => /starlink/i.test(file)).map(file => 'obj/' + file);
assert.deepEqual(declaredStarlink.sort(), [...starlinkFiles].sort());
const storedStarlink = fs.readdirSync('obj/leo')
  .filter(name => /starlink.*\.(?:obj|glb)$/i.test(name)).map(name => 'obj/leo/' + name);
assert.deepEqual(storedStarlink.sort(), [...starlinkFiles].sort());

for (const orbit of ['leo', 'meo', 'geo']) {
  const registry = read('json/satellites/' + orbit + '.json');
  for (const entry of orbitLibraryEntries(orbit.toUpperCase(), registry)) {
    assert.deepEqual(entry, models.get(entry.id));
    const file = 'obj/' + entry.files.glb;
    if (verifiedFiles.has(file)) continue;
    verifiedFiles.add(file);
    const data = fs.readFileSync(file);
    assert.equal(data.toString('ascii', 0, 4), 'glTF');
    assert.equal(data.readUInt32LE(8), data.length);
    const gltf = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
    assert.equal(gltf.extras.units, 'm');
    assert(gltf.meshes.length && gltf.nodes.some(n => n.name === 'OpenBEXIPreview'));
    assert(gltf.buffers.every(buffer => !buffer.uri));
  }
  for (const [asset, profile] of Object.entries(registry)) {
    if (orbit === 'geo') {
      assert(['Illustrated design','Catalog outline'].includes(profile.meta.reference_status), asset);
      assert(profile.meta.references.length && profile.meta.dimension_note, asset);
      assert.equal(new Set(profile.norad).size, profile.norad.length);
      if (profile.meta.reference_status === 'Illustrated design') assert(profile.appearance, asset);
    }
    if (profile.norad.length) meshPaths(models.get(asset)).forEach(file => assignedFiles.add(file));
    if (profile.appearance) {
      assert(profile.meta.references.length && profile.meta.references.every(url => new URL(url).protocol === 'https:'), asset);
      assert(profile.meta.dimension_note, asset);
    }
    for (const number of profile.norad) {
      assert(!profiles.has(number), 'A NORAD ID maps to one platform');
      profiles.set(number, asset);
      const resolved = resolveSatelliteModel({ norad_id: number });
      assert.equal(resolved.assetId, asset, String(number));
      assert.equal(resolved.metadataId, profile.existingMetadata || orbit);
      const file = models.get(asset).files;
      assert.equal(resolved.attemptedPaths[0], 'obj/' + (file.glb || file.obj));
    }
  }
}
for (const family of Object.values(extensionFamilies)) {
  if (family.model) meshPaths(models.get(family.model)).forEach(file => assignedFiles.add(file));
}
assert.deepEqual(assignedFiles, physicalFiles, 'Every published mesh belongs to a catalog payload or a documented mission family');
let records = 0;
for (const chunk of [...tracked.chunks, ...tracked.history_chunks].filter(c => c.object_type === 'PAYLOAD')) {
  for (const record of read(chunk.path).records.filter(r => ['LEO', 'MEO', 'GEO'].includes(r.orbit_class) ||
    catalogOrbitClasses[r.norad_id] === r.orbit_class)) {
    const result = resolveSatelliteModel(record);
    assert(result.found && models.has(result.assetId), record.satellite_name);
    if (/^STARLINK\b/i.test(record.satellite_name)) {
      assert(starlinkFiles.includes(result.attemptedPaths[0]), record.satellite_name);
    }
    assert.equal(result.assetId, profiles.get(Number(record.norad_id)), record.satellite_name);
    records++;
  }
}
assert(records > 25000);
assert.equal(records, profiles.size);
for (const [ids, path] of [
  [[44235, 44714, 51456, 51459], starlinkFiles[0]],
  [[55695, 55696], starlinkFiles[1]], [[100855, 100856], starlinkFiles[2]],
  [[60379, 69472], 'obj/leo/qianfan.obj'], [[26390, 26626, 38740], 'obj/geo/SSL_1300.glb'],
  [[14688, 14692, 24282, 13069], 'obj/geo/hs-376.glb'],
  [[15034, 12994], 'obj/geo/ref-fs-intelsat-5-12089.glb'],
  [[19802, 20959], 'obj/meo/gps-ii.glb'],
  [[56370, 66454, 68893], 'obj/geo/ref-bss-702mp-56370.glb'],
  [[26038, 26608], 'obj/geo/ref-hs-702-26038.glb'],
  [[53960, 53961], 'obj/geo/boeing-702sp-ses-cband.glb'],
  [[37218, 40946], 'obj/geo/boeing-geomobile-22m.glb'],
  [[39188, 40079], 'obj/meo/o3b.glb'], [[54755, 100687], 'obj/meo/o3b_mpower.glb'],
  [[41866, 60133], 'obj/geo/goes-r.glb'], [[40544, 40545], 'obj/meo/galileo-foc.glb']
]) {
  for (const norad_id of ids) assert.equal(resolveSatelliteModel({ norad_id }).attemptedPaths[0], path);
}

function geometryFor(norad_id) {
  const data = fs.readFileSync(resolveSatelliteModel({ norad_id }).attemptedPaths[0]);
  const gltf = JSON.parse(data.toString('utf8', 20, 20 + data.readUInt32LE(12)));
  assert(gltf.extras.visualReferences.length && gltf.extras.dimensionNote);
  return name => gltf.nodes.filter(node => node.name === name);
}

const viaSat = geometryFor(66454);
const pathFor = id => resolveSatelliteModel({norad_id:id}).attemptedPaths[0];
const gravitas = geometryFor(68495);
assert.equal(pathFor(68495), 'obj/leo/ref-gravitas-68495.glb');
assert.equal(models.get('leo/ref-gravitas-68495.glb').files.wavefront, 'exports/gravitas.zip');
for (const side of [-1,1]) {
  const caps = gravitas('Wing tip cap').filter(n => Math.sign(n.translation[0]) === side);
  assert.equal(caps.length, 1);
  assert.equal(Math.abs(caps[0].translation[0]) + caps[0].scale[0]/2, 20);
  assert.equal(gravitas('Photovoltaic module').filter(n => Math.sign(n.translation[0]) === side).length, 8);
}
assert.deepEqual(gravitas('Payload deck')[0].scale.slice(0,2), [3.0,2.7]);
assert.equal(gravitas('Corner housing rim').length, 4);
const telesat = geometryFor(43113);
assert.equal(pathFor(43113), 'obj/leo/telesat-leo-1.glb');
assert.equal(models.get('leo/telesat-leo-1.glb').files.wavefront, 'exports/telesat-leo-1.zip');
assert.equal(telesat('Fixed solar panel substrate').length, 6);
assert.equal(telesat('Silver equipment face').length, 1);
assert.equal(telesat('End fitting barrel').length, 2);
for (const peer of [43510,51288,67397]) assert.equal(resolveSatelliteModel({norad_id:peer}).assetId, 'leo/ref-sstl-42-43113.glb');
const meoRegistry = read('json/satellites/meo.json');
const spacecraftFacts = read('data/spacecraft-facts.json');
const argosHosts = read('data/argos-hosts.json');
assert.equal(Object.values(argosHosts).flat().length,49);
for (const [group, ids] of Object.entries(argosHosts)) {
  for (const n of ids) {
    const record = {norad_id:n, orbit_class:'LEO', object_type:'PAYLOAD'};
    const model = resolveSatelliteModel(record);
    assert(trackedObjectTags(record).includes('ARGOS'));
    assert.equal(models.get(model.assetId).files.wavefront,'exports/'+group+'.zip');
  }
}
for (const n of [25634,65159,24277,41790,25682]) assert(!trackedObjectTags({norad_id:n}).includes('ARGOS'));
for (const n of [...argosHosts['kineis-ais'],...argosHosts['kineis-iot']]) {
  const g = geometryFor(n);
  assert.equal(g('Solar panel substrate').length,6);
  assert.equal(g('AIS VHF antenna blade').length,argosHosts['kineis-ais'].includes(n) ? 4 : 0);
}
assert.equal(geometryFor(38771)('HIRS-4 aperture').length,1);
assert.equal(geometryFor(43689)('HIRS-4 aperture').length,0);
assert.equal(geometryFor(15427)('ERBE scanner aperture').length,1);
assert.equal(geometryFor(19531)('ERBE scanner aperture').length,0);
assert.equal(geometryFor(39086)('AltiKa radar altimeter').length,1);
const galileo = Object.entries(meoRegistry).filter(([,profile]) => profile.design === 'galileo-navigation');
assert.equal(galileo.length, 5);
assert.equal(galileo.reduce((count,[,p]) => count+p.norad.length, 0), 36);
for (const [id, variant, svn, flights, panels, radiators, cubes, sar] of [
  [28922,'giove-a','E001',1,4,36,76,false],
  [32781,'giove-b','E002',1,8,42,67,false],
  [37846,'galileo-iov','E101',2,4,45,84,false],
  [38857,'galileo-iov-sar','E103',2,4,45,84,true],
  [40128,'galileo-foc','E201',30,4,28,60,true]
]) {
  const asset = resolveSatelliteModel({norad_id:id}).assetId, p = meoRegistry[asset], parts = geometryFor(id);
  assert.equal(p.flights[id].svn, svn);
  assert.equal(p.norad.length, flights);
  assert.equal(models.get(asset).files.wavefront, 'exports/'+variant+'.zip');
  for (const n of p.norad) {
    const facts = spacecraftFacts.spacecraft[n];
    assert.equal(p.flights[n].cospar, facts[spacecraftFacts.fields.indexOf('international_designator')]);
    assert.equal(p.meta.manufacturer, facts[spacecraftFacts.fields.indexOf('manufacturer')]);
  }
  assert.equal(parts('Solar array leaf').length, panels);
  assert.equal(parts('L-band radiating element').length, radiators);
  assert.equal(parts('Laser corner cube').length, cubes);
  for (const key of ['earth-deck','navigation-antenna','reflector-bank']) assert.equal(parts('Inspection_'+key).length,1);
  assert.equal(parts('Inspection_search-rescue').length, Number(sar));
  assert.equal(parts('Search and rescue antenna base').length, Number(sar));
}
for (const norad_id of [40128,40129]) {
  assert.equal(catalogOrbitClasses[norad_id], 'HEO');
  assert.equal(resolveSatelliteModel({norad_id,orbit_class:'HEO',object_type:'PAYLOAD'}).assetId, 'meo/galileo-foc.glb');
}
assert.deepEqual(meoRegistry['meo/galileo-iov-sar.glb'].norad,[38857,38858]);
for (const [id, stem, svn, prn, dims, area, cubes] of [
  [43001, 'beidou-3-cast', 'C201', 'C19', [1.68,1.30,2.16], 10.22, 38],
  [43245, 'beidou-3-secm', 'C207', 'C29', [2.55,1.02,1.23], 5.40, 42],
  [44794, 'beidou-3-secm-b', 'C226', 'C38', [2.80,.92,1.35], 5.40, 42],
  [61186, 'beidou-3-secm-b-2024', 'C234', 'C11', [2.80,.92,1.35], 5.40, 42],
  [61187, 'beidou-3-secm-b-2024', 'C235', 'C13', [2.80,.92,1.35], 5.40, 42]
]) {
  const asset = 'meo/'+stem+'.glb';
  assert.equal(pathFor(id), 'obj/'+asset);
  const {meta, flights} = meoRegistry[asset], g = geometryFor(id);
  assert.equal(flights[id].svn, svn);
  const epoch = '2026-11-25T00:00:00Z';
  assert.equal(flights[id].prns.find(p=>p.start <= epoch && (!p.end || p.end > epoch))?.id, prn);
  assert.equal(spacecraftFacts.spacecraft[id][spacecraftFacts.fields.indexOf('manufacturer')], meta.manufacturer);
  assert.deepEqual(['length','width','height'].map(key=>meta.geometry['body_'+key+'_m']), dims);
  assert.equal(g('Corner cube aperture').length, cubes);
  for (const side of [-1,1]) {
    const leaves = g('Solar leaf backsheet').filter(n=>Math.sign(n.translation[0])===side);
    assert.equal(leaves.length, 3);
    assert(Math.abs(leaves.reduce((a,n)=>a+n.scale[0]*n.scale[1],0)-area)<1e-8);
  }
  assert.equal(g('Inspection_nadir')[0].extras.radius, g('Inspection_body-side')[0].extras.radius);
  assert.equal(g('Search and rescue antenna').length, Number(id===44794));
}
for (const id of [43622,43623,44542,44543,44793,44794]) {
  assert.equal(geometryFor(id)('Search and rescue antenna').length, 1);
}
for (const id of [40748,40749]) assert.equal(geometryFor(id)('Fold-out phased-array antenna').length, 1);
assert.equal(pathFor(41315),'obj/meo/beidou-3s-secm.glb');
assert.equal(pathFor(38250),'obj/meo/beidou-2-meo.glb');
for (const [norad, flight, stations, extent, archive] of [
  [28638, 'APSTAR-6', [1,1,1,1], 38, 'spacebus-4000c2'],
  [28526, 'AMC-12', [1,3,1,1], 38, 'spacebus-4000c3'],
  [33453, 'Ciel-2', [1,3,3], 35, 'spacebus-4000c4'],
  [28187, 'W3A', [1,1,1,1,1], 35, 'eurostar-3000']
]) {
  const geometry = geometryFor(norad);
  for (const sign of [-1,1]) {
    const bays = new Map();
    for (const node of geometry('Solar cell panel').filter(node => Math.sign(node.translation[0]) === sign)) {
      const distance = Math.abs(node.translation[0]);
      bays.set(distance,(bays.get(distance) || 0) + 1);
    }
    assert.deepEqual([...bays].sort((a,b)=>a[0]-b[0]).map(([,n])=>n), stations, flight+' wing layout');
    const rail = geometry('Terminal array rail').find(node=>Math.sign(node.translation[0])===sign);
    assert(Math.abs(2*Math.abs(rail.translation[0])+rail.scale[0]-extent) < .0001, flight+' extent');
  }
  assert(geometry(flight+' reflector 1 insulated back').length);
  assert.equal(models.get(pathFor(norad).slice(4)).files.wavefront, 'exports/'+archive+'.zip');
}
const stationGeometry = geometryFor(48274);
for (const module of ['Tianhe','Wentian','Mengtian']) {
  assert.equal(stationGeometry(module+' flexible cell blanket').length,16,module+' deployed wings');
}
assert.equal(geometryFor(53239)('Mengtian cargo airlock door').length,0);
assert.equal(geometryFor(54216)('Wentian EVA hatch').length,0);
assert.equal(models.get(pathFor(48274).slice(4)).files.wavefront,'exports/tiangong.zip');
assert.notEqual(pathFor(33453),pathFor(42692),'Ciel-2 and SGDC retain distinct C4 exteriors');
assert.equal(pathFor(56174), 'obj/geo/56174.glb');
const tempo = geometryFor(56174);
const reflectorBank = tempo('Aft bank reflector');
assert.equal(reflectorBank.length, 4);
assert(reflectorBank.every(node => node.translation[2] < 0));
assert.equal(tempo('Lateral reflector').length, 1);
assert(tempo('Spectrometer housing')[0].translation[2] > 0);
assert.deepEqual(tempo('Spectrometer housing')[0].scale, [1.4, 1.1, 1.2]);
for (const side of [-1, 1]) {
  const leaves = tempo('Solar wing leaf').filter(node => Math.sign(node.translation[0]) === side);
  assert.equal(leaves.length, 3);
  assert(Math.abs(Math.max(...leaves.map(node => Math.abs(node.translation[0]) + node.scale[0]/2)) - 13) < .02);
}
assert.equal(pathFor(46113), pathFor(44625));
assert.equal(pathFor(28358), 'obj/geo/intelsat-10-02.glb');
assert.equal(pathFor(43633),'obj/geo/horizons-3e.glb');
assert.equal(pathFor(38749),'obj/geo/ref-bss-702mp-38098.glb');
const horizons=geometryFor(43633);
for (let i=1;i<=4;i++) {
  assert.equal(horizons('Reflector '+i+' pale perimeter frame').length,1);
  assert(horizons('Reflector '+i+' carbon aperture')[0].translation[2]<0);
}
assert.equal(horizons('Photovoltaic cell strings').length,8);
assert.equal(horizons('Radiator tile mosaic').length,4);
assert.equal(horizons('Inspection_aft').length,1);
const mev = geometryFor(46113);
assert.equal(mev('Solar cell panel').length, 10);
assert.equal(mev('Docking contact pad').length, 3);
assert.equal(mev('Camera objective').length + mev('Docking camera objective').length, 10);
assert(mev('MEV docking plane')[0].translation[2] < mev('Capture probe head')[0].translation[2]);
assert.equal(geometryFor(28358)('Intelsat side reflector').length, 2);
assert.equal(pathFor(36581), 'obj/geo/astra-3b.glb');
assert.equal(pathFor(37775), 'obj/geo/ref-eurostar-3000m-36581.glb');
const astra3b = geometryFor(36581);
for (const part of ['Aft reflector hinge', 'Main reflector']) {
  const assemblies = astra3b(part);
  assert.equal(assemblies.length, 4);
  assert(assemblies.every(node => node.translation[2] < 0), part + ' sits aft of the bus midpoint');
}
const wingTips = astra3b('Solar array tip rail').map(node => Math.abs(node.translation[0]) + node.scale[0] / 2);
assert.deepEqual(wingTips, [19.9, 19.9]);
assert.equal(pathFor(49332), 'obj/geo/ses-17.glb');
for (const id of [53765,54259,55508,57045]) {
  assert.equal(pathFor(id), 'obj/geo/ref-spacebus-neo200-49332.glb');
}
assert.equal(pathFor(60086), 'obj/geo/astra-1p.glb');
assert.equal(pathFor(36516), pathFor(33275));
assert.equal(pathFor(40364), pathFor(38778));
assert.equal(geometryFor(33749)('Solar cell panel').length, 4);
assert.equal(geometryFor(39460)('Solar cell panel').length, 8);
assert.equal(geometryFor(39460)('Reflector 3 face')[0].scale[0], 1.45);
assert.equal(geometryFor(43175)('GOLD entrance aperture').length, 2);
assert.equal(geometryFor(43488)('GOLD entrance aperture').length, 0);
for (const [id, orbit, asset] of [[43178,'UNKNOWN','govsat-1'],[21989,'OTHER','nss-k']]) {
  assert.equal(resolveSatelliteModel({norad_id:id, orbit_class:orbit, object_type:'PAYLOAD'}).assetId, 'geo/'+asset+'.glb');
}
const ses17 = geometryFor(49332);
assert.deepEqual(ses17('Solar array tip rail').map(n => Math.abs(n.translation[0]) + n.scale[0]/2), [23,23]);
for (const side of [-1, 1]) {
  const shells = ses17('Ka-band reflector').filter(n => Math.sign(n.translation[1]) === side);
  assert.equal(shells.length, 4);
  const fromBus = shells.sort((a, b) => Math.abs(a.translation[1]) - Math.abs(b.translation[1]));
  assert(fromBus.slice(1).every(n => n.scale[0] > fromBus[0].scale[0]));
}
const kuiper = JSON.parse(fs.readFileSync('json/satellites/leo.json', 'utf8'));
assert.deepEqual(kuiper['leo/ref-kuiper-58013.glb'].norad, [58013,58014]);
assert(kuiper['leo/kuiper-production.glb'].norad.length > 300);
assert.equal(pathFor(58013), pathFor(58014));
assert.notEqual(pathFor(58013), pathFor(63724));
const production = geometryFor(63724);
assert.equal(production('Deployed antenna leaf').length, 3);
assert.equal(new Set(production('Deployed antenna leaf').map(n => n.translation[2])).size, 1);
assert.equal(production('Solar drive shaft').length, 1);
assert.equal(production('Solar cell panel').length, 8);
assert.equal(production('Solar array backsheet').length, 8);
for (const asset of ['leo/kuiper-production.glb','leo/ref-kuiper-58013.glb']) {
  const family = kuiper[asset];
  const mesh = geometryFor(family.norad[0]);
  for (const view of ['antenna-deck','gateway-dish','optical-terminal','solar-drive','hall-thruster']) {
    assert.equal(mesh('Inspection_'+view).length, 1, asset+' '+view);
  }
  assert.equal(mesh('OpenBEXIPreview')[0].extras.fitToMeshes, true);
  for (const norad_id of family.norad) assert.equal(pathFor(norad_id),'obj/'+asset);
}
const recentKuiper = {norad_id:'101486', satellite_name:'KUIPER-00714', object_type:'PAYLOAD', orbit_class:'LEO'};
assert.equal(resolveSatelliteModel(recentKuiper).assetId,'leo/kuiper-production.glb');
assert.equal(resolveSatelliteModel({...recentKuiper,satellite_name:'AMAZON LEO-00714'}).assetId,'leo/kuiper-production.glb');
for (const other of [{object_type:'DEBRIS'}, {orbit_class:'GEO'}, {satellite_name:'KUIPER-00714 R/B'}]) {
  assert.notEqual(resolveSatelliteModel({...recentKuiper,...other}).assetId,'leo/kuiper-production.glb');
}
assert(trackedObjectTags({satellite_name:'KUIPER-P2'}).includes('KUIPER'));
assert.deepEqual(trackedObjectTags({...recentKuiper, company:'ACTIVE'}), ['ACTIVE','KUIPER']);
assert.deepEqual(trackedObjectTags({...recentKuiper, company:'KUIPER'}), ['KUIPER']);
assert.equal(geometryFor(58013)('Prototype phased array').length, 1);
assert.equal(geometryFor(58013)('Deployed antenna leaf').length, 0);
const protoShaft = geometryFor(58013)('Solar drive shaft')[0];
const protoOutlet = geometryFor(58013)('Electric propulsion outlet')[0];
assert(Math.abs(protoShaft.translation[1] - protoOutlet.translation[1]) > (protoShaft.scale[0] + protoOutlet.scale[1]) / 2,
  'The prototype solar shaft clears the thruster outlet');
for (const family of [[24315,24713,24936],[25954,26580],[26495,26639,29644],[28154,28252],[28446,28472]]) {
  assert.equal(new Set(family.map(pathFor)).size, 1, 'Identical AMC configurations share a physical file');
}
assert.equal(new Set([24315,25954,25516,26495,28154,27820,28446,28526,28924,32708,33275].map(pathFor)).size, 11);
const amc18 = geometryFor(29644);
assert.equal(amc18('Communications reflector').length, 1);
const amc18Span = Math.max(...amc18('Solar panel frame').map(n => Math.abs(n.translation[0]) + n.scale[0]/2)) * 2;
assert(Math.abs(amc18Span - 14.65) < .05);
const amc21 = geometryFor(33275);
assert.equal(amc21('Solar cell panel').length, 8);
assert.equal(amc21('Front polarization grid').length, 2);
assert.deepEqual(amc21('Communications reflector').map(n => n.scale.slice(0,2)), [[2.3,2.3],[2.3,2.3]]);
assert.equal(geometryFor(25516)('Communications reflector').length, 1);
assert.equal(geometryFor(28924)('Communications reflector').length, 4);
assert.equal(geometryFor(32708)('Communications reflector').length, 3);
assert.equal(pathFor(54026),pathFor(54027));
assert.notEqual(pathFor(54026),pathFor(46114));
for (const id of [54244,54741,54742]) assert.equal(pathFor(54243),pathFor(id));
assert.equal(new Set([38867,33153,37392,38740].map(pathFor)).size,4);
assert.equal(geometryFor(54026)('White wing tip').length,2);
assert.equal(geometryFor(31307)('Solar cell panel').length,8);
assert.equal(geometryFor(38867)('Solar cell panel').length,8);
assert.deepEqual(geometryFor(38867)('Deck-mounted reflector')[0].scale.slice(0,2),[1.3,1.65]);
assert.equal(geometryFor(37392)('Stowed west reflector').length,1);
assert.equal(geometryFor(37392)('Communications reflector').length,1);
assert.equal(geometryFor(40272)('Communications reflector').length,1);
assert.equal(geometryFor(40941)('Deck-mounted reflector').length,1);
const galaxy17Frames = geometryFor(31307)('Solar panel frame');
const outerTip = Math.max(...galaxy17Frames.map(n=>Math.abs(n.translation[0])+n.scale[0]/2));
assert(Math.abs(outerTip*2-36.9)<.08);
for (const [spacecraft, rows, expectedSpan] of [[viaSat, [1, 3, 3, 1], 43.9], [ses17, [1, 1, 3, 1], 46]]) {
  for (const side of [-1, 1]) {
    const stations = new Map();
    for (const { translation: [x] } of spacecraft('Solar cell panel').filter(n => Math.sign(n.translation[0]) === side)) {
      const distance = Math.abs(x);
      stations.set(distance, (stations.get(distance) || 0) + 1);
    }
    assert.deepEqual([...stations.entries()].sort(([a], [b]) => a - b).map(([, count]) => count), rows);
  }
  const tip = Math.max(...spacecraft('Solar panel frame').map(n => Math.abs(n.translation[0]) + n.scale[0] / 2));
  assert(Math.abs(2 * tip - expectedSpan) < 0.1, 'Deployed solar wingspan');
}
assert.equal(viaSat('Reflector deployment boom').length, 1);
assert.equal(geometryFor(26038)('Solar concentrator mirror').length > 0, true);
assert.equal(geometryFor(42709)('Solar concentrator mirror').length, 0);
assert.equal(geometryFor(42698)('Communications reflector').length, 6);
assert.deepEqual(geometryFor(23553)('Communications reflector').map(n => n.scale.slice(0, 2)), [[5.7, 5.3], [5.7, 5.3]]);
assert.equal(geometryFor(40946)('Deployable mesh reflector')[0].scale[0], 22);
assert.equal(geometryFor(45245)('Deployable mesh reflector')[0].scale[0], 18);
assert.equal(geometryFor(54743)('Lightning Imager optical head').length, 4);
assert.equal(geometryFor(64723)('Sentinel-4 spectrometer').length, 1);
assert.equal(geometryFor(40267)('Solar cell panel').length, 2);
assert.equal(geometryFor(26388)('Single-access reflector')[0].scale[0], 4.6);
assert.equal(geometryFor(9503)('Helical antenna element').length, 96);
for (const [satellite, path] of [
  [{ name: 'STARLINK-1008' }, starlinkFiles[0]],
  [{ name: 'STARLINK-30107' }, starlinkFiles[1]],
  [{ name: 'STARLINK-40083' }, starlinkFiles[2]],
  [{ name: 'STARLINK-30001', meta: { bus: 'Starlink V3' } }, starlinkFiles[2]]
]) assert.equal(resolveSatelliteModel(satellite).attemptedPaths[0], path);
for (const orbit of ['LEO', 'MEO', 'GEO']) {
  const record = { orbit_class: orbit, object_type: 'PAYLOAD', norad_id: '999999' };
  const reference = resolveSatelliteModel(record);
  assert.equal(reference.assetId, orbit.toLowerCase() + '/' + orbit.toLowerCase() + '-reference.glb');
  for (const type of ['DEBRIS','ROCKET_BODY','UNKNOWN','MISSION_RELATED']) {
    assert.equal(resolveSatelliteModel({ ...record, object_type: type }).found, false);
  }
}
assert.equal(resolveSatelliteModel({ name: 'GSAT0299', orbit_class: 'MEO', object_type: 'PAYLOAD' }).assetId, 'meo/galileo-foc.glb');
console.log('Orbit model registry passed for ' + records + ' payloads and ' + verifiedFiles.size + ' generated meshes.');
