// satelliteYawPitchRollLoader.js – build & update Body‑Frame axes showing Yaw‑Pitch‑Roll bias
// -----------------------------------------------------------------------------
// Exports
//   createYPRFrame(scene, lengthKm?)                    → YPRFrame ({…helpers, len})
//   updateYPRFrame(ypr, satPos, yawDeg, pitchDeg, rollDeg) → void
//   setYPRVisibility(ypr, visible)                      → void
//   disposeYPRFrame(ypr)                                → void
// -----------------------------------------------------------------------------
//
// The Body‑Frame (spacecraft frame) is derived from the Orbit‑Frame by applying
// sequential extrinsic rotations:  1) Yaw (+Z)  2) Pitch (+Y)  3) Roll (+X).
// Angles are provided in **degrees** and applied in Z‑Y‑X order, matching the
// industry convention (yaw‑pitch‑roll).
// -----------------------------------------------------------------------------

import * as THREE from "three";
import { KM_TO_SCENE_UNITS } from "./SatelliteConstantLoader.js";

/* ─────────── Tunables ─────────── */
const DEFAULT_AXIS_LEN_KM = 3000;          // shorter than LVLH for clarity
const AXIS_COLOR_X        = 0xff4040;      // Roll axis (+X)
const AXIS_COLOR_Y        = 0x40ff40;      // Pitch axis (+Y)
const AXIS_COLOR_Z        = 0x4090ff;      // Yaw axis  (+Z)
const LABEL_OFFSET        = 1.0;           // scene units beyond arrow tip
const HEAD_RATIO          = 0.07;          // arrowhead length as % of total
const HEAD_WIDTH_RATIO    = 0.4;

/* ─────────── Helpers ─────────── */
function makeArrow(dir, len, color) {
    return new THREE.ArrowHelper(
        dir, new THREE.Vector3(), len, color,
        len * HEAD_RATIO,
        len * HEAD_RATIO * HEAD_WIDTH_RATIO
    );
}

const HTML_LABELS = {};
function htmlLabel(id, text) {
    if (HTML_LABELS[id]) return HTML_LABELS[id];
    const div = document.createElement("div");
    div.id = id;
    div.className = "axis-label";
    div.innerHTML = text;
    div.style.cssText = "position:absolute; pointer-events:none; display:none;";
    document.body.appendChild(div);
    HTML_LABELS[id] = div;
    return div;
}

function projToScreen(v, camera, renderer) {
    const p = v.clone().project(camera);
    return {
        x: ( p.x * 0.5 + 0.5) * renderer.domElement.clientWidth,
        y: (-p.y * 0.5 + 0.5) * renderer.domElement.clientHeight
    };
}
function place(el, x, y, show) {
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    el.style.display = show ? "block" : "none";
}
function degToRad(deg) { return (deg || 0) * Math.PI / 180; }

/* ─────────── Public API ─────────── */
export function createYPRFrame(scene, lengthKm = DEFAULT_AXIS_LEN_KM) {
    const len = lengthKm * KM_TO_SCENE_UNITS;

    const xArr = makeArrow(new THREE.Vector3(1,0,0), len, AXIS_COLOR_X);
    const yArr = makeArrow(new THREE.Vector3(0,1,0), len, AXIS_COLOR_Y);
    const zArr = makeArrow(new THREE.Vector3(0,0,1), len, AXIS_COLOR_Z);
    scene.add(xArr, yArr, zArr);

    const lblX = htmlLabel("labelBodyX", "+X (Roll)");
    const lblY = htmlLabel("labelBodyY", "+Y (Pitch)");
    const lblZ = htmlLabel("labelBodyZ", "+Z (Yaw)");

    return { xArr, yArr, zArr, lblX, lblY, lblZ, len };
}

/**
 * Updates the Body‑Frame given satellite position and yaw/pitch/roll angles.
 * @param ypr       The YPR frame object returned by createYPRFrame.
 * @param satPos    THREE.Vector3 in scene units.
 * @param yawDeg    Yaw   (about +Z) in degrees.
 * @param pitchDeg  Pitch (about +Y) in degrees.
 * @param rollDeg   Roll  (about +X) in degrees.
 */
export function updateYPRFrame(ypr, satPos, yawDeg=0, pitchDeg=0, rollDeg=0) {
    if (!ypr || !satPos) return;

    /* quaternion representing Z‑Y‑X extrinsic rotations (yaw‑pitch‑roll) */
    const euler = new THREE.Euler(
        degToRad(rollDeg),
        degToRad(pitchDeg),
        degToRad(yawDeg),
        "ZYX"                      // apply Z, then Y, then X
    );
    const q = new THREE.Quaternion().setFromEuler(euler);
    updateYPRFrameQuaternion(ypr, satPos, q);
}

export function updateYPRFrameQuaternion(ypr, satPos, q) {
    if (!ypr || !satPos || !q) return;

    /* rotated unit axes */
    const xHat = new THREE.Vector3(1,0,0).applyQuaternion(q);
    const yHat = new THREE.Vector3(0,1,0).applyQuaternion(q);
    const zHat = new THREE.Vector3(0,0,1).applyQuaternion(q);

    /* position arrows */
    ypr.xArr.setDirection(xHat);  ypr.xArr.position.copy(satPos);
    ypr.yArr.setDirection(yHat);  ypr.yArr.position.copy(satPos);
    ypr.zArr.setDirection(zHat);  ypr.zArr.position.copy(satPos);

    /* HTML labels */
    if (window.renderer && window.camera) {
        const offs = ypr.len + LABEL_OFFSET;
        const tipX = satPos.clone().add(xHat.clone().multiplyScalar(offs));
        const tipY = satPos.clone().add(yHat.clone().multiplyScalar(offs));
        const tipZ = satPos.clone().add(zHat.clone().multiplyScalar(offs));

        const pX = projToScreen(tipX, camera, renderer);
        const pY = projToScreen(tipY, camera, renderer);
        const pZ = projToScreen(tipZ, camera, renderer);

        place(ypr.lblX, pX.x, pX.y, true);
        place(ypr.lblY, pY.x, pY.y, true);
        place(ypr.lblZ, pZ.x, pZ.y, true);
    }
}

function setVis(obj, v) { if (obj) obj.visible = v; }
export function setYPRVisibility(ypr, visible) {
    if (!ypr) return;
    ["xArr","yArr","zArr"].forEach(k => setVis(ypr[k], visible));
    ["lblX","lblY","lblZ"].forEach(k => {
        const el = ypr[k];
        if (el) el.style.display = visible ? "block" : "none";
    });
}

export function disposeYPRFrame(ypr) {
    if (!ypr) return;
    ["xArr","yArr","zArr"].forEach(k => {
        if (ypr[k]) {
            ypr[k].geometry?.dispose();
            ypr[k].material?.dispose();
        }
    });
    setYPRVisibility(ypr, false);
}
