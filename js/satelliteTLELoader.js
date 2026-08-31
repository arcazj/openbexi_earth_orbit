import * as THREE from 'three';
import { eciToSceneVector } from './sceneFrame.js';
import {
    satelliteConfig,
    fetchJSON,
    getFullGitHubUrl, GITHUB_REPO_RAW_BASE_URL,
} from './SatelliteConfigurationLoader.js';
import { EARTH_RADIUS_KM, EARTH_SCENE_RADIUS } from './SatelliteConstantLoader.js';
import { processInChunks } from './startupPerformance.js';
import { orbitClassFromMeanMotion, radToDeg } from './orbit/orbitLinkGeometry.js';
import { normalizeNoradId, stableFingerprint } from './domain/objectIdentity.js';
import { normalizeDatasetProvenance } from './domain/contracts.js';
import {
    LIFECYCLE_STATUS,
    OBJECT_TYPE,
    ORBIT_CLASS,
    normalizeLifecycleStatus,
    normalizeObjectType,
    normalizeOrbitClass,
    normalizeUtcInstant
} from './domain/orbitalPolicy.js';
import { validateCatalog } from './domain/catalogValidation.js';
import { parseCcsdsOmmJson } from './domain/orbitalSourceAdapters.js';
import { trackedObjectVisual } from './trackedObjectCatalog.js';

export let satellites = [];
export let activeCatalogValidationSnapshot = null;
export let activeCatalogQualitySummary = null;
export let activeCatalogKind = null;
export let lastCatalogValidationSnapshot = null;
export let lastCatalogQualitySummary = null;
let orbitLine = null;
let satellitePointCloud = null;
export let usingLocalAssets = false;
let textureLoader = new THREE.TextureLoader();
const MIN_ORBIT_RADIUS_KM = EARTH_RADIUS_KM;
const ORBIT_OCCLUSION_RADIUS_PADDING = 0.002;
const DEFAULT_ORBIT_PERIOD_MINUTES = 96;
const MIN_VALID_ORBIT_PERIOD_MINUTES = 1;
const MAX_VALID_ORBIT_PERIOD_MINUTES = 45 * 24 * 60;
const SATELLITE_POINT_CLOUD_NAME = 'satellitePointCloud';
const pointColorCache = new Map();
const pointVisualCache = new WeakMap();
const disposedPointMarkerTextures = new WeakSet();
const CANONICAL_POINT_MARKER_SIZE = 32;
const DEFAULT_SATELLITE_ICON_ASSET = 'icons/ob_satellite.png';
const POINT_ICON_ALPHA_SHADER_KEY = 'openbexi-point-icon-alpha-v1';
export const GLOBE_DETAILED_ICON_LIMIT = 500;
export const GLOBE_DETAILED_ICON_SIZE_PX = 16;
const GLOBE_DENSITY_POINT_SIZE = 0.025;

export function globePointMarkerMode(drawnCount) {
    return Number(drawnCount) < GLOBE_DETAILED_ICON_LIMIT ? 'detailed' : 'density';
}

function createCanonicalPointMarkerMap() {
    const size = CANONICAL_POINT_MARKER_SIZE;
    const data = new Uint8Array(size * size * 4);
    const center = (size - 1) / 2;
    const solidRadius = center - 1.75;
    const outerRadius = center - 0.25;
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const distance = Math.hypot(x - center, y - center);
            const alpha = distance <= solidRadius
                ? 255
                : distance >= outerRadius
                    ? 0
                    : Math.round(255 * (outerRadius - distance) / (outerRadius - solidRadius));
            const offset = (y * size + x) * 4;
            data[offset] = 255;
            data[offset + 1] = 255;
            data[offset + 2] = 255;
            data[offset + 3] = alpha;
        }
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.name = 'openbexiCanonicalPointMarker';
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    texture.userData.openbexiOwned = true;
    texture.userData.openbexiPointMarkerSource = 'procedural-fallback';
    return texture;
}

function disposePointMarkerTexture(texture) {
    if (!texture?.dispose || disposedPointMarkerTextures.has(texture)) return;
    disposedPointMarkerTextures.add(texture);
    texture.dispose();
}

export function applyPointIconAlphaShader(material) {
    material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_particle_fragment>',
            `
#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
    #if defined( USE_POINTS_UV )
        vec2 openbexiPointIconUv = vUv;
    #else
        vec2 openbexiPointIconUv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
    #endif
#endif
#ifdef USE_MAP
    diffuseColor.a *= texture2D( map, openbexiPointIconUv ).a;
#endif
#ifdef USE_ALPHAMAP
    diffuseColor.a *= texture2D( alphaMap, openbexiPointIconUv ).g;
#endif
`
        );
    };
    material.customProgramCacheKey = () => POINT_ICON_ALPHA_SHADER_KEY;
    material.userData.openbexiPointIconAlphaOnly = true;
}

function pointMarkerImageDiagnostics(texture) {
    const image = texture?.image;
    const width = Number(image?.naturalWidth ?? image?.videoWidth ?? image?.width ?? 0);
    const height = Number(image?.naturalHeight ?? image?.videoHeight ?? image?.height ?? 0);
    const complete = texture?.isDataTexture || image?.complete !== false;
    return {
        ready: Boolean(width > 0 && height > 0 && complete),
        width: width > 0 ? width : 0,
        height: height > 0 ? height : 0
    };
}

function configuredPointMarker(baseMaterial) {
    const configuredMap = baseMaterial?.map?.isTexture ? baseMaterial.map : null;
    if (!configuredMap) {
        return {
            map: createCanonicalPointMarkerMap(),
            source: 'procedural-fallback',
            assetPath: null,
            resolvedUrl: null
        };
    }
    const assetPath = configuredMap.userData?.openbexiAssetPath ??
        baseMaterial.userData?.openbexiIconAssetPath ?? null;
    const explicitSource = baseMaterial.userData?.openbexiPointMarkerSource ??
        configuredMap.userData?.openbexiPointMarkerSource ?? null;
    return {
        map: configuredMap,
        source: explicitSource ?? (assetPath ? 'asset' : 'injected-texture'),
        assetPath,
        resolvedUrl: configuredMap.userData?.openbexiResolvedUrl ?? null
    };
}

function pointColorRgb(color) {
    if (!pointColorCache.has(color)) {
        const parsed = new THREE.Color(color);
        pointColorCache.set(color, Object.freeze([parsed.r, parsed.g, parsed.b]));
    }
    return pointColorCache.get(color);
}

function pointVisualSource(record) {
    return record?.object_type ?? record?.objectType ?? record?.catalogObject?.object_type ??
        record?.element_set?.omm?.OBJECT_TYPE ?? record?.meta?.object_type ??
        record?.satellite_name ?? record?.name ?? '';
}

function pointVisual(record) {
    const source = pointVisualSource(record);
    const cached = pointVisualCache.get(record);
    if (cached?.source === source) return cached;
    const visual = trackedObjectVisual(record);
    const entry = Object.freeze({ source, visual, rgb: pointColorRgb(visual.color) });
    pointVisualCache.set(record, entry);
    return entry;
}

const selectedPointRgb = pointColorRgb('#ffffff');

function removeSatellitePointCloud(scene) {
    if (!satellitePointCloud) return;
    scene.remove(satellitePointCloud);
    satellitePointCloud.geometry?.dispose?.();
    const sourceMaterial = satellitePointCloud.userData.sourceMaterial;
    const ownedMarkerMaps = new Set();
    for (const markerMap of [satellitePointCloud.material?.map, satellitePointCloud.userData.iconMap]) {
        if (markerMap?.userData?.openbexiOwned) ownedMarkerMaps.add(markerMap);
    }
    if (sourceMaterial?.userData?.openbexiOwned) {
        if (sourceMaterial.map) ownedMarkerMaps.add(sourceMaterial.map);
    }
    for (const markerMap of ownedMarkerMaps) disposePointMarkerTexture(markerMap);
    satellitePointCloud.material?.dispose?.();
    if (sourceMaterial?.userData?.openbexiOwned) {
        sourceMaterial.dispose?.();
    }
    satellitePointCloud = null;
}

