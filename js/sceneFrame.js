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
export const SELECTED_MODEL_VIEWPORT_MIN_FRACTION = 0.35;
export const SELECTED_MODEL_VIEWPORT_MAX_FRACTION = 0.60;
export const SELECTED_MODEL_VIEWPORT_TARGET_FRACTION = 0.45;
export const STARLINK_OBLIQUE_OBSERVER_WEIGHTS = Object.freeze({
    antiNadir: 0.78,
    velocity: -0.32,
    crossTrack: 0.54
});
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
    earthContextDistanceSceneUnits = Math.max(0, earthRadiusSceneUnits) * 0.035,
    preservePhysicalDistance = false
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
    const observerDistanceSceneUnits = preservePhysicalDistance
        ? physicalDistanceSceneUnits
        : Math.max(physicalDistanceSceneUnits, readableDistanceSceneUnits);

    return {
        requestedMeters: clampedMeters,
        physicalDistanceSceneUnits,
        readableDistanceSceneUnits,
        observerDistanceSceneUnits,
        preservePhysicalDistance,
        approximationUsed: !preservePhysicalDistance && observerDistanceSceneUnits > physicalDistanceSceneUnits,
        readableFallbackSuppressed: preservePhysicalDistance && readableDistanceSceneUnits > physicalDistanceSceneUnits
    };
}

export function selectedModelViewportHeightFraction({
    modelDiameterSceneUnits = 0,
    observerDistanceSceneUnits = 0,
    cameraFovDeg = 45
} = {}) {
    const diameter = Math.max(0, modelDiameterSceneUnits);
    const distance = Math.max(0, observerDistanceSceneUnits);
    const fovRad = cameraFovDeg * Math.PI / 180;
    const visibleHeight = 2 * distance * Math.tan(fovRad / 2);
    if (!Number.isFinite(visibleHeight) || visibleHeight <= 0 || !Number.isFinite(diameter)) {
        return 0;
    }
    return diameter / visibleHeight;
}

export function resolveSelectedModelVisualScale({
    modelDiameterSceneUnits = 0,
    observerDistanceSceneUnits = metersToSceneUnits(SELECTED_SATELLITE_OBSERVER_TARGET_METERS),
    cameraFovDeg = 45,
    minViewportFraction = SELECTED_MODEL_VIEWPORT_MIN_FRACTION,
    maxViewportFraction = SELECTED_MODEL_VIEWPORT_MAX_FRACTION,
    targetViewportFraction = SELECTED_MODEL_VIEWPORT_TARGET_FRACTION
} = {}) {
    const currentViewportHeightFraction = selectedModelViewportHeightFraction({
        modelDiameterSceneUnits,
        observerDistanceSceneUnits,
        cameraFovDeg
    });
    const fovRad = cameraFovDeg * Math.PI / 180;
    const visibleHeight = 2 * Math.max(0, observerDistanceSceneUnits) * Math.tan(fovRad / 2);
    const targetDiameterSceneUnits = visibleHeight * targetViewportFraction;
    const inRange = currentViewportHeightFraction >= minViewportFraction &&
        currentViewportHeightFraction <= maxViewportFraction;
    const canScale = Number.isFinite(modelDiameterSceneUnits) &&
        modelDiameterSceneUnits > 0 &&
        Number.isFinite(targetDiameterSceneUnits) &&
        targetDiameterSceneUnits > 0;
    const scaleMultiplier = inRange || !canScale
        ? 1
        : targetDiameterSceneUnits / modelDiameterSceneUnits;
    const adjustedDiameterSceneUnits = modelDiameterSceneUnits * scaleMultiplier;
    const adjustedViewportHeightFraction = selectedModelViewportHeightFraction({
        modelDiameterSceneUnits: adjustedDiameterSceneUnits,
        observerDistanceSceneUnits,
        cameraFovDeg
    });

    return {
        minViewportFraction,
        maxViewportFraction,
        targetViewportFraction,
        currentViewportHeightFraction,
        targetDiameterSceneUnits,
        scaleMultiplier,
        adjustedDiameterSceneUnits,
        adjustedViewportHeightFraction,
        inRange,
        adjustedInRange: adjustedViewportHeightFraction >= minViewportFraction &&
            adjustedViewportHeightFraction <= maxViewportFraction
    };
}

