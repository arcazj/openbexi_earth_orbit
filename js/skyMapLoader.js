import * as THREE from 'three';
import { EARTH_SCENE_RADIUS, KM_TO_SCENE_UNITS } from './SatelliteConstantLoader.js';

const DEFAULT_CATALOG_URL = 'json/stars/brightStars.json';
const DEFAULT_SETTINGS = {
    magnitudeLimit: 6,
    sizeScale: 1.0,
    colorMode: 'trueColor',
    showLabels: false,
    labelDensity: 8,
    opacity: 0.85,
    observerLat: 0,
    observerLon: 0,
    rotY: 0
};

const STAR_SPHERE_RADIUS = EARTH_SCENE_RADIUS * 50;
const AXIS_Y = new THREE.Vector3(0, 1, 0);

function bvToRgb(bv) {
    // Approximation from pecob/super-colors (based on Mitchell Charity tables)
    const clamped = Math.max(-0.4, Math.min(2.0, bv ?? 0));
    let t;
    if (clamped < 0.0) {
        t = (clamped + 0.4) / 0.4;
        return new THREE.Color().setRGB(0.61 + 0.11 * t + 0.1 * t * t, 0.70 + 0.07 * t, 1.0);
    }
    if (clamped < 0.4) {
        t = clamped / 0.4;
        return new THREE.Color().setRGB(0.83 + 0.17 * t, 0.87 - 0.27 * t, 1.0 - 0.26 * t);
    }
    if (clamped < 1.5) {
        t = (clamped - 0.4) / 1.1;
        return new THREE.Color().setRGB(1.0, 0.60 + 0.32 * t, 0.74 - 0.38 * t);
    }
    t = Math.min(1.0, (clamped - 1.5) / 0.5);
    return new THREE.Color().setRGB(1.0 - 0.5 * t, 0.92 - 0.38 * t, 0.36 + 0.32 * t);
}

function magnitudeToSize(mag, sizeScale) {
    const base = 8 * sizeScale;
    const brightFactor = Math.pow(10, -0.4 * (mag + 1));
    return Math.max(1.5, base * brightFactor);
}

function raDecToAltAz(raHours, decDeg, gmstRad, latDeg, lonDeg) {
    const raRad = (raHours / 24) * Math.PI * 2;
    const decRad = THREE.MathUtils.degToRad(decDeg);
    const latRad = THREE.MathUtils.degToRad(latDeg);
    const lonRad = THREE.MathUtils.degToRad(lonDeg);
    const lst = gmstRad + lonRad;
    const ha = lst - raRad;

    const sinAlt = Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha);
    const alt = Math.asin(sinAlt);
    const az = Math.atan2(-Math.sin(ha) * Math.cos(decRad), Math.sin(decRad) * Math.cos(latRad) - Math.cos(decRad) * Math.sin(latRad) * Math.cos(ha));
    return { alt, az };
}

function altAzToEcef(alt, az, latDeg, lonDeg) {
    const latRad = THREE.MathUtils.degToRad(latDeg);
    const lonRad = THREE.MathUtils.degToRad(lonDeg);
    const cosAlt = Math.cos(alt);
    const sinAlt = Math.sin(alt);
    const sinAz = Math.sin(az);
    const cosAz = Math.cos(az);
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinLon = Math.sin(lonRad);
    const cosLon = Math.cos(lonRad);

    const east = cosAlt * sinAz;
    const north = cosAlt * cosAz;
    const up = sinAlt;

    const x = -sinLon * east - sinLat * cosLon * north + cosLat * cosLon * up;
    const y = cosLon * east - sinLat * sinLon * north + cosLat * sinLon * up;
    const z = cosLat * north + sinLat * up;
    return new THREE.Vector3(x, z, y); // swap y/z to stay consistent with scene ECEF usage
}

function ecefToScene(vec, rotY) {
    return vec.clone().applyAxisAngle(AXIS_Y, rotY).multiplyScalar(KM_TO_SCENE_UNITS * STAR_SPHERE_RADIUS / EARTH_SCENE_RADIUS);
}

function ensureLabelPool(container, pool, count) {
    while (pool.length < count) {
        const div = document.createElement('div');
        div.className = 'star-label';
        div.style.position = 'absolute';
        div.style.pointerEvents = 'none';
        div.style.color = '#fff';
        div.style.font = '11px/1.1 sans-serif';
        div.style.textShadow = '0 0 4px rgba(0,0,0,0.7)';
        container.appendChild(div);
        pool.push(div);
    }
    return pool;
}