function createSatellitePointCloud(scene, capacity, baseMaterial) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(Math.max(1, capacity) * 3);
    const colors = new Float32Array(Math.max(1, capacity) * 3);
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const colorAttribute = new THREE.BufferAttribute(colors, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('color', colorAttribute);
    geometry.setDrawRange(0, 0);

    const marker = configuredPointMarker(baseMaterial);
    const material = new THREE.PointsMaterial({
        color: 0xffffff,
        map: marker.map,
        size: GLOBE_DETAILED_ICON_SIZE_PX,
        sizeAttenuation: false,
        transparent: true,
        alphaTest: Math.max(0.01, Number(baseMaterial.alphaTest) || 0.05),
        depthTest: baseMaterial.depthTest !== false,
        depthWrite: baseMaterial.depthWrite !== false,
        vertexColors: true
    });
    applyPointIconAlphaShader(material);
    satellitePointCloud = new THREE.Points(geometry, material);
    satellitePointCloud.name = SATELLITE_POINT_CLOUD_NAME;
    satellitePointCloud.frustumCulled = false;
    satellitePointCloud.userData.capacity = capacity;
    satellitePointCloud.userData.drawnCount = 0;
    satellitePointCloud.userData.sourceMaterial = baseMaterial;
    satellitePointCloud.userData.iconMap = marker.map;
    satellitePointCloud.userData.iconSource = marker.source;
    satellitePointCloud.userData.iconAssetPath = marker.assetPath;
    satellitePointCloud.userData.iconResolvedUrl = marker.resolvedUrl;
    satellitePointCloud.userData.baseSize = material.size;
    satellitePointCloud.userData.baseSizeAttenuation = material.sizeAttenuation;
    scene.add(satellitePointCloud);
}

function replaceFailedPointIcon(failedTexture) {
    if (!failedTexture) return;
    if (satellitePointCloud?.userData?.iconMap === failedTexture) {
        const fallbackMap = createCanonicalPointMarkerMap();
        satellitePointCloud.userData.iconMap = fallbackMap;
        satellitePointCloud.userData.iconSource = 'procedural-fallback';
        satellitePointCloud.userData.iconAssetPath = null;
        satellitePointCloud.userData.iconResolvedUrl = null;
        if (globePointMarkerMode(satellitePointCloud.userData.drawnCount) === 'detailed') {
            satellitePointCloud.material.map = fallbackMap;
            satellitePointCloud.material.needsUpdate = true;
        }
    }
    disposePointMarkerTexture(failedTexture);
}

function pointCloudRecordReady(record) {
    const position = record?.mesh?.position;
    return record?.mesh?.visible === true && record.motionPositionReady === true &&
        Number.isFinite(position?.x) && Number.isFinite(position?.y) && Number.isFinite(position?.z);
}

export function syncSatellitePointCloud(sourceSatellites = satellites) {
    if (!satellitePointCloud) return 0;
    const positionAttribute = satellitePointCloud.geometry.getAttribute('position');
    const colorAttribute = satellitePointCloud.geometry.getAttribute('color');
    let drawnCount = 0;
    let selectedDrawnCount = 0;
    const objectTypeMarkerCounts = {};
    for (const satelliteRecord of sourceSatellites) {
        const position = satelliteRecord?.mesh?.position;
        if (!pointCloudRecordReady(satelliteRecord)) continue;
        positionAttribute.setXYZ(drawnCount, position.x, position.y, position.z);
        const { visual: baseVisual, rgb: baseRgb } = pointVisual(satelliteRecord);
        const [r, g, b] = satelliteRecord.isSelected ? selectedPointRgb : baseRgb;
        colorAttribute.setXYZ(drawnCount, r, g, b);
        objectTypeMarkerCounts[baseVisual.label] = (objectTypeMarkerCounts[baseVisual.label] || 0) + 1;
        if (satelliteRecord.isSelected) selectedDrawnCount += 1;
        drawnCount += 1;
    }
    satellitePointCloud.geometry.setDrawRange(0, drawnCount);
    positionAttribute.needsUpdate = true;
    colorAttribute.needsUpdate = true;
    satellitePointCloud.visible = drawnCount > 0;
    satellitePointCloud.userData.drawnCount = drawnCount;
    satellitePointCloud.userData.objectTypeMarkerCounts = objectTypeMarkerCounts;
    satellitePointCloud.userData.selectedDrawnCount = selectedDrawnCount;
    const denseMode = globePointMarkerMode(drawnCount) === 'density';
    const nextMap = denseMode ? null : satellitePointCloud.userData.iconMap;
    if (satellitePointCloud.material.map !== nextMap) {
        satellitePointCloud.material.map = nextMap;
        satellitePointCloud.material.needsUpdate = true;
    }
    const nextSizeAttenuation = denseMode ? true : satellitePointCloud.userData.baseSizeAttenuation;
    if (satellitePointCloud.material.sizeAttenuation !== nextSizeAttenuation) {
        satellitePointCloud.material.sizeAttenuation = nextSizeAttenuation;
        satellitePointCloud.material.needsUpdate = true;
    }
    satellitePointCloud.material.size = denseMode ? GLOBE_DENSITY_POINT_SIZE : satellitePointCloud.userData.baseSize;
    return drawnCount;
}

export function getSatellitePointCloudDiagnostics(sourceSatellites = satellites) {
    const position = satellitePointCloud?.geometry?.getAttribute?.('position')?.array;
    const drawnCount = satellitePointCloud?.geometry?.drawRange?.count || 0;
    const uploadedNoradIds = [];
    let cursor = 0;
    for (const record of sourceSatellites) {
        if (!pointCloudRecordReady(record) || cursor >= drawnCount) continue;
        const p = record.mesh.position;
        const offset = cursor * 3;
        if (Math.hypot(position[offset] - p.x, position[offset + 1] - p.y, position[offset + 2] - p.z) < 1e-4) {
            uploadedNoradIds.push(record.norad_id?.toString());
        }
        cursor += 1;
    }
    const detailedMarkerImage = pointMarkerImageDiagnostics(satellitePointCloud?.userData?.iconMap);
    return {
        drawnCount,
        matchedPositionCount: uploadedNoradIds.length,
        uploadedNoradIds,
        objectTypeMarkerCounts: { ...(satellitePointCloud?.userData?.objectTypeMarkerCounts || {}) },
        debrisDrawnCount: satellitePointCloud?.userData?.objectTypeMarkerCounts?.Debris || 0,
        selectedDrawnCount: satellitePointCloud?.userData?.selectedDrawnCount || 0,
        markerMode: satellitePointCloud?.material?.map ? 'detailed' : 'density',
        pointSize: satellitePointCloud?.material?.size || 0,
        pointSizeAttenuation: satellitePointCloud?.material?.sizeAttenuation === true,
        detailedMarkerSource: satellitePointCloud?.userData?.iconSource ?? null,
        detailedMarkerAssetPath: satellitePointCloud?.userData?.iconAssetPath ?? null,
        detailedMarkerResolvedUrl: satellitePointCloud?.userData?.iconResolvedUrl ?? null,
        detailedMarkerTextureUuid: satellitePointCloud?.userData?.iconMap?.uuid ?? null,
        detailedMarkerUsesAlphaTint: satellitePointCloud?.material?.userData?.openbexiPointIconAlphaOnly === true,
        detailedMarkerReady: detailedMarkerImage.ready,
        detailedMarkerWidth: detailedMarkerImage.width,
        detailedMarkerHeight: detailedMarkerImage.height
    };
}
const MIN_ORBIT_SAMPLE_COUNT = 96;
const MAX_ORBIT_SAMPLE_COUNT = 720;
const ORBIT_SAMPLE_MINUTES_PER_POINT = 4;
const MIN_ORBIT_REFRESH_INTERVAL_MS = 60_000;
const MAX_ORBIT_REFRESH_INTERVAL_MS = 5 * 60_000;
const MIN_RUNNING_ORBIT_REFRESH_REAL_MS = 1_000;
export const STATIC_DEPLOYMENT_MODE = 'static';

