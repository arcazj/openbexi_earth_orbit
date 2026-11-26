import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

export async function loadObjMtl(entry, manager, warnings, basePath = 'obj/') {
    const mtlLoader = new MTLLoader(manager);
    mtlLoader.setPath(basePath);
    mtlLoader.setResourcePath(basePath + entry.files.mtl.slice(0, entry.files.mtl.lastIndexOf('/') + 1));

    let materials = null;
    try {
        materials = await mtlLoader.loadAsync(entry.files.mtl);
        materials.preload();
    } catch (error) {
        warnings.push(`MTL not loaded: ${basePath}${entry.files.mtl}`);
        console.warn(`MTL load failed for ${basePath}${entry.files.mtl}; loading OBJ with fallback material.`, error);
    }

    const objLoader = new OBJLoader(manager);
    objLoader.setPath(basePath);
    if (materials) objLoader.setMaterials(materials);
    const root = await objLoader.loadAsync(entry.files.obj);
    if (entry.previewDirection) {
        // OBJ cannot embed a camera. Use the same authored view as the GLB fitting path.
        const preview = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
        preview.name = 'OpenBEXIPreview';
        preview.position.fromArray(entry.previewDirection);
        preview.lookAt(0, 0, 0);
        root.add(preview);
    }
    return root;
}

export async function loadGlb(entry, manager, basePath = 'obj/') {
    const loader = new GLTFLoader(manager);
    loader.setPath(basePath);
    const gltf = await loader.loadAsync(entry.files.glb);
    const root = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
    const { dimensionNote, visualReferences, referenceStatus, sources } = gltf.userData || {};
    if (typeof dimensionNote === 'string') root.userData.dimensionNote = dimensionNote;
    if (Array.isArray(visualReferences)) root.userData.visualReferences = visualReferences;
    if (typeof referenceStatus === 'string') root.userData.referenceStatus = referenceStatus;
    if (Array.isArray(sources)) root.userData.referenceTitles = Object.fromEntries(sources
        .filter(source => typeof source?.url === 'string' && typeof source.basis === 'string')
        .map(source => [source.url, source.basis]));
    return root;
}

export async function loadGlbGroup(entry, manager, basePath = 'obj/') {
    const loader = new GLTFLoader(manager);
    loader.setPath(basePath);
    const group = new THREE.Group();
    group.name = entry.displayName || entry.id;
    const glbFiles = Array.isArray(entry.files.glbs) ? entry.files.glbs : [];
    const scenes = await Promise.all(glbFiles.map(async file => {
        const gltf = await loader.loadAsync(file);
        const sceneRoot = gltf.scene || gltf.scenes?.[0] || new THREE.Group();
        sceneRoot.name = file.split('/').pop() || file;
        return sceneRoot;
    }));
    scenes.forEach(sceneRoot => group.add(sceneRoot));
    return group;
}

function disposeMaterial(material) {
    if (!material) return;
    Object.keys(material).forEach(key => {
        const value = material[key];
        if (value?.isTexture) value.dispose();
    });
    material.dispose?.();
}

export function disposeObject(root) {
    root?.traverse(child => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
            child.material.forEach(disposeMaterial);
        } else {
            disposeMaterial(child.material);
        }
    });
}
