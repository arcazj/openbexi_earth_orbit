// js/MarsFrameLoader.js
// Renders Mars as an approximate Earth-centered visual body with a local texture.

import * as THREE from 'three';
import { KM_TO_SCENE_UNITS } from './SatelliteConstantLoader.js';
import { eciToSceneVector, sceneCoordinatesFromEciKm } from './sceneFrame.js';

export const MARS_TEXTURE_URL = 'textures/March.jpg';
export const MARS_MEAN_RADIUS_KM = 3389.5;
export const EARTH_ORBIT_RADIUS_KM = 149_597_870.7;
export const MARS_ORBIT_RADIUS_KM = 227_939_200;
export const EARTH_SIDEREAL_DAYS = 365.256363004;
export const MARS_SIDEREAL_DAYS = 686.98;

const TWO_PI = Math.PI * 2;
const MARS_EPOCH_PHASE_RAD = 44 * Math.PI / 180;

let marsMesh = null;
let textureLoader = null;

export function createMars(scene, earthSceneRadius = 10, opts = {}) {
    if (marsMesh) return marsMesh;

    const {
        textureUrl = MARS_TEXTURE_URL,
        onTextureLoadStart,
        onTextureLoadProgress,
        onTextureLoadComplete,
        onTextureLoadError
    } = opts;
    const radius = MARS_MEAN_RADIUS_KM * KM_TO_SCENE_UNITS;
    const geo = new THREE.SphereGeometry(radius, 96, 64);
    const mat = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        emissive: 0x000000,
        shininess: 8
    });

    marsMesh = new THREE.Mesh(geo, mat);
    marsMesh.name = 'Mars';
    marsMesh.castShadow = false;
    marsMesh.receiveShadow = false;
    marsMesh.userData.radiusScene = radius;
    marsMesh.userData.textureUrl = textureUrl;
    marsMesh.userData.positionModel = 'simplified-circular-heliocentric-relative-to-earth';
    scene.add(marsMesh);

    if (!textureLoader) textureLoader = new THREE.TextureLoader();
    onTextureLoadStart?.({ textureUrl });
    textureLoader.load(
        textureUrl,
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            mat.map = tex;
            mat.needsUpdate = true;
            onTextureLoadComplete?.({ textureUrl, texture: tex });
        },
        (event) => {
            onTextureLoadProgress?.({
                textureUrl,
                loaded: event?.loaded || 0,
                total: event?.total || 0,
                lengthComputable: !!event?.lengthComputable || !!event?.total
            });
        },
        (error) => {
            mat.map = null;
            mat.color.set(0xb56a42);
            mat.needsUpdate = true;
            onTextureLoadError?.({ textureUrl, error });
        }
    );

    return marsMesh;
}

export function getApproximateMarsEciKm(simDate) {
    const jd = simDate.valueOf() / 86400000 + 2440587.5;
    const daysSinceJ2000 = jd - 2451545.0;
    const earthTheta = (daysSinceJ2000 * TWO_PI / EARTH_SIDEREAL_DAYS) % TWO_PI;
    const marsTheta = (daysSinceJ2000 * TWO_PI / MARS_SIDEREAL_DAYS + MARS_EPOCH_PHASE_RAD) % TWO_PI;

    const earth = {
        x: EARTH_ORBIT_RADIUS_KM * Math.cos(earthTheta),
        y: EARTH_ORBIT_RADIUS_KM * Math.sin(earthTheta),
        z: 0
    };
    const mars = {
        x: MARS_ORBIT_RADIUS_KM * Math.cos(marsTheta),
        y: MARS_ORBIT_RADIUS_KM * Math.sin(marsTheta),
        z: 0
    };

    return {
        x: mars.x - earth.x,
        y: mars.y - earth.y,
        z: mars.z - earth.z
    };
}

export function getApproximateMarsScenePosition(simDate, scale = KM_TO_SCENE_UNITS) {
    return sceneCoordinatesFromEciKm(getApproximateMarsEciKm(simDate), scale);
}

export function updateMars(mars, simDate) {
    if (!mars || !simDate) return;

    eciToSceneVector(mars.position, getApproximateMarsEciKm(simDate));
    mars.rotation.y += 0.001;
    mars.visible = true;
}