export function resolveCatalogRuntimePolicy(options = {}) {
    const documentObj = options.documentObj ?? globalThis.document;
    const declaredMode = options.deployment_mode ?? options.deploymentMode ??
        documentObj?.querySelector?.('meta[name="openbexi-deployment-mode"]')?.content ??
        'server-capable';
    const deploymentMode = String(declaredMode).trim().toLowerCase();
    const remoteFallbackRequested = options.allow_remote_catalog_fallback ??
        options.allowRemoteCatalogFallback ?? true;
    return Object.freeze({
        deployment_mode: deploymentMode,
        packaged_catalog_required: deploymentMode === STATIC_DEPLOYMENT_MODE,
        allow_remote_catalog_fallback: deploymentMode === STATIC_DEPLOYMENT_MODE
            ? false
            : remoteFallbackRequested === true
    });
}

function canonicalJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function bytesToHex(bytes) {
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function computeTleDatasetHash(records, options = {}) {
    if (!Array.isArray(records)) throw new TypeError('TLE records must be an array.');
    const material = records.map(canonicalJson).sort().join('\n');
    const cryptoImpl = options.crypto_impl ?? options.cryptoImpl ?? globalThis.crypto;
    if (cryptoImpl?.subtle?.digest) {
        const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(material));
        return `sha256:${bytesToHex(new Uint8Array(digest))}`;
    }
    return `fnv1a64:${stableFingerprint(material)}`;
}

export const computeGpDatasetHash = computeTleDatasetHash;

function metadataSourceStatus(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return { source_status: 'DEGRADED', partial_update: false };
    }
    const status = String(metadata.last_status ?? '').trim().toLowerCase();
    const explicitSourceStatus = String(metadata.source_status ?? '').trim().toUpperCase();
    const mode = String(metadata.mode ?? '').trim().toLowerCase();
    const rejected = Number(metadata.counts?.rejected ?? 0);
    const fetched = Number(metadata.counts?.fetched);
    const total = Number(metadata.counts?.total);
    const isIncremental = mode === 'incremental' || (
        Number.isFinite(fetched) && Number.isFinite(total) && fetched < total
    );
    const hasFailure = !!String(metadata.last_error ?? '').trim() || status === 'error' || status === 'failed';
    if (status === 'not-modified' && !hasFailure &&
        (explicitSourceStatus === 'COMPLETE' || explicitSourceStatus === 'PARTIAL')) {
        return {
            source_status: explicitSourceStatus,
            partial_update: explicitSourceStatus === 'PARTIAL' || metadata.partial_update === true
        };
    }
    if (status === 'ok' && explicitSourceStatus === 'COMPLETE' &&
        metadata.partial_update !== true && rejected === 0) {
        return { source_status: 'COMPLETE', partial_update: false };
    }
    if (status === 'ok' && rejected === 0 && !isIncremental) {
        return { source_status: 'COMPLETE', partial_update: false };
    }
    if (status === 'ok' || status === 'partial') {
        return { source_status: 'PARTIAL', partial_update: true };
    }
    return { source_status: 'DEGRADED', partial_update: false };
}

export async function buildTleDatasetProvenance(records, metadata, options = {}) {
    const referenceTime = normalizeUtcInstant(
        options.reference_time ?? options.referenceTime ?? options.now?.() ?? new Date(),
        'catalog reference time'
    );
    const metadataTimestamp = metadata?.last_success_at ?? metadata?.fetched_at ?? null;
    const datasetHash = await computeTleDatasetHash(records, options);
    const status = metadataSourceStatus(metadata);
    const sourceUrls = Array.isArray(metadata?.source_urls)
        ? metadata.source_urls.filter(value => typeof value === 'string' && value.trim())
        : [];
    return normalizeDatasetProvenance({
        source_id: options.source_id ?? options.sourceId ?? 'celestrak-gp-catalog',
        provider: options.provider ?? 'CelesTrak',
        retrieved_at: metadataTimestamp,
        dataset_id: options.dataset_id ?? options.datasetId ?? `tle-catalog:${datasetHash.split(':')[1].slice(0, 16)}`,
        dataset_hash: datasetHash,
        source_uri: options.source_uri ?? options.sourceUri ?? sourceUrls[0] ?? null,
        source_status: status.source_status,
        partial_update: status.partial_update,
        license_id: options.license_id ?? options.licenseId ?? null
    });
}

export async function buildGpDatasetProvenance(records, metadata, options = {}) {
    const datasetHash = await computeGpDatasetHash(records, options);
    return buildTleDatasetProvenance(records, metadata, {
        ...options,
        source_id: options.source_id ?? options.sourceId ?? 'celestrak-gp-catalog',
        dataset_id: options.dataset_id ?? options.datasetId ?? `gp-catalog:${datasetHash.split(':')[1].slice(0, 16)}`
    });
}

export async function validateTleCatalogForDisplay(records, metadata, options = {}) {
    const referenceTime = normalizeUtcInstant(
        options.reference_time ?? options.referenceTime ?? options.now?.() ?? new Date(),
        'catalog reference time'
    );
    const provenance = options.provenance_override ?? options.provenanceOverride ??
        await buildTleDatasetProvenance(records, metadata, {
            ...options,
            reference_time: referenceTime
        });
    const satelliteLib = options.satelliteLib ?? options.satellite_lib ?? globalThis.satellite;
    const sgp4Initializer = options.sgp4_initializer ?? options.sgp4Initializer ??
        (typeof satelliteLib?.twoline2satrec === 'function'
            ? (line1, line2) => satelliteLib.twoline2satrec(line1, line2)
            : null);
    const result = validateCatalog(records, {
        provenance,
        reference_time: referenceTime,
        freshness_policy: options.freshness_policy ?? options.freshnessPolicy,
        quarantine_stale: options.quarantine_stale ?? options.quarantineStale ?? false,
        require_known_classification: options.require_known_classification ?? options.requireKnownClassification ?? false,
        sgp4_initializer: sgp4Initializer
    });
    if (!result.value) return Object.freeze({ result, snapshot: null, quality: null, records: Object.freeze([]) });
    const acceptedRecords = result.value.accepted_record_indices.map((sourceIndex, objectIndex) => ({
        ...records[sourceIndex],
        catalogObject: result.value.objects[objectIndex]
    }));
    return Object.freeze({
        result,
        snapshot: result.value,
        quality: result.value.quality,
        records: Object.freeze(acceptedRecords)
    });
}

function orbitalRecordFormat(record) {
    const declared = String(
        record?.element_set?.format ?? record?.elementSet?.format ?? record?.source_format ?? ''
    ).trim().toUpperCase();
    if (declared === 'OMM' || declared === 'CCSDS_OMM_JSON') return 'OMM';
    if (declared === 'TLE' || declared === 'TLE_JSON') return 'TLE';
    if (record?.element_set?.omm || record?.omm || record?.EPOCH) return 'OMM';
    return 'TLE';
}

function canonicalOmmInput(record) {
    const supplied = record?.element_set?.omm ?? record?.elementSet?.omm ?? record?.omm ?? record;
    const norad = record?.norad_id ?? record?.noradId ?? record?.NORAD_CAT_ID ?? supplied?.NORAD_CAT_ID;
    return {
        CCSDS_OMM_VERS: '2.0',
        CENTER_NAME: 'EARTH',
        REF_FRAME: 'TEME',
        TIME_SYSTEM: 'UTC',
        MEAN_ELEMENT_THEORY: 'SGP4',
        ...supplied,
        OBJECT_NAME: supplied?.OBJECT_NAME ?? record?.satellite_name ?? record?.name,
        OBJECT_ID: supplied?.OBJECT_ID ?? record?.international_designator ?? record?.object_id,
        NORAD_CAT_ID: norad == null ? norad : String(norad).trim(),
        EPOCH: supplied?.EPOCH ?? record?.element_set?.epoch ?? record?.elementSet?.epoch,
        OBJECT_TYPE: supplied?.OBJECT_TYPE ?? record?.object_type,
        OPS_STATUS_CODE: supplied?.OPS_STATUS_CODE ?? record?.operational_status ?? record?.lifecycle_status
    };
}

