import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAnimationTimer } from './animationTimer.js';
import { APP_VERSION } from './releaseVersion.js';
import { createSimulationClock, simulationRateLabel, simulationRateDescription } from './simulationClock.js';
import { createSolarSystemTimeControls } from './solarSystemTimeControls.js';
import { SOLAR_SYSTEM_PLANETS, createSolarSystemOverview, updateSolarSystemOverview,
    setSolarSystemOverviewVisible, setSolarSystemOverviewOptions, solarSystemEphemerisSummary, solarSystemOrbitGuideDiagnostics,
    focusSolarSystemPlanet, resetSolarSystemOverviewCamera, pickSolarSystemPlanet, solarSystemSizeDiagnostics } from './solarSystemOverviewLoader.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.01, 6000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const clock = createSimulationClock({ initialLive: true, minRate: -120, maxRate: 120 });
const simDate = new Date(clock.state().timeMs);
const overview = createSolarSystemOverview(scene, { renderer, camera, controls, initialDate: simDate });
setSolarSystemOverviewVisible(overview, true);
resetSolarSystemOverviewCamera(overview);
const el = id => document.getElementById(id);
el('appVersion').textContent = `OpenBEXI ${APP_VERSION}`;
let runningRate = 1;
const timeControls = createSolarSystemTimeControls({
    container: el('solarSystemTimeControls'), unitSelect: el('solarTimeUnit'), overview, clock,
    onChange: sync,
    onFocus: name => name ? focusSolarSystemPlanet(overview, name) : resetSolarSystemOverviewCamera(overview)
});
el('timeSpeed').addEventListener('input', event => {
    clock.setRate(Number(event.target.value));
    if (clock.state().rate) runningRate = clock.state().rate;
    sync();
});
el('timePause').addEventListener('click', () => { clock.setRate(clock.state().rate ? 0 : runningRate); sync(); });
el('timeNow').addEventListener('click', () => { clock.goLive(); runningRate = 1; sync(); });
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
    timeControls.sync();
    el('toggleGlow').disabled = !overview.options.educational;
    simDate.setTime(clock.state().timeMs);
    el('utcClock').textContent = `${simDate.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
    el('timeSpeed').value = String(clock.state().rate);
    const label = simulationRateLabel(clock, timeControls.unit());
    el('timeSpeedValue').textContent = label;
    el('timeSpeed').setAttribute('aria-valuetext', simulationRateDescription(clock, timeControls.unit()));
    el('timeNow').setAttribute('aria-pressed', String(clock.state().live));
    el('timePause').textContent = clock.state().rate ? 'Pause' : 'Play';
    el('ephemerisStatus').textContent = `${solarSystemEphemerisSummary(overview)}${clock.state().boundary ? ' • Boundary reached; paused' : ''}`;
}
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
window.openbexiSolarSystem = Object.freeze({
    bodySizes: () => solarSystemSizeDiagnostics(overview),
    orbitGuides: () => solarSystemOrbitGuideDiagnostics(overview),
    snapshot: () => ({ ...clock.state(), millisecondsPerWarpSecond: clock.timeScale(), educational: overview.options.educational, mode: overview.ephemerisRuntimeMode }),
    planetPosition: name => overview.planets.get(name)?.group.position.toArray(),
    planetRotation: name => overview.planets.get(name)?.marker.rotation.y
});
const timer = createAnimationTimer();
let lastUi = 0;
function animate(timestamp) {
    requestAnimationFrame(animate);
    clock.setBounds(timeControls.bounds());
    if (!timeControls.bounds() && !clock.state().live) clock.setRate(0);
    const state = clock.tick(timer.getDelta(timestamp));
    simDate.setTime(state.timeMs);
    updateSolarSystemOverview(overview, simDate, { clockBoundary: state.boundary });
    controls.update();
    if (timestamp - lastUi > 100) { sync(); lastUi = timestamp; }
    renderer.render(scene, camera);
}
requestAnimationFrame(animate);
