/*  drawDayNight.js
    ──────────────────────────────────────────────────────────────
    • drawDayNightMercator(ctx,w,h,date) – paint night-side on a Mercator map
    • drawDayNight3D(scene, earthMesh, date, { showSun, showHalo, earthRadius, sunDistance, haloSize }) – real-time sun-light & visible Sun + halo
*/

import * as THREE from 'three';
import { eciToSceneVector, gmstFromJulianDay } from './sceneFrame.js';
import { lonLatFromMercatorPixel } from './orbit/orbitLinkGeometry.js';

/* ≡≡ Sun position in ECI frame from Date (unit vector) ≡≡ */
function sunEciUnit(date) {
    const jd = date.valueOf() / 86400000 + 2440587.5;
    return sunECI(jd);
}

/* ≡≡ Convert ECI → ECF unit-vector using GMST (rad) ≡≡ */
function eciToEcf(vecEci, gmst) {
    return new THREE.Vector3(
        vecEci.x * Math.cos(gmst) + vecEci.y * Math.sin(gmst),
        -vecEci.x * Math.sin(gmst) + vecEci.y * Math.cos(gmst),
        vecEci.z
    ).normalize();
}

/* ------------------------------------------------------------------ */
/* 2-D Mercator night-side                                            */

/* ------------------------------------------------------------------ */
export function terminatorLatitudeRad(lonRad, subLonRad, subLatRad) {
    let lat = Math.atan2(-Math.cos(lonRad - subLonRad), Math.tan(subLatRad));
    // atan2 can select the opposite hemisphere when solar declination is negative.
    if (lat > Math.PI / 2) lat -= Math.PI;
    if (lat < -Math.PI / 2) lat += Math.PI;
    return lat;
}

const TWILIGHT_START = Math.sin(-6 * Math.PI / 180);
const TWILIGHT_END = Math.sin(2 * Math.PI / 180);
const mercatorNightCache = new WeakMap();

export function daylightFactor(solarDot) {
    const t = Math.max(0, Math.min(1, (solarDot - TWILIGHT_START) / (TWILIGHT_END - TWILIGHT_START)));
    return t * t * (3 - 2 * t);
}

export function drawDayNightMercator(ctx, width, height, date) {
    if (!(width > 0 && height > 0)) return;
    const time = date.valueOf();
    const jd = time / 86400000 + 2440587.5;
    let cached = mercatorNightCache.get(ctx);
    if (!cached || cached.width !== width || cached.height !== height) {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1024 / width, 1024 / height);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d');
        cached = { canvas, context, width, height, time: NaN,
            pixels: context.createImageData(canvas.width, canvas.height) };
        mercatorNightCache.set(ctx, cached);
    }
    if (!Number.isFinite(cached.time) || Math.abs(time - cached.time) >= 30_000) {
        const sun = eciToEcf(sunEciUnit(date), gmstFromJD(jd));
        const { canvas, pixels } = cached;
        const longitudeDots = new Float64Array(canvas.width);
        for (let x = 0; x < canvas.width; x++) {
            const lon = ((x + 0.5) / canvas.width) * 2 * Math.PI - Math.PI;
            longitudeDots[x] = Math.cos(lon) * sun.x + Math.sin(lon) * sun.y;
        }
        for (let y = 0; y < canvas.height; y++) {
            const { latDeg } = lonLatFromMercatorPixel(0, (y + 0.5) * height / canvas.height, width, height);
            const lat = latDeg * Math.PI / 180;
            const cosLat = Math.cos(lat);
            const polarDot = Math.sin(lat) * sun.z;
            for (let x = 0; x < canvas.width; x++) {
                const offset = (y * canvas.width + x) * 4;
                pixels.data[offset] = 5;
                pixels.data[offset + 1] = 12;
                pixels.data[offset + 2] = 28;
                pixels.data[offset + 3] = Math.round(255 * 0.58 *
                    (1 - daylightFactor(cosLat * longitudeDots[x] + polarDot)));
            }
        }
        cached.context.putImageData(pixels, 0, 0);
        cached.time = time;
    }
    // Sampling the surface/Sun dot product handles equinoxes, poles and map seams
    // without closing a terminator polygon through the wrong hemisphere.
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cached.canvas, 0, 0, width, height);
    ctx.restore();
}

// Earth has its own solar shading so satellite fill lights and exposure changes
// cannot wash out its night side or introduce a second highlight.
export function createEarthDayNightMaterial() {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const uniforms = {
        earthSunDirection: { value: new THREE.Vector3(1, 0, 0) },
        earthDayNightEnabled: { value: 1 }
    };
    material.userData.dayNightUniforms = uniforms;
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = `varying vec3 vEarthNormal;\n${shader.vertexShader}`
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vEarthNormal = normalize(mat3(modelMatrix) * normal);`);
        shader.fragmentShader = `varying vec3 vEarthNormal;
            uniform vec3 earthSunDirection;
            uniform float earthDayNightEnabled;\n${shader.fragmentShader}`
            .replace('#include <opaque_fragment>', `
                float solarDot = dot(normalize(vEarthNormal), earthSunDirection);
                float daylight = smoothstep(${TWILIGHT_START}, ${TWILIGHT_END}, solarDot);
                float dayBrightness = 0.72 + 0.28 * sqrt(max(0.0, solarDot));
                float illumination = mix(0.08, dayBrightness, daylight);
                outgoingLight *= mix(1.0, illumination, earthDayNightEnabled);
                #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'earth-day-night-v1';
    return material;
}