function inheritDisplayClassifications(catalogObject, displayRecord) {
    const classifications = [
        {
            key: 'object_type',
            unknown: OBJECT_TYPE.UNKNOWN,
            flag: 'OBJECT_TYPE_UNKNOWN',
            canonical: normalizeObjectType(catalogObject?.object_type),
            display: normalizeObjectType(
                displayRecord?.object_type ?? displayRecord?.objectType ?? displayRecord?.OBJECT_TYPE
            )
        },
        {
            key: 'orbit_class',
            unknown: ORBIT_CLASS.UNKNOWN,
            flag: 'ORBIT_CLASS_UNKNOWN',
            canonical: normalizeOrbitClass(catalogObject?.orbit_class),
            display: normalizeOrbitClass(
                displayRecord?.orbit_class ?? displayRecord?.orbitClass ??
                displayRecord?.ORBIT_CLASS ?? displayRecord?.type
            )
        },
        {
            key: 'lifecycle_status',
            unknown: LIFECYCLE_STATUS.UNKNOWN,
            flag: 'LIFECYCLE_STATUS_UNKNOWN',
            canonical: normalizeLifecycleStatus(catalogObject?.lifecycle_status),
            display: normalizeLifecycleStatus(
                displayRecord?.lifecycle_status ?? displayRecord?.lifecycleStatus ??
                displayRecord?.operational_status ?? displayRecord?.operationalStatus
            )
        }
    ];
    const inherited = {};
    let changed = false;
    for (const classification of classifications) {
        const value = classification.canonical === classification.unknown &&
            classification.display !== classification.unknown
            ? classification.display
            : classification.canonical;
        inherited[classification.key] = value;
        if (value !== catalogObject?.[classification.key]) changed = true;
    }
    if (!changed) return catalogObject;

    const resolvedFlags = new Set(catalogObject?.quality_flags ?? []);
    classifications.forEach(classification => {
        if (inherited[classification.key] !== classification.unknown) {
            resolvedFlags.delete(classification.flag);
        }
    });
    return Object.freeze({
        ...catalogObject,
        ...inherited,
        quality_flags: Object.freeze([...resolvedFlags].sort())
    });
}

function validInitializedSatrec(satrec) {
    if (!satrec || (Number.isFinite(satrec.error) && satrec.error !== 0)) return false;
    return ['epochyr', 'epochdays', 'jdsatepoch', 'inclo', 'nodeo', 'ecco', 'argpo', 'mo', 'no']
        .every(field => Number.isFinite(satrec[field]));
}

function mixedCatalogQuality(total, accepted, quarantine) {
    const formats = { TLE: 0, OMM: 0 };
    accepted.forEach(record => {
        const format = orbitalRecordFormat(record.catalogObject ?? record);
        formats[format] = (formats[format] ?? 0) + 1;
    });
    const reasonCounts = {};
    quarantine.forEach(item => (item.reason_codes ?? []).forEach(code => {
        reasonCounts[code] = (reasonCounts[code] ?? 0) + 1;
    }));
    return Object.freeze({
        total_records: total,
        accepted_records: accepted.length,
        quarantined_records: quarantine.length,
        duplicate_records: reasonCounts.DUPLICATE_OBJECT_ID ?? 0,
        by_format: Object.freeze(formats),
        quarantine_reason_counts: Object.freeze(reasonCounts)
    });
}

function recordEpochMillis(record) {
    const value = record?.catalogObject?.element_set?.epoch ?? record?.element_set?.epoch ??
        record?.elementSet?.epoch ?? record?.element_set?.omm?.EPOCH ?? record?.EPOCH;
    const millis = Date.parse(value);
    return Number.isFinite(millis) ? millis : Number.NEGATIVE_INFINITY;
}

function recordNoradId(record) {
    const value = record?.catalogObject?.norad_id ?? record?.norad_id ?? record?.NORAD_CAT_ID ??
        record?.element_set?.omm?.NORAD_CAT_ID;
    try {
        return normalizeNoradId(value);
    } catch {
        return null;
    }
}

export async function validateGpCatalogForDisplay(records, metadata, options = {}) {
    const sourceRecords = Array.isArray(records) ? records : [];
    const referenceTime = normalizeUtcInstant(
        options.reference_time ?? options.referenceTime ?? options.now?.() ?? new Date(),
        'catalog reference time'
    );
    const provenance = await buildGpDatasetProvenance(sourceRecords, metadata, {
        ...options,
        reference_time: referenceTime
    });
    const satelliteLib = options.satelliteLib ?? options.satellite_lib ?? globalThis.satellite;
    const accepted = [];
    const quarantine = [];

    for (const [sourceIndex, record] of sourceRecords.entries()) {
        if (orbitalRecordFormat(record) === 'TLE') {
            const validated = await validateTleCatalogForDisplay([record], metadata, {
                ...options,
                reference_time: referenceTime,
                provenance_override: provenance
            });
            if (validated.records.length) {
                accepted.push({ ...validated.records[0], sourceIndex });
            } else {
                quarantine.push(Object.freeze({
                    source_index: sourceIndex,
                    norad_id: recordNoradId(record),
                    format: 'TLE',
                    reason_codes: Object.freeze(
                        validated.snapshot?.quarantine?.[0]?.reason_codes ?? ['TLE_RECORD_INVALID']
                    )
                }));
            }
            continue;
        }

        try {
            if (!satelliteLib?.json2satrec) throw Object.assign(
                new Error('satellite.js with json2satrec is required for OMM.'),
                { code: 'OMM_LIBRARY_UNAVAILABLE' }
            );
            const bundle = parseCcsdsOmmJson(canonicalOmmInput(record), { source: provenance });
            const catalogObject = inheritDisplayClassifications(bundle.records[0], record);
            const satrec = satelliteLib.json2satrec(catalogObject.element_set.omm);
            if (!validInitializedSatrec(satrec)) {
                throw Object.assign(new Error('OMM SGP4 initialization failed.'), { code: 'OMM_SGP4_INITIALIZATION_FAILED' });
            }
            accepted.push({ ...record, catalogObject, sourceIndex });
        } catch (error) {
            quarantine.push(Object.freeze({
                source_index: sourceIndex,
                norad_id: recordNoradId(record),
                format: 'OMM',
                reason_codes: Object.freeze([String(error?.code || 'OMM_RECORD_INVALID')]),
                message: error?.message || String(error)
            }));
        }
    }

    const newestByNorad = new Map();
    for (const record of accepted) {
        const norad = recordNoradId(record);
        if (!norad) continue;
        const current = newestByNorad.get(norad);
        if (!current || recordEpochMillis(record) > recordEpochMillis(current)) newestByNorad.set(norad, record);
    }
    const deduplicated = [];
    for (const record of accepted) {
        const norad = recordNoradId(record);
        if (!norad || newestByNorad.get(norad) === record) {
            deduplicated.push(record);
            continue;
        }
        quarantine.push(Object.freeze({
            source_index: record.sourceIndex,
            norad_id: norad,
            format: orbitalRecordFormat(record.catalogObject ?? record),
            reason_codes: Object.freeze(['DUPLICATE_OBJECT_ID']),
            message: 'A newer element epoch for this NORAD ID was retained.'
        }));
    }

    const recordsForDisplay = deduplicated.map(({ sourceIndex, ...record }) => record);
    const quality = mixedCatalogQuality(sourceRecords.length, recordsForDisplay, quarantine);
    const sourceStatus = metadataSourceStatus(metadata);
    const status = recordsForDisplay.length === 0
        ? 'INVALID'
        : quarantine.length || sourceStatus.partial_update
            ? 'PARTIAL'
            : sourceStatus.source_status === 'DEGRADED'
                ? 'DEGRADED'
                : 'VALID';
    const snapshot = Object.freeze({
        status,
        reference_time: referenceTime,
        provenance,
        objects: Object.freeze(recordsForDisplay.map(record => record.catalogObject)),
        accepted_record_indices: Object.freeze(deduplicated.map(record => record.sourceIndex)),
        quarantine: Object.freeze(quarantine),
        quality
    });
    return Object.freeze({
        result: Object.freeze({ valid: recordsForDisplay.length > 0, value: snapshot, issues: Object.freeze([]) }),
        snapshot,
        quality,
        records: Object.freeze(recordsForDisplay)
    });
}

