const DEG_TO_RAD = Math.PI / 180;

export const DEFAULT_STAR_MAGNITUDE_LIMIT = 10;
export const MAX_BROWSER_STAR_MAGNITUDE_LIMIT = 11.5;
export const MAX_INTEGRATED_STAR_MAGNITUDE_LIMIT = 13;
export const GAIA_EXTERNAL_ONLY_MAGNITUDE_LIMIT = 18;

export function normalizeRaDeg(raDeg) {
    const normalized = raDeg % 360;
    return normalized < 0 ? normalized + 360 : normalized;
}

export function raHoursToDegrees(raHours) {
    return normalizeRaDeg(raHours * 15);
}

export function resolveStarRaDeg(star) {
    if (Number.isFinite(star?.raDeg)) return normalizeRaDeg(star.raDeg);
    if (Number.isFinite(star?.raHours)) return raHoursToDegrees(star.raHours);
    throw new Error(`Star ${star?.name || 'unknown'} is missing finite raDeg or raHours`);
}

export function raDecToCartesian({ raDeg, raHours, decDeg, radius = 1 }) {
    const resolvedRaDeg = Number.isFinite(raDeg) ? normalizeRaDeg(raDeg) : raHoursToDegrees(raHours);
    if (!Number.isFinite(decDeg)) throw new Error('decDeg must be finite');
    if (!Number.isFinite(radius) || radius <= 0) throw new Error('radius must be positive');

    const raRad = resolvedRaDeg * DEG_TO_RAD;
    const decRad = decDeg * DEG_TO_RAD;
    const cosDec = Math.cos(decRad);

    return {
        x: radius * cosDec * Math.cos(raRad),
        y: radius * Math.sin(decRad),
        z: -radius * cosDec * Math.sin(raRad)
    };
}

export function filterStarsByMagnitude(stars, magnitudeLimit = DEFAULT_STAR_MAGNITUDE_LIMIT) {
    return (stars || []).filter(star => Number.isFinite(star.mag) && star.mag < magnitudeLimit);
}

export function magnitudeToPointSize(mag, magnitudeLimit = DEFAULT_STAR_MAGNITUDE_LIMIT) {
    const clamped = Math.max(-1.5, Math.min(magnitudeLimit, mag));
    const t = Math.max(0, Math.min(1, (magnitudeLimit - clamped) / (magnitudeLimit + 1.5)));
    return 1.1 + Math.pow(t, 1.7) * 9.5;
}

export function magnitudeToAlpha(mag, magnitudeLimit = DEFAULT_STAR_MAGNITUDE_LIMIT) {
    const clamped = Math.max(-1.5, Math.min(magnitudeLimit, mag));
    const t = Math.max(0, Math.min(1, (magnitudeLimit - clamped) / (magnitudeLimit + 1.5)));
    return 0.18 + Math.pow(t, 1.25) * 0.82;
}

export function bvToTemperatureK(bv = 0.65) {
    const safeBv = Math.max(-0.4, Math.min(2.2, Number.isFinite(bv) ? bv : 0.65));
    return 4600 * ((1 / (0.92 * safeBv + 1.7)) + (1 / (0.92 * safeBv + 0.62)));
}

export function temperatureToRgb(tempK) {
    const temp = Math.max(1000, Math.min(40000, tempK)) / 100;
    let red;
    let green;
    let blue;

    if (temp <= 66) {
        red = 255;
        green = 99.4708025861 * Math.log(temp) - 161.1195681661;
        blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    } else {
        red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
        green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
        blue = 255;
    }

    return {
        r: Math.max(0, Math.min(1, red / 255)),
        g: Math.max(0, Math.min(1, green / 255)),
        b: Math.max(0, Math.min(1, blue / 255))
    };
}

export function starColorRgb(star, colorMode = 'color') {
    if (colorMode === 'white') return { r: 1, g: 1, b: 1 };
    return temperatureToRgb(bvToTemperatureK(star?.bv));
}

export function buildStarBufferData(stars, {
    radius = 120,
    magnitudeLimit = DEFAULT_STAR_MAGNITUDE_LIMIT,
    colorMode = 'color'
} = {}) {
    const visibleStars = filterStarsByMagnitude(stars, magnitudeLimit);
    const positions = new Float32Array(visibleStars.length * 3);
    const colors = new Float32Array(visibleStars.length * 3);
    const sizes = new Float32Array(visibleStars.length);
    const alphas = new Float32Array(visibleStars.length);

    visibleStars.forEach((star, index) => {
        const p = raDecToCartesian({
            raDeg: resolveStarRaDeg(star),
            decDeg: star.decDeg,
            radius
        });
        const c = starColorRgb(star, colorMode);
        const i3 = index * 3;

        positions[i3] = p.x;
        positions[i3 + 1] = p.y;
        positions[i3 + 2] = p.z;
        colors[i3] = c.r;
        colors[i3 + 1] = c.g;
        colors[i3 + 2] = c.b;
        sizes[index] = magnitudeToPointSize(star.mag, magnitudeLimit);
        alphas[index] = magnitudeToAlpha(star.mag, magnitudeLimit);
    });

    return {
        positions,
        colors,
        sizes,
        alphas,
        stars: visibleStars
    };
}
