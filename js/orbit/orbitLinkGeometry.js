export const EARTH_RADIUS_KM = 6378.137;
export const EARTH_ROTATION_RAD_PER_SEC = 7.2921159e-5;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function degToRad(deg) {
    return deg * DEG_TO_RAD;
}

export function radToDeg(rad) {
    return rad * RAD_TO_DEG;
}

export function normalizeLongitudeDeg(lonDeg) {
    return ((lonDeg + 540) % 360) - 180;
}

export function geodeticToEcfKm(latDeg, lonDeg, altitudeKm = 0) {
    const lat = degToRad(latDeg);
    const lon = degToRad(lonDeg);
    const radius = EARTH_RADIUS_KM + altitudeKm;
    const cosLat = Math.cos(lat);

    return {
        x: radius * cosLat * Math.cos(lon),
        y: radius * cosLat * Math.sin(lon),
        z: radius * Math.sin(lat)
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

export function ecfToGeodeticSpherical(ecfKm) {
    const radius = Math.hypot(ecfKm.x, ecfKm.y, ecfKm.z);
    if (radius === 0) return null;

    return {
        latDeg: radToDeg(Math.asin(ecfKm.z / radius)),
        lonDeg: normalizeLongitudeDeg(radToDeg(Math.atan2(ecfKm.y, ecfKm.x))),
        altitudeKm: radius - EARTH_RADIUS_KM
    };
}

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

    const elevationDeg = radToDeg(Math.asin(up / rangeKm));
    const azimuthDeg = (radToDeg(Math.atan2(east, north)) + 360) % 360;
    const satGeodetic = ecfToGeodeticSpherical(satEcfKm);

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
    const clampedLatDeg = Math.max(-85.05112878, Math.min(85.05112878, latDeg));
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
        latDeg: radToDeg(latRad)
    };
}

export function orbitClassFromMeanMotion(meanMotionRevPerDay) {
    if (!Number.isFinite(meanMotionRevPerDay) || meanMotionRevPerDay <= 0) return 'UNKNOWN';
    if (meanMotionRevPerDay > 11) return 'LEO';
    if (meanMotionRevPerDay < 2.5) return 'GEO';
    return 'MEO';
}
