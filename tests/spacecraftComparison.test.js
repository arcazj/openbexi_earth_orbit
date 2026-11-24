import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { twoline2satrec, propagate } from '../vendor/satellite.js/7.1.0/satellite.es.js';
import { pairMeasurement, prepareComparison, comparisonAt, earthOccludes } from '../js/spacecraftComparisonScene.js';
import { comparisonSnapshot, comparisonLink, comparisonObject, servicingPartner, findComparisonObjects } from '../js/comparisonCatalog.js';
import { comparisonOrbitPath, needsLocator } from '../js/comparisonOrbit.js';
import { inertialMetres,preparePositionTle } from '../js/modelViewerEarth.js';
import { mountAttachment } from '../js/spacecraftAttachmentMesh.js';
import { attachmentAt } from '../js/lifeExtensionCatalog.js';
import { astra3b, intelsat, mev2, optus, mev1 } from './fixtures/lifeExtensionTles.js';

const date = new Date('2026-11-24T12:00:00Z');
const data = {revision:'test-catalog', source:'Test fixture', objects:[intelsat,astra3b].map(row=>({
    ...comparisonObject(row.norad_id,row.satellite_name),row
}))};
const result = comparisonAt(prepareComparison(data),date);
function independentRange(time) {
    const p=[intelsat,astra3b].map(row=>propagate(twoline2satrec(row.tle_line1,row.tle_line2),time).position);
    return 1000*Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y,p[1].z-p[0].z);
}
assert.ok(Math.abs(result.measurement.metres-independentRange(date))<1e-6);
assert.ok(Math.abs(result.measurement.speed-(independentRange(new Date(+date+1000))-independentRange(new Date(+date-1000)))/2)<.025);
const coincident=comparisonAt(prepareComparison({...data,objects:[data.objects[0],{key:'46113',name:'MEV-2',row:mev2}]}),date);
assert.equal(coincident.measurement.metres,0);
assert.equal(coincident.measurement.speed,null);
assert.equal(coincident.measurement.trend,'Same TLE position');
assert.equal(coincident.status,'Docked');
assert.equal(coincident.poses[0],coincident.poses[1]);
const reverse=comparisonAt(prepareComparison({...data,objects:[coincident.systems[1].item,data.objects[0]]}),date);
assert.equal(reverse.shared,true);
assert.equal(reverse.systems[0].reference.item.key,'28358');
assert.deepEqual(reverse.systems.map(s=>s.observed.item.key),['46113','28358']);
// An erroneous open-ended mission record must not replace two conflicting TLE positions.
const outdated={...attachmentAt('35756',Date.parse('2026-06-01')),releaseReport:undefined};
const conflicting=comparisonAt(prepareComparison({...data,objects:[optus,mev1].map(row=>({
    ...comparisonObject(row.norad_id),row}))},[outdated]),new Date('2026-11-24T20:44:00Z'));
assert.equal(conflicting.shared,false);
assert.equal(conflicting.systems[1].reference.item.key,'44625');
assert.match(conflicting.warnings[0],/independent orbits/);
for (const rows of [[optus,mev1],[mev1,optus]]) {
    const objects=rows.map(row=>({...comparisonObject(row.norad_id),row}));
    const current=comparisonAt(prepareComparison({...data,objects}),new Date('2026-11-24T20:44:00Z'));
    assert.equal(current.shared,false);
    assert.equal(current.ended.releaseReport.publishedAt,'2026-08-13T18:55:00Z');
    assert.deepEqual(current.systems.map(s=>s.reference.item.key),rows.map(r=>r.norad_id));
    assert(Math.abs(current.measurement.metres/1000-77060.9533)<.001);
    assert.equal(servicingPartner(rows[0].norad_id,Date.parse('2026-08-13T18:55:00Z')),null);
}
assert.equal(attachmentAt('26824',Date.parse('2025-04-04T19:59:59Z')).vehicle.key,'44625');
assert.equal(attachmentAt('26824',Date.parse('2025-04-04T20:00:00Z')),undefined);
const independentPair={...data,objects:[coincident.systems[1].item,data.objects[1]],related:[data.objects[0]]};
const byServicer=comparisonAt(prepareComparison(independentPair),date);
assert.equal(byServicer.systems[0].host.key,'28358');
assert.equal(byServicer.measurement.metres,result.measurement.metres);
const frozen=comparisonLink({...independentPair,date,view:'overview',orbits:true,earth:true,snapshot:true},'https://example.test/');
assert.equal(frozen.searchParams.get('orbits'),'1');
const restored=comparisonSnapshot(frozen,independentPair.objects.map(o=>o.key));
assert.deepEqual(restored.related.map(o=>o.key),['28358']);
assert.equal(comparisonAt(prepareComparison(restored),date).systems[0].reference.item.key,'28358');
// A dated test installation exercises the host-only orbit path for an identified pod.
const pod={key:'model:test-installation',name:'Fixture pod',model:'mep.glb'};
const installed={kind:'MEP',host:data.objects[0],vehicle:pod,docked:'2026-11-01',released:'2026-12-01',
    hostInterface:'mount',vehicleInterface:'flange',roll:Math.PI/3};
