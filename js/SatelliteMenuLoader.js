// js/satelliteMenu.js
// -------------------------------------------------------------------
// Returns HTML markup for the satellite‑control sidebar.
// Clean template‑literal version (easier to read / edit than string +).
// -------------------------------------------------------------------

export function satelliteMenuLoader() {
    return /* html */ `
  <div id="controlsContainer">
    <div id="versionDisplay"></div>

   <div class="control-group">
  <h3 data-collapsible-target="filtersContent">
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
    <select id="companyFilter">
      <option value="ALL COMPANY">ALL COMPANY</option>
    </select>
  </div>
</div>

</div>


  <div class="control-group">
  <h3 data-collapsible-target="viewContent">View <span class="toggle-icon">▾</span></h3>

  <!-- 2‑column grid -->
  <div id="viewContent" class="collapsible-content"
       style="display:grid;grid-template-columns:repeat(2,auto);column-gap:14px;row-gap:4px;">

    <label><input type="checkbox" id="view3DToggle"      checked> 3D&nbsp;Globe</label>
    <label><input type="checkbox" id="viewMercatorToggle"> 2D&nbsp;Mercator</label>

    <label><input type="checkbox" id="highDefToggle">    High&nbsp;Definition</label>
    <label><input type="checkbox" id="showECEFAxesToggle"> ECEF&nbsp;Axes</label>

    <label><input type="checkbox" id="showOrbitFrameToggle"> Orbit&nbsp;Frame&nbsp;(LVLH)</label>
    <label><input type="checkbox" id="showYPRToggle">    Yaw‑Pitch‑Roll</label>
  
    <label><input type="checkbox" id="showDayNightToggle" checked>Day/Night Shading</label>
    <label class="checkbox-row"><input type="checkbox" id="showFootprintCheckbox"><span>Show Footprint</span></label>
    
    <label class="checkbox-row"><input type="checkbox" id="showOnlySelectedSatellite"><span>Show only selected satellite</span></label>
    
    <label><input type="checkbox" id="showOrbitToggle" checked>Show Orbit</label>
          
  </div>
</div>

    
    <div class="control-group" id="yprControls" style="display:none;">
      <h3>Body-Frame Bias (deg)</h3>
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

    <div class="control-group">
      <h3>Satellite Selection</h3>
      <div>
        <label for="satelliteSelect">Select Satellite:</label>
        <select id="satelliteSelect">
          <option value="None">None</option>
        </select>

        <div id="satelliteInfo">
          <div style="font-weight:bold;">No satellite selected</div>
        </div>
      </div>
    </div>
  </div>`;
}

export function updateSatelliteInfo(infoDiv, sat) {
    if (!infoDiv) return;

    // No satellite selected
    if (!sat) {
        infoDiv.innerHTML =
            '<div style="font-weight:bold;">No satellite selected</div>';
        return;
    }

    // Shortcuts
    const m   = sat.meta ?? {};
    const tle1 = sat.tle_line1 ?? '—';
    const tle2 = sat.tle_line2 ?? '—';

    // Build key‑value rows
    const kv = {
        orbitType       : sat.orbitType          ?? m.orbital_slot?.nominal ?? '—',
        company         : sat.company            ?? m.manufacturer ?? '—',
        satellite_name  : sat.satellite_name     ?? sat.name ?? '—',
        norad_id        : sat.norad_id           ?? m.norad_id ?? '—',
        launch_date     : sat.launch_date          ?? '—',
        tle_line1       : tle1,
        tle_line2       : tle2
    };

    const rows = Object.entries(kv)
        .map(([k,v]) => `<tr><td class="k">${k}</td><td class="v" style="color:#ffd966;">${v}</td></tr>`)
        .join('');

    infoDiv.innerHTML = `
        <table class="meta-table" style="font-size:12px;">
            ${rows}
        </table>`;
}