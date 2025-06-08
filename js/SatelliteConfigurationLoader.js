// SatelliteConfigurationLoader.js
// Load satellite visualization json data (TLE) from GitHub or local fallback

import {EARTH_RADIUS_KM, EARTH_SCENE_RADIUS} from './SatelliteConstantLoader.js';

export let usingLocalAssets = true;
export let earthConfig = {
    diameter: 12756,
    texture: 'textures/1_earth_16k.JPG',
    textureLight: 'textures/earthmap1k.JPG'
};
export let satelliteConfig = {
    icon: 'icons/ob_satellite.png',
    scale: [0.25, 0.25, 1],
    mercatorIcon: 'icons/ob_satellite.png'
};
export let sceneConfig = {
    camera: {fov: 75, near: 0.1, far: 2000, position: [0, 10, 35]},
    ambientLight: {color: 0xffffff, intensity: 0.4},
    directionalLight: {color: 0xffffff, intensity: 0.8, position: [5, 3, 5]}
};
export let controlsConfig = {enableDamping: true, dampingFactor: 0.1};
export const globalScale = EARTH_SCENE_RADIUS / (earthConfig.diameter / 2);

export async function checkFileExists(url) {
    try {
        const response = await fetch(url, {method: 'HEAD'});
        return response.ok;
    } catch (error) {
        // Network errors or CORS issues can cause fetch to reject
        console.error('Error checking file existence (HEAD request failed):', url, error);
        return false;
    }
}

/**
 * Dynamically resolves a full URL, either from GitHub or local assets.
 * @param {string} rel - Relative path (e.g., "textures/earth.jpg")
 * @param {string} base - Base URL (e.g., GITHUB_REPO_RAW_BASE_URL)
 * @returns {string|null}
 */
export function getFullGitHubUrl(relativePath, base) {
    if (!relativePath || typeof relativePath !== 'string') {
        console.warn("getFullGitHubUrl: received invalid path:", relativePath);
        return usingLocalAssets ? relativePath.replace(/^\//, '') : null;
    }
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
        return relativePath;
    }
    if (usingLocalAssets) {
        return relativePath.replace(/^\//, '');
    }
    return base + relativePath.replace(/^\//, '');
}

/**
 * Loads JSON from a URL with graceful fallback.
 * @param {string} url
 * @returns {Promise<object|Array>}
 */
export async function fetchJSON(url) {
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return await r.json();
    } catch (err) {
        return url.includes('/tle/') ? [] : {};
    }
}
