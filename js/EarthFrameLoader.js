// EarthFrameLoader.js – keeps original signatures, now actually works
import * as THREE from 'three';
import {
    EARTH_SCENE_RADIUS,
    KM_TO_SCENE_UNITS,
    WGS84_A_KM,
    WGS84_F
} from './SatelliteConstantLoader.js';

/* ─────────── Constants ─────────── */
const TARGET_AXIS_LENGTH_KM = 10000;
const VISUAL_AXIS_EXTENT    = TARGET_AXIS_LENGTH_KM * KM_TO_SCENE_UNITS;

const LABEL_OFFSET          = 1.0;
const LABEL_VERTICAL_OFFSET = 0.5;

const HEAD_LENGTH           = VISUAL_AXIS_EXTENT * 0.05;
const HEAD_WIDTH            = HEAD_LENGTH * 0.4;
const AXIS_COLOR            = 0x00ff00;

// WGS84 ellipsoid constants used in geodetic conversions
const a  = WGS84_A_KM;                         // semi-major axis in km
const e2 = WGS84_F * (2 - WGS84_F);            // first eccentricity squared

/* ─────────── Module‑scoped state ─────────── */
const helpers = {};               // ArrowHelpers & graticule meshes
const labels  = {};               // Cached DOM elements

/* ─────────── Utility helpers ─────────── */
function $lbl(id) {
    return (labels[id] = labels[id] || document.getElementById(id));
}
function setVisible(obj, v) { if (obj) obj.visible = v; }
function placeLabel(el, x, y) {
    if (!el) return;
    el.style.left   = x + 'px';
    el.style.top    = y + 'px';
    el.style.display = 'block';
}

/* Inject the six HTML label <div>s once, if they don’t already exist */
function ensureAxisLabels() {
    const ids = [
        ['labelXecr',              'X<sub>ecr</sub>'],
        ['labelYecr',              'Y<sub>ecr</sub>'],
        ['labelZecr',              'Z<sub>ecr</sub>'],
        ['labelNorthPole',         'North&nbsp;Pole'],
        ['labelEquatorLine',       'Equator&nbsp;Line'],
        ['labelGreenwichMeridian', 'Greenwich&nbsp;Meridian']
    ];

    ids.forEach(([id, html]) => {
        if (!document.getElementById(id)) {
            const div = document.createElement('div');
            div.id = id;
            div.className = 'axis-label';
            div.innerHTML = html;
            div.style.position = 'absolute';
            div.style.pointerEvents = 'none';
            div.style.display = 'none';
            document.body.appendChild(div);
            labels[id] = div;
        }
    });
}

/* ─────────── Public API ─────────── */
export function geodeticToECEF(latDeg, lonDeg, hKm = 0) {
    const φ = THREE.MathUtils.degToRad(latDeg);
    const λ = THREE.MathUtils.degToRad(lonDeg);
    const sinφ = Math.sin(φ);
    const N = a / Math.sqrt(1 - e2 * sinφ*sinφ);

    const x = (N + hKm) * Math.cos(φ) * Math.cos(λ);
    const y = (N + hKm) * Math.cos(φ) * Math.sin(λ);
    const z = ((1 - e2) * N + hKm) * sinφ;
    return new THREE.Vector3(x, z, y).multiplyScalar(KM_TO_SCENE_UNITS);
    // ^^^ swap y/z to stay consistent with your axis choices
}