/* ── Cached 3-D objects ── */
let sunLight = null;   // THREE.DirectionalLight
let sunMesh = null;   // visible Sun sphere
let sunHalo = null;   // additive sprite halo

/* Build a small radial-gradient texture for the halo sprite */
function makeHaloTexture() {
    const size = 256;
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = size;
    const g = cnv.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 233, 128, 0.95)');
    grad.addColorStop(0.4, 'rgba(255, 200, 64, 0.6)');
    grad.addColorStop(0.8, 'rgba(255, 160, 0, 0.25)');
    grad.addColorStop(1.0, 'rgba(255, 140, 0, 0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cnv);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
}

/**
 * Update day/night in 3-D:
 *  - positions a DirectionalLight based on Sun inertial scene direction
 *  - renders a visible Sun and a soft halo at the correct location
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D} earthMesh
 * @param {Date} date
 * @param {Object} options
 * @param {boolean} [options.showSun=true]       render a visible Sun mesh
 * @param {boolean} [options.showHalo=true]      render a glow halo sprite
 * @param {boolean} [options.showDayNight=true]  shade the Earth night side
 * @param {number}  [options.earthRadius=10]     scene Earth radius (units)
 * @param {number}  [options.sunDistance]        distance of Sun (defaults to 60×earthRadius)
 * @param {number}  [options.haloSize]           halo sprite size (defaults to 2.5×earthRadius)
 * @param {number}  [options.sunIntensity=1.0]   directional sunlight intensity
 */
export function drawDayNight3D(scene, earthMesh, date = new Date(), options = {}) {
    if (!scene || !earthMesh) return;

    const {
        showSun = true,
        showHalo = true,
        showDayNight = true,
        earthRadius = 10,
        sunDistance = 60 * earthRadius,
        haloSize = 2.5 * earthRadius,
        sunIntensity = 1.0
    } = options;

    // Create or reuse DirectionalLight
    if (!sunLight) {
        sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.name = 'sunLight';
        sunLight.castShadow = false;
        scene.add(sunLight);
        sunLight.target = earthMesh;
    }
    sunLight.intensity = sunIntensity;

    // Create or reuse Sun mesh (simple emissive sphere)
    if (!sunMesh) {
        const sunGeo = new THREE.SphereGeometry(earthRadius * 0.25, 32, 16); // visual only
        const sunMat = new THREE.MeshBasicMaterial({color: 0xffe07a});
        sunMesh = new THREE.Mesh(sunGeo, sunMat);
        sunMesh.name = 'sunMesh';
        scene.add(sunMesh);
    }
    sunMesh.visible = !!showSun;

    // Create or reuse halo sprite
    if (!sunHalo) {
        const haloTex = makeHaloTexture();
        const haloMat = new THREE.SpriteMaterial({
            map: haloTex,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        sunHalo = new THREE.Sprite(haloMat);
        sunHalo.name = 'sunHalo';
        scene.add(sunHalo);
    }
    sunHalo.visible = !!showHalo;

    // Time → Sun inertial scene direction (Earth itself rotates by -GMST).
    const jd = date.valueOf() / 86400000 + 2440587.5;
    const sunScenePosition = sunSceneVectorFromJD(jd, sunDistance);
    const earthUniforms = earthMesh.material?.userData?.dayNightUniforms;
    if (earthUniforms) {
        earthUniforms.earthSunDirection.value.copy(sunScenePosition).normalize();
        earthUniforms.earthDayNightEnabled.value = showDayNight ? 1 : 0;
    }

    // Scene axes use X-Z-Y: (x, z, y)

    // Position light + visuals
    sunLight.position.copy(sunScenePosition);

    if (sunMesh.visible) {
        sunMesh.position.copy(sunScenePosition);
        sunMesh.lookAt(earthMesh.position);
    }
    if (sunHalo.visible) {
        sunHalo.position.copy(sunScenePosition);
        // Sprite size is world-space; scale XY only (Z ignored)
        sunHalo.scale.set(haloSize, haloSize, 1);
    }
}

/* ≡≡ Greenwich Mean Sidereal Time from Julian Day (rad) ≡≡ */
export function gmstFromJD(jd) {
    return gmstFromJulianDay(jd);
}

export function sunSceneVectorFromJD(jd, distance = 1) {
    return eciToSceneVector(new THREE.Vector3(), sunECI(jd), distance);
}

/* ≡≡ Sun position in ECI frame (unit vector) from Julian Day ≡≡ */
export function sunECI(jd) {
    const T = (jd - 2451545.0) / 36525.0;                     // Julian centuries since J2000
    const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
    const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) % 360;
    const C = Math.sin(THREE.MathUtils.degToRad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T))
        + Math.sin(THREE.MathUtils.degToRad(2 * M)) * (0.019993 - 0.000101 * T)
        + Math.sin(THREE.MathUtils.degToRad(3 * M)) * 0.000289;
    const trueLong = L0 + C;
    const omega = 125.04 - 1934.136 * T;
    const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(THREE.MathUtils.degToRad(omega));
    const epsilon0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - 0.001813 * T))) / 60) / 60;
    const epsilon = epsilon0 + 0.00256 * Math.cos(THREE.MathUtils.degToRad(omega));
    const lambdaRad = THREE.MathUtils.degToRad(lambda);
    const epsilonRad = THREE.MathUtils.degToRad(epsilon);

    const x = Math.cos(lambdaRad);
    const y = Math.cos(epsilonRad) * Math.sin(lambdaRad);
    const z = Math.sin(epsilonRad) * Math.sin(lambdaRad);
    return new THREE.Vector3(x, y, z).normalize();
}
