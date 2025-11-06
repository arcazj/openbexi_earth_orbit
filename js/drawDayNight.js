/*  drawDayNight.js
    ──────────────────────────────────────────────────────────────
    • drawDayNightMercator(ctx,w,h,date) – paint night-side on a Mercator map
    • drawDayNight3D(scene, earthMesh, date, { showSun, showHalo, earthRadius, sunDistance, haloSize }) – real-time sun-light & visible Sun + halo
*/

import * as THREE from 'three';

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
export function drawDayNightMercator(ctx, width, height, date) {
    const jd = window.satellite.jday(
        date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
        date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()
    );
    const gmst = window.satellite.gstime(jd);
    const sunEcf = eciToEcf(sunEciUnit(date), gmst);
    const subLat = Math.asin(sunEcf.z);
    const subLon = Math.atan2(sunEcf.y, sunEcf.x);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();

    const pts = [];
    for (let x = 0; x <= width; ++x) {
        const lon = (x / width) * 2 * Math.PI - Math.PI;
        const lat = Math.atan(-Math.cos(lon - subLon) / Math.tan(subLat));
        const mercY = height / 2 - width * Math.log(Math.tan(Math.PI / 4 + lat / 2)) / (2 * Math.PI);
        pts.push({x, y: mercY});
    }
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    if (subLat > 0) {
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
    } else {
        ctx.lineTo(width, 0);
        ctx.lineTo(0, 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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
 *  - positions a DirectionalLight based on Sun ECF direction
 *  - renders a visible Sun and a soft halo at the correct location
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Object3D} earthMesh
 * @param {Date} date
 * @param {Object} options
 * @param {boolean} [options.showSun=true]       render a visible Sun mesh
 * @param {boolean} [options.showHalo=true]      render a glow halo sprite
 * @param {number}  [options.earthRadius=10]     scene Earth radius (units)
 * @param {number}  [options.sunDistance]        distance of Sun (defaults to 60×earthRadius)
 * @param {number}  [options.haloSize]           halo sprite size (defaults to 2.5×earthRadius)
 */
export function drawDayNight3D(scene, earthMesh, date = new Date(), options = {}) {
    if (!scene || !earthMesh) return;

    const {
        showSun = true,
        showHalo = true,
        earthRadius = 10,
        sunDistance = 60 * earthRadius,
        haloSize = 2.5 * earthRadius
    } = options;

    // Create or reuse DirectionalLight
    if (!sunLight) {
        sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.name = 'sunLight';
        sunLight.castShadow = false;
        scene.add(sunLight);
        sunLight.target = earthMesh;
    }

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

    // Time → Sun ECF direction
    const jd = date.valueOf() / 86400000 + 2440587.5;
    const gmst = window.satellite.gstime(jd);
    const sECF = eciToEcf(sunECI(jd), gmst);

    // Scene axes use X-Z-Y: (x, z, y)
    const sx = sECF.x * sunDistance;
    const sy = sECF.z * sunDistance; // swap Y↔Z
    const sz = sECF.y * sunDistance;

    // Position light + visuals
    sunLight.position.set(sx, sy, sz);

    if (sunMesh.visible) {
        sunMesh.position.set(sx, sy, sz);
        sunMesh.lookAt(earthMesh.position);
    }
    if (sunHalo.visible) {
        sunHalo.position.set(sx, sy, sz);
        // Sprite size is world-space; scale XY only (Z ignored)
        sunHalo.scale.set(haloSize, haloSize, 1);
    }
}

/* ≡≡ Greenwich Mean Sidereal Time from Julian Day (rad) ≡≡ */
export function gmstFromJD(jd) {
    const T = (jd - 2451545.0) / 36525.0;
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
        + 0.000387933 * T * T - (T * T * T) / 38710000;
    gmst = ((gmst % 360) + 360) % 360; // wrap 0-360
    return THREE.MathUtils.degToRad(gmst);
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
