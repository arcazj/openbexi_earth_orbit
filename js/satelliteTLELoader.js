// js/satelliteTLELoader.js
// -----------------------------------------------------------
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
import { stableFingerprint } from './domain/objectIdentity.js';
import { normalizeDatasetProvenance } from './domain/contracts.js';
import { normalizeUtcInstant } from './domain/orbitalPolicy.js';
import { validateCatalog } from './domain/catalogValidation.js';

export let satellites = [];
export let activeCatalogValidationSnapshot = null;
export let activeCatalogQualitySummary = null;
export let lastCatalogValidationSnapshot = null;
export let lastCatalogQualitySummary = null;
let orbitLine = null;
export let usingLocalAssets = false;
let textureLoader = new THREE.TextureLoader();
const MIN_ORBIT_RADIUS_KM = EARTH_RADIUS_KM;
const ORBIT_OCCLUSION_RADIUS_PADDING = 0.002;
const DEFAULT_ORBIT_PERIOD_MINUTES = 96;
const MIN_VALID_ORBIT_PERIOD_MINUTES = 1;
const MAX_VALID_ORBIT_PERIOD_MINUTES = 45 * 24 * 60;
const MIN_ORBIT_SAMPLE_COUNT = 96;
const MAX_ORBIT_SAMPLE_COUNT = 720;
const ORBIT_SAMPLE_MINUTES_PER_POINT = 4;
const MIN_ORBIT_REFRESH_INTERVAL_MS = 60_000;
const MAX_ORBIT_REFRESH_INTERVAL_MS = 5 * 60_000;
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

function metadataSourceStatus(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return { source_status: 'DEGRADED', partial_update: false };
    }
    const status = String(metadata.last_status ?? '').trim().toLowerCase();
    const mode = String(metadata.mode ?? '').trim().toLowerCase();
    const rejected = Number(metadata.counts?.rejected ?? 0);
    const fetched = Number(metadata.counts?.fetched);
    const total = Number(metadata.counts?.total);
    const isIncremental = mode === 'incremental' || (
        Number.isFinite(fetched) && Number.isFinite(total) && fetched < total
    );
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

export async function validateTleCatalogForDisplay(records, metadata, options = {}) {
    const referenceTime = normalizeUtcInstant(
        options.reference_time ?? options.referenceTime ?? options.now?.() ?? new Date(),
        'catalog reference time'
    );
    const provenance = await buildTleDatasetProvenance(records, metadata, {
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

export function getActiveCatalogValidationSnapshot() {
    return activeCatalogValidationSnapshot;
}

export function getActiveCatalogQualitySummary() {
    return activeCatalogQualitySummary;
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

function createOrbitLineSegment(points) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: 0xff0000,
        depthTest: true,
        depthWrite: true,
        transparent: false,
        opacity: 1
    });
    const line = new THREE.Line(geometry, material);
    line.name = 'selectedOrbitTrajectory';
    line.renderOrder = 0;
    line.userData.depthOccludedByEarth = true;
    return line;
}

function disposeOrbitLineChildren(group) {
    if (!group?.children) return;
    while (group.children.length > 0) {
        const child = group.children[group.children.length - 1];
        group.remove(child);
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
            child.material.forEach(material => material?.dispose?.());
        } else {
            child.material?.dispose?.();
        }
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
    disposeOrbitLineChildren(orbitLine);
    visibleSegments.forEach(segment => orbitLine.add(createOrbitLineSegment(segment)));
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
            if (Array.isArray(child.material)) {
                child.material.forEach(material => material?.dispose?.());
            } else {
                child.material?.dispose?.();
            }
        });
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
    orbitLine.userData.sourceSegments = orbitSegments.map(segment => segment.map(point => point.clone()));
    orbitLine.userData.satelliteKey = orbitSatelliteKey(satData);
    orbitLine.userData.startTimeMs = new Date(simDate).getTime();
    orbitLine.userData.periodMinutes = periodMinutes;
    orbitLine.userData.sampleCount = sampleCount;
    orbitLine.userData.refreshIntervalMillis = getOrbitRefreshIntervalMillis(periodMinutes, sampleCount);
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

    if (staleForSatellite || staleForTime) {
        return updateOrbitTrajectory(scene, simParams, satData, options);
    }

    return orbitLine;
}