export function getActiveCatalogValidationSnapshot() {
    return activeCatalogValidationSnapshot;
}

export function getActiveCatalogQualitySummary() {
    return activeCatalogQualitySummary;
}

export function getActiveCatalogKind() {
    return activeCatalogKind;
}

export function getLastCatalogValidationSnapshot() {
    return lastCatalogValidationSnapshot;
}

export function getLastCatalogQualitySummary() {
    return lastCatalogQualitySummary;
}

function getSatelliteLib(satelliteLib = globalThis.satellite) {
    if (!satelliteLib?.propagate) {
        throw new Error('satellite.js is required for orbit propagation.');
    }
    return satelliteLib;
}

export function classifyOrbitByPeriodMinutes(periodMinutes, satrec = null) {
    const meanMotionRevPerDay = Number.isFinite(periodMinutes) && periodMinutes > 0
        ? 1440 / periodMinutes
        : NaN;
    return orbitClassFromMeanMotion(meanMotionRevPerDay, {
        periodMinutes,
        eccentricity: satrec?.ecco,
        inclinationDeg: Number.isFinite(satrec?.inclo) ? radToDeg(satrec.inclo) : undefined
    });
}

export function getOrbitDurationMinutes(satrec) {
    const meanMotionRadPerMinute = Number(satrec?.no);
    const basePeriod = (2 * Math.PI) / meanMotionRadPerMinute;

    if (
        Number.isFinite(basePeriod) &&
        basePeriod >= MIN_VALID_ORBIT_PERIOD_MINUTES &&
        basePeriod <= MAX_VALID_ORBIT_PERIOD_MINUTES
    ) {
        return basePeriod;
    }

    return DEFAULT_ORBIT_PERIOD_MINUTES;
}

export function getOrbitSampleCount(periodMinutes, options = {}) {
    const {
        minSampleCount = MIN_ORBIT_SAMPLE_COUNT,
        maxSampleCount = MAX_ORBIT_SAMPLE_COUNT,
        minutesPerPoint = ORBIT_SAMPLE_MINUTES_PER_POINT
    } = options;

    if (!Number.isFinite(periodMinutes) || periodMinutes <= 0) {
        return minSampleCount;
    }

    return Math.max(
        minSampleCount,
        Math.min(maxSampleCount, Math.ceil(periodMinutes / minutesPerPoint))
    );
}

export function getOrbitRefreshIntervalMillis(periodMinutes, sampleCount = getOrbitSampleCount(periodMinutes)) {
    const sampleIntervalMillis = periodMinutes * 60_000 / Math.max(1, sampleCount);
    if (!Number.isFinite(sampleIntervalMillis) || sampleIntervalMillis <= 0) {
        return MIN_ORBIT_REFRESH_INTERVAL_MS;
    }

    return Math.max(
        MIN_ORBIT_REFRESH_INTERVAL_MS,
        Math.min(MAX_ORBIT_REFRESH_INTERVAL_MS, sampleIntervalMillis)
    );
}

export function isFiniteEciPosition(position) {
    return !!position &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y) &&
        Number.isFinite(position.z);
}

export function positionRadiusKm(position) {
    if (!isFiniteEciPosition(position)) return NaN;
    return Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
}

export function isUsableOrbitPosition(position, minRadiusKm = MIN_ORBIT_RADIUS_KM) {
    const radiusKm = positionRadiusKm(position);
    return Number.isFinite(radiusKm) && radiusKm >= minRadiusKm;
}

export function generateOrbitScenePointSegments(satrec, simDate = new Date(), options = {}) {
    if (!satrec) return [];

    const {
        numPoints = null,
        periodMinutes: providedPeriodMinutes = null,
        satelliteLib = globalThis.satellite,
        minRadiusKm = MIN_ORBIT_RADIUS_KM
    } = options;
    const satLib = getSatelliteLib(satelliteLib);
    const periodMinutes = Number.isFinite(providedPeriodMinutes) && providedPeriodMinutes > 0
        ? providedPeriodMinutes
        : getOrbitDurationMinutes(satrec);
    const sampleCount = Number.isInteger(numPoints) && numPoints > 0
        ? numPoints
        : getOrbitSampleCount(periodMinutes);
    const deltaT = periodMinutes / sampleCount;
    const startTime = new Date(simDate);
    const segments = [];
    let currentSegment = [];

    const finishSegment = () => {
        if (currentSegment.length > 1) {
            segments.push(currentSegment);
        }
        currentSegment = [];
    };

    for (let i = 0; i <= sampleCount; i++) {
        const t = new Date(startTime.getTime() + i * deltaT * 60000);
        const pv = satLib.propagate(satrec, t);
        if (!isUsableOrbitPosition(pv?.position, minRadiusKm)) {
            finishSegment();
            continue;
        }
        currentSegment.push(eciToSceneVector(new THREE.Vector3(), pv.position));
    }
    finishSegment();

    return segments;
}

export function generateOrbitScenePoints(satrec, simDate = new Date(), options = {}) {
    return generateOrbitScenePointSegments(satrec, simDate, options).flat();
}

export function nearestPointDistanceToOrbitSegments(point, segments) {
    if (!point || !Array.isArray(segments)) return null;

    let best = null;
    segments.forEach((segment, segmentIndex) => {
        if (!Array.isArray(segment)) return;
        segment.forEach((candidate, pointIndex) => {
            if (!candidate) return;
            const dx = (candidate.x ?? 0) - (point.x ?? 0);
            const dy = (candidate.y ?? 0) - (point.y ?? 0);
            const dz = (candidate.z ?? 0) - (point.z ?? 0);
            const distanceSceneUnits = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (!Number.isFinite(distanceSceneUnits)) return;
            if (!best || distanceSceneUnits < best.distanceSceneUnits) {
                best = {
                    distanceSceneUnits,
                    nearestPoint: candidate.clone ? candidate.clone() : { ...candidate },
                    segmentIndex,
                    pointIndex
                };
            }
        });
    });
    return best;
}

export function selectedOrbitNearestPointDistance(point) {
    return nearestPointDistanceToOrbitSegments(point, orbitLine?.userData?.sourceSegments || []);
}

export function isScenePointOccludedByEarth(
    point,
    cameraPosition,
    earthRadiusScene = EARTH_SCENE_RADIUS,
    radiusPadding = ORBIT_OCCLUSION_RADIUS_PADDING
) {
    if (!point || !cameraPosition) return false;

    const earthRadius = Math.max(0, earthRadiusScene + radiusPadding);
    const dx = point.x - cameraPosition.x;
    const dy = point.y - cameraPosition.y;
    const dz = point.z - cameraPosition.z;
    const a = dx * dx + dy * dy + dz * dz;
    if (!Number.isFinite(a) || a <= 0) return false;

    const b = 2 * (cameraPosition.x * dx + cameraPosition.y * dy + cameraPosition.z * dz);
    const c =
        cameraPosition.x * cameraPosition.x +
        cameraPosition.y * cameraPosition.y +
        cameraPosition.z * cameraPosition.z -
        earthRadius * earthRadius;
    const discriminant = b * b - 4 * a * c;
    if (!Number.isFinite(discriminant) || discriminant <= 0) return false;

    const sqrtDiscriminant = Math.sqrt(discriminant);
    const tEnter = (-b - sqrtDiscriminant) / (2 * a);
    const tExit = (-b + sqrtDiscriminant) / (2 * a);

    return (tEnter > 0 && tEnter < 1) || (tExit > 0 && tExit < 1);
}

