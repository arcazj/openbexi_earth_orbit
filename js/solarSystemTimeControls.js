import { solarSystemEphemerisBounds } from './solarSystemEphemeris.js';
import { EDUCATIONAL_BOUNDS } from './solarSystemEducation.js';
import { SOLAR_SYSTEM_PLANETS, setSolarSystemOverviewOptions, setSolarSystemOverviewVisible, fitSolarSystemOverviewCamera, solarSystemOrbitGuideSummary, solarSystemUsesEnlargedSymbols } from './solarSystemOverviewLoader.js';

export const SOLAR_TIME_UNITS = Object.freeze({ second: 1000, minute: 60000, hour: 3600000, day: 86400000, year: 31557600000 });
const DAY = 86400000;
export function solarSystemTimeBounds(overview) {
    return overview.options.educational ? EDUCATIONAL_BOUNDS : solarSystemEphemerisBounds(overview.ephemerisState?.data);
}
export function solarTimeWindow(time, spanDays, bounds) {
    if (!bounds) return null;
    const duration = Math.min(bounds.maxTimeMs - bounds.minTimeMs, spanDays * DAY);
    const minTimeMs = Math.max(bounds.minTimeMs, Math.min(bounds.maxTimeMs - duration, time - duration / 2));
    return { minTimeMs, maxTimeMs: minTimeMs + duration };
}
const utcInput = time => new Date(time).toISOString().slice(0, 19);
const dateInput = time => new Date(time).toISOString().slice(0, 10);