async function processSatellites(scene, tleData, baseMaterial, options = {}) {
    const {
        chunkSize = 300,
        onProgress = null,
        schedulerOptions = { timeout: 16 },
        satelliteLib = globalThis.satellite
    } = options;
    if (!Array.isArray(tleData) || tleData.length === 0) {
        console.warn("No TLE data to process.");
        if (typeof updateSatelliteList === "function") updateSatelliteList(); // Update UI
        return satellites;
    }
    if (!baseMaterial) {
        throw new Error('Base material for satellites is not available.');
    }
    if (!satelliteLib?.twoline2satrec) {
        throw new Error('satellite.js with twoline2satrec is required to process the validated catalog.');
    }

    // Commit only after the replacement catalog and rendering dependencies are ready.
    satellites.forEach(s => {
        if (s.mesh) scene.remove(s.mesh);
    });
    satellites.length = 0;

    await processInChunks(tleData, (item) => {
        const {company, satellite_name, norad_id, type, launch_date, catalogObject} = item;
        const tle_line1 = catalogObject?.element_set?.line1 ?? item.tle_line1 ?? item.tleLine1 ?? item.TLE_LINE1;
        const tle_line2 = catalogObject?.element_set?.line2 ?? item.tle_line2 ?? item.tleLine2 ?? item.TLE_LINE2;
        if (!tle_line1 || !tle_line2) {
            console.warn(`Skipping satellite ${satellite_name || norad_id}: missing TLE line1 or line2.`);
            return;
        }
        try {
            const satrec = satelliteLib.twoline2satrec(tle_line1, tle_line2);
            // Check for common error: epoch year. satellite.js might parse ' yyddd...' as 19yy if yy > 56.
            // Modern TLEs use 'yyddd...'. If satrec.epochyr < 2000 (and yy > 56), it's likely 20yy.
            // This is a heuristic. satellite.js handles most cases, but good to be aware.
            // No direct fix here, assuming satellite.js handles it.

            if (!satrec) { // satellite.js returns false if TLE is fundamentally invalid
                throw new Error("Failed to parse TLE (twoline2satrec returned false).");
            }


            const sprite = new THREE.Sprite(baseMaterial.clone()); // Clone material for individual control if needed
            sprite.scale.set(...(satelliteConfig.scale || [0.1, 0.1, 0.1]));
            scene.add(sprite);

            satellites.push({
                mesh: sprite, // The THREE.Sprite object
                satrec: satrec, // The parsed TLE data from satellite.js
                orbitType: catalogObject?.orbit_class || item.orbit_class || type || "N/A",
                company: company || "N/A",
                satellite_name: satellite_name || `NORAD ${norad_id}`, // Use NORAD ID if name is missing
                norad_id: catalogObject?.norad_id ?? norad_id,
                object_id: catalogObject?.object_id ?? item.object_id ?? null,
                international_designator: catalogObject?.international_designator ?? item.international_designator ?? null,
                object_type: catalogObject?.object_type ?? item.object_type ?? 'UNKNOWN',
                orbit_class: catalogObject?.orbit_class ?? item.orbit_class ?? type ?? 'UNKNOWN',
                lifecycle_status: catalogObject?.lifecycle_status ?? item.lifecycle_status ?? 'UNKNOWN',
                launch_date: launch_date || "N/A",
                tle_line1: tle_line1,
                tle_line2: tle_line2,
                element_set: catalogObject?.element_set ?? item.element_set ?? null,
                provenance: catalogObject?.provenance ?? item.provenance ?? null,
                covariance: catalogObject?.covariance ?? item.covariance ?? null,
                hard_body_radius_km: catalogObject?.hard_body_radius_km ?? item.hard_body_radius_km ?? null,
                quality_flags: catalogObject?.quality_flags ?? item.quality_flags ?? [],
                catalogObject: catalogObject ?? null,
                isSelected: false // Track selection state
            });
        } catch (e) {
            console.error(`Error processing TLE for ${satellite_name || norad_id} (NORAD: ${norad_id}): ${e.message}. TLE1: ${tle_line1}, TLE2: ${tle_line2}`);
            // Optionally, skip adding this satellite or add it with an error state
        }
    }, {
        chunkSize,
        afterChunk: onProgress,
        schedulerOptions
    });
    console.log(`${satellites.length} satellites processed and added to the scene.`);
    //if (typeof updateSatelliteList === "function") updateSatelliteList(); // Update UI elements
    return satellites;
}


