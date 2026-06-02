// js/MoonFrameLoader.js
// Renders the Moon (always visible) and updates its position each frame with a texture.

import * as THREE from 'three';
import { KM_TO_SCENE_UNITS } from './SatelliteConstantLoader.js';
import { eciToSceneVector, sceneCoordinatesFromEciKm } from './sceneFrame.js';

// Mean Moon distance and period (simplified)
const MOON_MEAN_DISTANCE_KM = 384_400;         // km
const MOON_SIDEREAL_DAYS    = 27.321661;       // days
const TWO_PI = Math.PI * 2;

let moonMesh = null;
let textureLoader = null;

/**
 * Create (or return existing) Moon mesh with an equirectangular (Mercator-like) texture.
 * @param {THREE.Scene} scene
 * @param {number} earthSceneRadius  - your scene Earth radius
 * @param {Object} [opts]
 * @param {string} [opts.textureUrl='textures/moon_map2.jpg'] - local or absolute URL
 * @returns {THREE.Mesh}
 */
export function createMoon(scene, earthSceneRadius = 10, opts = {}) {
    if (moonMesh) return moonMesh;

    const { textureUrl = 'textures/moon_map2.jpg' } = opts;

    // Visual size: ~0.27 * Earth radius
    const radius = earthSceneRadius * 0.27;
    const geo = new THREE.SphereGeometry(radius, 64, 48);

    // Base material; texture applied once loaded
    const mat = new THREE.MeshPhongMaterial({
        color: 0xffffff,          // neutral so the texture shows true
        emissive: 0x000000,
        shininess: 10
    });

    moonMesh = new THREE.Mesh(geo, mat);
    moonMesh.name = 'Moon';
    moonMesh.castShadow = false;
    moonMesh.receiveShadow = false;
    scene.add(moonMesh);

    // Load texture (equirectangular will wrap correctly on a SphereGeometry)
    if (!textureLoader) textureLoader = new THREE.TextureLoader();
    textureLoader.load(
        textureUrl,
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace; // correct color
            mat.map = tex;
            mat.needsUpdate = true;
        },
        undefined,
        () => {
            // Fallback if texture fails to load
            mat.map = null;
            mat.color.set(0xbfbfbf);               // light gray fallback
            mat.needsUpdate = true;
            // Optional: console.warn('Moon texture failed to load:', textureUrl);
        }
    );

    return moonMesh;
}

export function getApproximateMoonEciKm(simDate) {
    const jd = simDate.valueOf() / 86400000 + 2440587.5;
    const daysSinceJ2000 = jd - 2451545.0;
    const meanMotion = TWO_PI / MOON_SIDEREAL_DAYS;
    const theta = (daysSinceJ2000 * meanMotion) % TWO_PI;

    return {
        x: MOON_MEAN_DISTANCE_KM * Math.cos(theta),
        y: MOON_MEAN_DISTANCE_KM * Math.sin(theta),
        z: 0
    };
}

export function getApproximateMoonScenePosition(simDate, scale = KM_TO_SCENE_UNITS) {
    return sceneCoordinatesFromEciKm(getApproximateMoonEciKm(simDate), scale);
}

/**
 * Update Moon position each frame.
 * Approximate visual model: circular equatorial ECI orbit with sidereal period.
 * @param {THREE.Object3D} moon
 * @param {Date} simDate
 */
export function updateMoon(moon, simDate) {
    if (!moon || !simDate) return;

    eciToSceneVector(moon.position, getApproximateMoonEciKm(simDate));
    moon.visible = true; // always visible
}
