import {
    EARTH_RADIUS_KM,
    WGS84_A_KM,
    WGS84_B_KM,
    WGS84_F
} from '../SatelliteConstantLoader.js';

export { EARTH_RADIUS_KM, WGS84_A_KM, WGS84_B_KM, WGS84_F };
export const EARTH_ROTATION_RAD_PER_SEC = 7.2921159e-5;
export const WEB_MERCATOR_MAX_LAT_DEG = 85.05112878;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const WGS84_EP2 = (WGS84_A_KM * WGS84_A_KM - WGS84_B_KM * WGS84_B_KM) / (WGS84_B_KM * WGS84_B_KM);

export function degToRad(deg) {
    return deg * DEG_TO_RAD;
}

export function radToDeg(rad) {
    return rad * RAD_TO_DEG;
}

export function normalizeLongitudeDeg(lonDeg) {
    return ((lonDeg + 540) % 360) - 180;
}

export function clampWebMercatorLatDeg(latDeg) {
    return Math.max(-WEB_MERCATOR_MAX_LAT_DEG, Math.min(WEB_MERCATOR_MAX_LAT_DEG, latDeg));
}

export function geodeticToEcfKm(latDeg, lonDeg, altitudeKm = 0) {
    const lat = degToRad(latDeg);
    const lon = degToRad(lonDeg);
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const primeVerticalRadius = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

    return {
        x: (primeVerticalRadius + altitudeKm) * cosLat * Math.cos(lon),
        y: (primeVerticalRadius + altitudeKm) * cosLat * Math.sin(lon),
        z: (primeVerticalRadius * (1 - WGS84_E2) + altitudeKm) * sinLat
    };
}

export function eciToEcfKm(eciKm, gmstRad) {
    const cosGmst = Math.cos(gmstRad);
    const sinGmst = Math.sin(gmstRad);
    return {
        x: eciKm.x * cosGmst + eciKm.y * sinGmst,
        y: -eciKm.x * sinGmst + eciKm.y * cosGmst,
        z: eciKm.z
    };
}

export function ecfToGeodeticWgs84(ecfKm) {
    const p = Math.hypot(ecfKm.x, ecfKm.y);
    if (!Number.isFinite(p) || !Number.isFinite(ecfKm.z) || (p === 0 && ecfKm.z === 0)) return null;

    const lonDeg = normalizeLongitudeDeg(radToDeg(Math.atan2(ecfKm.y, ecfKm.x)));
    const theta = Math.atan2(ecfKm.z * WGS84_A_KM, p * WGS84_B_KM);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const lat = Math.atan2(
        ecfKm.z + WGS84_EP2 * WGS84_B_KM * sinTheta * sinTheta * sinTheta,
        p - WGS84_E2 * WGS84_A_KM * cosTheta * cosTheta * cosTheta
    );
    const sinLat = Math.sin(lat);
    const primeVerticalRadius = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    const altitudeKm = p / Math.cos(lat) - primeVerticalRadius;

    return {
        latDeg: radToDeg(lat),
        lonDeg,
        altitudeKm
    };
}

export const ecfToGeodeticSpherical = ecfToGeodeticWgs84;

export function computeLookGeometry(satEcfKm, targetLatDeg, targetLonDeg, targetAltKm = 0) {
    const ground = geodeticToEcfKm(targetLatDeg, targetLonDeg, targetAltKm);
    const rx = satEcfKm.x - ground.x;
    const ry = satEcfKm.y - ground.y;
    const rz = satEcfKm.z - ground.z;
    const rangeKm = Math.hypot(rx, ry, rz);
    const lat = degToRad(targetLatDeg);
    const lon = degToRad(targetLonDeg);

    const east = -Math.sin(lon) * rx + Math.cos(lon) * ry;
    const north =
        -Math.sin(lat) * Math.cos(lon) * rx -
        Math.sin(lat) * Math.sin(lon) * ry +
        Math.cos(lat) * rz;
    const up =
        Math.cos(lat) * Math.cos(lon) * rx +
        Math.cos(lat) * Math.sin(lon) * ry +
        Math.sin(lat) * rz;

    const elevationDeg = rangeKm > 0 ? radToDeg(Math.asin(Math.max(-1, Math.min(1, up / rangeKm)))) : -90;
    const azimuthDeg = (radToDeg(Math.atan2(east, north)) + 360) % 360;
    const satGeodetic = ecfToGeodeticWgs84(satEcfKm);

    return {
        rangeKm,
        elevationDeg,
        azimuthDeg,
        isLineOfSight: elevationDeg > 0,
        targetEcfKm: ground,
        satelliteGeodetic: satGeodetic,
        targetLatDeg,
        targetLonDeg
    };
}

export function radialVelocityMps(rangeKmNow, rangeKmLater, deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
        throw new Error('deltaSeconds must be a positive finite number.');
    }
    return ((rangeKmLater - rangeKmNow) * 1000) / deltaSeconds;
}

export function mercatorPixelFromLonLat(lonDeg, latDeg, width, height) {
    const clampedLatDeg = clampWebMercatorLatDeg(latDeg);
    const latRad = degToRad(clampedLatDeg);

    return {
        x: ((normalizeLongitudeDeg(lonDeg) + 180) / 360) * width,
        y: height / 2 - (width * Math.log(Math.tan(Math.PI / 4 + latRad / 2))) / (2 * Math.PI)
    };
}

export function lonLatFromMercatorPixel(x, y, width, height) {
    const lonDeg = (x / width) * 360 - 180;
    const mercator = (height / 2 - y) * (2 * Math.PI) / width;
    const latRad = 2 * Math.atan(Math.exp(mercator)) - Math.PI / 2;

    return {
        lonDeg: normalizeLongitudeDeg(lonDeg),
        latDeg: clampWebMercatorLatDeg(radToDeg(latRad))
    };
}

export function orbitClassFromMeanMotion(meanMotionRevPerDay, options = {}) {
    if (!Number.isFinite(meanMotionRevPerDay) || meanMotionRevPerDay <= 0) return 'UNKNOWN';

    const eccentricity = Number.isFinite(options.eccentricity) ? Math.max(0, options.eccentricity) : 0;
    const inclinationDeg = Number.isFinite(options.inclinationDeg) ? Math.abs(options.inclinationDeg) : 0;
    const periodMinutes = Number.isFinite(options.periodMinutes) && options.periodMinutes > 0
        ? options.periodMinutes
        : 1440 / meanMotionRevPerDay;
    const altitudeKm = Number.isFinite(options.altitudeKm) ? options.altitudeKm : null;

    const isNearGeoPeriod = Math.abs(periodMinutes - 1436.1) <= 90;
    const isNearGeoInclination = inclinationDeg <= 15;
    const isNearCircular = eccentricity < 0.08;
    if (isNearGeoPeriod && isNearGeoInclination && isNearCircular) return 'GEO';

    const isMolniyaLike = periodMinutes >= 600 && periodMinutes <= 900 && inclinationDeg >= 50 && inclinationDeg <= 75;
    const isHighlyEccentric = eccentricity >= 0.25;
    const isLongElliptical = eccentricity >= 0.12 && periodMinutes > 225;
    if (isHighlyEccentric || isMolniyaLike || isLongElliptical) return 'HEO';

    if (altitudeKm !== null) {
        if (altitudeKm < 2000) return 'LEO';
        if (altitudeKm < 35786) return 'MEO';
        return 'OTHER';
    }

    if (meanMotionRevPerDay > 11) return 'LEO';
    if (meanMotionRevPerDay >= 2.5 && meanMotionRevPerDay <= 11) return 'MEO';
    return 'OTHER';
}