export async function setupTLESatellites(scene, options = {}) {
    const {
        tleDataOverride = null,
        tleMetaOverride = null,
        tleDataSource = 'local files',
        satelliteMaterialOverride = null
    } = options;
    const catalogRuntimePolicy = resolveCatalogRuntimePolicy(options);
    let TLE_BASE_URL = "json/tle/";
    console.log("Attempting to load TLE data from:", TLE_BASE_URL);
    const primaryTleUrl = TLE_BASE_URL + 'TLE.json';

    try {
        let tleData = Array.isArray(tleDataOverride) && tleDataOverride.length > 0
            ? tleDataOverride
            : await fetchJSON(primaryTleUrl);
        if (Array.isArray(tleDataOverride) && tleDataOverride.length > 0) {
            console.info(`Using ${tleData.length} TLE records from ${tleDataSource}.`);
        }

        if (!Array.isArray(tleData) || tleData.length === 0) {
            //console.warn(`TLE data from ${primaryTleUrl} failed or is empty.`);
            if (catalogRuntimePolicy.allow_remote_catalog_fallback) {
                const backupTleUrl = GITHUB_REPO_RAW_BASE_URL + "json/tle/" + 'TLE.json'; // Assuming backup is in the same base
                console.log("Attempting backup TLE from GitHub:", backupTleUrl);
                tleData = await fetchJSON(backupTleUrl);
                if (!Array.isArray(tleData) || tleData.length === 0) {
                    console.warn(`Backup TLE data from ${backupTleUrl} also failed or is empty.`);
                } else {
                    console.log("Loaded TLE data from GitHub backup source.");
                }
            } else if (catalogRuntimePolicy.packaged_catalog_required) {
                console.error('Packaged TLE catalog is unavailable; static deployment prohibits remote fallback.');
            }
            // If still no data (either local failed, or both GitHub primary/backup failed)
            if (!Array.isArray(tleData) || tleData.length === 0) {
                const userMessage = catalogRuntimePolicy.packaged_catalog_required
                    ? 'Critical Error: The packaged satellite catalog is missing or invalid. Remote fallback is disabled for static deployment.'
                    : 'Critical Error: Failed to load satellite TLE data from all available sources. Satellites will not be displayed.';
                console.error(userMessage);
                // Display user-facing error
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = "position:fixed; top:10px; left:10px; padding:10px; background:red; color:white; z-index:1000;";
                errorDiv.innerText = userMessage;
                document.body.appendChild(errorDiv);
                // No need for setTimeout, this is a critical error.
                await processSatellites(scene, [], null, options); // Process with empty data
                return satellites;
            }
        }

        const tleMetadata = tleMetaOverride !== null
            ? tleMetaOverride
            : await fetchJSON(TLE_BASE_URL + 'TLE.meta.json');
        const catalogValidation = await validateTleCatalogForDisplay(tleData, tleMetadata, {
            ...options,
            reference_time: options.catalogReferenceTime ?? options.referenceTime ?? options.now?.() ?? new Date()
        });
        lastCatalogValidationSnapshot = catalogValidation.snapshot;
        lastCatalogQualitySummary = catalogValidation.quality;
        if (!catalogValidation.snapshot) {
            throw new Error('TLE catalog validation could not produce a snapshot.');
        }
        if (catalogValidation.snapshot.quarantine.length > 0) {
            console.warn(
                `TLE catalog validation quarantined ${catalogValidation.snapshot.quarantine.length} of ${tleData.length} records.`,
                catalogValidation.quality.quarantine_reason_counts
            );
        }
        tleData = catalogValidation.records;
        console.info(
            `TLE catalog ${catalogValidation.snapshot.status}: ${tleData.length} accepted, ` +
            `${catalogValidation.snapshot.quarantine.length} quarantined.`
        );
        if (tleData.length === 0) {
            return satellites;
        }

        const satIconFullUrl = getFullGitHubUrl('icons/ob_satellite.png', GITHUB_REPO_RAW_BASE_URL);
        let satMaterial = satelliteMaterialOverride;

        if (satMaterial) {
            // A material override keeps validation and processing independently testable.
        } else if (!satIconFullUrl) {
            console.error("3D Satellite icon path is null (check satelliteConfig.icon). Using placeholder material.");
            // Create a very simple placeholder material if texture path is null
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
            satMaterial = new THREE.SpriteMaterial({map: placeholderTexture});
        } else {
            satMaterial = new THREE.SpriteMaterial({
                map: textureLoader.load(satIconFullUrl,
                    () => { /* onLoad */
                        console.log("3D Satellite icon loaded from:", satIconFullUrl);
                    },
                    undefined, // onProgress
                    (err) => { // onError
                        console.error('Error loading 3D satellite icon from:', satIconFullUrl, err, '. Using placeholder.');
                        if (satMaterial) { // Ensure satMaterial exists
                            const errorPlaceholderUrl = 'https://placehold.co/32x32/ff0000/ffffff?text=S_ERR';
                            satMaterial.map = textureLoader.load(errorPlaceholderUrl); // Load placeholder
                            satMaterial.needsUpdate = true;
                        }
                    })
            });
        }
        const loadedSatellites = await processSatellites(scene, tleData, satMaterial, options);
        activeCatalogValidationSnapshot = catalogValidation.snapshot;
        activeCatalogQualitySummary = catalogValidation.quality;
        return loadedSatellites;

    } catch (err) {
        console.error("Error in setupTLESatellites (fetching/processing TLEs):", err);
        const userMessage = "Error setting up satellite data. Some satellites may not display correctly. Check console for details.";
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = "position:fixed; top:10px; left:10px; padding:10px; background:orange; color:black; z-index:1000;";
        errorDiv.innerText = userMessage;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 7000);
        await processSatellites(scene, [], null, options); // Attempt to continue with empty data
        return satellites;
    }
}

