// js/satelliteMenu.js
// -------------------------------------------------------------------
// Returns HTML markup for the satellite-control sidebar.
// -------------------------------------------------------------------

export function satelliteMenuLoader() {
    return /* html */ `
  <div id="controlsContainer">
    <div id="menuHeaderRow" class="menu-header-row" aria-label="Menu, version, and server status">
      <div id="versionDisplay"></div>
      <div id="serverStatusBlock" class="server-status-block">
        <button id="serverStatusButton" type="button" class="server-status-button server-state-checking" aria-label="Checking server connection" aria-controls="serverStatusPanel" aria-expanded="false" title="Checking server connection">
          <img id="serverStatusIcon" class="server-status-icon" src="icons/server_checking.svg" alt="" aria-hidden="true">
          <span id="serverStatusText">Checking server</span>
        </button>
        <div id="serverStatusPanel" class="server-status-panel" role="status" aria-live="polite" hidden>
          <div><span>Server URL</span><strong id="serverStatusUrl">http://127.0.0.1:8000</strong></div>
          <div><span>Connection</span><strong id="serverStatusState">Checking</strong></div>
          <div><span>Data source</span><strong id="serverDataSource">Local files</strong></div>
          <div><span>App version</span><strong id="serverAppVersion">1.5.17</strong></div>
          <div><span>API version</span><strong id="serverApiVersion">Unavailable</strong></div>
          <div><span>Last data load</span><strong id="serverLastSync">Never</strong></div>
          <button id="serverReconnectButton" type="button" class="menu-secondary-action server-reconnect-button">Reconnect / Refresh</button>
        </div>
        <div id="serverOfflineNotice" class="server-offline-notice" role="status" aria-live="polite" hidden>Server unavailable. Using local satellite data.</div>
      </div>
    </div>

    <div class="menu-accordion" aria-label="OpenBEXI menu sections">
      <section id="viewAccordionSection" class="menu-accordion-section menu-section-view">
        <h3 id="viewAccordionHeader" role="button" tabindex="0" aria-controls="viewContent" aria-expanded="true" data-collapsible-target="viewContent" class="section-heading menu-accordion-heading menu-accordion-heading-view" data-default-expanded="true">
          <span>Views &amp; Time</span>
          <span class="toggle-icon">v</span>
        </h3>

        <div id="viewContent" class="collapsible-content view-option-grid" aria-labelledby="viewAccordionHeader">
          <div class="menu-time-warp-control" aria-label="Menu simulation speed control">
            <label for="menuTimeWarpSlider">Time x</label>
            <input type="range" id="menuTimeWarpSlider" min="0" max="60" step="1" value="0" aria-label="Time speed multiplier" title="Time speed multiplier">
            <span id="menuTimeWarpVal">0</span><span aria-hidden="true">x</span>
          </div>
          <div class="view-control-row view-control-row-two">
            <label><input type="checkbox" id="view3DToggle" checked>Globe</label>
            <label><input type="checkbox" id="viewMercatorToggle">Mercator</label>
          </div>
          <div class="view-control-row view-control-row-three">
            <label><input type="checkbox" id="highDefToggle"> High Def.</label>
            <label><input type="checkbox" id="showECEFAxesToggle"> ECEF Axes</label>
            <label><input type="checkbox" id="showDayNightToggle" checked> Day/Night</label>
          </div>
          <div class="view-control-row view-shortcut-row">
            <button id="selectFirstStarlinkButton" type="button" class="view-shortcut-button" aria-label="Starlink shortcut unavailable" disabled>Starlink unavailable</button>
            <button id="selectIssButton" type="button" class="view-shortcut-button" aria-label="ISS shortcut unavailable" disabled>ISS unavailable</button>
          </div>
        </div>
      </section>

      <section id="satelliteAccordionSection" class="menu-accordion-section menu-section-satellite">
        <h3 id="satelliteAccordionHeader" role="button" tabindex="0" aria-controls="satelliteSelectionContent" aria-expanded="true" data-collapsible-target="satelliteSelectionContent" class="section-heading menu-accordion-heading menu-accordion-heading-satellite" data-default-expanded="true">
          <span>Satellite Selection</span>
          <span class="toggle-icon">v</span>
        </h3>

        <div id="satelliteSelectionContent" class="collapsible-content" aria-labelledby="satelliteAccordionHeader">
          <div class="satellite-combobox-block">
            <div class="satellite-combobox">
              <input id="satelliteSearchInput" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="satelliteSearchResults" aria-describedby="satelliteSearchHelp" aria-label="Search satellite by name, NORAD ID, orbit type, or tag" placeholder="Search satellite or NORAD ID">
              <button id="satelliteSearchClear" type="button" class="search-clear-button" aria-label="Clear satellite search">Clear</button>
              <div id="satelliteSearchHelp" class="sr-only">Use arrow keys to navigate results, Enter to select, and Escape to close results.</div>
              <ul id="satelliteSearchResults" class="satellite-search-results" role="listbox" aria-label="Satellite search results" hidden></ul>
            </div>
            <select id="satelliteSelect" class="legacy-satellite-select" aria-hidden="true" tabindex="-1"><option value="None">None</option></select>
            <div id="satelliteSearchEmpty" class="empty-state" hidden>No satellites match this search.</div>
          </div>

          <div id="selectedSatelliteControls" class="satellite-option-grid" aria-label="Selected satellite options" aria-hidden="true" hidden>
            <label><input type="checkbox" id="showYPRToggle"> Yaw-Pitch-Roll</label>
            <label class="checkbox-row"><input type="checkbox" id="showFootprintCheckbox"><span>Show Footprint</span></label>
            <label class="checkbox-row"><input type="checkbox" id="showOnlySelectedSatellite" checked><span>Show only selected satellite</span></label>
            <label><input type="checkbox" id="showOrbitFrameToggle"> Orbit Frame (LVLH)</label>
            <label><input type="checkbox" id="showOrbitToggle"> Show Orbit</label>
          </div>

          <div id="yprSlidersRow" class="ypr-slider-grid">
            <label>Yaw:
              <input type="range" id="yawSlider" min="-180" max="180" step="0.1" value="0">
              <span id="yawVal">0</span>
            </label>

            <label>Pitch:
              <input type="range" id="pitchSlider" min="-180" max="180" step="0.1" value="0">
              <span id="pitchVal">0</span>
            </label>

            <label>Roll:
              <input type="range" id="rollSlider" min="-180" max="180" step="0.1" value="0">
              <span id="rollVal">0</span>
            </label>
          </div>

          <div id="selectedSatelliteSummary" class="selected-satellite-summary" hidden></div>
          <div id="satelliteInfo" hidden></div>
        </div>
      </section>

      <section id="filtersAccordionSection" class="menu-accordion-section menu-section-filters">
        <h3 id="filtersAccordionHeader" role="button" tabindex="0" aria-controls="filtersContent" aria-expanded="true" data-collapsible-target="filtersContent" class="section-heading menu-accordion-heading menu-accordion-heading-filters" data-default-expanded="true">
          <span>Filters - Satellites Found: <span id="satelliteCountDisplay">0</span></span>
          <span class="toggle-icon">v</span>
        </h3>

        <div id="filtersContent" class="collapsible-content filters-panel" aria-labelledby="filtersAccordionHeader">
          <div class="filter-toolbar">
            <div id="filterStatusSummary" class="filter-status-summary" aria-live="polite">MEO + All tags + Debris shown | 0 satellites</div>
            <button id="resetFiltersButton" type="button" class="menu-secondary-action">Reset Filters</button>
          </div>
          <div id="filterEmptyState" class="empty-state" hidden>
            <span>No satellites match these filters.</span>
            <button id="resetFiltersEmptyButton" type="button">Reset filters</button>
          </div>

          <div class="filter-block orbit-filter-block">
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
            <div class="menu-helper">Use tags to narrow by constellation, operator, or mission group.</div>
            <div id="companyFilter" class="tag-chip-list" role="group" aria-label="Tag filter">
              <label class="filter-chip">
                <input type="checkbox" value="ALL COMPANY" checked>
                <span>All tags</span>
              </label>
            </div>
          </div>

          <div class="filter-block">
            <div class="filter-label">Debris filter:</div>
            <div class="menu-helper">Show all objects, hide debris, or inspect debris only.</div>
            <div id="debrisFilter" class="segmented-control debris-segmented" role="radiogroup" aria-label="Debris filter">
              <button type="button" class="segmented-option" data-debris-filter="show" aria-pressed="true">Show</button>
              <button type="button" class="segmented-option" data-debris-filter="hide" aria-pressed="false">Hide</button>
              <button type="button" class="segmented-option" data-debris-filter="only" aria-pressed="false">Debris only</button>
            </div>
          </div>
        </div>
      </section>

      <section id="otherAccordionSection" class="menu-accordion-section menu-section-other">
        <h3 id="otherAccordionHeader" role="button" tabindex="0" aria-controls="otherSelectionsContent" aria-expanded="false" data-collapsible-target="otherSelectionsContent" class="section-heading menu-accordion-heading menu-accordion-heading-other" data-default-collapsed="true">
          <span>Other Selections</span>
          <span class="toggle-icon">v</span>
        </h3>
        <div id="otherSelectionsContent" class="collapsible-content other-selections-panel collapsed" aria-labelledby="otherAccordionHeader">
          <label for="otherSelection" class="section-subtitle">Other Selections:</label>
          <div class="menu-helper">Switch the observer context between Earth and Moon without changing the app mode.</div>
          <select id="otherSelection">
            <option value="Earth">Earth</option>
            <option value="Moon">Moon</option>
          </select>
        </div>
      </section>

      <section id="timelinesAccordionSection" class="menu-accordion-section menu-section-timelines">
        <h3 id="timelinesAccordionHeader" role="button" tabindex="0" aria-controls="timelineContent" aria-expanded="false" data-collapsible-target="timelineContent" class="section-heading menu-accordion-heading menu-accordion-heading-timelines" data-default-collapsed="true">
          <span>Timelines</span>
          <span class="toggle-icon">v</span>
        </h3>
        <div id="timelineContent" class="collapsible-content timeline-control-panel collapsed" aria-labelledby="timelinesAccordionHeader">
          <div class="menu-helper">Timeline data loads after the first globe render. Disabled controls are still preparing.</div>
          <label class="checkbox-row timeline-checkbox-control">
            <input type="checkbox" id="launchTimelineToggle" aria-describedby="launchTimelineHelp">
            <span>Show Launch Timeline</span>
          </label>
          <div id="launchTimelineHelp" class="menu-helper">Shows launch history for loaded satellites.</div>
          <label class="checkbox-row timeline-checkbox-control">
            <input type="checkbox" id="reentryTimelineToggle" aria-describedby="reentryTimelineHelp">
            <span>Show Re-entry Timeline</span>
          </label>
          <div id="reentryTimelineHelp" class="menu-helper">Shows confirmed and predicted re-entry information when ready.</div>
        </div>
      </section>

      <section id="shareAccordionSection" class="menu-accordion-section menu-section-share">
        <h3 id="shareAccordionHeader" role="button" tabindex="0" aria-controls="shareContent" aria-expanded="false" data-collapsible-target="shareContent" class="section-heading menu-accordion-heading menu-accordion-heading-share" data-default-collapsed="true">
          <span>Share</span>
          <span class="toggle-icon">v</span>
        </h3>
        <div id="shareContent" class="collapsible-content share-panel collapsed" aria-labelledby="shareAccordionHeader">
          <div class="menu-helper">Create a safe link for the current view, filters, selected satellite, simulation time, and display settings.</div>
          <div id="shareStateSummary" class="share-state-summary">Current app state is ready to share.</div>
          <div class="share-action-row">
            <button id="copyShareLinkButton" type="button" class="menu-secondary-action">Copy Link</button>
            <button id="nativeShareButton" type="button" class="menu-secondary-action">Native Share</button>
          </div>
          <input id="shareLinkOutput" class="share-link-output" type="text" readonly aria-label="Generated share link">
          <div class="share-image-tools" aria-label="Share image tools">
            <div class="share-image-preview-frame">
              <img id="shareImagePreview" class="share-image-preview" alt="Captured current canvas preview" hidden>
              <div id="shareImagePlaceholder" class="share-image-placeholder">Canvas preview not captured yet.</div>
            </div>
            <div class="share-action-row share-image-action-row">
              <button id="previewShareImageButton" type="button" class="menu-secondary-action">Preview Image</button>
              <button id="downloadShareImageButton" type="button" class="menu-secondary-action" disabled>Download Image</button>
              <button id="copyShareImageButton" type="button" class="menu-secondary-action" disabled>Copy Image</button>
            </div>
          </div>
          <div id="shareFeedback" class="share-feedback" role="status" aria-live="polite"></div>
        </div>
      </section>

      <section id="helpAccordionSection" class="menu-accordion-section menu-section-help">
        <h3 id="helpAccordionHeader" role="button" tabindex="0" aria-controls="helpContent" aria-expanded="false" data-collapsible-target="helpContent" class="section-heading menu-accordion-heading menu-accordion-heading-help" data-default-collapsed="true">
          <span>Help</span>
          <span class="toggle-icon">v</span>
        </h3>
        <div id="helpContent" class="collapsible-content help-panel collapsed" aria-labelledby="helpAccordionHeader">
          <div class="help-smart-grid" aria-label="Project help links">
            <a class="help-doc-card" href="https://github.com/arcazj/openbexi_earth_orbit" title="https://github.com/arcazj/openbexi_earth_orbit" target="_blank" rel="noopener noreferrer">
              <strong>GitHub</strong>
              <span>Repository and source files</span>
            </a>
            <a id="readmeMarkdownLink" class="help-doc-card help-markdown-link" href="README.md" title="README.md" data-markdown-source="README.md" data-markdown-title="README">
              <strong>README</strong>
              <span>Render project guide as Markdown</span>
            </a>
            <a id="releasesHistoryMarkdownLink" class="help-doc-card help-markdown-link" href="PROMPT_History.md" title="PROMPT_History.md" data-markdown-source="PROMPT_History.md" data-markdown-title="Releases History">
              <strong>Releases History</strong>
              <span>Render release prompts as Markdown</span>
            </a>
            <a id="licenseMarkdownLink" class="help-doc-card" href="LICENSE.md" title="LICENSE.md" target="_blank" rel="noopener noreferrer">
              <strong>Licenses</strong>
              <span>Open license Markdown page</span>
            </a>
          </div>
          <div id="helpMarkdownPanel" class="help-markdown-panel" aria-live="polite" hidden>
            <div class="help-markdown-header">
              <strong id="helpMarkdownTitle">Markdown Preview</strong>
              <a id="helpMarkdownDirectLink" href="README.md">Open file</a>
            </div>
            <div id="helpMarkdownStatus" class="menu-helper">Select README or Releases History to render Markdown here.</div>
            <div id="helpMarkdownContent" class="help-markdown-content"></div>
          </div>
          <div class="api-docs-panel" aria-label="Developer documentation links">
            <strong>Developer Docs</strong>
            <div id="apiDocsStatus" class="menu-helper">Swagger and API links open in a separate page. If the Python server is offline, start it and retry the opened page.</div>
            <div class="api-docs-link-list">
              <a id="swaggerDocsLink" class="api-docs-link" href="http://127.0.0.1:8000/docs" target="_blank" rel="noopener noreferrer" title="Open Swagger UI in a separate page">Swagger</a>
              <a id="openApiSchemaLink" class="api-docs-link" href="http://127.0.0.1:8000/openapi.json" target="_blank" rel="noopener noreferrer" title="Open OpenAPI schema in a separate page">API</a>
            </div>
          </div>
          <div class="help-disclaimer" role="note" aria-label="Disclaimer">
            <strong>Disclaimer:</strong>
            This app is for visualization, educational, and experimental purposes only. The author is not responsible for inaccurate satellite data, TLE propagation, model rendering, orbital position, attitude/orientation, timing, visualization results, or limitations from third-party libraries including satellite.js. Do not use it for navigation, safety, mission planning, collision avoidance, or operational satellite decisions.
          </div>
        </div>
      </section>
    </div>
  </div>`;
}

// -------------------------------------------------------------------
// Satellite info panel
// -------------------------------------------------------------------
export function updateSatelliteInfo(infoDiv, sat) {
    if (!infoDiv) return;

    if (!sat) {
        infoDiv.hidden = true;
        infoDiv.innerHTML = '';
        return;
    }
    infoDiv.hidden = false;

    const m = sat.meta ?? {};
    const tle1 = sat.tle_line1 ?? 'N/A';
    const tle2 = sat.tle_line2 ?? 'N/A';

    const kv = {
        orbitType: sat.orbitType ?? m.orbital_slot?.nominal ?? 'N/A',
        company: sat.company ?? m.manufacturer ?? 'N/A',
        satellite_name: sat.satellite_name ?? sat.name ?? 'N/A',
        norad_id: sat.norad_id ?? m.norad_id ?? 'N/A',
        launch_date: sat.launch_date ?? 'N/A',
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