export function createSolarSystemTimeControls({ container, unitSelect, overview, clock, onChange = () => {}, onFocus = () => {} }) {
    unitSelect.innerHTML = `<option value="second">sec/s</option><option value="minute">min/s</option><option value="hour">hour/s</option><option value="day">day/s</option><optgroup label="Advanced"><option value="year">year/s</option></optgroup>`;
    unitSelect.value = 'second';
    container.innerHTML = `
      <label class="solar-mode-toggle"><input id="solarEducational" type="checkbox" checked> Educational mode <span>(approximate, wider dates)</span></label>
      <div id="solarCoverage" class="solar-time-note"></div>
      <div id="solarOrbitGuideStatus" class="solar-time-note" role="status"></div>
      <label for="solarDate">Simulation date and time (UTC)</label>
      <input id="solarDate" type="datetime-local" step="1">
      <label for="solarRange">Timeline window<select id="solarRange"><option value="30">1 month</option><option value="365.25" selected>1 year</option><option value="3652.5">10 years</option><option value="36525">100 years</option><option value="all">Full coverage</option><option value="custom">Custom dates</option></select></label>
      <div id="solarCustomRange" class="solar-time-grid" hidden>
        <label for="solarRangeStart">From (UTC)<input id="solarRangeStart" type="date"></label>
        <label for="solarRangeEnd">To (UTC)<input id="solarRangeEnd" type="date"></label>
      </div>
      <input id="solarScrubber" type="range" min="0" max="10000" step="1" value="5000" aria-label="Explore the selected date range">
      <div id="solarRangeLabel" class="solar-time-note"></div>
      <div class="solar-time-actions"><button type="button" id="solarStepBack">-1 day</button><button type="button" id="solarStepForward">+1 day</button></div>
      <div class="solar-time-actions"><button type="button" id="solarFitAll">Fit Solar System</button><button type="button" id="solarFitInner">Inner planets</button></div>
      <label for="solarPlanetFocus">Follow a planet<select id="solarPlanetFocus"><option value="">Sun-centered overview</option>${SOLAR_SYSTEM_PLANETS.map(planet => `<option>${planet.name}</option>`).join('')}</select></label>
      <label class="solar-mode-toggle"><input id="solarEnlarged" type="checkbox" checked aria-describedby="solarSizeNote"> Enlarge Sun and planet symbols</label>
      <div id="solarSizeNote" class="solar-time-note"></div>
      <div class="solar-time-note">Live follows current UTC at 1 sec/s; planetary motion is slow at this scale. Choose playback units beside Play/Pause; year/s is under Advanced. Planet symbols use nominal spin rates; axis orientation and texture alignment are illustrative. The educational Moon orbit is schematic.</div>
      <button type="button" id="solarDataRetry" hidden>Retry Solar System data</button>
      <div id="solarTimeMessage" class="solar-time-note" role="status" aria-live="polite"></div>`;
    const el = id => container.querySelector(`#${id}`);
    let range = null, lastBounds = '', lastMode = null;
    const changed = () => { overview.forceOrbitUpdate = true; onChange(); sync(); };
    const message = text => { el('solarTimeMessage').textContent = text; };
    el('solarDataRetry').addEventListener('click', () => { setSolarSystemOverviewVisible(overview, true); sync(); });
    function resetWindow() {
        const bounds = solarSystemTimeBounds(overview);
        const value = el('solarRange').value;
        if (bounds && value === 'custom') {
            const start = Math.max(bounds.minTimeMs, Date.parse(`${el('solarRangeStart').value}T00:00:00Z`));
            const end = Math.min(bounds.maxTimeMs, Date.parse(`${el('solarRangeEnd').value}T00:00:00Z`));
            if (Number.isFinite(start) && Number.isFinite(end) && start < end) {
                range = { minTimeMs: start, maxTimeMs: end };
            } else range = solarTimeWindow(clock.state().timeMs, 365.25, bounds);
            el('solarRangeStart').value = dateInput(range.minTimeMs);
            el('solarRangeEnd').value = dateInput(range.maxTimeMs);
            return;
        }
        range = solarTimeWindow(clock.state().timeMs, value === 'all' ? Infinity : Number(value) || 365.25, bounds);
    }
    function setTime(time) {
        const bounds = solarSystemTimeBounds(overview);
        if (!bounds || !Number.isFinite(time)) { message('Choose a valid date within the available range.'); return; }
        clock.setBounds(bounds);
        clock.reset(time, 0);
        message(clock.state().boundary ? 'Date adjusted to the available range; playback paused.' : '');
        changed();
    }
    el('solarEducational').addEventListener('change', event => {
        setSolarSystemOverviewOptions(overview, { educational: event.target.checked });
        const bounds = solarSystemTimeBounds(overview);
        clock.setRate(0);
        if (bounds) clock.setBounds(bounds);
        resetWindow();
        message(clock.state().boundary ? 'Date adjusted to precise data coverage; playback paused.' : 'Mode changed; playback paused.');
        changed();
    });
    el('solarDate').addEventListener('change', event => setTime(Date.parse(`${event.target.value}Z`)));
    unitSelect.addEventListener('change', event => { clock.setTimeScale(SOLAR_TIME_UNITS[event.target.value]); changed(); });
    el('solarRange').addEventListener('change', () => { resetWindow(); changed(); });
    for (const id of ['solarRangeStart', 'solarRangeEnd']) el(id).addEventListener('change', () => {
        const bounds = solarSystemTimeBounds(overview);
        const start = Date.parse(`${el('solarRangeStart').value}T00:00:00Z`);
        const end = Date.parse(`${el('solarRangeEnd').value}T00:00:00Z`);
        if (!bounds || !Number.isFinite(start) || !Number.isFinite(end) || start >= end || start < bounds.minTimeMs || end > bounds.maxTimeMs) {
            message('Choose an increasing date range within the available coverage.'); return;
        }
        range = { minTimeMs: start, maxTimeMs: end };
        message('');
        setTime(Math.max(start, Math.min(end, clock.state().timeMs)));
    });
    el('solarScrubber').addEventListener('input', event => {
        if (range) setTime(range.minTimeMs + Number(event.target.value) / 10000 * (range.maxTimeMs - range.minTimeMs));
    });
    el('solarStepBack').addEventListener('click', () => setTime(clock.state().timeMs - DAY));
    el('solarStepForward').addEventListener('click', () => setTime(clock.state().timeMs + DAY));
    el('solarPlanetFocus').addEventListener('change', event => { onFocus(event.target.value); changed(); });
    for (const [id, inner] of [['solarFitAll', false], ['solarFitInner', true]]) el(id).addEventListener('click', () => {
        onFocus(''); fitSolarSystemOverviewCamera(overview, inner); changed();
    });
    el('solarEnlarged').addEventListener('change', event => {
        setSolarSystemOverviewOptions(overview, { enlargedPlanets: event.target.checked }); changed();
    });
    function sync() {
        el('solarDataRetry').hidden = overview.ephemerisState?.status !== 'error' && !['partial', 'error'].includes(overview.orbitGuideState?.status);
        el('solarDataRetry').disabled = overview.ephemerisState?.status === 'loading' || overview.orbitGuideState?.status === 'loading';
        const bounds = solarSystemTimeBounds(overview);
        const state = clock.state();
        const unit = Object.keys(SOLAR_TIME_UNITS).find(key => SOLAR_TIME_UNITS[key] === clock.timeScale()) || 'second';
        if (unitSelect.value !== unit && container.ownerDocument.activeElement !== unitSelect) unitSelect.value = unit;
        const signature = bounds ? `${bounds.minTimeMs}:${bounds.maxTimeMs}` : '';
        if (signature !== lastBounds || lastMode !== overview.options.educational) {
            lastBounds = signature; lastMode = overview.options.educational; resetWindow();
        }
        if (range && el('solarRange').value !== 'custom' && (state.timeMs < range.minTimeMs || state.timeMs > range.maxTimeMs)) resetWindow();
        const mode = overview.options.educational ? 'Educational approximation' : 'Precise • JPL Horizons';
        const coverage = bounds ? `${mode}: ${dateInput(bounds.minTimeMs)} to ${dateInput(bounds.maxTimeMs)}` : 'Precise data loading or unavailable. Educational mode remains available.';
        if (el('solarCoverage').textContent !== coverage) el('solarCoverage').textContent = coverage;
        const guideSummary = solarSystemOrbitGuideSummary(overview);
        if (el('solarOrbitGuideStatus').textContent !== guideSummary) el('solarOrbitGuideStatus').textContent = guideSummary;
        el('solarEducational').checked = overview.options.educational;
        el('solarEnlarged').checked = solarSystemUsesEnlargedSymbols(overview);
        el('solarEnlarged').disabled = !overview.options.educational;
        el('solarSizeNote').textContent = overview.options.educational
            ? 'Educational view: illustrative sizes and Moon orbit.'
            : 'Physical mean radii at orbital distance scale. Bodies are tiny in overview; follow a planet to inspect it. Labels are guides.';
        el('solarPlanetFocus').value = overview.selectedPlanet || '';
        for (const id of ['solarDate', 'solarScrubber', 'solarRange', 'solarRangeStart', 'solarRangeEnd', 'solarStepBack', 'solarStepForward']) el(id).disabled = !bounds;
        const date = el('solarDate');
        if (container.ownerDocument.activeElement !== date) date.value = utcInput(state.timeMs);
        if (bounds) { date.min = utcInput(bounds.minTimeMs); date.max = utcInput(bounds.maxTimeMs); }
        el('solarCustomRange').hidden = el('solarRange').value !== 'custom';
        if (range) {
            el('solarScrubber').value = String(Math.round((state.timeMs - range.minTimeMs) / (range.maxTimeMs - range.minTimeMs) * 10000));
            el('solarScrubber').setAttribute('aria-valuetext', `${utcInput(state.timeMs)} UTC`);
            const rangeText = `${dateInput(range.minTimeMs)} — ${dateInput(range.maxTimeMs)}`;
            if (el('solarRangeLabel').textContent !== rangeText) el('solarRangeLabel').textContent = rangeText;
            for (const [id, value] of [['solarRangeStart', range.minTimeMs], ['solarRangeEnd', range.maxTimeMs]]) {
                const input = el(id);
                // Preserve an in-progress custom edit until both endpoints validate.
                if (el('solarRange').value !== 'custom' || !input.value) input.value = dateInput(value);
                input.min = dateInput(bounds.minTimeMs); input.max = dateInput(bounds.maxTimeMs);
            }
        }
    }
    return { sync, bounds: () => solarSystemTimeBounds(overview), unit: () => unitSelect.value,
        activate() { if (!clock.state().live) clock.setTimeScale(SOLAR_TIME_UNITS[unitSelect.value]); sync(); } };
}