export function removeAllGeometry(scene) {
    clearOrbitLine(scene);
    // Add removal for other types of geometry if needed
}

export function getOrbitECIPoints(tleLine1, tleLine2, startTime, endTime, timeStepMinutes, satelliteLib = globalThis.satellite) {
    const satLib = getSatelliteLib(satelliteLib);
    const satrec = satLib.twoline2satrec(tleLine1, tleLine2);

    // Error handling for TLE parsing
    if (!satrec) {
        console.error("Error: Could not parse TLE data.");
        // Depending on application flow, might return null, an empty array, or throw an error
        return;
    }
    // Check for specific TLE parsing errors if satrec.error is populated by twoline2satrec
    // (Note: satellite.js typically sets satrec.error during propagation, not always during parsing)

    let orbitECIPoints = [];
    let currentTime = new Date(startTime.getTime()); // Create a mutable copy of startTime

    while (currentTime <= endTime) {
        // Propagate to the current time to get ECI position and velocity
        // The position is in ECI coordinates (TEME frame), in kilometers.
        const positionAndVelocity = satLib.propagate(satrec, currentTime);

        if (isUsableOrbitPosition(positionAndVelocity?.position)) {
            // Add the ECI position object {x, y, z} to our array
            orbitECIPoints.push(positionAndVelocity.position);
        } else {
            // Propagation might fail if, for example, the satellite has decayed
            // satrec.error provides a numerical code for the error type
            // (Refer to satellite.js documentation for SatRecError enum values)
            let errorMessage = "Propagation failed";
            if (satrec.error && satLib.SatRecError) { // Check if SatRecError enum exists
                // Attempt to get a string representation if available (not standard in satellite.js)
                // Or handle based on numeric satrec.error codes directly
                switch (satrec.error) {
                    case satLib.SatRecError.Ok: // Should not happen if positionAndVelocity is null/invalid
                        errorMessage = "Propagation OK but no position data.";
                        break;
                    case satLib.SatRecError.MeanElements:
                        errorMessage = "Propagation failed: Mean elements, check TLE.";
                        break;
                    case satLib.SatRecError.LockheedProp:
                        errorMessage = "Propagation failed: Lockheed propagator error.";
                        break;
                    case satLib.SatRecError.NearSingular:
                        errorMessage = "Propagation failed: Near singular elements.";
                        break;
                    case satLib.SatRecError.NoSupport:
                        errorMessage = "Propagation failed: No support for this TLE.";
                        break;
                    case satLib.SatRecError.Recovered:
                        errorMessage = "Propagation recovered but position might be suspect.";
                        // Decide if to include this point or not
                        break;
                    case satLib.SatRecError.Decayed:
                        errorMessage = `Satellite decayed at or before ${currentTime.toISOString()}. No further points will be generated.`;
                        console.warn(errorMessage);
                        // Optionally, break the loop if the satellite has decayed
                        // and no further valid points can be generated.
                        return orbitECIPoints; // Return points up to decay
                    default:
                        errorMessage = `Propagation failed with error code ${satrec.error}.`;
                }
            }
            console.warn(`Warning for satellite defined by TLE starting with "${tleLine1.substring(0, 20)}..." at ${currentTime.toISOString()}: ${errorMessage}`);
            // Depending on requirements, one might choose to break, continue, or push a null/special marker.
            // For a continuous orbit line, it's often better to stop generating points after a persistent failure.
        }

        // Increment current time by the time step
        currentTime.setMinutes(currentTime.getMinutes() + timeStepMinutes);
    }

    // Return the array of ECI coordinate points
    return orbitECIPoints;
}
