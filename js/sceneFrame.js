import * as THREE from 'three';
import { EARTH_SCENE_RADIUS, KM_TO_SCENE_UNITS } from './SatelliteConstantLoader.js';

export const SCENE_FRAME_DESCRIPTION =
    'Scene coordinates use inertial ECI axes with Three.js Y/Z swapped: scene = (ECI.x, ECI.z, ECI.y) * scale. Earth-fixed ECF geometry is swapped the same way, then rotated about scene Y by -GMST.';

export function normalizeRadians(angleRad) {
    const twoPi = Math.PI * 2;
    return ((angleRad % twoPi) + twoPi) % twoPi;
}

export function julianDayFromDate(date) {
    return date.valueOf() / 86400000 + 2440587.5;
}

export function gmstFromJulianDay(jd) {
    const t = (jd - 2451545.0) / 36525.0;
    let gmstDeg = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
        + 0.000387933 * t * t - (t * t * t) / 38710000;
    gmstDeg = ((gmstDeg % 360) + 360) % 360;
    return normalizeRadians(gmstDeg * Math.PI / 180);
}

export function gmstFromDate(date, satelliteLib = globalThis.satellite) {
    const jd = julianDayFromDate(date);
    if (satelliteLib?.gstime) {
        return normalizeRadians(satelliteLib.gstime(jd));
    }
    return gmstFromJulianDay(jd);
}

export function eciToEcfKm(eciKm, gmstRad) {
    const cosG = Math.cos(gmstRad);
    const sinG = Math.sin(gmstRad);
    return {
        x: eciKm.x * cosG + eciKm.y * sinG,
        y: -eciKm.x * sinG + eciKm.y * cosG,
        z: eciKm.z
    };
}

export function sceneCoordinatesFromEciKm(eciKm, scale = KM_TO_SCENE_UNITS) {
    return {
        x: eciKm.x * scale,
        y: eciKm.z * scale,
        z: eciKm.y * scale
    };
}

export function sceneCoordinatesFromEcfKm(ecfKm, rotYRad, scale = KM_TO_SCENE_UNITS) {
    const sx = ecfKm.x * scale;
    const sy = ecfKm.z * scale;
    const sz = ecfKm.y * scale;
    const cosR = Math.cos(rotYRad);
    const sinR = Math.sin(rotYRad);

    return {
        x: sx * cosR + sz * sinR,
        y: sy,
        z: sz * cosR - sx * sinR
    };
}

export function sceneCoordinatesFromEciViaEcfKm(eciKm, gmstRad, scale = KM_TO_SCENE_UNITS) {
    return sceneCoordinatesFromEcfKm(eciToEcfKm(eciKm, gmstRad), -gmstRad, scale);
}

export function setVector3(out, coords) {
    if (out?.set) {
        return out.set(coords.x, coords.y, coords.z);
    }
    if (out) {
        out.x = coords.x;
        out.y = coords.y;
        out.z = coords.z;
    }
    return out;
}

export function eciToSceneVector(out, eciKm, scale = KM_TO_SCENE_UNITS) {
    return setVector3(out, sceneCoordinatesFromEciKm(eciKm, scale));
}

export function ecfToSceneVector(out, ecfKm, rotYRad, scale = KM_TO_SCENE_UNITS) {
    return setVector3(out, sceneCoordinatesFromEcfKm(ecfKm, rotYRad, scale));
}

export function isFiniteVector3Like(value) {
    return !!value &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        Number.isFinite(value.z);
}

export function distanceFromOrigin(value) {
    return Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
}

export const SELECTED_SATELLITE_OBSERVER_MIN_METERS = 75;
export const SELECTED_SATELLITE_OBSERVER_MAX_METERS = 100;
export const SELECTED_SATELLITE_OBSERVER_TARGET_METERS = 100;
export const SELECTED_SATELLITE_EARTH_FACING_AXIS = Object.freeze({ x: 0, y: 0, z: 1 });
export const SELECTED_SATELLITE_MODEL_AXIS_NOTE =
    'The selected satellite view treats the model local +Z axis as the Earth-facing/nadir axis.';

export function metersToSceneUnits(meters, scale = KM_TO_SCENE_UNITS) {
    if (!Number.isFinite(meters)) return 0;
    return (meters / 1000) * scale;
}

export function resolveSelectedSatelliteObserverDistance({
    requestedMeters = SELECTED_SATELLITE_OBSERVER_TARGET_METERS,
    modelDiameterSceneUnits = 0,
    cameraNearSceneUnits = 0.1,
    earthRadiusSceneUnits = EARTH_SCENE_RADIUS,
    earthContextDistanceSceneUnits = Math.max(0, earthRadiusSceneUnits) * 0.035
} = {}) {
    const clampedMeters = Math.min(
        SELECTED_SATELLITE_OBSERVER_MAX_METERS,
        Math.max(SELECTED_SATELLITE_OBSERVER_MIN_METERS, requestedMeters)
    );
    const physicalDistanceSceneUnits = metersToSceneUnits(clampedMeters);
    const readableDistanceSceneUnits = Math.max(
        Math.max(0, modelDiameterSceneUnits) * 2.5,
        Math.max(0, cameraNearSceneUnits) * 3,
        Math.max(0, earthContextDistanceSceneUnits)
    );
    const observerDistanceSceneUnits = Math.max(
        physicalDistanceSceneUnits,
        readableDistanceSceneUnits
    );

    return {
        requestedMeters: clampedMeters,
        physicalDistanceSceneUnits,
        readableDistanceSceneUnits,
        observerDistanceSceneUnits,
        approximationUsed: observerDistanceSceneUnits > physicalDistanceSceneUnits
    };
}

