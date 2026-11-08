// JPL approximate Keplerian elements, Table 2a/2b (J2000 ecliptic).
// Source and accuracy limits: https://ssd.jpl.nasa.gov/planets/approx_pos.html
// Educational only: Earth is represented by the Earth-Moon barycenter.
import { AU_KM, heliocentricVectorKmToScene } from './solarSystemEphemeris.js';

export const EDUCATIONAL_BOUNDS = Object.freeze({
    minTimeMs: Date.parse('1000-01-01T00:00:00Z'),
    maxTimeMs: Date.parse('3000-01-01T00:00:00Z')
});
const ELEMENTS = {
    mercury: [[.38709843,.20563661,7.00559432,252.25166724,77.45771895,48.33961819],[0,.00002123,-.00590158,149472.67486623,.15940013,-.12214182]],
    venus: [[.72332102,.00676399,3.39777545,181.97970850,131.76755713,76.67261496],[-.00000026,-.00005107,.00043494,58517.81560260,.05679648,-.27274174]],
    earth: [[1.00000018,.01673163,-.00054346,100.46691572,102.93005885,-5.11260389],[-.00000003,-.00003661,-.01337178,35999.37306329,.31795260,-.24123856]],
    mars: [[1.52371243,.09336511,1.85181869,-4.56813164,-23.91744784,49.71320984],[.00000097,.00009149,-.00724757,19140.29934243,.45223625,-.26852431]],
    jupiter: [[5.20248019,.04853590,1.29861416,34.33479152,14.27495244,100.29282654],[-.00002864,.00018026,-.00322699,3034.90371757,.18199196,.13024619],[-.00012452,.06064060,-.35635438,38.35125000]],
    saturn: [[9.54149883,.05550825,2.49424102,50.07571329,92.86136063,113.63998702],[-.00003065,-.00032044,.00451969,1222.11494724,.54179478,-.25015002],[.00025899,-.13434469,.87320147,38.35125000]],
    uranus: [[19.18797948,.04685740,.77298127,314.20276625,172.43404441,73.96250215],[-.00020455,-.00001550,-.00180155,428.49512595,.09266985,.05739699],[.00058331,-.97731848,.17689245,7.67025000]],
    neptune: [[30.06952752,.00895439,1.77005520,304.22289287,46.68158724,131.78635853],[.00006447,.00000818,.00022400,218.46515314,.01009938,-.00606302],[-.00041348,.68346318,-.10162547,7.67025000]]
};
const RAD = Math.PI / 180;
export function educationalPlanetPosition(bodyKey, date) {
    const time = date.getTime();
    if (!Number.isFinite(time) || time < EDUCATIONAL_BOUNDS.minTimeMs || time > EDUCATIONAL_BOUNDS.maxTimeMs) return null;
    const table = ELEMENTS[bodyKey];
    if (!table) return null;
    // UTC is sufficient for this explicitly approximate, century-scale model.
    const t = (time - Date.UTC(2000, 0, 1, 12)) / (36525 * 86400000);
    const [a,e,i,l,p,n] = table[0].map((value, axis) => value + table[1][axis] * t);
    const [b,c,s,f] = table[2] || [0,0,0,0];
    const m = ((l - p + b*t*t + c*Math.cos(f*t*RAD) + s*Math.sin(f*t*RAD)) % 360) * RAD;
    let anomaly = m;
    for (let step = 0; step < 12; step++) {
        const correction = (anomaly - e * Math.sin(anomaly) - m) / (1 - e * Math.cos(anomaly));
        anomaly -= correction;
        if (Math.abs(correction) < 1e-12) break;
    }
    const x = a * (Math.cos(anomaly) - e), y = a * Math.sqrt(1-e*e) * Math.sin(anomaly);
    const w = (p-n)*RAD, node = n*RAD, inc = i*RAD;
    return heliocentricVectorKmToScene([
        ((Math.cos(w)*Math.cos(node)-Math.sin(w)*Math.sin(node)*Math.cos(inc))*x + (-Math.sin(w)*Math.cos(node)-Math.cos(w)*Math.sin(node)*Math.cos(inc))*y)*AU_KM,
        ((Math.cos(w)*Math.sin(node)+Math.sin(w)*Math.cos(node)*Math.cos(inc))*x + (-Math.sin(w)*Math.sin(node)+Math.cos(w)*Math.cos(node)*Math.cos(inc))*y)*AU_KM,
        (Math.sin(w)*Math.sin(inc)*x + Math.cos(w)*Math.sin(inc)*y)*AU_KM
    ]);
}
