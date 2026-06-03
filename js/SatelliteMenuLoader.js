// js/satelliteMenu.js
// -------------------------------------------------------------------
// Returns HTML markup for the satellite-control sidebar.
// -------------------------------------------------------------------

export function satelliteMenuLoader() {
    return /* html */ `
  <div id="controlsContainer">
    <div id="versionDisplay"></div>

    <!-- Filters -->
    <div class="control-group">
      <div class="timeline-toggle-row">
        <button id="launchTimelineToggle" class="timeline-toggle">Show Launch Timeline</button>
      </div>
    
      <div class="timeline-toggle-sep"></div>
    
      <div class="timeline-toggle-row">
        <button id="reentryTimelineToggle" class="timeline-toggle">Show Re-entry Timeline</button>
      </div>
    </div>
    
    <!-- View -->
    <div class="control-group">
      <h3 data-collapsible-target="viewContent" class="section-heading">
        View <span class="toggle-icon">▾</span>
      </h3>

      <!-- 2-column grid (safer sizing) -->
      <div id="viewContent" class="collapsible-content"
           style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:14px;row-gap:4px;">
        <label><input type="checkbox" id="view3DToggle" checked>Globe</label>
        <label><input type="checkbox" id="viewMercatorToggle">Mercator</label>
        <label><input type="checkbox" id="highDefToggle"> High Def.</label>
        <label><input type="checkbox" id="showECEFAxesToggle"> ECEF&nbsp;Axes</label>
        <label><input type="checkbox" id="showDayNightToggle" checked> Day/Night</label>
      </div>
    </div>
    <!-- Filters -->
    <div class="control-group">
      <h3 data-collapsible-target="filtersContent" class="section-heading">
        Filters – Satellites Found: <span id="satelliteCountDisplay">0</span>
        <span class="toggle-icon">▾</span>
      </h3>

      <div id="filtersContent" class="collapsible-content filters-panel">
        <div class="filter-block">
          <div class="filter-label">Orbit filter (multi-select):</div>
          <div id="orbitTypeFilter" class="segmented-control orbit-segmented" role="group" aria-label="Orbit filter">
            <button type="button" class="segmented-option" data-orbit-filter="ALL" aria-pressed="false">ALL</button>
            <button type="button" class="segmented-option" data-orbit-filter="GEO" aria-pressed="false">GEO</button>
            <button type="button" class="segmented-option" data-orbit-filter="MEO" aria-pressed="true">MEO</button>
            <button type="button" class="segmented-option" data-orbit-filter="LEO" aria-pressed="false">LEO</button>
            <button type="button" class="segmented-option" data-orbit-filter="HEO" aria-pressed="false">HEO</button>
            <button type="button" class="segmented-option" data-orbit-filter="OTHER" aria-pressed="false">Other</button>
          </div>
        </div>

        <div class="filter-block">
          <div class="filter-label">Tag filter (multi-select):</div>
          <div id="companyFilter" class="tag-chip-list" role="group" aria-label="Tag filter">
            <label class="filter-chip">
              <input type="checkbox" value="ALL COMPANY" checked>
              <span>All tags</span>
            </label>
          </div>
        </div>

        <div class="filter-block">
          <div class="filter-label">Debris filter:</div>
          <div id="debrisFilter" class="segmented-control debris-segmented" role="radiogroup" aria-label="Debris filter">
            <button type="button" class="segmented-option" data-debris-filter="show" aria-pressed="true">Show</button>
            <button type="button" class="segmented-option" data-debris-filter="hide" aria-pressed="false">Hide</button>
            <button type="button" class="segmented-option" data-debris-filter="only" aria-pressed="false">Debris only</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Satellite selection -->
    <div class="control-group">
      <h3 data-collapsible-target="satelliteSelectionContent" class="section-heading">
        Satellite Selection <span class="toggle-icon">▾</span>
      </h3>

      <!-- Single collapsible container (unique id) -->
      <div id="satelliteSelectionContent" class="collapsible-content">

        <!-- 2-column grid for selection-related toggles -->
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:14px;row-gap:4px;">
          <label><input type="checkbox" id="showYPRToggle"> Yaw-Pitch-Roll</label>
          <label class="checkbox-row"><input type="checkbox" id="showFootprintCheckbox"><span>Show Footprint</span></label>
          <label class="checkbox-row"> <input type="checkbox" id="showOnlySelectedSatellite"><span>Show only selected satellite</span></label>
          <label><input type="checkbox" id="showOrbitFrameToggle"> Orbit&nbsp;Frame&nbsp;(LVLH)</label>
          <label><input type="checkbox" id="showOrbitToggle" checked> Show Orbit</label>
        </div>

        <!-- YPR sliders (unique id + hidden by default) -->
        <div id="yprSlidersRow"
             style="display:none;margin-top:6px;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:14px;row-gap:4px;">
          <label style="margin-bottom:4px;display:block;min-width:0;">Yaw:
            <input type="range" id="yawSlider" min="-180" max="180" step="0.1" value="0" style="width:100%;min-width:0;">
            <span id="yawVal">0</span>
          </label>

          <label style="margin-bottom:4px;display:block;min-width:0;">Pitch:
            <input type="range" id="pitchSlider" min="-180" max="180" step="0.1" value="0" style="width:100%;min-width:0;">
            <span id="pitchVal">0</span>
          </label>

          <label style="display:block;min-width:0;">Roll:
            <input type="range" id="rollSlider" min="-180" max="180" step="0.1" value="0" style="width:100%;min-width:0;">
            <span id="rollVal">0</span>
          </label>
        </div>

        <div style="margin-top:8px;">
          <label for="satelliteSelect" class="section-heading">Select Satellite:</label>
          <select id="satelliteSelect"><option value="None">None</option></select>
          <div id="satelliteInfo" style="margin-top:10px;"><div style="font-weight:bold;">No satellite selected</div></div>
          <label for="otherSelection" class="section-subtitle" style="margin-top:10px;">Other Selections:</label>
          <select id="otherSelection">
            <option value="Earth">Earth</option>
            <option value="Moon">Moon</option>
          </select>
        </div>
      </div>
    </div>
  </div>`;
}

// -------------------------------------------------------------------
// Satellite info panel
// -------------------------------------------------------------------
export function updateSatelliteInfo(infoDiv, sat) {
    if (!infoDiv) return;

    if (!sat) {
        infoDiv.innerHTML = '<div style="font-weight:bold;">No satellite selected</div>';
        return;
    }

    const m = sat.meta ?? {};
    const tle1 = sat.tle_line1 ?? '—';
    const tle2 = sat.tle_line2 ?? '—';

    const kv = {
        orbitType: sat.orbitType ?? m.orbital_slot?.nominal ?? '—',
        company: sat.company ?? m.manufacturer ?? '—',
        satellite_name: sat.satellite_name ?? sat.name ?? '—',
        norad_id: sat.norad_id ?? m.norad_id ?? '—',
        launch_date: sat.launch_date ?? '—',
        tle_line1: tle1,
        tle_line2: tle2
    };

    const rows = Object.entries(kv)
        .map(([k, v]) => `<tr><td class="k">${k}</td><td class="v" style="color:#ffd966;">${v}</td></tr>`)
        .join('');

    infoDiv.innerHTML = `
    <table class="meta-table" style="font-size:12px;">
      ${rows}
    </table>`;
}
