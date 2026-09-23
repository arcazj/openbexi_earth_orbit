import assert from 'assert';
import { daylightFactor, gmstFromJD, sunECI, terminatorLatitudeRad } from '../js/drawDayNight.js';

function run() {
  const jd = 2451545.0; // J2000 epoch
  const gmst = gmstFromJD(jd);
  assert(gmst >= 0 && gmst < 2 * Math.PI, 'gmst within 0-2pi');

  const sun = sunECI(jd);
  const len = Math.sqrt(sun.x * sun.x + sun.y * sun.y + sun.z * sun.z);
  assert(Math.abs(len - 1) < 1e-6, 'sun vector normalized');
  ['x','y','z'].forEach(k => {
    assert(sun[k] <= 1 && sun[k] >= -1, 'component in range');
  });

  [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI].forEach(lon => {
    const lat = terminatorLatitudeRad(lon, 0, 0);
    assert(Number.isFinite(lat), 'terminator latitude stays finite at equinox');
    assert(lat >= -Math.PI && lat <= Math.PI, 'terminator latitude stays bounded at equinox');
  });

  for (const declination of [-0.409, -0.001, 0.001, 0.409]) {
    for (let lon = -Math.PI; lon <= Math.PI; lon += 0.1) {
      const lat = terminatorLatitudeRad(lon, 0, declination);
      assert(Math.abs(lat) <= Math.PI / 2, 'terminator stays in geographic latitude range in both seasons');
      const solarDot = Math.cos(lat) * Math.cos(lon) * Math.cos(declination) +
        Math.sin(lat) * Math.sin(declination);
      assert(Math.abs(solarDot) < 1e-12, 'terminator lies on the solar horizon');
    }
  }
  assert.equal(daylightFactor(-1), 0, 'midnight is dark');
  assert.equal(daylightFactor(1), 1, 'noon is fully illuminated');
  assert(daylightFactor(0) > 0 && daylightFactor(0) < 1, 'horizon has a twilight transition');
  let previous = 0;
  for (let dot = -1; dot <= 1; dot += 0.001) {
    const factor = daylightFactor(dot);
    assert(factor >= previous && factor - previous < 0.02, 'twilight changes smoothly and monotonically');
    previous = factor;
  }

  console.log('All tests passed');
}

run();

