// Nominal sidereal periods, not a body attitude/IAU pole or prime-meridian model.
// Planets: https://ssd.jpl.nasa.gov/planets/phys_par.html (days, signed)
// Moon: https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html (655.720 hours)
// Source values checked 2026-11-08. Zero texture phase at J2000 is illustrative.
export const SIDEREAL_ROTATION_DAYS = Object.freeze({
    mercury: 58.6462, venus: -243.018, earth: 0.99726968, moon: 655.720 / 24,
    mars: 1.02595676, jupiter: 0.41354, saturn: 0.44401, uranus: -0.71833, neptune: 0.67125
});
export const ROTATION_EPOCH_MS = Date.UTC(2000, 0, 1, 12);

export function solarSystemRotationRadians(body, timeMs) {
    const period = SIDEREAL_ROTATION_DAYS[body] * 86400000;
    if (!Number.isFinite(period) || !Number.isFinite(timeMs)) throw new RangeError('Rotation requires a known body and finite UTC time.');
    // Scene maps ecliptic (x,y,z) to (x,z,y), so prograde is negative around scene Y.
    const turns = -(timeMs - ROTATION_EPOCH_MS) % period / period;
    return ((turns % 1) + 1) % 1 * Math.PI * 2;
}