const pairedPod=comparisonAt(prepareComparison({...data,objects:[pod,data.objects[0]]},[installed]),date);
assert.equal(pairedPod.status,'Pod attached');
assert.equal(pairedPod.poses[0],pairedPod.poses[1]);
const podToThird=comparisonAt(prepareComparison({...data,objects:[pod,data.objects[1]],related:[data.objects[0]]},[installed]),date);
assert.equal(podToThird.systems[0].reference.item.key,'28358');
assert.equal(podToThird.measurement.metres,result.measurement.metres);
assert.equal(comparisonAt(prepareComparison({...data,objects:[pod,data.objects[1]]},[]),date).shared,false);
for (const hostFirst of [true,false]) {
    const host=new Group(),vehicle=new Group(),bracket=new Group();
    bracket.position.set(2,3,1);bracket.rotation.x=.2;host.add(bracket);
    const ring=new Mesh(new BoxGeometry(1,1,1)),flange=new Mesh(new BoxGeometry(1,1,1));
    ring.name='mount';ring.scale.set(2,2,.15);ring.rotation.y=.3;ring.position.z=-3;bracket.add(ring);
    flange.name='flange';flange.scale.set(.75,.75,.2);flange.position.z=1.6;vehicle.add(flange);
    const primary=hostFirst ? host : vehicle, guest=hostFirst ? vehicle : host;
    primary.position.set(11,20,5);primary.rotation.z=.7;
    assert(mountAttachment(primary,guest,installed,hostFirst ? installed.host.key : pod.key));
    const hostFace=ring.localToWorld(new Vector3(0,0,-.5));
    const podFace=flange.localToWorld(new Vector3(0,0,.5));
    assert(hostFace.distanceTo(podFace)<1e-9);
    assert(guest.scale.distanceTo(new Vector3(1,1,1))<1e-9);
}
assert.equal(needsLocator(5.99,false),true);
assert.equal(needsLocator(8,true),true);
assert.equal(needsLocator(8,false),false);
assert.equal(needsLocator(12,true),false);
const iss={norad_id:'25544',orbit_class:'LEO',
    tle_line1:'1 25544U 98067A   26322.30200954  .00012483  00000+0  23055-3 0  9993',
    tle_line2:'2 25544  51.6316 257.4339 0007388  38.9132 321.2387 15.49454822595648'};
for (const row of [intelsat,iss]) {
    const elements=preparePositionTle(row.norad_id,row,'Test fixture'), satrec=elements.satrec;
    const paths=comparisonOrbitPath(elements,+date), period=2*Math.PI/satrec.no*60000;
    assert.equal(paths.length,1);assert.equal(paths[0].length,361);
    for (const i of [0,90,180,360]) {
        const time=new Date(Math.trunc(+date+(i-180)*period/360));
        const expected=inertialMetres(propagate(satrec,time).position);
        assert(paths[0][i].distanceTo(expected)<.01);
    }
}
assert.equal(servicingPartner('28358',+date).key,'46113');
assert.equal(servicingPartner('44625',Date.parse('2021-04-20')).key,'26824');
assert.equal(servicingPartner('26824',+date),null);
assert.deepEqual(findComparisonObjects('MEV-2','46113'),[]);
assert.equal(findComparisonObjects('Mission Extension Pod','28358')[0].key,'model:mep.glb');
assert.equal(findComparisonObjects('Norad 36581','28358',[astra3b])[0].key,'36581');
assert.equal(earthOccludes(new Vector3(4e7,0,0),new Vector3(-4e7,0,0),new Vector3()),true);
assert.equal(earthOccludes(new Vector3(4e7,0,0),new Vector3(2e7,0,0),new Vector3()),false);
assert.equal(earthOccludes(new Vector3(4e7,6362e3,0),new Vector3(-4e7,6362e3,0),new Vector3()),false);
const bad={...data,objects:[data.objects[0],{...data.objects[1],row:{...astra3b,tle_line2:mev2.tle_line2}}]};
assert.match(comparisonAt(prepareComparison(bad),date).errors.join(),/failed validation/);
assert.match(comparisonAt(prepareComparison(data),new Date('2027-03-01')).errors.join(),/stale|expired/i);
const modelOnly=prepareComparison({...data,objects:[data.objects[0],comparisonObject('model:mep.glb')]});
assert.match(comparisonAt(modelOnly,date).errors.join(),/no independent TLE/);
const url=comparisonLink({...data,date,view:'behind-b',earth:true,snapshot:true},'https://example.test/orbit/index.html');
assert.equal(url.pathname,'/orbit/display_satellite.html');
const keys=data.objects.map(o=>o.key);
const replay=comparisonSnapshot(url,keys);
assert.equal(replay.revision,data.revision);
assert.equal(comparisonAt(prepareComparison(replay),date).measurement.metres,result.measurement.metres);
assert.throws(()=>comparisonSnapshot(url,[...keys].reverse()),/do not match/);
const legacy=new URL(url);
const legacyData=JSON.parse(new URLSearchParams(legacy.hash.slice(1)).get('orbits'));
legacyData.version=1;delete legacyData.related;
legacy.hash=new URLSearchParams({orbits:JSON.stringify(legacyData)}).toString();
assert.equal(comparisonAt(prepareComparison(comparisonSnapshot(legacy,keys)),date).measurement.metres,result.measurement.metres);
url.searchParams.set('tleRevision','other');
assert.throws(()=>comparisonSnapshot(url,keys),/Incomplete/);
url.hash='';
assert.throws(()=>comparisonSnapshot(url,keys),/missing/);
console.log('Spacecraft comparison geometry, common UTC, identity and snapshot tests passed.');
