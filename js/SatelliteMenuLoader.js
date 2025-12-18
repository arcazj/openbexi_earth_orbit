// js/satelliteMenu.js
// -------------------------------------------------------------------
// Returns HTML markup for the satellite-control sidebar.
// -------------------------------------------------------------------

export function satelliteMenuLoader() {
    return /* html */ `
  <div id="controlsContainer">
    <div id="versionDisplay"></div>

    <!-- Filters -->
    <div class="timeline-toggle-row">
      <button id="launchTimelineToggle" class="timeline-toggle">Show Launch Timeline</button>
    </div>

    <div class="control-group">
      <h3 data-collapsible-target="filtersContent" class="section-heading">
        Filters – Satellites Found: <span id="satelliteCountDisplay">0</span>
        <span class="toggle-icon">▾</span>
      </h3>

      <div id="filtersContent" class="collapsible-content">
        <div class="filter-column">
          <label for="orbitTypeFilter">Orbit Type:</label>
          <select id="orbitTypeFilter">
            <option value="ALL">ALL</option>
            <option value="LEO">LEO</option>
            <option value="MEO">MEO</option>
            <option value="GEO">GEO</option>
          </select>
        </div>

        <div class="filter-column">
          <label for="companyFilter">Company:</label>
          <div id="companyFilter" class="company-checkbox-list" role="listbox" aria-multiselectable="true">
            <label class="company-checkbox">
              <input type="checkbox" value="ALL COMPANY" checked>
              <span>ALL COMPANY</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- View -->
    <div class="control-group">
      <h3 data-collapsible-target="viewContent" class="section-heading">
        View <span class="toggle-icon">▾</span>
      </h3>

      <!-- 2-column grid -->
      <div id="viewContent" class="collapsible-content"
           style="display:grid;grid-template-columns:repeat(2,auto);column-gap:14px;row-gap:4px;">

        <label><input type="checkbox" id="view3DToggle" checked> 3D&nbsp;Globe</label>
        <label><input type="checkbox" id="viewMercatorToggle"> 2D&nbsp;Mercator</label>

        <label><input type="checkbox" id="highDefToggle"> High&nbsp;Definition</label>
        <label><input type="checkbox" id="showECEFAxesToggle"> ECEF&nbsp;Axes</label>

        <label><input type="checkbox" id="showOrbitFrameToggle"> Orbit&nbsp;Frame&nbsp;(LVLH)</label>
        <label><input type="checkbox" id="showDayNightToggle" checked> Day/Night Shading</label>
      </div>
    </div>

    <!-- Body-frame bias sliders (YPR) -->
    <div class="control-group" id="yprControls" style="display:none;">
      <h3 class="section-heading">Body-Frame Bias (deg)</h3>
      <label style="margin-bottom:4px; display:block;">Yaw:
        <input type="range" id="yawSlider"   min="-180" max="180" step="0.1" value="0">
        <span id="yawVal">0</span>
      </label>
      <label style="margin-bottom:4px; display:block;">Pitch:
        <input type="range" id="pitchSlider" min="-180" max="180" step="0.1" value="0">
        <span id="pitchVal">0</span>
      </label>
      <label style="display:block;">Roll:
        <input type="range" id="rollSlider"  min="-180" max="180" step="0.1" value="0">
        <span id="rollVal">0</span>
      </label>
    </div>

    <!-- Satellite selection -->
    <div class="control-group">
      <h3 class="section-heading">Satellite Selection</h3>

      <!-- 2-column grid for selection-related toggles -->
      <div id="satelliteSelectionContent" class="collapsible-content"
           style="display:grid;grid-template-columns:repeat(2,auto);column-gap:14px;row-gap:4px;">

        <label><input type="checkbox" id="showYPRToggle"> Yaw-Pitch-Roll</label>

        <label class="checkbox-row">
          <input type="checkbox" id="showFootprintCheckbox">
          <span>Show Footprint</span>
        </label>

        <label class="checkbox-row">
          <input type="checkbox" id="showOnlySelectedSatellite">
          <span>Show only selected satellite</span>
        </label>

        <label><input type="checkbox" id="showOrbitToggle" checked> Show Orbit</label>
      </div>

      <div style="margin-top:8px;">

        <!-- BLUE BOLD: Select Satellite -->
        <label for="satelliteSelect" class="section-heading">
          Select Satellite:
        </label>
        <select id="satelliteSelect">
          <option value="None">None</option>
        </select>

        <!-- Satellite info (No satellite selected / table) -->
        <div id="satelliteInfo" style="margin-top:10px;">
          <div style="font-weight:bold;">No satellite selected</div>
        </div>

        <!-- BLUE BOLD: Other Selections, AFTER the info field -->
        <label for="otherSelection" class="section-subtitle" style="margin-top:10px;">
          Other Selections:
        </label>
        <select id="otherSelection">
          <option value="Earth">Earth</option>
          <option value="Moon">Moon</option>
        </select>

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
        infoDiv.innerHTML =
            '<div style="font-weight:bold;">No satellite selected</div>';
        return;
    }

    const m    = sat.meta ?? {};
    const tle1 = sat.tle_line1 ?? '—';
    const tle2 = sat.tle_line2 ?? '—';

    const kv = {
        orbitType      : sat.orbitType      ?? m.orbital_slot?.nominal ?? '—',
        company        : sat.company        ?? m.manufacturer          ?? '—',
        satellite_name : sat.satellite_name ?? sat.name                ?? '—',
        norad_id       : sat.norad_id       ?? m.norad_id              ?? '—',
        launch_date    : sat.launch_date    ?? '—',
        tle_line1      : tle1,
        tle_line2      : tle2
    };

    const rows = Object.entries(kv)
        .map(([k, v]) =>
            `<tr><td class="k">${k}</td><td class="v" style="color:#ffd966;">${v}</td></tr>`
        )
        .join('');

    infoDiv.innerHTML = `
      <table class="meta-table" style="font-size:12px;">
        ${rows}
      </table>`;
}
