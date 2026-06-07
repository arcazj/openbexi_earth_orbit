// js/satelliteModelLoader.js (ES-module) — OBJ/MTL-based loader, flat /obj directory
// -----------------------------------------------------------------------------
// Loads satellite geometry from prebuilt .obj/.mtl files (in /obj) and preserves
// your extended JSON metadata flow (meta, orbit, attitude, capability, payload).
// Public API: showSatellite, clearCurrentDetailedSat, updateBusOrientation
// -----------------------------------------------------------------------------

import * as THREE from 'three';
import { fetchJSON } from './SatelliteConfigurationLoader.js';
import { KM_TO_SCENE_UNITS, EARTH_SCENE_RADIUS, EARTH_RADIUS_KM } from './SatelliteConstantLoader.js';

/* ─────────────────────────── Config & constants ─────────────────────────── */
const appWindow = globalThis.window ?? {};
export const SATELLITE_MODEL_VISUAL_SCALE = 5;

// Scene scale: meters → scene units (can be overridden globally)
export const METERS_TO_UNITS = appWindow.METERS_TO_SCENE_UNITS || (KM_TO_SCENE_UNITS / 1000);

// Metadata JSON base (unchanged)
export const SATELLITE_MODELS_BASE_URL =
    appWindow.SATELLITE_MODELS_BASE_URL || 'json/satellites/';

// Flat OBJ/MTL asset base (all files live directly under /obj)
export const SATELLITE_OBJ_BASE_URL =
    appWindow.SATELLITE_OBJ_BASE_URL  || 'obj/';

const SELECTED_VIEW_MAX_SPECULAR_CHANNEL = 0.18;
const SELECTED_VIEW_MAX_SHININESS = 65;
const SELECTED_VIEW_MAX_METALNESS = 0.55;
const SELECTED_VIEW_MIN_ROUGHNESS = 0.5;

function currentRenderer() {
    return appWindow.renderer || globalThis.window?.renderer || null;
}

/* ───────────────────────── Utilities & helpers ──────────────────────────── */
export function getNominalAltMeters(meta = {}) {
    if (meta.orbit?.altitude) return meta.orbit.altitude;
    const m = /([\d.]+)\s*km/i.exec(meta?.orbital_slot?.nominal ?? '');
    return m ? parseFloat(m[1]) * 1_000 : 35_786e3; // GEO default
}

