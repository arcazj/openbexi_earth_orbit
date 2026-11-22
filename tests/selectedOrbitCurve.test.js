import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as satellite from 'satellite.js';
import { eciToSceneVector } from '../js/sceneFrame.js';
import { refreshSelectedOrbitOcclusion, updateOrbitTrajectory } from '../js/satelliteTLELoader.js';

// The mPOWER F7 elements and simulation time shown in the reported close-up.
const f7 = {
    OBJECT_ID: '2024-244A', NORAD_CAT_ID: '62362', EPOCH: '2026-11-18T09:23:14.140Z',
    MEAN_MOTION: 5.00115297, ECCENTRICITY: 0.00056483, INCLINATION: 0.0443,
    RA_OF_ASC_NODE: 331.736, ARG_OF_PERICENTER: 261.4805, MEAN_ANOMALY: 126.7385,
    BSTAR: 0, MEAN_MOTION_DOT: -1.2e-7, MEAN_MOTION_DDOT: 0
};
const epoch = new Date('2026-11-28T06:50:15Z');

function toScene(vector) {
    return eciToSceneVector(new THREE.Vector3(), vector);
}

function inspectView(root, satrec, time, direction, range, height) {
    const width = height * 1.8;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.000001, 400);
    const pv = satellite.propagate(satrec, time);
    const center = toScene(pv.position);
    const radial = center.clone().normalize();
    const along = toScene(pv.velocity).normalize();
    const normal = radial.clone().cross(along).normalize();
    const offset = along.clone().multiplyScalar(direction[0])
        .addScaledVector(radial, direction[1]).addScaledVector(normal, direction[2]);
    camera.position.copy(center).addScaledVector(offset.normalize(), range);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const arcs = refreshSelectedOrbitOcclusion(camera, {
        viewportHeight: height, satellitePosition: center, simTimeMs: time.getTime()
    });
    root.updateMatrixWorld(true);
    const cameraSpace = p => p.applyMatrix4(camera.matrixWorldInverse);
    const pixels = p => {
        p.applyMatrix4(camera.projectionMatrix);
        return new THREE.Vector3(p.x * width / 2, p.y * height / 2, 0);
    };
    const chord = new THREE.Line3();
    let worst = 0;
    let checks = 0;
    let anchored = false;
    for (const [index, arc] of arcs.entries()) {
        const positions = root.children[index].geometry.getAttribute('position');
        const rendered = arc.map((point, i) => {
            const local = new THREE.Vector3().fromBufferAttribute(positions, i);
            if (point.orbitTimeMs === time.getTime() && local.lengthSq() === 0) anchored = true;
            return cameraSpace(root.localToWorld(local));
        });
        for (let i = 1; i < arc.length; i++) {
            const a = rendered[i - 1].clone();
            const b = rendered[i].clone();
            if (Math.min(a.z, b.z) >= -camera.near) continue;
            // Clip the line before projecting, as WebGL does for a close pass.
            if (a.z > -camera.near) a.lerp(b, (-camera.near - a.z) / (b.z - a.z));
            if (b.z > -camera.near) b.lerp(a, (-camera.near - b.z) / (a.z - b.z));
            chord.set(pixels(a), pixels(b));
            const start = arc[i - 1].orbitTimeMs, duration = arc[i].orbitTimeMs - start;
            const offsets = [1, ...[0.001, 0.02, 0.25, 0.5, 0.75, 0.98, 0.999]
                .map(fraction => Math.round(duration * fraction)), duration - 1];
            for (const offset of offsets) {
                const at = new Date(start + offset);
                const actual = cameraSpace(toScene(satellite.propagate(satrec, at).position));
                if (actual.z >= -camera.near) continue;
                const sample = pixels(actual);
                if (Math.abs(sample.x) > width / 2 || Math.abs(sample.y) > height / 2) continue;
                const error = sample.distanceTo(chord.closestPointToPoint(sample, true, new THREE.Vector3()));
                worst = Math.max(worst, error);
                checks++;
            }
        }
    }
    assert(anchored, 'the propagated bus center is an exact vertex of the displayed curve');
    assert(checks > 0, 'independent on-screen ephemeris samples were compared');
    assert(worst < 0.75, `projected orbit error ${worst.toFixed(3)} px for ${direction}, at ${range} scene units`);
    return worst;
}

let maxError = 0;
for (const elements of [f7, { ...f7, MEAN_MOTION: 1.0027 }, {
    ...f7, MEAN_MOTION: 2.006, ECCENTRICITY: 0.68, INCLINATION: 63.4
}]) {
    const satrec = satellite.json2satrec(elements);
    const root = updateOrbitTrajectory(new THREE.Scene(), { showOrbit: true, simDate: epoch },
        { satrec, norad_id: 'curve-test' }, { satelliteLib: satellite });
    for (const delta of [0, 37123, -8720]) {
        const time = new Date(epoch.getTime() + delta);
        for (const direction of [[1, 0.015, 0.12], [-1, -0.04, 0.25], [0.1, 1, 0.2], [0, 0, 1]]) {
            maxError = Math.max(maxError, inspectView(root, satrec, time, direction, 0.0001, 1080));
        }
    }
    maxError = Math.max(maxError, inspectView(root, satrec, epoch, [0, 0, 1], 80, 765));
}
console.log(`Selected orbit screen projection passed in 39 views (maximum error ${maxError.toFixed(3)} px)`);
