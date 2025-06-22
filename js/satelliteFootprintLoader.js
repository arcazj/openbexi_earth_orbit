// satelliteFootprintLoader.js – RF‑footprint renderer for 3‑D globe + Mercator (debug‑return added)
// -----------------------------------------------------------------------------
// Public API
//   initFootprintRenderer(scene, earthMesh, mercatorCtx) → void
//   updateFootprints(selectedSat, gmstRad, options)      → FootprintEntry | undefined
//
// Expectations
//   • Each satellite object may hold `footprints`:
//       – GeoJSON FeatureCollection OR
//       – Array of   { lat, lon, eirp_dBW }   OR   { lat, lon, beamId }
//   • Builds once per satellite, caches meshes + 2‑D paths.
// -----------------------------------------------------------------------------

import * as THREE from 'three';
import {KM_TO_SCENE_UNITS, EARTH_RADIUS_KM} from './SatelliteConstantLoader.js';

/* ─────────── internal state ─────────── */
let _scene, _mercCtx;
const _cache = new Map(); // satId → { globeGroup, mercShapes }

function getSatId(sat) {
    return sat?.noradId ?? sat?.norad_id ?? sat?.satellite_id ??
        sat?.updatedNoradId ?? sat?.meta?.norad_id ?? sat?.name;
}

/* palette helpers */
const PALETTE = ['#ff4c4c', '#ff8c1a', '#ffd21a', '#66cc33', '#3399ff', '#9966ff', '#ff66cc'];
const beamColor = id => PALETTE[id % PALETTE.length];
const eirpColor = (v, min = 30, max = 60) => new THREE.Color().setHSL(0.66 - 0.66 * THREE.MathUtils.clamp((v - min) / (max - min), 0, 1), 1, 0.5).getStyle();

/* deg→XYZ */
const ll2xyz = (lat, lon) => {
    const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon),
        r = EARTH_RADIUS_KM * KM_TO_SCENE_UNITS;
    return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), r * Math.cos(la) * Math.sin(lo));
};
/* deg→Merc */
const ll2merc = (lat, lon, cv) => {
    const w = cv.width, h = cv.height, x = (lon + 180) * (w / 360);
    const cl = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const y = h / 2 - (w * Math.log(Math.tan(Math.PI / 4 + THREE.MathUtils.degToRad(cl) / 2))) / (2 * Math.PI);
    return {x, y};
};

export function initFootprintRenderer(scene, _earthMesh, mercCtx) {
    _scene = scene;
    _mercCtx = mercCtx;
}

export function updateFootprints(selectedSat, _gmst, {showFootprint, mercatorCtx = _mercCtx} = {}) {
    // hide all by default
    _cache.forEach(e => e.globeGroup.visible = false);
    if (!selectedSat) return undefined;

    const id = getSatId(selectedSat);
    if (!id) return undefined;

    if (!_cache.has(id)) {
        const entry = buildEntry(selectedSat);
        _cache.set(id, entry);
        _scene.add(entry.globeGroup);
    }
    const entry = _cache.get(id);
    entry.globeGroup.visible = !!showFootprint;

    if (mercatorCtx) drawMercator(mercatorCtx, showFootprint ? entry : null);

    return entry; // allow caller to debug e.g., entry.mercShapes.length
}

/* ───────────────── builders ───────────────── */
function buildEntry(sat) {
    const grp = new THREE.Group();
    grp.visible = false;
    const mercShapes = [];
    const polyList = parseFootprints(sat.footprints || []);
    polyList.forEach(({path, color}) => {
        mercShapes.push({path, color});
        const sh = new THREE.Shape(path.map(([la, lo], i) => {
            const v = ll2xyz(la, lo);
            return new THREE.Vector2(v.x, v.y);
        }));
        const geom = new THREE.ShapeGeometry(sh, 25);
        geom.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        grp.add(new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        })));
    });
    return {globeGroup: grp, mercShapes};
}

function parseFootprints(fp) {
    if (!fp || (Array.isArray(fp) && fp.length === 0) ||
        (typeof fp === 'object' && !Array.isArray(fp) && Object.keys(fp).length === 0)) {
        return [];
    }
    if (Array.isArray(fp.features)) {
        return fp.features.flatMap(f => geoFeatureToPolys(f));
    }
    if (Array.isArray(fp)) {
        const by = new Map();
        fp.forEach(p => {
            const k = p.beamId ?? 'eirp';
            if (!by.has(k)) by.set(k, []);
            by.get(k).push(p);
        });
        return [...by.entries()].map(([k, pts]) => ({
            path: pts.map(p => [p.lat, p.lon]),
            color: pts[0].eirp_dBW !== undefined ? eirpColor(pts[0].eirp_dBW) : beamColor(k)
        }));
    }
    console.warn('Footprint format not recognised', fp);
    return [];
}

function geoFeatureToPolys(f) {
    const c = f.properties || {};
    const col = c.eirp_dBW !== undefined ? eirpColor(c.eirp_dBW) : beamColor(c.beamId || 0);
    const coords = f.geometry.coordinates;
    if (f.geometry.type === 'Polygon') return [{path: coords[0].map(([lo, la]) => [la, lo]), color: col}];
    if (f.geometry.type === 'MultiPolygon') return coords.map(poly => ({
        path: poly[0].map(([lo, la]) => [la, lo]),
        color: col
    }));
    return [];
}

/* ───────────────── Mercator draw ───────────────── */
function drawMercator(ctx, entry) {
    ctx.save();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!entry) {
        ctx.restore();
        return;
    }
    ctx.globalAlpha = 0.3;
    entry.mercShapes.forEach(({path, color}) => {
        ctx.beginPath();
        path.forEach(([la, lo], i) => {
            const {x, y} = ll2merc(la, lo, ctx.canvas);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
    });
    ctx.restore();
}
