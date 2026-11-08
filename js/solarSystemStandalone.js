import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAnimationTimer } from './animationTimer.js';
import { createSimulationClock } from './simulationClock.js';
import { createSolarSystemTimeControls } from './solarSystemTimeControls.js';
import { SOLAR_SYSTEM_PLANETS, createSolarSystemOverview, updateSolarSystemOverview,
    setSolarSystemOverviewVisible, setSolarSystemOverviewOptions, solarSystemEphemerisSummary, solarSystemOrbitGuideDiagnostics,
    focusSolarSystemPlanet, resetSolarSystemOverviewCamera, pickSolarSystemPlanet } from './solarSystemOverviewLoader.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.01, 6000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const clock = createSimulationClock({ initialTimeMs: Date.now(), millisecondsPerWarpSecond: 86400000, minRate: -120, maxRate: 120 });
const simDate = new Date(clock.state().timeMs);
const overview = createSolarSystemOverview(scene, { renderer, camera, controls, initialDate: simDate });
setSolarSystemOverviewVisible(overview, true);
resetSolarSystemOverviewCamera(overview);
const el = id => document.getElementById(id);
let runningRate = 1;
const timeControls = createSolarSystemTimeControls({
    container: el('solarSystemTimeControls'), overview, clock,
    onChange: sync,
    onFocus: name => name ? focusSolarSystemPlanet(overview, name) : resetSolarSystemOverviewCamera(overview)
});
el('timeSpeed').addEventListener('input', event => {
    clock.setRate(Number(event.target.value));
    if (clock.state().rate) runningRate = clock.state().rate;
    sync();
});
el('timePause').addEventListener('click', () => { clock.setRate(clock.state().rate ? 0 : runningRate); sync(); });
el('timeNow').addEventListener('click', () => { clock.reset(Date.now(), 0); sync(); });
el('resetCamera').addEventListener('click', () => { resetSolarSystemOverviewCamera(overview); timeControls.sync(); });
for (const [id, option] of [['toggleLabels', 'planetLabels'], ['toggleOrbits', 'orbitPaths'], ['toggleGlow', 'sunGlow']]) {
    el(id).addEventListener('change', event => setSolarSystemOverviewOptions(overview, { [option]: event.target.checked }));
}
el('toggleStars').addEventListener('change', event => { overview.starGroup.visible = event.target.checked; });
renderer.domElement.addEventListener('click', event => {
    const name = pickSolarSystemPlanet(overview, event);
    if (name) { focusSolarSystemPlanet(overview, name); timeControls.sync(); }
});
el('planetCount').textContent = '8 + Moon';
el('planetLegend').textContent = SOLAR_SYSTEM_PLANETS.map(planet => planet.name).join(' · ');
function sync() {
    simDate.setTime(clock.state().timeMs);
    el('utcClock').textContent = `${simDate.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
    el('timeSpeed').value = String(clock.state().rate);
    el('timeSpeedValue').textContent = `${clock.state().rate} ${timeControls.unit()}/s`;
    el('timePause').textContent = clock.state().rate ? 'Pause' : 'Play';
    el('ephemerisStatus').textContent = `${solarSystemEphemerisSummary(overview)}${clock.state().boundary ? ' • Boundary reached; paused' : ''}`;
    timeControls.sync();
}
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
window.openbexiSolarSystem = Object.freeze({
    orbitGuides: () => solarSystemOrbitGuideDiagnostics(overview),
    snapshot: () => ({ ...clock.state(), educational: overview.options.educational, mode: overview.ephemerisRuntimeMode }),
    planetPosition: name => overview.planets.get(name)?.group.position.toArray()
});
const timer = createAnimationTimer();
let lastUi = 0;
function animate(timestamp) {
    requestAnimationFrame(animate);
    clock.setBounds(timeControls.bounds());
    if (!timeControls.bounds()) clock.setRate(0);
    const state = clock.tick(timer.getDelta());
    simDate.setTime(state.timeMs);
    updateSolarSystemOverview(overview, simDate, { clockBoundary: state.boundary });
    controls.update();
    if (timestamp - lastUi > 100) { sync(); lastUi = timestamp; }
    renderer.render(scene, camera);
}
requestAnimationFrame(animate);