export function selectedSatelliteCameraFrame(satellitePositionScene, {
    earthCenterScene = { x: 0, y: 0, z: 0 },
    requestedMeters = SELECTED_SATELLITE_OBSERVER_TARGET_METERS,
    modelDiameterSceneUnits = 0,
    cameraNearSceneUnits = 0.1,
    earthRadiusSceneUnits = EARTH_SCENE_RADIUS,
    earthContextDistanceSceneUnits = Math.max(0, earthRadiusSceneUnits) * 0.035
} = {}) {
    if (!isFiniteVector3Like(satellitePositionScene) || !isFiniteVector3Like(earthCenterScene)) {
        return null;
    }

    const outward = {
        x: satellitePositionScene.x - earthCenterScene.x,
        y: satellitePositionScene.y - earthCenterScene.y,
        z: satellitePositionScene.z - earthCenterScene.z
    };
    const outwardLength = distanceFromOrigin(outward);
    if (!Number.isFinite(outwardLength) || outwardLength === 0) return null;

    const unitOutward = {
        x: outward.x / outwardLength,
        y: outward.y / outwardLength,
        z: outward.z / outwardLength
    };
    const distance = resolveSelectedSatelliteObserverDistance({
        requestedMeters,
        modelDiameterSceneUnits,
        cameraNearSceneUnits,
        earthRadiusSceneUnits,
        earthContextDistanceSceneUnits
    });

    return {
        target: { ...satellitePositionScene },
        position: {
            x: satellitePositionScene.x + unitOutward.x * distance.observerDistanceSceneUnits,
            y: satellitePositionScene.y + unitOutward.y * distance.observerDistanceSceneUnits,
            z: satellitePositionScene.z + unitOutward.z * distance.observerDistanceSceneUnits
        },
        unitOutward,
        ...distance
    };
}

function axisObjectToVector3(axis) {
    return new THREE.Vector3(axis?.x ?? 0, axis?.y ?? 0, axis?.z ?? 1).normalize();
}

function setQuaternionFromUnitVectors(out, from, to) {
    const eps = 1e-12;
    let r = from.x * to.x + from.y * to.y + from.z * to.z + 1;

    if (r < eps) {
        r = 0;
        if (Math.abs(from.x) > Math.abs(from.z)) {
            out.x = -from.y;
            out.y = from.x;
            out.z = 0;
            out.w = r;
        } else {
            out.x = 0;
            out.y = -from.z;
            out.z = from.y;
            out.w = r;
        }
    } else {
        out.x = from.y * to.z - from.z * to.y;
        out.y = from.z * to.x - from.x * to.z;
        out.z = from.x * to.y - from.y * to.x;
        out.w = r;
    }

    return normalizeQuaternion(out);
}

function normalizeQuaternion(out) {
    const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z + out.w * out.w);
    if (!Number.isFinite(len) || len === 0) {
        out.x = 0;
        out.y = 0;
        out.z = 0;
        out.w = 1;
        return out;
    }
    out.x /= len;
    out.y /= len;
    out.z /= len;
    out.w /= len;
    return out;
}

function multiplyQuaternions(out, a, b) {
    const qax = a.x;
    const qay = a.y;
    const qaz = a.z;
    const qaw = a.w;
    const qbx = b.x;
    const qby = b.y;
    const qbz = b.z;
    const qbw = b.w;

    out.x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    out.y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    out.z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    out.w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    return normalizeQuaternion(out);
}

function setQuaternionFromEulerZYX(out, rollRad, pitchRad, yawRad) {
    const c1 = Math.cos(rollRad / 2);
    const c2 = Math.cos(pitchRad / 2);
    const c3 = Math.cos(yawRad / 2);
    const s1 = Math.sin(rollRad / 2);
    const s2 = Math.sin(pitchRad / 2);
    const s3 = Math.sin(yawRad / 2);

    out.x = s1 * c2 * c3 - c1 * s2 * s3;
    out.y = c1 * s2 * c3 + s1 * c2 * s3;
    out.z = c1 * c2 * s3 - s1 * s2 * c3;
    out.w = c1 * c2 * c3 + s1 * s2 * s3;
    return normalizeQuaternion(out);
}

export function nadirDirectionScene(satellitePositionScene, earthCenterScene = { x: 0, y: 0, z: 0 }) {
    if (!isFiniteVector3Like(satellitePositionScene) || !isFiniteVector3Like(earthCenterScene)) {
        return null;
    }

    const dir = new THREE.Vector3(
        earthCenterScene.x - satellitePositionScene.x,
        earthCenterScene.y - satellitePositionScene.y,
        earthCenterScene.z - satellitePositionScene.z
    );
    return dir.lengthSq() > 0 ? dir.normalize() : null;
}

export function nadirPointingQuaternion(out, satellitePositionScene, {
    earthCenterScene = { x: 0, y: 0, z: 0 },
    earthFacingAxis = SELECTED_SATELLITE_EARTH_FACING_AXIS,
    yawDeg = 0,
    pitchDeg = 0,
    rollDeg = 0
} = {}) {
    const nadir = nadirDirectionScene(satellitePositionScene, earthCenterScene);
    if (!nadir) return null;

    const modelAxis = axisObjectToVector3(earthFacingAxis);
    const base = setQuaternionFromUnitVectors(new THREE.Quaternion(), modelAxis, nadir);
    const bias = setQuaternionFromEulerZYX(new THREE.Quaternion(),
        THREE.MathUtils.degToRad(rollDeg || 0),
        THREE.MathUtils.degToRad(pitchDeg || 0),
        THREE.MathUtils.degToRad(yawDeg || 0)
    );
    const result = out || new THREE.Quaternion();
    return multiplyQuaternions(result, base, bias);
}
