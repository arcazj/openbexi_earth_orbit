import assert from 'node:assert/strict';
import { Mesh, SphereGeometry, Vector3 } from 'three';
import { eciToGeodetic, gstime, propagate, twoline2satrec } from '../vendor/satellite.js/7.1.0/satellite.es.js';
import { publishedBeam, PublishedBeamLayer } from '../js/publishedBeamFootprints.js';
import { orbitalPose, physicalEarthGeometry, preparePositionTle } from '../js/modelViewerEarth.js';
import { intelsat } from './fixtures/lifeExtensionTles.js';

const client = publishedBeam('28358'), astra = publishedBeam(36581);
for (const [beam, norad, number] of [[client,'28358','5491'],[astra,'36581','6252']]) {
    assert.equal(beam.beam, number);
    assert.equal(beam.coverage, null);
    const link = new URL(beam.source);
    assert.equal(link.origin, 'https://satbeams.com');
    assert.equal(link.searchParams.get('norad'), norad);
    assert.equal(link.searchParams.get('beam'), number);
}
const docked = {shownPair: true, elements: [{id:'46113'}], client:{norad:'28358'}};
assert.equal(publishedBeam('46113', docked), client);
assert.equal(publishedBeam('44625', docked), null);
assert.equal(publishedBeam('46113', {...docked, shownPair:false}), null);

// Artificial equatorial seam-crossing line solely for exercising both renderers.
const geojson = {type:'FeatureCollection', features:[{type:'Feature', geometry:{type:'LineString', coordinates:[[179,0],[-179,0]]}}]};
const earth = new Mesh(new SphereGeometry(1));
const layer = new PublishedBeamLayer(earth);
layer.set({beam: 'test', coverage: {geojson}});
assert.equal(earth.children.length, 0);
layer.set({beam:'test', coverage:{geojson, rights:'redistribution-cleared', attribution:'test', provenance:'test fixture'}});
const positions = layer.line.geometry.getAttribute('position');
assert.equal(positions.count, 4);
assert(positions.getX(0) < -.99 && positions.getZ(0) < 0 && positions.getZ(3) > 0);
const segments = [];
let x;
layer.drawMap({canvas:{width:360,height:180}, save(){},restore(){},beginPath(){},stroke(){},
    moveTo(n){x=n;},lineTo(n){segments.push([x,n]);}});
assert.deepEqual(segments, [[359,361],[-1,1]]);
layer.set(astra);
assert.equal(earth.children.length, 0);

const date = new Date('2026-11-24T12:00:00Z');
const physical = physicalEarthGeometry();
physical.computeBoundingBox();
const bounds = physical.boundingBox.getSize(new Vector3());
assert(Math.abs(bounds.x/1000-12756.274) < .001 && Math.abs(bounds.y/1000-12713.5046) < .001);
assert.equal(bounds.z,bounds.x);
assert.throws(() => preparePositionTle('36581',intelsat,'test'),/No published TLE/);
assert.throws(() => preparePositionTle('28358',{...intelsat,tle_line1:intelsat.tle_line1.slice(0,-1)+'0'},'test'),/failed validation/);
const elements = {satrec:twoline2satrec(intelsat.tle_line1,intelsat.tle_line2),epoch:'2026-11-18T07:56:38.672Z',orbit:'GEO'};
const pose = orbitalPose(elements, date, '28358');
const deck = new Vector3(0,0,1).applyQuaternion(pose.attitude);
assert(pose.position.length() > 4.1e7 && pose.position.length() < 4.3e7);
assert(deck.dot(pose.position.clone().normalize().negate()) > .999999);
const geographic = eciToGeodetic(propagate(elements.satrec,date).position,gstime(date));
const inGlobe = pose.position.clone().applyAxisAngle(new Vector3(0,1,0),-pose.rotation);
assert(Math.abs(Math.atan2(-inGlobe.z,inGlobe.x)-geographic.longitude) < 1e-9);
assert.throws(() => orbitalPose(elements, new Date('2027-01-01Z'), '28358'), /stale/);