export function geocentricToECEF(latCenDeg, lonDeg, rKm) {
    const φc = THREE.MathUtils.degToRad(latCenDeg);
    const λ  = THREE.MathUtils.degToRad(lonDeg);
    const x = rKm * Math.cos(φc) * Math.cos(λ);
    const y = rKm * Math.cos(φc) * Math.sin(λ);
    const z = rKm * Math.sin(φc);
    return new THREE.Vector3(x, z, y).multiplyScalar(KM_TO_SCENE_UNITS);
}
export function addECEFAxes(scene) {
    ensureAxisLabels();                        // ← NEW: actually add labels to DOM

    // X, Y, Z ArrowHelpers
    helpers.xAxis = new THREE.ArrowHelper(
        new THREE.Vector3(1,0,0), new THREE.Vector3(0,0,0),
        VISUAL_AXIS_EXTENT, AXIS_COLOR, HEAD_LENGTH, HEAD_WIDTH);
    helpers.yAxis = new THREE.ArrowHelper(
        new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,0),
        VISUAL_AXIS_EXTENT, AXIS_COLOR, HEAD_LENGTH, HEAD_WIDTH);
    helpers.zAxis = new THREE.ArrowHelper(
        new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,0),
        VISUAL_AXIS_EXTENT, AXIS_COLOR, HEAD_LENGTH, HEAD_WIDTH);
    scene.add(helpers.xAxis, helpers.yAxis, helpers.zAxis);

    // Equator ring
    const equatorR  = EARTH_SCENE_RADIUS + 0.05;
    const lineMat   = new THREE.LineBasicMaterial({ color: AXIS_COLOR });
    const equatorG  = new THREE.BufferGeometry().setFromPoints(
        new THREE.Path()
            .absarc(0, 0, equatorR, 0, Math.PI * 2, false)
            .getPoints(64)
    );
    helpers.equator = new THREE.Line(equatorG, lineMat);
    helpers.equator.rotation.x = Math.PI / 2;
    helpers.equator.userData.radius = equatorR;
    scene.add(helpers.equator);

    // Greenwich meridian half‑circle
    const pts = [];
    const SEG = 32;
    for (let i = 0; i <= SEG; i++) {
        const phi = (i / SEG) * Math.PI;            // 0 → π
        pts.push(new THREE.Vector3(Math.sin(phi)*equatorR, Math.cos(phi)*equatorR, 0));
    }
    const meridianG = new THREE.BufferGeometry().setFromPoints(pts);
    helpers.meridian = new THREE.Line(meridianG, lineMat);
    scene.add(helpers.meridian);
}

export function updateECEFAxesVisibility(simParams) {
    const v = !!simParams.showECEFAxes;
    ['xAxis','yAxis','zAxis','equator','meridian'].forEach(k => setVisible(helpers[k], v));

    ['labelXecr','labelYecr','labelZecr',
        'labelNorthPole','labelEquatorLine','labelGreenwichMeridian']
        .forEach(id => {
            const el = $lbl(id);
            if (el) el.style.display = v ? 'block' : 'none';
        });
}

export function update3DLabelsPosition(camera, simParams) {
    /* relies on a global `renderer`, exactly like your original setup */
    if (!simParams.showECEFAxes || !simParams.view3D || typeof renderer === 'undefined') {
        updateECEFAxesVisibility({ showECEFAxes: false });
        return;
    }

    const proj = v => {
        const p = v.clone().project(camera);
        return {
            x: ( p.x * 0.5 + 0.5) * renderer.domElement.clientWidth,
            y: (-p.y * 0.5 + 0.5) * renderer.domElement.clientHeight
        };
    };

    // Arrow‑tip labels
    placeLabel($lbl('labelXecr'), ...Object.values(
        proj(new THREE.Vector3(VISUAL_AXIS_EXTENT + LABEL_OFFSET, 0, 0))));
    placeLabel($lbl('labelYecr'), ...Object.values(
        proj(new THREE.Vector3(0, 0, VISUAL_AXIS_EXTENT + LABEL_OFFSET))));
    placeLabel($lbl('labelZecr'), ...Object.values(
        proj(new THREE.Vector3(0, VISUAL_AXIS_EXTENT + LABEL_OFFSET, 0))));

    // North‑pole label
    placeLabel($lbl('labelNorthPole'), ...Object.values(
        proj(new THREE.Vector3(0, EARTH_SCENE_RADIUS + LABEL_OFFSET, 0))));

    // Equator label – nearest point on ring to camera
    const r     = helpers.equator.userData.radius;
    const camXZ = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    const eqPos = camXZ.lengthSq() < 1e-3
        ? new THREE.Vector3(r, 0, 0)
        : camXZ.normalize().multiplyScalar(r);
    eqPos.y = LABEL_VERTICAL_OFFSET;
    placeLabel($lbl('labelEquatorLine'), ...Object.values(proj(eqPos)));

    // Greenwich meridian label (≈ 30° from north on meridian)
    const theta = THREE.MathUtils.degToRad(30);
    const merPos = new THREE.Vector3(
        r * Math.sin(theta),
        r * Math.cos(theta) + LABEL_VERTICAL_OFFSET,
        0 );
    placeLabel($lbl('labelGreenwichMeridian'), ...Object.values(proj(merPos)));
}
