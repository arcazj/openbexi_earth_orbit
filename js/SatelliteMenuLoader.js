// js/satelliteMenu.js
// -------------------------------------------------------------------
// Returns HTML markup for the tracked-object control sidebar.
// -------------------------------------------------------------------

import { APP_VERSION } from './releaseVersion.js';

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
          <div><span>App version</span><strong id="serverAppVersion">${APP_VERSION}</strong></div>
          <div><span>API version</span><strong id="serverApiVersion">Unavailable</strong></div>
          <div><span>Last data load</span><strong id="serverLastSync">Never</strong></div>
          <button id="serverReconnectButton" type="button" class="menu-secondary-action server-reconnect-button">Reconnect / Refresh</button>
        </div>
      </div>
    </div>

    <div class="menu-accordion" aria-label="OpenBEXI menu sections">
      <section id="viewAccordionSection" class="menu-accordion-section menu-section-view">
        <h3 id="viewAccordionHeader" role="button" tabindex="0" aria-controls="viewContent" aria-expanded="true" data-collapsible-target="viewContent" class="section-heading menu-accordion-heading menu-accordion-heading-view" data-default-expanded="true">
          <span>Views &amp; Time</span>
          <span class="toggle-icon">v</span>
        </h3>

        <div id="viewContent" class="collapsible-content view-option-grid" aria-labelledby="viewAccordionHeader">
          <div class="view-checkbox-table" role="group" aria-label="Views and time display controls">
            <div class="view-checkbox-cell"><label><input type="checkbox" id="solarSystemOverviewToggle">Solar System</label></div>
            <div class="view-checkbox-cell"><label><input type="checkbox" id="starsMilkyWayToggle" checked>Stars &amp; Milky Way</label></div>
            <div class="view-checkbox-cell view-checkbox-empty" aria-hidden="true"></div>
            <div class="view-checkbox-cell"><label><input type="checkbox" id="view3DToggle" checked>Globe</label></div>
            <div class="view-checkbox-cell"><label><input type="checkbox" id="highDefToggle"> High Def.</label></div>
            <div class="view-checkbox-cell"><label><input type="checkbox" id="showECEFAxesToggle"> ECEF Axes</label></div>
            <div class="view-checkbox-cell"><label><input type="checkbox" id="viewMercatorToggle">Mercator</label></div>
            <div class="view-checkbox-cell"><label><input type="checkbox" id="showDayNightToggle" checked> Day/Night</label></div>
            <div class="view-checkbox-cell view-checkbox-empty" aria-hidden="true"></div>
          </div>
          <div id="solarSystemOptions" class="solar-system-options" hidden aria-hidden="true">
            <div class="view-control-row view-control-row-two solar-system-control-row">
              <label><input type="checkbox" id="solarSystemPlanetLabelsToggle" checked>Planet Labels</label>
              <label><input type="checkbox" id="solarSystemOrbitPathsToggle" checked>Orbit Paths</label>
            </div>
            <div class="view-control-row view-control-row-two solar-system-control-row">
              <label><input type="checkbox" id="solarSystemPlanetTexturesToggle" checked>Planet Textures</label>
              <label><input type="checkbox" id="solarSystemSunGlowToggle" checked>Sun Glow</label>
            </div>
            <div class="solar-system-action-row">
              <button id="solarSystemBackButton" type="button" class="menu-secondary-action">Back to Solar System Overview</button>
              <button id="solarSystemExitButton" type="button" class="menu-secondary-action">Exit Solar System Overview</button>
            </div>
            <div id="solarSystemSelectionSummary" class="solar-system-selection-summary" aria-live="polite">Solar System overview mode</div>
          </div>
          <div id="starsMilkyWayOptions" class="stars-milky-way-options" aria-hidden="false">
            <div class="view-control-row view-control-row-three star-view-control-row">
              <label><input type="checkbox" id="showRaDecGridToggle">RA/Dec Grid</label>
              <label><input type="checkbox" id="showBrightStarLabelsToggle">Bright Labels</label>
              <label><input type="checkbox" id="showStarAtmosphereToggle">Atmosphere</label>
            </div>
            <div id="starCatalogSummary" class="star-catalog-summary" aria-live="polite" hidden aria-hidden="true">Displaying bundled reference stars</div>
          </div>
        </div>
      </section>

      <section id="satelliteAccordionSection" class="menu-accordion-section menu-section-satellite">
        <h3 id="satelliteAccordionHeader" role="button" tabindex="0" aria-controls="satelliteSelectionContent" aria-expanded="true" data-collapsible-target="satelliteSelectionContent" class="section-heading menu-accordion-heading menu-accordion-heading-satellite" data-default-expanded="true">
          <span class="satellite-heading-title">Tracked Objects - Matches <span id="satelliteCountDisplay" class="satellite-found-count" aria-live="polite" aria-label="0 tracked objects match active filters out of 0 total tracked objects">0 / 0</span></span>
          <span class="toggle-icon">v</span>
        </h3>

        <div id="satelliteSelectionContent" class="collapsible-content" aria-labelledby="satelliteAccordionHeader">
          <div class="satellite-combobox-block">
            <div class="satellite-combobox">
              <input id="satelliteSearchInput" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="satelliteSearchResults" aria-describedby="satelliteSearchHelp" aria-label="Search tracked object by name, full NORAD ID, orbit class, object type, or tag" placeholder="Search tracked object or NORAD ID">
              <button id="satelliteSearchClear" type="button" class="search-clear-button" aria-label="Clear tracked-object search">Clear</button>
              <button id="resetFiltersButton" type="button" class="menu-secondary-action reset-filters-inline-button">Reset Filters</button>
              <div id="satelliteSearchHelp" class="sr-only">Use arrow keys to navigate results, Enter to select, and Escape to close results.</div>
              <ul id="satelliteSearchResults" class="satellite-search-results" role="listbox" aria-label="Tracked-object search results" hidden></ul>
            </div>
            <select id="satelliteSelect" class="legacy-satellite-select" aria-hidden="true" tabindex="-1"><option value="None">None</option></select>
            <div id="satelliteSearchEmpty" class="empty-state" hidden>No tracked objects match this search.</div>
          </div>
          <div class="satellite-shortcut-row" aria-label="Satellite shortcuts">
            <button id="selectFirstStarlinkButton" type="button" class="satellite-shortcut-button" aria-label="Starlink shortcut unavailable" disabled>Starlink unavailable</button>
            <button id="selectIssButton" type="button" class="satellite-shortcut-button" aria-label="ISS shortcut unavailable" disabled>ISS unavailable</button>
          </div>

          <div class="satellite-filter-panel filters-panel" aria-label="Tracked-object filters">
            <div id="filterEmptyState" class="empty-state" hidden>
              <span>No tracked objects match these filters.</span>
              <button id="resetFiltersEmptyButton" type="button">Reset filters</button>
            </div>

            <div class="filter-block orbit-filter-block">
              <div id="orbitTypeFilter" class="segmented-control orbit-segmented" role="group" aria-label="Orbit filter">
                <button type="button" class="segmented-option" data-orbit-filter="ALL" aria-pressed="false">ALL</button>
                <button type="button" class="segmented-option" data-orbit-filter="GEO" aria-pressed="false">GEO</button>
                <button type="button" class="segmented-option" data-orbit-filter="MEO" aria-pressed="true">MEO</button>
                <button type="button" class="segmented-option" data-orbit-filter="LEO" aria-pressed="false">LEO</button>
                <button type="button" class="segmented-option" data-orbit-filter="HEO" aria-label="HRO orbit filter" aria-pressed="false">HRO</button>
                <button type="button" class="segmented-option" data-orbit-filter="OTHER" aria-pressed="false">Others</button>
              </div>
            </div>

            <div class="filter-block object-type-filter-block">
              <div id="objectTypeFilter" class="segmented-control object-type-segmented" role="group" aria-label="Tracked object type filter">
                <button type="button" class="segmented-option is-active" data-object-type-filter="ALL" aria-pressed="true">ALL</button>
                <button type="button" class="segmented-option" data-object-type-filter="PAYLOAD" aria-pressed="false">Payload</button>
                <button type="button" class="segmented-option" data-object-type-filter="DEBRIS" aria-pressed="false">Debris</button>
                <button type="button" class="segmented-option" data-object-type-filter="ROCKET_BODY" aria-pressed="false">Rocket Body</button>
                <button type="button" class="segmented-option" data-object-type-filter="MISSION_RELATED" aria-pressed="false">Mission</button>
                <button type="button" class="segmented-option" data-object-type-filter="UNKNOWN" aria-pressed="false">Unknown</button>
              </div>
              <label class="tracked-history-toggle"><input type="checkbox" id="includeHistoricalTrackedObjects" aria-label="Include decayed and absent tracked-object history"><span>Include history</span></label>
            </div>

            <div class="filter-block">
              <span class="filter-label">Catalog tags</span>
              <div id="companyFilter" class="tag-chip-list" role="group" aria-label="Tag filter">
                <label class="filter-chip">
                  <input type="checkbox" value="ALL COMPANY" checked>
                  <span>All tags</span>
                </label>
              </div>
            </div>

            <section id="trackedDebrisFacets" class="tracked-debris-facets" aria-labelledby="trackedDebrisFacetsTitle" hidden>
              <div class="tracked-facet-header">
                <strong id="trackedDebrisFacetsTitle">Debris filters</strong>
                <button id="resetTrackedDebrisFacets" class="tracked-facet-reset" type="button">Reset debris filters</button>
              </div>
              <div id="trackedDebrisFacetSummary" class="tracked-facet-summary" role="status" aria-live="polite">0 matches | 0 positioned | 0 position unavailable</div>

              <fieldset class="tracked-facet-position">
                <legend>Position availability</legend>
                <div id="trackedPositionFacet" class="tag-chip-list" role="group" aria-label="Position availability filter">
                  <label class="filter-chip"><input type="checkbox" name="trackedPositionFacet" value="ALL" checked><span>All positions</span></label>
                  <label class="filter-chip"><input type="checkbox" name="trackedPositionFacet" value="POSITIONED"><span>Positioned</span></label>
                  <label class="filter-chip"><input type="checkbox" name="trackedPositionFacet" value="METADATA_ONLY"><span>Position unavailable</span></label>
                </div>
              </fieldset>

              <details class="tracked-facet-disclosure" data-tracked-facet="rcs">
                <summary>Radar cross-section (m2)<span data-facet-summary="rcs">All</span></summary>
                <div id="trackedRcsFacet" class="tracked-facet-options" role="group" aria-label="Radar cross-section filter"></div>
              </details>
              <details class="tracked-facet-disclosure" data-tracked-facet="owner">
                <summary>Owner / country<span data-facet-summary="owner">All</span></summary>
                <div id="trackedOwnerFacet" class="tracked-facet-options" role="group" aria-label="Owner or country filter"></div>
              </details>
              <details class="tracked-facet-disclosure" data-tracked-facet="launchSite">
                <summary>Launch site<span data-facet-summary="launchSite">All</span></summary>
                <div id="trackedLaunchSiteFacet" class="tracked-facet-options" role="group" aria-label="Launch site filter"></div>
              </details>
              <details class="tracked-facet-disclosure" data-tracked-facet="status">
                <summary>Operational status code<span data-facet-summary="status">All</span></summary>
                <div id="trackedStatusFacet" class="tracked-facet-options" role="group" aria-label="Operational status code filter"></div>
              </details>

              <fieldset class="tracked-launch-year-facet">
                <legend>Launch year</legend>
                <label>From<select id="trackedLaunchYearFrom" aria-label="Launch year from"><option value="">Any</option></select></label>
                <label>To<select id="trackedLaunchYearTo" aria-label="Launch year to"><option value="">Any</option></select></label>
              </fieldset>
              <label class="tracked-designator-filter">International designator
                <input id="trackedDesignatorFacet" type="search" maxlength="64" autocomplete="off" placeholder="Example: 1999-025">
              </label>
            </section>

            <div id="trackedCatalogStatus" class="tracked-catalog-status" role="status" aria-live="polite">Current orbital catalog</div>
            <dl id="trackedCatalogCounts" class="tracked-catalog-counts" aria-label="Tracked catalog counts">
              <div><dt>Tracked</dt><dd id="trackedCountTotal">0</dd></div>
              <div><dt>Matches</dt><dd id="trackedCountFiltered">0</dd></div>
              <div><dt>Current</dt><dd id="trackedCountCurrent">0</dd></div>
              <div><dt>History</dt><dd id="trackedCountHistorical">0</dd></div>
              <div><dt>Positioned</dt><dd id="trackedCountPropagatable">0</dd></div>
              <div><dt>Position unavailable</dt><dd id="trackedCountMetadataOnly">0</dd></div>
              <div><dt>Visible</dt><dd id="trackedCountRenderReady">0</dd></div>
              <div><dt>Quarantine</dt><dd id="trackedCountQuarantine">0</dd></div>
            </dl>
            <ul id="trackedObjectLegend" class="tracked-object-legend" aria-label="Tracked-object color key" aria-description="Colors identify markers on the globe and map. Shapes are additional cues on the detailed map.">
              <li><span class="tracked-marker tracked-marker-payload" aria-hidden="true"></span>Payload</li>
              <li><span class="tracked-marker tracked-marker-debris" aria-hidden="true"></span>Debris</li>
              <li><span class="tracked-marker tracked-marker-rocket" aria-hidden="true"></span>Rocket body</li>
              <li><span class="tracked-marker tracked-marker-mission" aria-hidden="true"></span>Mission</li>
              <li><span class="tracked-marker tracked-marker-unknown" aria-hidden="true"></span>Unknown</li>
              <li><span class="tracked-marker tracked-marker-selected" aria-hidden="true"></span>Selected</li>
            </ul>
          </div>

          <div id="selectedSatelliteControls" class="satellite-option-grid" aria-label="Selected tracked-object options" aria-hidden="true" hidden>
            <label><input type="checkbox" id="showYPRToggle"> Yaw-Pitch-Roll</label>
            <label class="checkbox-row"><input type="checkbox" id="showFootprintCheckbox"><span>Show Footprint</span></label>
            <label class="checkbox-row"><input type="checkbox" id="showOnlySelectedSatellite" checked><span>Show only selected object</span></label>
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
        </div>
      </section>

      <section id="conjunctionAccordionSection" class="menu-accordion-section menu-section-conjunction">
        <h3 id="conjunctionAccordionHeader" role="button" tabindex="0" aria-controls="conjunctionContent" aria-expanded="false" data-collapsible-target="conjunctionContent" class="section-heading menu-accordion-heading menu-accordion-heading-conjunction" data-default-collapsed="true">
          <span>Close Approaches <span class="conjunction-maturity-badge">Experimental</span></span>
          <span class="toggle-icon">v</span>
        </h3>
        <div id="conjunctionContent" class="collapsible-content conjunction-panel collapsed" aria-labelledby="conjunctionAccordionHeader">
          <div class="conjunction-qualification" role="note">
            <strong>Experimental SGP4 close-approach screening</strong>
            <span>Collision probability: unavailable</span>
            <span>GP/OMM catalog with legacy TLE fallback</span>
          </div>

          <dl class="conjunction-context" aria-label="Screening context">
            <div><dt>Primary</dt><dd id="conjunctionPrimarySummary">Unavailable</dd></div>
            <div><dt>Catalog</dt><dd id="conjunctionCatalogSummary">Loading</dd></div>
            <div><dt>Frame</dt><dd>TEME</dd></div>
            <div><dt>Model</dt><dd>SGP4</dd></div>
          </dl>

          <form id="conjunctionScreeningForm" class="conjunction-form">
            <label for="conjunctionStartTime">Start UTC
              <input id="conjunctionStartTime" name="startTime" type="datetime-local" step="1" required>
            </label>
            <label for="conjunctionDurationHours">Duration (hours)
              <input id="conjunctionDurationHours" name="durationHours" type="number" min="1" max="24" step="1" value="1" required>
            </label>
            <label for="conjunctionCoarseStepSeconds">Coarse step (seconds)
              <input id="conjunctionCoarseStepSeconds" name="coarseStepSeconds" type="number" min="5" max="300" step="5" value="300" required>
            </label>
            <label for="conjunctionScreeningRadiusKm">Screening radius (km)
              <input id="conjunctionScreeningRadiusKm" name="screeningRadiusKm" type="number" min="1" max="1000" step="1" value="100" required>
            </label>
            <label for="conjunctionRefinementToleranceSeconds">TCA tolerance (seconds)
              <input id="conjunctionRefinementToleranceSeconds" name="refinementToleranceSeconds" type="number" min="0.05" max="5" step="0.05" value="0.5" required>
            </label>
            <label for="conjunctionMaxResults">Result limit
              <input id="conjunctionMaxResults" name="maxResults" type="number" min="10" max="500" step="10" value="100" required>
            </label>
            <div class="conjunction-action-row">
              <button id="conjunctionRunButton" type="submit" class="menu-secondary-action" disabled>Run Screen</button>
              <button id="conjunctionCancelButton" type="button" class="menu-secondary-action" disabled>Cancel</button>
              <button id="conjunctionExportButton" type="button" class="menu-secondary-action" disabled>Export JSON</button>
            </div>
          </form>

          <div class="conjunction-progress-block">
            <progress id="conjunctionProgress" max="100" value="0" aria-label="Screening progress"></progress>
            <div id="conjunctionStatus" role="status" aria-live="polite">Select a positioned tracked object to enable screening.</div>
          </div>

          <div id="conjunctionResults" class="conjunction-results" hidden>
            <div class="conjunction-results-toolbar">
              <label for="conjunctionResultFilter">Filter
                <input id="conjunctionResultFilter" type="search" autocomplete="off">
              </label>
              <label for="conjunctionResultSort">Sort
                <select id="conjunctionResultSort">
                  <option value="tca">TCA</option>
                  <option value="miss-distance">Miss distance</option>
                  <option value="relative-speed">Relative speed</option>
                  <option value="object">Object</option>
                </select>
              </label>
            </div>
            <div class="conjunction-table-scroll" tabindex="0" aria-label="Close-approach events">
              <table class="conjunction-table">
                <thead>
                  <tr>
                    <th scope="col">TCA</th>
                    <th scope="col">Object</th>
                    <th scope="col">Miss km</th>
                    <th scope="col">km/s</th>
                    <th scope="col">Age d</th>
                    <th scope="col">Quality</th>
                  </tr>
                </thead>
                <tbody id="conjunctionResultRows"></tbody>
              </table>
            </div>
          </div>

          <section id="conjunctionEventDetails" class="conjunction-event-details" aria-labelledby="conjunctionEventTitle" hidden>
            <div class="conjunction-event-header">
              <strong id="conjunctionEventTitle">Selected event</strong>
              <span id="conjunctionEventQuality" class="conjunction-quality-badge">Unrated</span>
            </div>
            <dl id="conjunctionEventMetrics" class="conjunction-event-metrics"></dl>
            <div class="conjunction-playback-row">
              <button id="conjunctionPlaybackButton" type="button" class="conjunction-icon-button" aria-label="Play conjunction event" title="Play" disabled>&#9654;</button>
              <label for="conjunctionPlaybackOffset">TCA offset
                <input id="conjunctionPlaybackOffset" type="range" min="-300" max="300" step="1" value="0" disabled>
              </label>
              <output id="conjunctionPlaybackOffsetValue" for="conjunctionPlaybackOffset">TCA</output>
            </div>
            <div class="conjunction-visual-note">Markers are visually exaggerated. Numeric distance is authoritative for this screening model.</div>
          </section>

          <section id="fullCatalogWorkspace" class="full-catalog-workspace" aria-labelledby="fullCatalogTitle">
            <div class="full-catalog-header">
              <strong id="fullCatalogTitle">Full-catalog job</strong>
              <span id="fullCatalogCapabilityBadge" class="full-catalog-state-badge" data-state="checking">Checking</span>
              <button id="fullCatalogRefreshButton" type="button" class="conjunction-icon-button full-catalog-refresh-button" aria-label="Refresh full-catalog capability" title="Refresh capability">&#8635;</button>
            </div>
            <div id="fullCatalogCapabilityStatus" class="full-catalog-capability-status" role="status" aria-live="polite">Checking server capability.</div>
            <div class="full-catalog-safety-note">Experimental and non-operational. Collision probability is unavailable.</div>

            <form id="fullCatalogJobForm" class="full-catalog-form">
              <label for="fullCatalogBearerToken">Bearer token
                <input id="fullCatalogBearerToken" name="fullCatalogBearerToken" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="fullCatalogTokenNote">
              </label>
              <span id="fullCatalogTokenNote" class="full-catalog-token-note">Session memory only</span>
              <div class="full-catalog-action-row">
                <button id="fullCatalogRunButton" type="submit" class="menu-secondary-action" disabled>Start Full-Catalog Job</button>
                <button id="fullCatalogCancelButton" type="button" class="menu-secondary-action" disabled>Cancel Job</button>
              </div>
            </form>

            <div id="fullCatalogJobStatusBlock" class="full-catalog-job-status" hidden>
              <progress id="fullCatalogProgress" max="100" value="0" aria-label="Full-catalog job progress"></progress>
              <div id="fullCatalogStatus" class="full-catalog-status" role="status" aria-live="polite">No job submitted.</div>
              <dl class="full-catalog-job-metrics">
                <div><dt>Job</dt><dd id="fullCatalogJobId">Unavailable</dd></div>
                <div><dt>State</dt><dd id="fullCatalogJobState">Unavailable</dd></div>
                <div><dt>Stage</dt><dd id="fullCatalogJobStage">Waiting</dd></div>
                <div><dt>Events</dt><dd id="fullCatalogEventCount">0</dd></div>
                <div><dt>Coverage</dt><dd id="fullCatalogCoverage">Pending</dd></div>
              </dl>
            </div>

            <div id="fullCatalogResults" class="full-catalog-results" hidden>
              <div class="conjunction-table-scroll" tabindex="0" aria-label="Full-catalog close-approach events">
                <table class="full-catalog-table">
                  <thead>
                    <tr>
                      <th scope="col">TCA</th>
                      <th scope="col">Object pair</th>
                      <th scope="col">Miss km</th>
                    </tr>
                  </thead>
                  <tbody id="fullCatalogResultRows"></tbody>
                </table>
              </div>
              <div id="fullCatalogResultsStatus" class="full-catalog-results-status" role="status" aria-live="polite"></div>
            </div>
          </section>
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
          <div id="launchTimelineHelp" class="menu-helper">Shows launch history for loaded tracked objects.</div>
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
          <div class="menu-helper">Create a safe link for the current view, filters, selected object, simulation time, and display settings.</div>
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
            <a id="readmeMarkdownLink" class="help-doc-card" href="markdown_viewer.html?source=README.md&amp;title=README" title="Open README Markdown in a separate page" target="_blank" rel="noopener noreferrer">
              <strong>README</strong>
              <span>Open rendered project guide</span>
            </a>
            <a id="releasesHistoryMarkdownLink" class="help-doc-card" href="markdown_viewer.html?source=RELEASE_NOTES.md&amp;title=Releases%20History" title="Open Releases History Markdown in a separate page" target="_blank" rel="noopener noreferrer">
              <strong>Releases History</strong>
              <span>Open rendered release prompts</span>
            </a>
            <a id="licenseMarkdownLink" class="help-doc-card" href="LICENSE.md" title="LICENSE.md" target="_blank" rel="noopener noreferrer">
              <strong>Licenses</strong>
              <span>Open license Markdown page</span>
            </a>
          </div>
          <div class="api-docs-panel" aria-label="Developer documentation links">
            <strong>Developer Docs</strong>
            <div id="apiDocsStatus" class="menu-helper">Swagger UI opens from local static files. Live OpenAPI JSON requires the optional Python server.</div>
            <div class="api-docs-link-list">
              <a id="swaggerDocsLink" class="api-docs-link" href="swagger.html" target="_blank" rel="noopener noreferrer" title="Open local Swagger UI documentation">Swagger</a>
              <a id="swaggerMarkdownLink" class="api-docs-link" href="markdown_viewer.html?source=SWAGGER.md&amp;title=Swagger%20API" target="_blank" rel="noopener noreferrer" title="Open local Swagger API Markdown companion">Swagger MD</a>
              <a id="openApiSchemaLink" class="api-docs-link" href="http://127.0.0.1:8000/openapi.json" target="_blank" rel="noopener noreferrer" title="Open live OpenAPI schema from the optional Python server">Live API</a>
            </div>
          </div>
          <div class="help-disclaimer" role="note" aria-label="Disclaimer">
            <strong>Disclaimer:</strong>
            This app is for visualization, educational, and experimental purposes only. The author is not responsible for inaccurate tracked-object data, orbital propagation, model rendering, orbital position, attitude/orientation, timing, visualization results, or limitations from third-party libraries including satellite.js. Do not use it for navigation, safety, mission planning, collision avoidance, or operational decisions.
          </div>
        </div>
      </section>
    </div>
  </div>`;
}