export function splitOrbitSegmentsByEarthOcclusion(
    sourceSegments,
    cameraPosition,
    earthRadiusScene = EARTH_SCENE_RADIUS
) {
    if (!Array.isArray(sourceSegments) || !cameraPosition) return [];

    const visibleSegments = [];
    const finishSegment = (segment) => {
        if (segment.length > 1) visibleSegments.push(segment);
    };

    sourceSegments.forEach(sourceSegment => {
        let currentSegment = [];
        sourceSegment.forEach(point => {
            const occluded = isScenePointOccludedByEarth(point, cameraPosition, earthRadiusScene);
            if (occluded) {
                finishSegment(currentSegment);
                currentSegment = [];
            } else {
                currentSegment.push(point);
            }
        });
        finishSegment(currentSegment);
    });

    return visibleSegments;
}

function createOrbitLineMaterial() {
    return new THREE.LineBasicMaterial({
        color: 0xff0000,
        depthTest: true,
        depthWrite: true,
        transparent: false,
        opacity: 1
    });
}

function createOrbitLineSegment(points, material = createOrbitLineMaterial()) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    line.name = 'selectedOrbitTrajectory';
    line.renderOrder = 0;
    line.userData.depthOccludedByEarth = true;
    return line;
}

function trimOrbitLineChildren(group, targetCount) {
    if (!group?.children) return;
    while (group.children.length > targetCount) {
        const child = group.children[group.children.length - 1];
        group.remove(child);
        child.geometry?.dispose?.();
    }
}

export function refreshSelectedOrbitOcclusion(camera, options = {}) {
    if (!orbitLine?.userData?.sourceSegments || !camera?.position) return null;

    const {
        earthRadiusScene = EARTH_SCENE_RADIUS
    } = options;
    const cameraPosition = camera.position;
    const cameraSignature = [
        cameraPosition.x.toFixed(4),
        cameraPosition.y.toFixed(4),
        cameraPosition.z.toFixed(4),
        earthRadiusScene.toFixed(4)
    ].join('|');

    if (orbitLine.userData.occlusionCameraSignature === cameraSignature) {
        return orbitLine.userData.visibleSegments || null;
    }

    const visibleSegments = splitOrbitSegmentsByEarthOcclusion(
        orbitLine.userData.sourceSegments,
        cameraPosition,
        earthRadiusScene
    );
    const material = orbitLine.userData.material || createOrbitLineMaterial();
    orbitLine.userData.material = material;
    visibleSegments.forEach((segment, index) => {
        const existing = orbitLine.children[index];
        if (existing) {
            existing.geometry.setFromPoints(segment);
            existing.geometry.computeBoundingSphere();
        } else {
            orbitLine.add(createOrbitLineSegment(segment, material));
        }
    });
    trimOrbitLineChildren(orbitLine, visibleSegments.length);
    orbitLine.userData.occlusionCameraSignature = cameraSignature;
    orbitLine.userData.visibleSegments = visibleSegments;
    orbitLine.userData.visibleSegmentCount = visibleSegments.length;
    return visibleSegments;
}

function clearOrbitLine(scene) {
    if (typeof orbitLine !== 'undefined' && orbitLine) {
        scene?.remove?.(orbitLine);
        orbitLine.traverse?.(child => {
            child.geometry?.dispose?.();
        });
        orbitLine.userData?.material?.dispose?.();
        orbitLine.geometry?.dispose?.();
        if (Array.isArray(orbitLine.material)) {
            orbitLine.material.forEach(material => material?.dispose?.());
        } else {
            orbitLine.material?.dispose?.();
        }
        orbitLine = null;
    }
}

function orbitSatelliteKey(satData) {
    return [
        satData?.norad_id ?? '',
        satData?.satellite_name ?? ''
    ].join('|');
}

export function updateOrbitTrajectory(scene, simParams, satData, options = {}) {
    clearOrbitLine(scene);

    if (!simParams.showOrbit || !satData || !satData.satrec) return null;

    const simDate = simParams.simDate || new Date();
    const periodMinutes = getOrbitDurationMinutes(satData.satrec);
    const sampleCount = getOrbitSampleCount(periodMinutes);
    const orbitSegments = generateOrbitScenePointSegments(satData.satrec, simDate, {
        ...options,
        periodMinutes,
        numPoints: sampleCount
    });
    if (orbitSegments.length === 0) return null;

    orbitLine = new THREE.Group();
    orbitLine.name = 'selectedOrbitTrajectoryRoot';
    orbitLine.renderOrder = 0;
    orbitLine.userData.depthOccludedByEarth = true;
    orbitLine.userData.material = createOrbitLineMaterial();
    orbitLine.userData.sourceSegments = orbitSegments.map(segment => segment.map(point => point.clone()));
    orbitLine.userData.satelliteKey = orbitSatelliteKey(satData);
    orbitLine.userData.startTimeMs = new Date(simDate).getTime();
    orbitLine.userData.periodMinutes = periodMinutes;
    orbitLine.userData.sampleCount = sampleCount;
    orbitLine.userData.refreshIntervalMillis = getOrbitRefreshIntervalMillis(periodMinutes, sampleCount);
    orbitLine.userData.lastRefreshRealMs = Number.isFinite(options.realTimeMs)
        ? options.realTimeMs
        : (globalThis.performance?.now?.() ?? Date.now());
    orbitLine.userData.occlusionCameraSignature = '';

    scene.add(orbitLine);
    return orbitLine;
}

export function refreshOrbitTrajectoryIfNeeded(scene, simParams, satData, options = {}) {
    if (!simParams?.showOrbit || !satData?.satrec) return orbitLine;

    if (!orbitLine) {
        return updateOrbitTrajectory(scene, simParams, satData, options);
    }

    const simTimeMs = new Date(simParams.simDate || new Date()).getTime();
    const startTimeMs = orbitLine.userData?.startTimeMs;
    const refreshIntervalMillis = orbitLine.userData?.refreshIntervalMillis || MIN_ORBIT_REFRESH_INTERVAL_MS;
    const satelliteKey = orbitSatelliteKey(satData);
    const staleForSatellite = orbitLine.userData?.satelliteKey !== satelliteKey;
    const staleForTime = !Number.isFinite(startTimeMs) ||
        Math.abs(simTimeMs - startTimeMs) >= refreshIntervalMillis;

    if (staleForSatellite) {
        return updateOrbitTrajectory(scene, simParams, satData, options);
    }

    if (staleForTime) {
        const timeWarp = Number(simParams.timeWarp);
        const running = Number.isFinite(timeWarp) && timeWarp !== 0;
        const realTimeMs = Number.isFinite(options.realTimeMs)
            ? options.realTimeMs
            : (globalThis.performance?.now?.() ?? Date.now());
        const lastRefreshRealMs = orbitLine.userData?.lastRefreshRealMs;
        const runningRefreshRealMillis = Math.max(
            100,
            options.runningRefreshRealMillis ?? MIN_RUNNING_ORBIT_REFRESH_REAL_MS
        );
        if (running && Number.isFinite(lastRefreshRealMs) &&
            realTimeMs - lastRefreshRealMs < runningRefreshRealMillis) {
            return orbitLine;
        }

        const periodMinutes = getOrbitDurationMinutes(satData.satrec);
        const sampleCount = getOrbitSampleCount(periodMinutes);
        const orbitSegments = generateOrbitScenePointSegments(satData.satrec, new Date(simTimeMs), {
            ...options,
            periodMinutes,
            numPoints: sampleCount
        });
        if (orbitSegments.length === 0) return orbitLine;

        orbitLine.userData.sourceSegments = orbitSegments.map(segment => segment.map(point => point.clone()));
        orbitLine.userData.startTimeMs = simTimeMs;
        orbitLine.userData.periodMinutes = periodMinutes;
        orbitLine.userData.sampleCount = sampleCount;
        orbitLine.userData.refreshIntervalMillis = getOrbitRefreshIntervalMillis(periodMinutes, sampleCount);
        orbitLine.userData.lastRefreshRealMs = realTimeMs;
        orbitLine.userData.occlusionCameraSignature = '';
        orbitLine.userData.visibleSegments = null;
    }

    return orbitLine;
}

