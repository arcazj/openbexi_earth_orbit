const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function normalizeBeamLongitudeDeg(lonDeg) {
    return ((lonDeg + 540) % 360) - 180;
}

export function surfaceAngularSeparationDeg(lat1Deg, lon1Deg, lat2Deg, lon2Deg) {
    const lat1 = clampLatitude(lat1Deg) * DEG_TO_RAD;
    const lat2 = clampLatitude(lat2Deg) * DEG_TO_RAD;
    const lonDelta = normalizeBeamLongitudeDeg(lon2Deg - lon1Deg) * DEG_TO_RAD;

    const sinHalfLat = Math.sin((lat2 - lat1) / 2);
    const sinHalfLon = Math.sin(lonDelta / 2);
    const haversine =
        sinHalfLat * sinHalfLat +
        Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;

    return 2 * Math.asin(Math.min(1, Math.sqrt(Math.max(0, haversine)))) * RAD_TO_DEG;
}

export function estimateArrayBeamwidthDeg(nx, ny, spacingLambda, options = {}) {
    const elementWidthLambda = Number.isFinite(options.elementWidthLambda)
        ? Math.max(0, options.elementWidthLambda)
        : 0.5;
    const apertureX = estimateApertureLambda(nx, spacingLambda, elementWidthLambda);
    const apertureY = estimateApertureLambda(ny, spacingLambda, elementWidthLambda);
    const aperture = Math.max(apertureX, apertureY);

    if (aperture <= 0) return 120;

    const factor = Number.isFinite(options.hpbwFactorDeg)
        ? options.hpbwFactorDeg
        : 58;
    const minBeamwidthDeg = Number.isFinite(options.minBeamwidthDeg)
        ? options.minBeamwidthDeg
        : 0.35;
    const maxBeamwidthDeg = Number.isFinite(options.maxBeamwidthDeg)
        ? options.maxBeamwidthDeg
        : 120;

    return Math.max(minBeamwidthDeg, Math.min(maxBeamwidthDeg, factor / aperture));
}

export function beamPatternLossDb(separationDeg, halfPowerBeamwidthDeg, maxLossDb = 45) {
    if (!Number.isFinite(separationDeg) || separationDeg <= 0) return 0;
    if (!Number.isFinite(halfPowerBeamwidthDeg) || halfPowerBeamwidthDeg <= 0) {
        return Number.isFinite(maxLossDb) ? Math.max(0, maxLossDb) : 45;
    }

    const loss = 3 * Math.pow(separationDeg / halfPowerBeamwidthDeg, 2);
    return Math.min(Math.max(0, maxLossDb), loss);
}

export function computeBeamFootprintLoss({
    centerLatDeg,
    centerLonDeg,
    pointLatDeg,
    pointLonDeg,
    halfPowerBeamwidthDeg,
    maxLossDb = 45
}) {
    const separationDeg = surfaceAngularSeparationDeg(
        centerLatDeg,
        centerLonDeg,
        pointLatDeg,
        pointLonDeg
    );
    return {
        separationDeg,
        lossDb: beamPatternLossDb(separationDeg, halfPowerBeamwidthDeg, maxLossDb)
    };
}

function estimateApertureLambda(count, spacingLambda, elementWidthLambda) {
    const n = Math.max(0, Math.round(Number(count) || 0));
    const spacing = Math.max(0, Number(spacingLambda) || 0);
    if (n <= 0) return 0;
    if (n === 1) return Math.max(elementWidthLambda, 0.1);
    return (n - 1) * spacing + elementWidthLambda;
}

function clampLatitude(latDeg) {
    return Math.max(-90, Math.min(90, Number(latDeg) || 0));
}
