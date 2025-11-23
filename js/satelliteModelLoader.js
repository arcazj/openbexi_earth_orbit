// js/satelliteModelLoader.js (ES-module) — OBJ/MTL-based loader, flat /obj directory
// -----------------------------------------------------------------------------
// Loads satellite geometry from prebuilt .obj/.mtl files (in /obj) and preserves
// your extended JSON metadata flow (meta, orbit, attitude, capability, payload).
// Public API: showSatellite, clearCurrentDetailedSat, updateBusOrientation
// -----------------------------------------------------------------------------

import * as THREE from 'three';
import { fetchJSON } from './SatelliteConfigurationLoader.js';

/* ─────────────────────────── Config & constants ─────────────────────────── */
const EARTH_RADIUS_KM = 6371;
const EARTH_SCENE_RADIUS = 10;
const KM_TO_SCENE_UNITS = EARTH_SCENE_RADIUS / EARTH_RADIUS_KM;

// Scene scale: meters → scene units (can be overridden globally)
const METERS_TO_UNITS = window.METERS_TO_SCENE_UNITS || 1.0;

// Metadata JSON base (unchanged)
export const SATELLITE_MODELS_BASE_URL =
    window.SATELLITE_MODELS_BASE_URL || 'json/satellites/';

// Flat OBJ/MTL asset base (all files live directly under /obj)
export const SATELLITE_OBJ_BASE_URL =
    window.SATELLITE_OBJ_BASE_URL  || 'obj/';

// Optional global renderer (for anisotropy)
const renderer = window.renderer || null;

/* ───────────────────────── Utilities & helpers ──────────────────────────── */
export function getNominalAltMeters(meta = {}) {
    if (meta.orbit?.altitude) return meta.orbit.altitude;
    const m = /([\d.]+)\s*km/i.exec(meta?.orbital_slot?.nominal ?? '');
    return m ? parseFloat(m[1]) * 1_000 : 35_786e3; // GEO default
}

function setTextureAnisotropy(material) {
    if (!renderer) return;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const apply = tex => {
        if (tex && tex.isTexture) tex.anisotropy = maxAniso;
    };
    if (Array.isArray(material)) {
        material.forEach(m => m && apply(m.map));
    } else if (material) {
        apply(material.map);
        apply(material.normalMap);
        apply(material.roughnessMap);
        apply(material.metalnessMap);
        apply(material.aoMap);
    }
}

// Return directory and filenames (we use setPath(dir), so we pass filenames only)
function resolveModelPaths(fileBase) {
    const dir = SATELLITE_OBJ_BASE_URL; // e.g., 'obj/'
    return {
        dir,
        mtlName: `${fileBase}.mtl`,
        objName: `${fileBase}.obj`,
    };
}

function placeholderCube(size = 1, color = 0x9999ff) {
    const g = new THREE.BoxGeometry(size, size, size);
    const m = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.6 });
    const mesh = new THREE.Mesh(g, m);
    const group = new THREE.Group();
    group.add(mesh);
    return group;
}

// Robust disposer to avoid GPU leaks when reloading models
function disposeObject3D(obj) {
    obj.traverse(child => {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
                if (!mat) return;
                Object.keys(mat).forEach(key => {
                    const val = mat[key];
                    if (val && val.isTexture) {
                        val.dispose();
                    }
                });
                mat.dispose?.();
            });
        }
    });
}

/* ──────────────── Optional CSS2D label support (no top-level await) ───────── */
let CSS2DObject = window.CSS2DObject; // allow external injection

async function ensureCSS2DObject() {
    if (CSS2DObject) return CSS2DObject;
    try {
        // Use addons path for r176 import-map setups
        const mod = await import('three/addons/renderers/CSS2DRenderer.js');
        CSS2DObject = mod.CSS2DObject;
    } catch (e) {
        console.warn('CSS2DRenderer not available:', e);
    }
    return CSS2DObject;
}

/* ───────────────────────── Orientation utilities ────────────────────────── */
export function updateBusOrientation(modelGroup, yawDeg = 0, pitchDeg = 0, rollDeg = 0) {
    if (!modelGroup) return;
    const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(rollDeg || 0),   // X: Roll
        THREE.MathUtils.degToRad(pitchDeg || 0),  // Y: Pitch
        THREE.MathUtils.degToRad(yawDeg || 0),    // Z: Yaw
        'ZYX'
    );
    modelGroup.setRotationFromEuler(euler);
}