async function processSatellites(scene, catalogData, baseMaterial, options = {}) {
    const {
        chunkSize = 300,
        onProgress = null,
        onCatalogChunk = null,
        priorityRecordPredicate = null,
        schedulerOptions = { timeout: 16 },
        satelliteLib = globalThis.satellite
    } = options;
    if (!Array.isArray(catalogData) || catalogData.length === 0) {
        console.warn("No orbital catalog data to process.");
        return satellites;
    }
    if (!baseMaterial) {
        throw new Error('Base material for satellites is not available.');
    }
    if (!satelliteLib?.propagate) {
        throw new Error('satellite.js with orbit propagation is required to process the validated catalog.');
    }

    satellites.forEach(s => {
        if (s.mesh) scene.remove(s.mesh);
    });
    removeSatellitePointCloud(scene);
    satellites.length = 0;
    createSatellitePointCloud(scene, catalogData.length, baseMaterial);

    let processingOrder = catalogData;
    if (typeof priorityRecordPredicate === 'function') {
        const prioritized = [];
        const remaining = [];
        catalogData.forEach(item => {
            if (priorityRecordPredicate(item)) prioritized.push(item);
            else remaining.push(item);
        });
        processingOrder = prioritized.concat(remaining);
    }

    await processInChunks(processingOrder, (item) => {
        const {company, satellite_name, norad_id, type, launch_date, catalogObject} = item;
        const elementSet = catalogObject?.element_set ?? item.element_set ?? item.elementSet ?? null;
        const format = String(elementSet?.format ?? orbitalRecordFormat(item)).trim().toUpperCase();
        const tle_line1 = elementSet?.line1 ?? item.tle_line1 ?? item.tleLine1 ?? item.TLE_LINE1 ?? null;
        const tle_line2 = elementSet?.line2 ?? item.tle_line2 ?? item.tleLine2 ?? item.TLE_LINE2 ?? null;
        const catalogOrbitClass = String(catalogObject?.orbit_class ?? '').trim().toUpperCase();
        const resolvedOrbitClass = catalogOrbitClass && !['UNKNOWN', 'N/A'].includes(catalogOrbitClass)
            ? catalogOrbitClass
            : (item.orbit_class || type || catalogOrbitClass || 'UNKNOWN');
        try {
            let satrec;
            if (format === 'OMM') {
                if (!satelliteLib.json2satrec || !elementSet?.omm) {
                    throw new Error('satellite.js json2satrec and canonical OMM fields are required.');
                }
                satrec = satelliteLib.json2satrec(elementSet.omm);
            } else {
                if (!satelliteLib.twoline2satrec || !tle_line1 || !tle_line2) {
                    throw new Error('satellite.js twoline2satrec and both TLE lines are required.');
                }
                satrec = satelliteLib.twoline2satrec(tle_line1, tle_line2);
            }
            if (!validInitializedSatrec(satrec)) throw new Error(`${format} SGP4 initialization failed.`);

            const markerProxy = new THREE.Object3D();
            markerProxy.material = baseMaterial;
            markerProxy.scale.set(...(satelliteConfig.scale || [0.1, 0.1, 0.1]));
            markerProxy.visible = false;
            markerProxy.userData.filterVisible = false;
            markerProxy.userData.positionReady = false;

            satellites.push({
                mesh: markerProxy,
                satrec,
                orbitType: resolvedOrbitClass,
                company: company || "N/A",
                satellite_name: satellite_name || `NORAD ${norad_id}`,
                norad_id: catalogObject?.norad_id ?? norad_id,
                object_id: catalogObject?.object_id ?? item.object_id ?? null,
                international_designator: catalogObject?.international_designator ?? item.international_designator ?? null,
                object_type: catalogObject?.object_type ?? item.object_type ?? 'UNKNOWN',
                orbit_class: resolvedOrbitClass,
                lifecycle_status: catalogObject?.lifecycle_status ?? item.lifecycle_status ?? 'UNKNOWN',
                launch_date: launch_date || "N/A",
                launch_site: item.launch_site ?? item.LAUNCH_SITE ?? null,
                operational_status: item.operational_status ?? item.OPS_STATUS_CODE ?? null,
                decay_date: item.decay_date ?? item.DECAY_DATE ?? null,
                source_format: catalogObject?.source_format ?? item.source_format ?? (format === 'OMM' ? 'CCSDS_OMM_JSON' : 'TLE_JSON'),
                tle_line1: tle_line1,
                tle_line2: tle_line2,
                element_set: elementSet,
                provenance: catalogObject?.provenance ?? item.provenance ?? null,
                covariance: catalogObject?.covariance ?? item.covariance ?? null,
                hard_body_radius_km: catalogObject?.hard_body_radius_km ?? item.hard_body_radius_km ?? null,
                quality_flags: catalogObject?.quality_flags ?? item.quality_flags ?? [],
                catalogObject: catalogObject ?? null,
                motionPositionReady: false,
                isSelected: false
            });
        } catch (e) {
            console.error(`Error processing ${format} for ${satellite_name || norad_id} (NORAD: ${norad_id}): ${e.message}`);
        }
    }, {
        chunkSize,
        afterChunk: progress => {
            if (typeof onProgress === 'function') onProgress(progress);
            if (typeof onCatalogChunk === 'function') {
                onCatalogChunk({ ...progress, loadedSatellites: satellites });
            }
        },
        schedulerOptions
    });
    console.log(`${satellites.length} satellites processed and added to the scene.`);
    return satellites;
}