function hideExtraLabels(pool, startIdx) {
    for (let i = startIdx; i < pool.length; i++) pool[i].style.display = 'none';
}

function updateLabels(state, labelCandidates, opts) {
    if (!state.labelContainer || !opts.renderer || !opts.camera) return;
    const { camera, renderer } = opts;
    ensureLabelPool(state.labelContainer, state.labelPool, labelCandidates.length);
    const rect = renderer.domElement.getBoundingClientRect();
    let shown = 0;
    for (const candidate of labelCandidates.slice(0, opts.labelDensity)) {
        const { position, name } = candidate;
        const projected = position.clone().project(camera);
        if (projected.z > 1.0) continue;
        const x = (projected.x * 0.5 + 0.5) * rect.width;
        const y = (-projected.y * 0.5 + 0.5) * rect.height;
        const label = state.labelPool[shown];
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        label.textContent = name;
        label.style.display = 'block';
        shown++;
    }
    hideExtraLabels(state.labelPool, shown);
}

function applyCatalogToGeometry(state) {
    const n = state.catalog.length;
    state.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    state.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    state.geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
    state.geometry.setDrawRange(0, 0);
}

async function loadCatalog(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Star catalog request failed');
        return await response.json();
    } catch (err) {
        console.warn('Falling back to bundled star sample.', err);
        return [
            { name: 'Sirius', ra: 6.7525, dec: -16.7161, mag: -1.46, bv: 0.0 },
            { name: 'Canopus', ra: 6.3992, dec: -52.6957, mag: -0.74, bv: 0.15 },
            { name: 'Arcturus', ra: 14.261, dec: 19.1825, mag: -0.05, bv: 1.23 },
            { name: 'Vega', ra: 18.6156, dec: 38.7836, mag: 0.03, bv: 0.00 },
            { name: 'Capella', ra: 5.2782, dec: 45.9978, mag: 0.08, bv: 0.80 },
            { name: 'Rigel', ra: 5.2423, dec: -8.2016, mag: 0.18, bv: -0.03 },
            { name: 'Procyon', ra: 7.655, dec: 5.225, mag: 0.38, bv: 0.42 },
            { name: 'Betelgeuse', ra: 5.9195, dec: 7.4071, mag: 0.45, bv: 1.85 },
            { name: 'Altair', ra: 19.8464, dec: 8.8683, mag: 0.77, bv: 0.22 },
            { name: 'Aldebaran', ra: 4.5987, dec: 16.5092, mag: 0.85, bv: 1.54 },
            { name: 'Spica', ra: 13.4199, dec: -11.1613, mag: 0.98, bv: -0.23 },
            { name: 'Antares', ra: 16.4901, dec: -26.4319, mag: 1.09, bv: 1.83 },
            { name: 'Pollux', ra: 7.7553, dec: 28.0262, mag: 1.14, bv: 1.0 },
            { name: 'Fomalhaut', ra: 22.9608, dec: -29.6223, mag: 1.16, bv: 0.90 },
            { name: 'Deneb', ra: 20.6905, dec: 45.2803, mag: 1.25, bv: 0.09 },
            { name: 'Mimosa', ra: 12.7953, dec: -59.6888, mag: 1.25, bv: -0.23 },
            { name: 'Regulus', ra: 10.1395, dec: 11.967, mag: 1.36, bv: -0.12 },
            { name: 'Adhara', ra: 6.9771, dec: -28.9721, mag: 1.50, bv: -0.20 },
            { name: 'Shaula', ra: 17.5601, dec: -37.1038, mag: 1.62, bv: -0.22 },
            { name: 'Bellatrix', ra: 5.4189, dec: 6.3497, mag: 1.64, bv: -0.21 }
        ];
    }
}

/**
 * Initializes the star layer and attaches it to the scene.
 * @param {THREE.Scene} scene
 * @param {object} [options]
 * @returns {Promise<object>} star layer state
 */