export function unitScaleToMeters(unit, fallback = 1) {
    if (unit === undefined || unit === null || unit === '') return fallback;
    if (typeof unit === 'number') return Number.isFinite(unit) && unit > 0 ? unit : fallback;

    const normalized = String(unit).trim().toLowerCase();
    if (normalized === 'm' || normalized === 'meter' || normalized === 'meters') return 1;
    if (normalized === 'cm' || normalized === 'centimeter' || normalized === 'centimeters') return 0.01;
    if (normalized === 'mm' || normalized === 'millimeter' || normalized === 'millimeters') return 0.001;
    if (normalized === 'km' || normalized === 'kilometer' || normalized === 'kilometers') return 1000;

    const numeric = Number(normalized);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function modelScaleToSceneUnits(unit, visualScale = SATELLITE_MODEL_VISUAL_SCALE) {
    const metersToUnits = globalThis.window?.METERS_TO_SCENE_UNITS || METERS_TO_UNITS;
    return unitScaleToMeters(unit) * metersToUnits * visualScale;
}

function materialLooksInvisible(material) {
    if (!material) return true;
    if (material.visible === false) return true;
    if (Number.isFinite(material.opacity) && material.opacity <= 0.05) return true;
    return false;
}

function materialColorLooksBlack(material) {
    const color = material?.color;
    if (!color) return false;
    if ([color.r, color.g, color.b].every(value => Number.isFinite(value))) {
        return color.r <= 0.02 && color.g <= 0.02 && color.b <= 0.02;
    }
    if (Number.isFinite(color.value)) {
        return color.value === 0x000000;
    }
    return false;
}

function ensureVisibleMaterial(material) {
    if (!material) {
        return new THREE.MeshStandardMaterial({
            color: 0xcfd8ff,
            metalness: 0.15,
            roughness: 0.55
        });
    }

    material.visible = true;
    if (Number.isFinite(material.opacity) && material.opacity <= 0.05) {
        material.opacity = 1;
    }
    if (Number.isFinite(material.opacity) && material.opacity >= 0.95) {
        material.transparent = false;
    }
    if (THREE.DoubleSide !== undefined) {
        material.side = THREE.DoubleSide;
    }
    if (!material.map && material.color?.set && materialColorLooksBlack(material)) {
        material.color.set(0xcfd8ff);
    }
    prepareSelectedMaterialResponse(material);
    material.needsUpdate = true;
    return material;
}

function prepareColorTexture(texture) {
    if (!texture?.isTexture) return;
    if (THREE.SRGBColorSpace !== undefined) {
        texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.needsUpdate = true;
}

function clampPhongSpecular(material) {
    if (!material?.specular) return;
    ['r', 'g', 'b'].forEach(channel => {
        const value = material.specular[channel];
        if (Number.isFinite(value)) {
            material.specular[channel] = Math.min(value, SELECTED_VIEW_MAX_SPECULAR_CHANNEL);
        }
    });
}

function prepareSelectedMaterialResponse(material) {
    if (!material) return material;

    prepareColorTexture(material.map);
    clampPhongSpecular(material);

    if (Number.isFinite(material.shininess)) {
        material.shininess = Math.min(material.shininess, SELECTED_VIEW_MAX_SHININESS);
    }
    if (Number.isFinite(material.metalness)) {
        material.metalness = Math.min(material.metalness, SELECTED_VIEW_MAX_METALNESS);
    }
    if (Number.isFinite(material.roughness)) {
        material.roughness = Math.max(material.roughness, SELECTED_VIEW_MIN_ROUGHNESS);
    }

    material.needsUpdate = true;
    return material;
}

export function diagnoseModelVisibility(root) {
    if (!root) {
        return {
            visible: false,
            reason: 'model root is missing',
            meshCount: 0,
            diameterSceneUnits: 0
        };
    }

    let meshCount = 0;
    let visibleMeshCount = 0;
    let materialCount = 0;
    let invisibleMaterialCount = 0;

    root.traverse(child => {
        if (!child?.isMesh) return;
        meshCount += 1;
        if (child.visible !== false) visibleMeshCount += 1;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => {
            materialCount += 1;
            if (materialLooksInvisible(material)) invisibleMaterialCount += 1;
        });
    });

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const diameterSceneUnits = Math.max(size.x || 0, size.y || 0, size.z || 0);
    const visible = root.visible !== false &&
        meshCount > 0 &&
        visibleMeshCount > 0 &&
        Number.isFinite(diameterSceneUnits) &&
        diameterSceneUnits > 0;

    return {
        visible,
        reason: visible
            ? 'model has visible mesh geometry and nonzero bounds'
            : 'model has no visible mesh geometry or nonzero bounds',
        meshCount,
        visibleMeshCount,
        materialCount,
        invisibleMaterialCount,
        diameterSceneUnits,
        scale: {
            x: root.scale?.x ?? 1,
            y: root.scale?.y ?? 1,
            z: root.scale?.z ?? 1
        }
    };
}

export function prepareModelForSelectedView(root) {
    if (!root) return diagnoseModelVisibility(root);
    root.visible = true;
    root.frustumCulled = false;

    root.traverse(child => {
        if (!child?.isMesh) return;
        child.visible = true;
        child.frustumCulled = false;
        child.castShadow = true;
        child.receiveShadow = true;

        if (Array.isArray(child.material)) {
            child.material = child.material.map(ensureVisibleMaterial);
        } else {
            child.material = ensureVisibleMaterial(child.material);
        }
    });

    const diagnostics = diagnoseModelVisibility(root);
    root.userData = root.userData || {};
    root.userData.modelVisibility = diagnostics;
    return diagnostics;
}

export function centerModelGeometryAtRoot(root) {
    if (!root) return null;
    root.updateMatrixWorld?.(true);
    root.updateWorldMatrix?.(true, true);

    const box = new THREE.Box3().setFromObject(root);
    if (typeof box.isEmpty === 'function' && box.isEmpty()) return null;

    const worldCenterBefore = new THREE.Vector3();
    box.getCenter(worldCenterBefore);
    if (![worldCenterBefore.x, worldCenterBefore.y, worldCenterBefore.z].every(Number.isFinite)) return null;

    const rootPositionBefore = root.position.clone();
    const localCenter = typeof root.worldToLocal === 'function'
        ? root.worldToLocal(worldCenterBefore.clone())
        : worldCenterBefore.clone().sub(root.position);
    if (root.scale && !root.worldToLocal) {
        localCenter.set(
            root.scale.x ? localCenter.x / root.scale.x : localCenter.x,
            root.scale.y ? localCenter.y / root.scale.y : localCenter.y,
            root.scale.z ? localCenter.z / root.scale.z : localCenter.z
        );
    }
    root.children.forEach(child => {
        child.position.sub(localCenter);
    });
    root.position.copy(rootPositionBefore);
    root.updateMatrixWorld?.(true);
    root.updateWorldMatrix?.(true, true);

    const centeredBox = new THREE.Box3().setFromObject(root);
    const worldCenterAfter = new THREE.Vector3();
    centeredBox.getCenter(worldCenterAfter);

    root.userData = root.userData || {};
    root.userData.geometryCentering = {
        method: 'child-offset-root-preserved',
        localOffsetApplied: {
            x: -localCenter.x,
            y: -localCenter.y,
            z: -localCenter.z
        },
        rootPositionPreserved: {
            x: root.position.x,
            y: root.position.y,
            z: root.position.z
        },
        worldCenterBefore: {
            x: worldCenterBefore.x,
            y: worldCenterBefore.y,
            z: worldCenterBefore.z
        },
        worldCenterAfter: {
            x: worldCenterAfter.x,
            y: worldCenterAfter.y,
            z: worldCenterAfter.z
        }
    };
    return root.userData.geometryCentering;
}

function setTextureAnisotropy(material) {
    const renderer = currentRenderer();
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

function resolveFilePathAndName(filePathOrBase, defaultDir = SATELLITE_OBJ_BASE_URL) {
    if (filePathOrBase.includes('/')) {
        const lastSlash = filePathOrBase.lastIndexOf('/') + 1;
        return {
            dir: filePathOrBase.slice(0, lastSlash),
            fileName: filePathOrBase.slice(lastSlash),
        };
    }
    return {
        dir: defaultDir,
        fileName: filePathOrBase,
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
let CSS2DObject = appWindow.CSS2DObject; // allow external injection

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
async function loadOBJWithMTL(fileBase, meta, { usePlaceholderOnFailure = true } = {}) {
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
            `[${fileBase}] OBJ load failed (${dir + objName}).`
            + (usePlaceholderOnFailure ? ' Using placeholder.' : ''),
            e
        );
        if (!usePlaceholderOnFailure) throw e;
        root = placeholderCube(0.5);
    }

    // Optional unit conversion: OBJ units → meters → scene units
    // If you have metadata like meta.geometry.obj_units ('m','cm','mm'), convert here.
    // Default assumption: OBJ is authored in meters.
    const scale = modelScaleToSceneUnits(meta?.geometry?.obj_units);
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
        centerModelGeometryAtRoot(root);
    }

    return root;
}

/* ─────────────────────────── GLB loading core ───────────────────────────── */
async function loadGLB(filePathOrBase, meta, { usePlaceholderOnFailure = true } = {}) {
    const { dir, fileName } = resolveFilePathAndName(filePathOrBase);

    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    loader.setPath(dir);

    let gltf;
    try {
        gltf = await loader.loadAsync(fileName);
    } catch (e) {
        console.error(
            `[${filePathOrBase}] GLB load failed (${dir + fileName}).`
            + (usePlaceholderOnFailure ? ' Using placeholder.' : ''),
            e
        );
        if (!usePlaceholderOnFailure) throw e;
        return placeholderCube(0.5);
    }

    const sceneRoot = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
    const root = new THREE.Group();
    root.add(sceneRoot);

    const scale = modelScaleToSceneUnits(meta?.geometry?.glb_units ?? meta?.geometry?.obj_units);
    root.scale.setScalar(scale);

    root.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (!child.material) {
                child.material = new THREE.MeshStandardMaterial({
                    color: 0xb0b0b0,
                    metalness: 0.5,
                    roughness: 0.6,
                });
            } else if (Array.isArray(child.material)) {
                child.material.forEach(setTextureAnisotropy);
            } else {
                setTextureAnisotropy(child.material);
            }
        }
    });

    if (meta?.geometry?.center_model ?? true) {
        centerModelGeometryAtRoot(root);
    }

    return root;
}