export async function setupTLESatellites(scene, options = {}) {
    const {
        gpDataOverride = null,
        gpMetaOverride = null,
        tleDataOverride = null,
        tleMetaOverride = null,
        gpDataSource = null,
        tleDataSource = 'local files',
        satelliteMaterialOverride = null,
        satelliteIconTextureLoader = textureLoader
    } = options;
    const catalogRuntimePolicy = resolveCatalogRuntimePolicy(options);
    const GP_BASE_URL = 'json/gp/';
    const TLE_BASE_URL = 'json/tle/';
    console.log('Attempting to load GP/OMM data from:', GP_BASE_URL);
    const primaryGpUrl = GP_BASE_URL + 'GP.json';
    const primaryTleUrl = TLE_BASE_URL + 'TLE.json';
    const catalogFetchOptions = options.forceCatalogRefresh ? { cache: 'no-store' } : {};
    const fetchCatalogJson = (url) => fetchJSON(url, catalogFetchOptions);

    try {
        let catalogData = null;
        let catalogKind = 'GP';
        const catalogDataSource = gpDataSource || tleDataSource;
        if (Array.isArray(gpDataOverride) && gpDataOverride.length > 0) {
            catalogData = gpDataOverride;
        } else if (Array.isArray(tleDataOverride) && tleDataOverride.length > 0) {
            catalogData = tleDataOverride;
            catalogKind = 'TLE';
        } else {
            catalogData = await fetchCatalogJson(primaryGpUrl);
            if (!Array.isArray(catalogData) || catalogData.length === 0) {
                console.warn(`GP catalog ${primaryGpUrl} is unavailable; using the deprecated TLE fallback.`);
                catalogData = await fetchCatalogJson(primaryTleUrl);
                catalogKind = 'TLE';
            }
        }
        if ((Array.isArray(gpDataOverride) && gpDataOverride.length > 0) ||
            (Array.isArray(tleDataOverride) && tleDataOverride.length > 0)) {
            console.info(`Using ${catalogData.length} ${catalogKind} records from ${catalogDataSource}.`);
        }

        if (!Array.isArray(catalogData) || catalogData.length === 0) {
            if (catalogRuntimePolicy.allow_remote_catalog_fallback) {
                const backupGpUrl = GITHUB_REPO_RAW_BASE_URL + 'json/gp/GP.json';
                console.log('Attempting backup GP catalog from GitHub:', backupGpUrl);
                catalogData = await fetchCatalogJson(backupGpUrl);
                if (!Array.isArray(catalogData) || catalogData.length === 0) {
                    const backupTleUrl = GITHUB_REPO_RAW_BASE_URL + 'json/tle/TLE.json';
                    catalogData = await fetchCatalogJson(backupTleUrl);
                    catalogKind = 'TLE';
                }
            } else if (catalogRuntimePolicy.packaged_catalog_required) {
                console.error('Packaged GP and TLE catalogs are unavailable; static deployment prohibits remote fallback.');
            }
            if (!Array.isArray(catalogData) || catalogData.length === 0) {
                const userMessage = catalogRuntimePolicy.packaged_catalog_required
                    ? 'Critical Error: The packaged satellite catalog is missing or invalid. Remote fallback is disabled for static deployment.'
                    : 'Critical Error: Failed to load satellite GP or TLE data from all available sources. Satellites will not be displayed.';
                console.error(userMessage);
                if (options.throwOnFailure) throw new Error(userMessage);
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = "position:fixed; top:10px; left:10px; padding:10px; background:red; color:white; z-index:1000;";
                errorDiv.innerText = userMessage;
                document.body.appendChild(errorDiv);
                await processSatellites(scene, [], null, options);
                return satellites;
            }
        }

        const validationOptions = {
            ...options,
            reference_time: options.catalogReferenceTime ?? options.referenceTime ?? options.now?.() ?? new Date()
        };
        const validateCatalogCandidate = async (kind, records) => {
            const metadata = kind === 'GP'
                ? (gpMetaOverride !== null ? gpMetaOverride : await fetchCatalogJson(GP_BASE_URL + 'GP.meta.json'))
                : (tleMetaOverride !== null ? tleMetaOverride : await fetchCatalogJson(TLE_BASE_URL + 'TLE.meta.json'));
            return validateGpCatalogForDisplay(records, metadata, validationOptions);
        };
        const logCatalogValidation = (kind, sourceRecords, validation) => {
            if (validation.snapshot?.quarantine.length > 0) {
                console.warn(
                    `${kind} catalog validation quarantined ${validation.snapshot.quarantine.length} of ${sourceRecords.length} records.`,
                    validation.quality.quarantine_reason_counts
                );
            }
            console.info(
                `${kind} catalog ${validation.snapshot?.status || 'INVALID'}: ${validation.records.length} accepted, ` +
                `${validation.snapshot?.quarantine.length || 0} quarantined.`
            );
        };

        let catalogValidation = await validateCatalogCandidate(catalogKind, catalogData);
        logCatalogValidation(catalogKind, catalogData, catalogValidation);
        if (catalogKind === 'GP' && catalogValidation.records.length === 0) {
            console.warn('GP catalog contains no usable records; attempting the deprecated TLE fallback.');
            const fallbackData = Array.isArray(tleDataOverride) && tleDataOverride.length > 0
                ? tleDataOverride
                : await fetchCatalogJson(primaryTleUrl);
            if (Array.isArray(fallbackData) && fallbackData.length > 0) {
                const fallbackValidation = await validateCatalogCandidate('TLE', fallbackData);
                logCatalogValidation('TLE', fallbackData, fallbackValidation);
                if (fallbackValidation.records.length > 0) {
                    catalogData = fallbackData;
                    catalogKind = 'TLE';
                    catalogValidation = fallbackValidation;
                }
            }
        }
        lastCatalogValidationSnapshot = catalogValidation.snapshot;
        lastCatalogQualitySummary = catalogValidation.quality;
        if (!catalogValidation.snapshot) {
            throw new Error('GP/TLE catalog validation could not produce a snapshot.');
        }
        catalogData = catalogValidation.records;
        if (catalogData.length === 0) {
            const error = new Error('GP and TLE catalogs contain no usable records; preserving the last known good satellite catalog.');
            console.error(error.message);
            if (options.throwOnFailure) throw error;
            return satellites;
        }

        const configuredIconAsset = satelliteConfig.icon || DEFAULT_SATELLITE_ICON_ASSET;
        const satIconFullUrl = getFullGitHubUrl(configuredIconAsset, GITHUB_REPO_RAW_BASE_URL);
        let satMaterial = satelliteMaterialOverride;

        if (!satMaterial && !satIconFullUrl) {
            console.error("3D Satellite icon path is null (check satelliteConfig.icon). Using placeholder material.");
            const placeholderCanvas = document.createElement('canvas');
            placeholderCanvas.width = 32;
            placeholderCanvas.height = 32;
            const ctx = placeholderCanvas.getContext('2d');
            ctx.fillStyle = 'red';
            ctx.fillRect(0, 0, 32, 32);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('S', 16, 16);
            const placeholderTexture = new THREE.CanvasTexture(placeholderCanvas);
            placeholderTexture.userData.openbexiOwned = true;
            placeholderTexture.userData.openbexiPointMarkerSource = 'procedural-fallback';
            satMaterial = new THREE.SpriteMaterial({map: placeholderTexture});
            satMaterial.userData.openbexiPointMarkerSource = 'procedural-fallback';
        } else if (!satMaterial) {
            let requestedIconTexture = null;
            requestedIconTexture = satelliteIconTextureLoader.load(
                satIconFullUrl,
                () => {
                    console.log("3D Satellite icon loaded from:", satIconFullUrl);
                },
                undefined,
                (err) => {
                    console.error('Error loading 3D satellite icon from:', satIconFullUrl, err, '. Using placeholder.');
                    if (satMaterial) {
                        satMaterial.map = null;
                        satMaterial.color?.set?.(0xff3333);
                        satMaterial.needsUpdate = true;
                    }
                    replaceFailedPointIcon(requestedIconTexture);
                }
            );
            requestedIconTexture.name = 'openbexiSatelliteIcon';
            requestedIconTexture.userData.openbexiOwned = true;
            requestedIconTexture.userData.openbexiPointMarkerSource = 'asset';
            requestedIconTexture.userData.openbexiAssetPath = configuredIconAsset.replace(/^\//, '');
            requestedIconTexture.userData.openbexiResolvedUrl = satIconFullUrl;
            satMaterial = new THREE.SpriteMaterial({ map: requestedIconTexture });
            satMaterial.userData.openbexiPointMarkerSource = 'asset';
            satMaterial.userData.openbexiIconAssetPath = requestedIconTexture.userData.openbexiAssetPath;
        }
        if (!satelliteMaterialOverride) satMaterial.userData.openbexiOwned = true;
        const loadedSatellites = await processSatellites(scene, catalogData, satMaterial, options);
        activeCatalogValidationSnapshot = catalogValidation.snapshot;
        activeCatalogQualitySummary = catalogValidation.quality;
        activeCatalogKind = catalogKind;
        return loadedSatellites;

    } catch (err) {
        console.error("Error in setupTLESatellites (fetching/processing GP/TLE catalog):", err);
        const userMessage = "Error setting up satellite data. Some satellites may not display correctly. Check console for details.";
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = "position:fixed; top:10px; left:10px; padding:10px; background:orange; color:black; z-index:1000;";
        errorDiv.innerText = userMessage;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 7000);
        await processSatellites(scene, [], null, options);
        if (options.throwOnFailure) throw err;
        return satellites;
    }
}

export const setupGPSatellites = setupTLESatellites;

export function removeAllGeometry(scene) {
    clearOrbitLine(scene);
}