/* ───────────────────────── OBJ/MTL loading core ─────────────────────────── */
async function loadOBJWithMTL(fileBase, meta) {
    const { dir, mtlName, objName } = resolveModelPaths(fileBase);

    // Lazy-load loaders from addons (r176+)
    const [{ MTLLoader }, { OBJLoader }] = await Promise.all([
        import('three/addons/loaders/MTLLoader.js'),
        import('three/addons/loaders/OBJLoader.js'),
    ]);

    // --- MTL ---
    const mtlLoader = new MTLLoader();
    mtlLoader.setResourcePath(dir);  // for texture refs in .mtl
    mtlLoader.setPath(dir);          // for .mtl itself

    let materials;
    try {
        // IMPORTANT: pass filename (not full URL) since setPath(dir) is used
        materials = await mtlLoader.loadAsync(mtlName);
        materials.preload();
        if (materials && materials.materials) {
            Object.values(materials.materials).forEach(setTextureAnisotropy);
        }
    } catch (e) {
        console.warn(
            `[${fileBase}] MTL load failed (${dir + mtlName}). Proceeding without materials.`,
            e
        );
    }

    // --- OBJ ---
    const objLoader = new OBJLoader();
    if (materials) objLoader.setMaterials(materials);
    objLoader.setPath(dir);

    let root;
    try {
        // IMPORTANT: pass filename (not full URL)
        root = await objLoader.loadAsync(objName);
    } catch (e) {
        console.error(
            `[${fileBase}] OBJ load failed (${dir + objName}). Using placeholder.`,
            e
        );
        root = placeholderCube(0.5);
    }

    // Optional unit conversion: OBJ units → meters → scene units
    // If you have metadata like meta.geometry.obj_units ('m','cm','mm'), convert here.
    // Default assumption: OBJ is authored in meters.
    const objUnitsToMeters = (() => {
        const u = meta?.geometry?.obj_units;
        if (!u) return 1;          // meters by default
        if (u === 'm') return 1;
        if (u === 'cm') return 0.01;
        if (u === 'mm') return 0.001;
        if (u === 'km') return 1000;
        if (typeof u === 'number') return u; // allow numeric factor
        return 1;
    })();

    const scale = objUnitsToMeters * METERS_TO_UNITS;
    root.scale.setScalar(scale);

    // Improve shading/material defaults if no MTL or weak materials
    root.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Normalize or upgrade materials when none were provided
            if (!child.material) {
                child.material = new THREE.MeshStandardMaterial({
                    color: 0xb0b0b0,
                    metalness: 0.5,
                    roughness: 0.6,
                });
            } else if (Array.isArray(child.material)) {
                child.material.forEach(m => setTextureAnisotropy(m));
            } else {
                setTextureAnisotropy(child.material);
            }
        }
    });

    // Center the model around its bounding box center (optional, default true)
    if (meta?.geometry?.center_model ?? true) {
        const box = new THREE.Box3().setFromObject(root);
        const c = new THREE.Vector3();
        box.getCenter(c);
        root.position.sub(c); // recenter at origin
    }

    return root;
}

/* ───────────────────────── Singleton state ──────────────────────────────── */
let currentSatModel = null;
const currentLabels = [];

/* ───────────────────────── Public API: show/clear ───────────────────────── */
export async function showSatellite(noradId, scene, updatedNoradId) {
    if (!scene) throw new Error('showSatellite: scene is required');

    clearCurrentDetailedSat(scene);

    // Use updatedNoradId if provided; else NORAD
    const fileBase = (updatedNoradId || noradId); // expects obj/<fileBase>.obj|.mtl
    const jsonUrl = `${SATELLITE_MODELS_BASE_URL}${fileBase}.json`;

    try {
        // Load metadata JSON first (use your existing CORS-safe fetchJSON)
        const raw = await (window.fetchJSON || fetchJSON)(jsonUrl);
        const sat = Array.isArray(raw) ? raw[0] : Object.values(raw)[0];

        if (!sat) {
            console.warn(`[${noradId}] No satellite record in JSON at ${jsonUrl}`);
            // Even if JSON failed, try to load geometry so caller gets a visual
            const fallbackRoot = await loadOBJWithMTL(fileBase, {});
            currentSatModel = fallbackRoot;
            scene.add(currentSatModel);
            return currentSatModel;
        }

        // Load OBJ/MTL model
        const root = await loadOBJWithMTL(fileBase, sat.meta || sat);

        // Preserve your rich userData structure
        currentSatModel = root;
        currentSatModel.userData = {
            updatedNoradId: fileBase,
            meta: sat.meta || {},
            orbit: sat.orbit || {},
            attitude: sat.attitude || sat.meta?.attitude || {},
            capability: sat.capability || {},
            attitudeCapability: sat.attitudeCapability || {},
            payload: sat.payload || {},
            geometry: sat.geometry || {},
            footprints: sat.footprints || {},
            source: sat,
        };

        // Apply initial attitude if provided
        const att = currentSatModel.userData.attitude;
        if (att) {
            updateBusOrientation(
                currentSatModel,
                att.yaw ?? 0,
                att.pitch ?? 0,
                att.roll ?? 0
            );
        }

        // (Optional) add a name label above the model
        const CSS2DObjectClass = await ensureCSS2DObject();
        if (CSS2DObjectClass && sat?.meta?.name) {
            const div = document.createElement('div');
            div.className = 'label';
            div.textContent = sat.meta.name;
            const lbl = new CSS2DObjectClass(div);
            const box = new THREE.Box3().setFromObject(currentSatModel);
            const size = new THREE.Vector3();
            box.getSize(size);
            lbl.position.set(0, size.y * 0.55, 0);
            currentSatModel.add(lbl);
            currentLabels.push(lbl);
        }

        // Optional coarse global scale (kept from legacy)
        currentSatModel.scale.multiplyScalar(0.25);

        scene.add(currentSatModel);
        return currentSatModel;
    } catch (e) {
        console.error('showSatellite failed', e);
        // Last-resort placeholder
        currentSatModel = placeholderCube(0.5);
        scene.add(currentSatModel);
        return currentSatModel;
    }
}

export function clearCurrentDetailedSat(scene) {
    if (currentSatModel) {
        if (scene) scene.remove(currentSatModel);
        disposeObject3D(currentSatModel);
    }
    currentLabels.forEach(l => l.parent && l.parent.remove(l));
    currentLabels.length = 0;
    currentSatModel = null;
}

/* ───────────────────────── Optional: exports for reuse ──────────────────── */
export { KM_TO_SCENE_UNITS, METERS_TO_UNITS };