/* ───────────────────────── Singleton state ──────────────────────────────── */
let currentSatModel = null;
const currentLabels = [];

/* ───────────────────────── Public API: show/clear ───────────────────────── */
export async function showSatellite(noradId, scene, updatedNoradId, options = {}) {
    if (!scene) throw new Error('showSatellite: scene is required');

    clearCurrentDetailedSat(scene);

    const resolvedId = options.assetId || updatedNoradId || noradId;
    const metadataId = options.metadataId || resolvedId;
    const extMatch = /^(.*)\.([^.]+)$/.exec(resolvedId);
    const baseName = extMatch ? extMatch[1] : resolvedId;
    const extension = extMatch ? extMatch[2] : '';
    const extLower = extension.toLowerCase();
    const metadataBaseName = String(metadataId).replace(/\.[^.]+$/, '');

    const jsonUrl = `${SATELLITE_MODELS_BASE_URL}${metadataBaseName}.json`;
    const usePlaceholderOnFailure = options.usePlaceholderOnFailure ?? true;

    console.info(
        `[${noradId}] Loading selected satellite model asset "${resolvedId}" with metadata "${metadataBaseName}".`,
        options.attemptedPaths ? { attemptedPaths: options.attemptedPaths } : ''
    );

    let sat = null;
    try {
        // Load metadata JSON first (use your existing CORS-safe fetchJSON)
        const raw = await (globalThis.window?.fetchJSON || fetchJSON)(jsonUrl);
        sat = Array.isArray(raw) ? raw[0] : Object.values(raw)[0];
        if (!sat) {
            console.warn(`[${noradId}] No satellite record in JSON at ${jsonUrl}`);
        }
    } catch (e) {
        console.warn(`[${resolvedId}] JSON load failed (${jsonUrl}). Proceeding with defaults.`, e);
    }

    const meta = sat?.meta || sat || {};

    let loaderFn = loadOBJWithMTL;
    let loaderArg = baseName;
    if (options.kind === 'glb' || extLower === 'glb') {
        loaderFn = loadGLB;
        loaderArg = resolvedId;
    } else if (options.kind === 'obj-mtl' || extLower === 'obj') {
        loaderFn = loadOBJWithMTL;
        loaderArg = baseName;
    } else if (extension) {
        console.warn(`[${resolvedId}] Unsupported extension "${extension}". Defaulting to OBJ/MTL.`);
    }

    let root;
    try {
        root = await loaderFn(loaderArg, meta, { usePlaceholderOnFailure });
    } catch (e) {
        console.error(`[${resolvedId}] Model load failed for ${loaderArg}.`, e);
        if (!usePlaceholderOnFailure) return null;
        root = placeholderCube(0.5);
    }

    const loaderUserData = root.userData || {};

    // Preserve your rich userData structure
    root.userData = {
        updatedNoradId: resolvedId,
        metadataId: metadataBaseName,
        geometryCentering: loaderUserData.geometryCentering || null,
        meta: sat?.meta || {},
        orbit: sat?.orbit || {},
        attitude: sat?.attitude || sat?.meta?.attitude || {},
        capability: sat?.capability || {},
        attitudeCapability: sat?.attitudeCapability || {},
        payload: sat?.payload || {},
        geometry: sat?.geometry || {},
        footprints: sat?.footprints || {},
        source: sat,
    };

    // Apply initial attitude if provided
    const att = root.userData.attitude;
    if (att) {
        updateBusOrientation(
            root,
            att.yaw ?? 0,
            att.pitch ?? 0,
            att.roll ?? 0
        );
    }

    const visibilityDiagnostics = prepareModelForSelectedView(root);
    console.info(
        `[${noradId}] Model visibility diagnostics for "${resolvedId}".`,
        visibilityDiagnostics
    );
    if (!visibilityDiagnostics.visible && !usePlaceholderOnFailure) {
        disposeObject3D(root);
        return null;
    }

    // (Optional) add a name label above the model
    const pendingLabels = [];
    const CSS2DObjectClass = await ensureCSS2DObject();
    if (CSS2DObjectClass && sat?.meta?.name) {
        const div = document.createElement('div');
        div.className = 'label';
        div.textContent = sat.meta.name;
        const lbl = new CSS2DObjectClass(div);
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        lbl.position.set(0, size.y * 0.55, 0);
        root.add(lbl);
        pendingLabels.push(lbl);
    }

    if (typeof options.shouldAttach === 'function' && !options.shouldAttach()) {
        disposeObject3D(root);
        pendingLabels.forEach(l => l.parent && l.parent.remove(l));
        console.info(`[${noradId}] Ignored stale model load for "${resolvedId}".`);
        return null;
    }

    currentSatModel = root;
    currentLabels.push(...pendingLabels);
    scene.add(currentSatModel);
    return currentSatModel;
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
export { KM_TO_SCENE_UNITS, EARTH_SCENE_RADIUS, EARTH_RADIUS_KM };
