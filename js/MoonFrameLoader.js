// js/MoonFrameLoader.js
// Renders the Moon (always visible) and updates its position each frame with a texture.

import * as THREE from 'three';
import { KM_TO_SCENE_UNITS } from './SatelliteConstantLoader.js';

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

/**
 * Update Moon position each frame.
 * Simple circular equatorial orbit with sidereal period (fast & visually good).
 * @param {THREE.Object3D} moon
 * @param {Date} simDate
 * @param {number} gmstNow - GMST (rad), consistent with your Earth rotation
 */
export function updateMoon(moon, simDate, gmstNow) {
    if (!moon || !simDate) return;

    // Time since J2000 in days
    const jd = simDate.valueOf() / 86400000 + 2440587.5;
    const daysSinceJ2000 = jd - 2451545.0;

    // Mean motion (rad/day) and phase
    const meanMotion = TWO_PI / MOON_SIDEREAL_DAYS;
    const theta = (daysSinceJ2000 * meanMotion) % TWO_PI;

    // ECI position (circular orbit in equatorial plane)
    const r_km = MOON_MEAN_DISTANCE_KM;
    const x_eci = r_km * Math.cos(theta);
    const y_eci = r_km * Math.sin(theta);
    const z_eci = 0;

    // ECI -> ECF via GMST
    const cosG = Math.cos(gmstNow), sinG = Math.sin(gmstNow);
    const x_ecf =  x_eci * cosG + y_eci * sinG;
    const y_ecf = -x_eci * sinG + y_eci * cosG;
    const z_ecf =  z_eci;

    // ECF -> scene (X, Z, Y) and km -> scene units
    moon.position.set(
        x_ecf * KM_TO_SCENE_UNITS,
        z_ecf * KM_TO_SCENE_UNITS,  // swap Y<->Z
        y_ecf * KM_TO_SCENE_UNITS
    );

    moon.visible = true; // always visible
}