export function selectedSatelliteCameraFrame(satellitePositionScene, {
    earthCenterScene = { x: 0, y: 0, z: 0 },
    requestedMeters = SELECTED_SATELLITE_OBSERVER_TARGET_METERS,
    modelDiameterSceneUnits = 0,
    cameraNearSceneUnits = 0.1,
    earthRadiusSceneUnits = EARTH_SCENE_RADIUS,
    earthContextDistanceSceneUnits = Math.max(0, earthRadiusSceneUnits) * 0.035,
    preservePhysicalDistance = false,
    observerDirectionScene = null
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
    const observerDirection = normalizeVectorLike(observerDirectionScene) || new THREE.Vector3(
        unitOutward.x,
        unitOutward.y,
        unitOutward.z
    );
    const distance = resolveSelectedSatelliteObserverDistance({
        requestedMeters,
        modelDiameterSceneUnits,
        cameraNearSceneUnits,
        earthRadiusSceneUnits,
        earthContextDistanceSceneUnits,
        preservePhysicalDistance
    });

    return {
        target: { ...satellitePositionScene },
        position: {
            x: satellitePositionScene.x + observerDirection.x * distance.observerDistanceSceneUnits,
            y: satellitePositionScene.y + observerDirection.y * distance.observerDistanceSceneUnits,
            z: satellitePositionScene.z + observerDirection.z * distance.observerDistanceSceneUnits
        },
        unitOutward,
        observerDirection: {
            x: observerDirection.x,
            y: observerDirection.y,
            z: observerDirection.z
        },
        ...distance
    };
}

export function selectedCameraFrameKeepsEarthInView(frame, {
    earthCenterScene = { x: 0, y: 0, z: 0 },
    earthRadiusSceneUnits = EARTH_SCENE_RADIUS,
    cameraFovDeg = 45,
    marginDeg = 0
} = {}) {
    if (!frame || !isFiniteVector3Like(frame.position) || !isFiniteVector3Like(frame.target) ||
        !isFiniteVector3Like(earthCenterScene)) {
        return false;
    }

    const view = {
        x: frame.target.x - frame.position.x,
        y: frame.target.y - frame.position.y,
        z: frame.target.z - frame.position.z
    };
    const toEarth = {
        x: earthCenterScene.x - frame.position.x,
        y: earthCenterScene.y - frame.position.y,
        z: earthCenterScene.z - frame.position.z
    };
    const viewLength = distanceFromOrigin(view);
    const earthDistance = distanceFromOrigin(toEarth);
    if (!Number.isFinite(viewLength) || viewLength === 0 ||
        !Number.isFinite(earthDistance) || earthDistance === 0) {
        return false;
    }

    const cosSeparation = Math.max(-1, Math.min(1, dotVectors(view, toEarth) / (viewLength * earthDistance)));
    const separationRad = Math.acos(cosSeparation);
    const earthAngularRadiusRad = Math.asin(Math.max(0, Math.min(1, earthRadiusSceneUnits / earthDistance)));
    const halfFovRad = Math.max(0, cameraFovDeg) * Math.PI / 360;
    const marginRad = Math.max(0, marginDeg) * Math.PI / 180;
    return separationRad <= halfFovRad + earthAngularRadiusRad - marginRad;
}

function dotVectors(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalizeVectorLike(value) {
    if (!isFiniteVector3Like(value)) return null;
    const v = new THREE.Vector3(value.x, value.y, value.z);
    return v.lengthSq() > 0 ? v.normalize() : null;
}

function vectorFromWeightedAxes(terms) {
    const v = new THREE.Vector3(0, 0, 0);
    terms.forEach(({ axis, weight }) => {
        if (!axis || !Number.isFinite(weight)) return;
        v.x += axis.x * weight;
        v.y += axis.y * weight;
        v.z += axis.z * weight;
    });
    return v.lengthSq() > 0 ? v.normalize() : null;
}

function projectOntoPlane(axis, planeNormal) {
    const dot = dotVectors(axis, planeNormal);
    const projected = new THREE.Vector3(
        axis.x - planeNormal.x * dot,
        axis.y - planeNormal.y * dot,
        axis.z - planeNormal.z * dot
    );
    return projected.lengthSq() > 0 ? projected.normalize() : null;
}

export function selectedSatelliteOrbitalFrame(satellitePositionScene, satelliteVelocityScene, {
    earthCenterScene = { x: 0, y: 0, z: 0 }
} = {}) {
    const zAxis = nadirDirectionScene(satellitePositionScene, earthCenterScene);
    const velocity = normalizeVectorLike(satelliteVelocityScene);
    if (!zAxis || !velocity) return null;

    const radialVelocity = dotVectors(velocity, zAxis);
    const xAxis = new THREE.Vector3(
        velocity.x - zAxis.x * radialVelocity,
        velocity.y - zAxis.y * radialVelocity,
        velocity.z - zAxis.z * radialVelocity
    );
    if (xAxis.lengthSq() === 0) return null;
    xAxis.normalize();

    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
    if (yAxis.lengthSq() === 0) return null;
    yAxis.normalize();

    const correctedX = new THREE.Vector3().crossVectors(yAxis, zAxis);
    if (correctedX.lengthSq() === 0) return null;
    correctedX.normalize();

    return {
        xAxis: correctedX,
        yAxis,
        zAxis,
        velocityAxis: velocity,
        isRightHanded: dotVectors(new THREE.Vector3().crossVectors(correctedX, yAxis), zAxis) > 0.999
    };
}

export function selectedSatelliteObliqueObserverDirection(
    orbitalFrame,
    weights = STARLINK_OBLIQUE_OBSERVER_WEIGHTS
) {
    if (!orbitalFrame?.xAxis || !orbitalFrame?.yAxis || !orbitalFrame?.zAxis) return null;
    return vectorFromWeightedAxes([
        { axis: orbitalFrame.zAxis, weight: -(weights.antiNadir ?? 0.78) },
        { axis: orbitalFrame.xAxis, weight: weights.velocity ?? -0.32 },
        { axis: orbitalFrame.yAxis, weight: weights.crossTrack ?? 0.54 }
    ]);
}

export function selectedSatelliteObliqueCameraUp(orbitalFrame, observerDirectionScene) {
    const observerDirection = normalizeVectorLike(observerDirectionScene);
    if (!observerDirection || !orbitalFrame?.zAxis || !orbitalFrame?.xAxis) return null;

    const antiNadir = new THREE.Vector3(
        -orbitalFrame.zAxis.x,
        -orbitalFrame.zAxis.y,
        -orbitalFrame.zAxis.z
    );
    let cameraUp = projectOntoPlane(antiNadir, observerDirection);
    if (!cameraUp && orbitalFrame.yAxis) {
        cameraUp = projectOntoPlane(orbitalFrame.yAxis, observerDirection);
    }
    if (!cameraUp) return null;

    const viewForward = new THREE.Vector3(
        -observerDirection.x,
        -observerDirection.y,
        -observerDirection.z
    ).normalize();
    const screenRight = new THREE.Vector3().crossVectors(viewForward, cameraUp).normalize();
    if (dotVectors(screenRight, orbitalFrame.xAxis) < 0) {
        cameraUp.multiplyScalar(-1);
    }
    return cameraUp.normalize();
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

function copyQuaternion(out, source) {
    out.x = source.x;
    out.y = source.y;
    out.z = source.z;
    out.w = source.w;
    return out;
}

function setQuaternionFromBasis(out, xAxis, yAxis, zAxis) {
    const m11 = xAxis.x, m12 = yAxis.x, m13 = zAxis.x;
    const m21 = xAxis.y, m22 = yAxis.y, m23 = zAxis.y;
    const m31 = xAxis.z, m32 = yAxis.z, m33 = zAxis.z;
    const trace = m11 + m22 + m33;

    if (trace > 0) {
        const s = 0.5 / Math.sqrt(trace + 1.0);
        out.w = 0.25 / s;
        out.x = (m32 - m23) * s;
        out.y = (m13 - m31) * s;
        out.z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
        const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
        out.w = (m32 - m23) / s;
        out.x = 0.25 * s;
        out.y = (m12 + m21) / s;
        out.z = (m13 + m31) / s;
    } else if (m22 > m33) {
        const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
        out.w = (m13 - m31) / s;
        out.x = (m12 + m21) / s;
        out.y = 0.25 * s;
        out.z = (m23 + m32) / s;
    } else {
        const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
        out.w = (m21 - m12) / s;
        out.x = (m13 + m31) / s;
        out.y = (m23 + m32) / s;
        out.z = 0.25 * s;
    }
    return normalizeQuaternion(out);
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

export function selectedSatelliteOrbitalFrameQuaternion(out, satellitePositionScene, satelliteVelocityScene, {
    earthCenterScene = { x: 0, y: 0, z: 0 },
    yawDeg = 0,
    pitchDeg = 0,
    rollDeg = 0,
    calibrationYawDeg = 0,
    calibrationPitchDeg = 0,
    calibrationRollDeg = 0
} = {}) {
    const frame = selectedSatelliteOrbitalFrame(satellitePositionScene, satelliteVelocityScene, {
        earthCenterScene
    });
    if (!frame) return null;

    const base = setQuaternionFromBasis(
        new THREE.Quaternion(),
        frame.xAxis,
        frame.yAxis,
        frame.zAxis
    );
    const calibration = setQuaternionFromEulerZYX(
        new THREE.Quaternion(),
        THREE.MathUtils.degToRad(calibrationRollDeg || 0),
        THREE.MathUtils.degToRad(calibrationPitchDeg || 0),
        THREE.MathUtils.degToRad(calibrationYawDeg || 0)
    );
    const bias = setQuaternionFromEulerZYX(new THREE.Quaternion(),
        THREE.MathUtils.degToRad(rollDeg || 0),
        THREE.MathUtils.degToRad(pitchDeg || 0),
        THREE.MathUtils.degToRad(yawDeg || 0)
    );
    const calibrated = multiplyQuaternions(new THREE.Quaternion(), base, calibration);
    const result = out || new THREE.Quaternion();
    return multiplyQuaternions(result, calibrated, bias);
}

export const __sceneFrameTestHooks = Object.freeze({
    dotVectors,
    copyQuaternion,
    setQuaternionFromBasis
});
