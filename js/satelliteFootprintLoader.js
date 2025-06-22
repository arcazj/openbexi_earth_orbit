// satelliteFootprintLoader.js – Single-satellite version, safe and robust

import * as THREE from 'three';
import { KM_TO_SCENE_UNITS, EARTH_RADIUS_KM } from './SatelliteConstantLoader.js';

let _scene;
let footprintMesh3D;
const R_E_KM = EARTH_RADIUS_KM;
const R_E_SCENE = R_E_KM * KM_TO_SCENE_UNITS;

/**
 * Converts Latitude/Longitude in degrees to a 3D position on the globe.
 */
const ll2xyz = (lat, lon) => {
    const la = THREE.MathUtils.degToRad(lat);
    const lo = THREE.MathUtils.degToRad(lon);
    const r = EARTH_RADIUS_KM * KM_TO_SCENE_UNITS;
    const x = r * Math.cos(la) * Math.cos(lo);
    const y = r * Math.cos(la) * Math.sin(lo);
    const z = r * Math.sin(la);
    // swap Y and Z to match X-Z-Y axis convention
    return new THREE.Vector3(x, z, y);
};

/**
 * Converts Latitude/Longitude in degrees to 2D Mercator canvas coordinates.
 */
const ll2merc = (lat, lon, cv) => {
    const w = cv.width, h = cv.height;
    const x = (lon + 180) * (w / 360);
    const latRad = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
    const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    const y = h / 2 - (w * mercN) / (2 * Math.PI);
    return { x, y };
};

/**
 * Initializes the footprint renderer, creating a reusable mesh for the 3D footprint.
 * @param {THREE.Scene} scene The main Three.js scene.
 */
export function initFootprintRenderer(scene) {
    _scene = scene;
    if (!footprintMesh3D) {
        const geometry = new THREE.CircleGeometry(1, 128);
        const material = new THREE.MeshBasicMaterial({
            color: 0xFFFF99,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
        });
        footprintMesh3D = new THREE.Mesh(geometry, material);
        footprintMesh3D.visible = false;
        _scene.add(footprintMesh3D);
    }
}

/**
 * Draws the calculated footprint path on the Mercator map canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<[number, number]>} path
 */
function drawMercator(ctx, path) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    path.forEach(([la, lo], i) => {
        const { x, y } = ll2merc(la, lo, ctx.canvas);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = '#FFFF99';
    ctx.fill();
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
}

/**
 * Main update function, called each frame to draw the footprint for the selected satellite.
 * @param {object} selectedSat The currently selected satellite.
 * @param {number} gmstRad The current GMST in radians.
 * @param {object} options Additional options including mercatorCtx and simDate.
 */
export function updateFootprints(selectedSat, gmstRad, { showFootprint, mercatorCtx, simDate }) {
    if (!footprintMesh3D) return;
    if (selectedSat === null) return;
    if (selectedSat.satrec === undefined) return;

    const simDateObj = simDate || new Date();
    const pv = satellite.propagate(selectedSat.satrec, simDateObj);
    if (!pv || !pv.position) {
        console.warn("No footprint: propagate failed", selectedSat.satrec, simDateObj, pv);
        return;
    }

    const sat_pos_vec_km = new THREE.Vector3(pv.position.x, pv.position.y, pv.position.z);
    const d_km = sat_pos_vec_km.length();
    const H_km = d_km - EARTH_RADIUS_KM;
    if (H_km <= 0) {
        console.warn("No footprint: satellite below surface", d_km, H_km);
        return;
    }

    if (H_km <= 0) return;

    // Calculate angular radius (lambda)
    const lambda = Math.acos(R_E_KM / d_km);

    // Get sub-satellite point
    const j = satellite.jday(simDateObj);
    const gmst = satellite.gstime(j);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    const center_lat_rad = geo.latitude;
    const center_lon_rad = geo.longitude;

    // Generate path for Mercator view (geodesic)
    const path = [];
    const num_points = 128;
    for (let i = 0; i <= num_points; i++) {
        const brg = (i / num_points) * 2 * Math.PI;
        const lat2 = Math.asin(
            Math.sin(center_lat_rad) * Math.cos(lambda) +
            Math.cos(center_lat_rad) * Math.sin(lambda) * Math.cos(brg)
        );
        let lon2 = center_lon_rad + Math.atan2(
            Math.sin(brg) * Math.sin(lambda) * Math.cos(center_lat_rad),
            Math.cos(lambda) - Math.sin(center_lat_rad) * Math.sin(lat2)
        );
        let lonDeg = THREE.MathUtils.radToDeg(lon2);
        lonDeg = ((lonDeg + 540) % 360) - 180;
        path.push([THREE.MathUtils.radToDeg(lat2), lonDeg]);
    }

    // Draw on 2D Mercator map
    if (mercatorCtx && path.length > 0) {
        drawMercator(mercatorCtx, path);
    }

    // Update 3D footprint mesh
    const footprint_radius_scene = R_E_SCENE * Math.tan(lambda);
    footprintMesh3D.scale.set(footprint_radius_scene, footprint_radius_scene, 1);

    const sub_satellite_pos_3D = ll2xyz(
        THREE.MathUtils.radToDeg(center_lat_rad),
        THREE.MathUtils.radToDeg(center_lon_rad)
    );
    footprintMesh3D.position.copy(sub_satellite_pos_3D);

    const surface_normal = sub_satellite_pos_3D.clone().normalize();
    footprintMesh3D.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), surface_normal);

    footprintMesh3D.visible = true;
}