export async function initStarLayer(scene, options = {}) {
    const settings = { ...DEFAULT_SETTINGS, ...options };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(0), 1));

    const material = new THREE.ShaderMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uOpacity: { value: settings.opacity },
            uSizeScale: { value: settings.sizeScale }
        },
        vertexShader: `
            uniform float uSizeScale;
            attribute float size;
            varying vec3 vColor;
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * uSizeScale * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform float uOpacity;
            varying vec3 vColor;
            void main() {
                float d = length(gl_PointCoord - 0.5);
                float alpha = smoothstep(0.5, 0.0, d) * uOpacity;
                gl_FragColor = vec4(vColor, alpha);
            }
        `
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);

    const labelContainer = document.createElement('div');
    labelContainer.style.position = 'fixed';
    labelContainer.style.left = '0';
    labelContainer.style.top = '0';
    labelContainer.style.pointerEvents = 'none';
    labelContainer.style.width = '100%';
    labelContainer.style.height = '100%';
    labelContainer.style.zIndex = '1500';
    document.body.appendChild(labelContainer);

    const catalog = await loadCatalog(settings.catalogUrl || DEFAULT_CATALOG_URL);
    const state = {
        scene,
        points,
        geometry,
        material,
        catalog,
        settings,
        labelContainer,
        labelPool: [],
        visible: true
    };
    applyCatalogToGeometry(state);
    return state;
}

/**
 * Shows or hides the star layer and any labels.
 * @param {object} state
 * @param {boolean} visible
 */
export function setStarVisibility(state, visible) {
    if (!state) return;
    state.visible = visible;
    if (state.points) state.points.visible = visible;
    if (state.labelContainer) state.labelContainer.style.display = visible && state.settings.showLabels ? 'block' : 'none';
}

const prepareLabelCandidates = (worldPositions) => worldPositions.map(entry => ({
    position: entry.position.clone(),
    name: entry.star?.name || 'Star'
}));

/**
 * Updates star positions, colors, and labels in response to time/location/setting changes.
 * @param {object} state
 * @param {object} opts
 */
export function updateStarLayer(state, opts) {
    if (!state || !state.catalog?.length) return;
    const settings = { ...state.settings, ...opts };
    state.settings = settings;
    const { magnitudeLimit, colorMode, showLabels, labelDensity, opacity, sizeScale, observerLat, observerLon, gmst, rotY } = settings;

    const posAttr = state.geometry.attributes.position;
    const colAttr = state.geometry.attributes.color;
    const sizeAttr = state.geometry.attributes.size;
    if (!posAttr || !colAttr || !sizeAttr) return;
    const positions = posAttr.array;
    const colors = colAttr.array;
    const sizes = sizeAttr.array;

    let drawCount = 0;
    const labelWorldPositions = [];
    for (let i = 0; i < state.catalog.length; i++) {
        const star = state.catalog[i];
        if (star.mag > magnitudeLimit) continue;
        const { alt, az } = raDecToAltAz(star.ra, star.dec, gmst, observerLat, observerLon);
        // Filter stars that are far below horizon for realism
        if (alt < THREE.MathUtils.degToRad(-12)) continue;
        const ecefDir = altAzToEcef(alt, az, observerLat, observerLon);
        const worldPos = ecefToScene(ecefDir, rotY || 0);
        positions[drawCount * 3] = worldPos.x;
        positions[drawCount * 3 + 1] = worldPos.y;
        positions[drawCount * 3 + 2] = worldPos.z;

        const color = colorMode === 'trueColor' ? bvToRgb(star.bv) : new THREE.Color(1, 1, 1);
        colors[drawCount * 3] = color.r;
        colors[drawCount * 3 + 1] = color.g;
        colors[drawCount * 3 + 2] = color.b;

        sizes[drawCount] = magnitudeToSize(star.mag, sizeScale);
        labelWorldPositions.push({ position: worldPos, star, mag: star.mag });
        drawCount++;
    }

    state.geometry.setDrawRange(0, drawCount);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    state.material.uniforms.uOpacity.value = opacity;
    state.material.uniforms.uSizeScale.value = sizeScale;

    if (state.labelContainer) state.labelContainer.style.display = showLabels && state.visible ? 'block' : 'none';

    if (showLabels && state.visible) {
        labelWorldPositions.sort((a, b) => a.mag - b.mag);
        updateLabels(state, prepareLabelCandidates(labelWorldPositions), {
            renderer: settings.renderer,
            camera: settings.camera,
            labelDensity
        });
    } else {
        hideExtraLabels(state.labelPool, 0);
        if (state.labelContainer) state.labelContainer.style.display = showLabels && state.visible ? 'block' : 'none';
    }
}

/**
 * Releases resources used by the star layer.
 * @param {object} state
 */
export function disposeStarLayer(state) {
    if (!state) return;
    if (state.points?.parent) state.points.parent.remove(state.points);
    state.geometry?.dispose();
    state.material?.dispose();
    if (state.labelContainer?.parentElement) state.labelContainer.parentElement.removeChild(state.labelContainer);
}
