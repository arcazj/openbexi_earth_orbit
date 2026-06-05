import assert from 'assert';
import fs from 'fs';
import { satelliteMenuLoader } from '../js/SatelliteMenuLoader.js';

function indexOfOrFail(text, needle, message) {
  const index = text.indexOf(needle);
  assert(index >= 0, message);
  return index;
}

function run() {
  const html = satelliteMenuLoader();
  const css = fs.readFileSync('css/style.css', 'utf8');
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const launchTimeline = fs.readFileSync('js/ganttTimelineLoader.js', 'utf8');
  const reentryTimeline = fs.readFileSync('js/reentryTimeline.js', 'utf8');

  assert(!html.includes('role="tablist"'), 'main menu no longer exposes a tablist');
  assert(!html.includes('role="tab"'), 'main menu no longer exposes tab buttons');
  assert(!html.includes('role="tabpanel"'), 'main menu no longer exposes tab panels');
  assert(!html.includes('data-tab-target'), 'main menu no longer uses tab target wiring');
  assert(!html.includes('menu-tab-rail'), 'vertical tab rail markup is removed');
  assert(!css.includes('.menu-tab-rail'), 'vertical tab rail CSS is removed');
  assert(!indexHtml.includes('MENU_TAB_STORAGE_KEY'), 'selected tab persistence is removed');
  assert(!indexHtml.includes('activateMenuTabById'), 'tab activation logic is removed');

  assert(html.includes('class="menu-accordion"'), 'menu uses stacked accordion markup');
  assert(html.includes('menu-accordion-heading'), 'accordion headers are present');
  assert(html.includes('role="button"'), 'accordion headers expose button semantics');
  assert(html.includes('aria-controls="filtersContent"'), 'Filters header controls its content');
  assert(html.includes('aria-controls="satelliteSelectionContent"'), 'Satellite header controls its content');
  assert(html.includes('aria-expanded="false" data-collapsible-target="viewContent"'), 'Views & Time starts collapsed in markup');
  assert(html.includes('aria-expanded="false" data-collapsible-target="filtersContent"'), 'Filters starts collapsed in markup');
  assert(html.includes('aria-expanded="false" data-collapsible-target="satelliteSelectionContent"'), 'Satellite Selection starts collapsed in markup');
  assert(!html.includes('data-default-expanded="true"'), 'default-expanded accordion state is not declared');
  assert(html.includes('data-default-collapsed="true"'), 'default-collapsed accordion state is declared');

  const filtersSection = indexOfOrFail(html, 'id="filtersAccordionSection"', 'filters accordion exists');
  const satelliteSection = indexOfOrFail(html, 'id="satelliteAccordionSection"', 'satellite accordion exists');
  const viewSection = indexOfOrFail(html, 'id="viewAccordionSection"', 'view accordion exists');
  const timelinesSection = indexOfOrFail(html, 'id="timelinesAccordionSection"', 'timelines accordion exists');
  const otherSection = indexOfOrFail(html, 'id="otherAccordionSection"', 'other accordion exists');
  const shareSection = indexOfOrFail(html, 'id="shareAccordionSection"', 'share accordion exists');
  const helpSection = indexOfOrFail(html, 'id="helpAccordionSection"', 'help accordion exists');
  assert(!html.includes('id="settingsAccordionSection"'), 'Settings accordion section is removed');
  assert(!html.includes('data-collapsible-target="settingsContent"'), 'Settings content target is removed');
  assert(
    viewSection < filtersSection && filtersSection < satelliteSection && satelliteSection < timelinesSection &&
      satelliteSection < otherSection && otherSection < timelinesSection && timelinesSection < shareSection && shareSection < helpSection,
    'accordion section order is Views & Time, Filters, Satellite Selection, Other, Timelines, Share, Help'
  );
  assert(html.includes('Views &amp; Time'), 'View section is renamed to Views & Time');

  const viewContent = indexOfOrFail(html, 'id="viewContent"', 'View content exists');
  const globeToggle = indexOfOrFail(html, 'id="view3DToggle"', 'Globe toggle exists');
  const mercatorToggle = indexOfOrFail(html, 'id="viewMercatorToggle"', 'Mercator toggle exists');
  const highDefToggle = indexOfOrFail(html, 'id="highDefToggle"', 'High Def toggle exists');
  const axesToggle = indexOfOrFail(html, 'id="showECEFAxesToggle"', 'ECEF Axes toggle exists');
  const dayNightToggle = indexOfOrFail(html, 'id="showDayNightToggle"', 'Day/Night toggle exists');
  const starlinkShortcut = indexOfOrFail(html, 'id="selectFirstStarlinkButton"', 'First Starlink shortcut exists');
  const issShortcut = indexOfOrFail(html, 'id="selectIssButton"', 'ISS shortcut exists');
  assert(
    viewContent < globeToggle && globeToggle < mercatorToggle &&
      mercatorToggle < highDefToggle && highDefToggle < axesToggle &&
      axesToggle < dayNightToggle && dayNightToggle < starlinkShortcut &&
      starlinkShortcut < issShortcut,
    'Views & Time menu order is Globe/Mercator, High Def/ECEF/Day-Night, then First Starlink/ISS shortcuts'
  );
  assert(html.includes('Use the time slider at the top of the screen to control simulation speed.'), 'Views & Time contains time slider guidance');
  assert(html.includes('view-control-row view-control-row-two'), 'View menu has a two-item first row');
  assert(html.includes('view-control-row view-control-row-three'), 'View menu has a three-item second row');
  assert(html.includes('view-control-row view-shortcut-row'), 'View menu has a shortcut button row');
  assert(html.includes('aria-label="Starlink shortcut unavailable"'), 'Starlink shortcut has unavailable accessible text before TLE load');
  assert(html.includes('aria-label="ISS shortcut unavailable"'), 'ISS shortcut has unavailable accessible text before TLE load');
  assert(html.includes('Starlink unavailable'), 'Starlink shortcut has required unavailable fallback text');
  assert(html.includes('ISS unavailable'), 'ISS shortcut has required unavailable fallback text');

  assert(indexHtml.includes('DEFAULT_EXPANDED_ACCORDION_SECTIONS = new Set()'), 'no accordion section is forced open on page load');
  assert(indexHtml.includes('DEFAULT_COLLAPSED_ACCORDION_SECTIONS'), 'other accordion defaults are explicit');
  ['viewContent', 'filtersContent', 'satelliteSelectionContent', 'otherSelectionsContent', 'timelineContent', 'shareContent', 'helpContent'].forEach(id => {
    assert(indexHtml.includes(`'${id}'`), `${id} starts collapsed on launch`);
  });
  assert(!indexHtml.includes("'settingsContent'"), 'settings content is not part of accordion defaults');
  assert(indexHtml.includes('persisted state cannot reopen'), 'persisted accordion state cannot reopen sections on launch');
  assert(indexHtml.includes('setAccordionSectionCollapsed(targetId, nextCollapsed, collapsedSections)'), 'accordion toggles only the targeted section');
  assert(indexHtml.includes('Multiple sections may remain open'), 'implementation documents multi-open accordion behavior');
  assert(indexHtml.includes("expandCollapsibleSection('satelliteSelectionContent')"), 'YPR-enabled selection opens Satellite Selection');
  assert(!indexHtml.includes("expandCollapsibleSection('filtersContent')"), 'YPR selection does not force unrelated sections open');

  assert(!/>\s*Active\s*</i.test(html), 'filter menu does not expose an Active control');
  assert(indexHtml.includes('EXCLUDED_COMPANY_FILTER_OPTIONS'), 'index defines generated company/tag exclusions');
  assert(indexHtml.includes("new Set(['ACTIVE'])"), 'Active is excluded from generated company/tag chips');
  assert(html.includes('id="satelliteSearchInput"'), 'satellite search input is present');
  assert(html.includes('role="combobox"'), 'satellite search uses combobox semantics');
  assert(html.includes('aria-expanded="false"'), 'satellite search exposes collapsed aria-expanded state');
  assert(html.includes('aria-controls="satelliteSearchResults"'), 'satellite search controls the result list');
  assert(html.includes('id="satelliteSearchResults"'), 'satellite search results list is present');
  assert(html.includes('role="listbox"'), 'satellite search results use listbox semantics');
  assert(html.includes('id="satelliteSearchClear"'), 'satellite search clear action is present');
  assert(html.includes('id="resetFiltersButton"'), 'reset filters action is present');
  assert(html.includes('id="filterStatusSummary"'), 'active filter summary is present');
  assert(html.includes('id="filterEmptyState"'), 'filter empty state is present');

  const satelliteSelection = indexOfOrFail(html, 'Satellite Selection', 'satellite selection section exists');
  const searchInput = indexOfOrFail(html, 'id="satelliteSearchInput"', 'search input exists');
  const selectedControls = indexOfOrFail(html, 'id="selectedSatelliteControls"', 'selected satellite controls exist');
  const firstSatelliteCheckbox = indexOfOrFail(html, 'id="showYPRToggle"', 'satellite-specific checkboxes exist');
  assert(
    satelliteSelection < searchInput && searchInput < selectedControls && selectedControls < firstSatelliteCheckbox,
    'search/select satellite combo appears between the Satellite Selection header and checkboxes'
  );
  assert(html.includes('id="selectedSatelliteControls" class="satellite-option-grid" aria-label="Selected satellite options" aria-hidden="true" hidden'), 'satellite-specific controls are hidden until selection');
  assert(html.includes('id="showFootprintCheckbox"><span>Show Footprint</span>'), 'Show Footprint checkbox exists and is unchecked by default');
  assert(html.includes('id="showOnlySelectedSatellite" checked'), 'Show only selected satellite checkbox is checked by default when shown');
  assert(html.includes('id="showOrbitFrameToggle"> Orbit Frame (LVLH)'), 'Orbit Frame checkbox exists and is unchecked by default');
  assert(html.includes('id="showOrbitToggle"> Show Orbit'), 'Show Orbit checkbox exists and is unchecked by default');
  assert(!html.includes('No satellite selected'), 'visible no-selection placeholder text is removed from generated menu');

  const timelinePanel = indexOfOrFail(html, 'id="timelineContent"', 'timeline content exists');
  const otherPanel = indexOfOrFail(html, 'id="otherSelectionsContent"', 'other content exists');
  const sharePanel = indexOfOrFail(html, 'id="shareContent"', 'share content exists');
  const helpPanel = indexOfOrFail(html, 'id="helpContent"', 'help content exists');
  assert(otherPanel < timelinePanel && timelinePanel < sharePanel && sharePanel < helpPanel, 'Other follows Satellite Selection and Share appears after Timelines before Help');
  assert(html.includes('type="checkbox" id="launchTimelineToggle"'), 'launch timeline toggle is a checkbox');
  assert(html.includes('type="checkbox" id="reentryTimelineToggle"'), 're-entry timeline toggle is a checkbox');
  assert(!html.includes('other-selections-heading'), 'Other Selections header does not use a special text-style class');
  assert(html.includes('data-collapsible-target="otherSelectionsContent"'), 'Other Selections is collapsible');
  assert(html.includes('data-collapsible-target="shareContent"'), 'Share section is collapsible');
  assert(html.includes('data-collapsible-target="helpContent"'), 'Help section is collapsible');
  assert(html.includes('id="menuHeaderRow"'), 'menu header row exists');
  assert(html.indexOf('id="versionDisplay"') < html.indexOf('id="serverStatusBlock"'), 'version appears before server status in header row');
  assert(html.includes('id="serverStatusButton"'), 'server status button exists');
  assert(html.includes('id="serverStatusIcon"'), 'server status uses an icon element');
  assert(html.includes('src="icons/server_checking.svg"'), 'server status starts with checking icon');
  assert(html.includes('aria-label="Checking server connection"'), 'server status has checking accessible text');
  assert(html.includes('id="serverStatusPanel"'), 'server status panel exists');
  assert(html.includes('id="serverReconnectButton"'), 'server status exposes reconnect action');
  assert(html.includes('Server unavailable. Using local satellite data.'), 'server offline message is present');
  assert(html.includes('id="copyShareLinkButton"'), 'Share section includes Copy Link');
  assert(html.includes('id="nativeShareButton"'), 'Share section includes native share action');
  assert(html.includes('id="shareLinkOutput"'), 'Share section includes generated link output');
  assert(html.includes('id="shareImagePreview"'), 'Share section includes canvas image preview');
  assert(html.includes('id="previewShareImageButton"'), 'Share section includes Preview Image action');
  assert(html.includes('id="downloadShareImageButton"'), 'Share section includes Download Image action');
  assert(html.includes('id="copyShareImageButton"'), 'Share section includes Copy Image action');
  assert(html.includes('href="https://github.com/arcazj/openbexi_earth_orbit"'), 'Help includes GitHub project link');
  assert(html.includes('target="_blank" rel="noopener noreferrer"'), 'GitHub Help link opens safely in a new tab');
  assert(html.includes('id="readmeMarkdownLink"'), 'Help includes README Markdown action');
  assert(html.includes('data-markdown-source="README.md"'), 'README Markdown action targets README.md');
  assert(html.includes('id="releasesHistoryMarkdownLink"'), 'Help includes Releases History Markdown action');
  assert(html.includes('data-markdown-source="PROMPT_History.md"'), 'Releases History action targets PROMPT_History.md');
  assert(html.includes('>Releases History</strong>'), 'Prompt History action is renamed to Releases History');
  assert(!html.includes('>Prompt History</a>'), 'Prompt History is not the visible Help action text');
  assert(html.includes('id="helpMarkdownPanel"'), 'Help includes a rendered Markdown panel');
  assert(html.includes('id="helpMarkdownContent"'), 'Help includes rendered Markdown content target');
  assert(html.includes('class="help-smart-grid"'), 'Help uses a smart document grid');
  assert(html.includes('id="licenseMarkdownLink"'), 'Help includes Licenses link hook');
  assert(html.includes('href="LICENSE.md"'), 'Help includes Markdown license link');
  assert(html.includes('>Licenses</strong>'), 'Help labels the license action as Licenses');
  assert(!html.includes('Swagger / API Documentation'), 'old Swagger/API heading is removed');
  assert(html.includes('Developer Docs'), 'Help includes developer documentation section');
  assert(html.includes('id="swaggerDocsLink"'), 'Help includes Swagger UI link hook');
  assert(html.includes('id="openApiSchemaLink"'), 'Help includes OpenAPI schema link hook');
  assert(html.includes('href="http://127.0.0.1:8000/docs"'), 'Swagger link opens the default docs page');
  assert(html.includes('href="http://127.0.0.1:8000/openapi.json"'), 'API link opens the default OpenAPI page');
  assert(!html.includes('Swagger and OpenAPI documentation are available from the connected Python server.'), 'prohibited Swagger/API sentence is absent from Help markup');
  assert(html.includes('for visualization, educational, and experimental purposes only'), 'Help includes legal disclaimer');
  assert(html.includes('satellite.js'), 'Help disclaimer mentions satellite.js limitations');

  assert(css.includes('.menu-accordion-heading'), 'CSS defines accordion headers');
  assert(css.includes('--menu-metal-yellow'), 'CSS defines a metallic yellow view style');
  assert(css.includes('--menu-metal-blue'), 'CSS defines a metallic blue filters style');
  assert(css.includes('--section-panel-bg'), 'CSS defines section-specific panel backgrounds');
  assert(css.includes('#controlsContainer h3.menu-accordion-heading[aria-expanded="true"]'), 'expanded accordion header contrast rule overrides global h3 color');
  assert(css.includes('color: #06182c !important;'), 'expanded accordion headers use dark high-contrast text');
  assert(css.includes('#controlsContainer h3.menu-accordion-heading[aria-expanded="true"] .toggle-icon'), 'expanded accordion chevron has an explicit readable color');
  assert(!css.includes('.menu-accordion-heading[aria-expanded="true"] {\n    color: #00aaff'), 'expanded accordion headers do not use light blue text');
  assert(css.includes('width: min(380px, calc(100vw - 20px))'), 'menu is thinner than the 1.5.4 accordion menu');
  assert(!css.includes('width: min(420px, calc(100vw - 20px))'), 'previous 420px menu width is no longer used');
  assert(css.includes('#satelliteCountDisplay'), 'satellite count has a dedicated style hook');
  assert(css.includes('color: #ff2a2a !important;'), 'satellite count is styled red');
  assert(css.includes('font-weight: 900;'), 'satellite count is styled bold');
  assert(css.includes('.menu-accordion-section .collapsible-content:not(.collapsed)'), 'long active accordion panels have scroll constraints');
  assert(css.includes('overflow-y: auto'), 'narrowed menu keeps scrollable overflow');
  assert(css.includes('max-height: min(220px, calc(100vh - 260px))'), 'satellite search results stay bounded after narrowing');
  assert(css.includes('.satellite-search-results[hidden]'), 'hidden satellite results have an explicit CSS state');
  assert(css.includes('display: none !important;'), 'hidden satellite results are removed from layout');
  assert(css.includes('pointer-events: none !important;'), 'hidden satellite results cannot block controls');
  assert(css.includes('max-height: min(260px, calc(100vh - 330px))'), 'satellite metadata stays bounded after narrowing');
  assert(css.includes('#timeWarpBox'), 'time slider has responsive layout CSS');
  assert(css.includes('top: 50px !important'), 'narrow viewport time slider is moved away from top controls');
  assert(css.includes('top: 88px'), 'narrow viewport menu starts below the time slider');
  assert(css.includes('.menu-accordion-heading-satellite { border-left-color: #35b9a9; }'), 'Satellite keeps the legacy teal accent');
  assert(css.includes('.menu-accordion-heading-view { border-left-color: #f0b429; }'), 'View keeps the legacy yellow accent');
  assert(css.includes('.menu-accordion-heading-timelines { border-left-color: #d45187; }'), 'Timelines keeps the legacy pink accent');
  assert(css.includes('.menu-accordion-heading-other { border-left-color: #53a7ff; }'), 'Other keeps the legacy blue accent');
  assert(!css.includes('.menu-accordion-heading-other:not([aria-expanded="true"])'), 'Other does not override collapsed header text style');
  assert(!css.includes('.other-selections-heading'), 'Other header special text styling is removed');
  assert(!css.includes('.menu-accordion-heading-settings'), 'Settings accordion accent CSS is removed');
  assert(css.includes('.menu-accordion-heading-share { border-left-color: #6fd08c; }'), 'Share keeps a dedicated legacy-style accent');
  assert(css.includes('.menu-accordion-heading-help { border-left-color: #a98cff; }'), 'Help keeps a dedicated legacy-style accent');
  assert(css.includes('.server-status-button'), 'server status has dedicated CSS');
  assert(css.includes('.menu-header-row'), 'menu top row has dedicated CSS');
  assert(css.includes('--menu-header-control-height: 30px;'), 'menu header controls share a fixed alignment height');
  assert(css.includes('height: var(--menu-header-control-height);'), 'Close and server controls share the header control height');
  assert(css.includes('margin: 0 0 10px 54px;'), 'menu header row reserves aligned space for the external Close button');
  assert(css.includes('.server-status-icon'), 'server status icon has dedicated CSS');
  assert(css.includes('.server-state-connected .server-status-icon'), 'server connected icon state has CSS');
  assert(css.includes('.server-state-disconnected .server-status-icon'), 'server disconnected icon state has CSS');
  assert(css.includes('.server-state-error .server-status-icon'), 'server error icon state has CSS');
  assert(css.includes('.share-panel'), 'Share panel has dedicated CSS');
  assert(css.includes('.share-action-row'), 'Share actions have dedicated CSS');
  assert(css.includes('.share-image-preview-frame'), 'Share image preview has dedicated CSS');
  assert(css.includes('.share-image-action-row'), 'Share image actions have dedicated CSS');
  assert(css.includes('.api-docs-panel'), 'API docs panel has dedicated CSS');
  assert(css.includes('.api-docs-link.is-disabled'), 'API docs disabled state has CSS');
  assert(css.includes('.help-panel'), 'Help panel has dedicated CSS');
  assert(css.includes('.help-smart-grid'), 'Help document grid has dedicated CSS');
  assert(css.includes('.help-doc-card'), 'Help document cards have dedicated CSS');
  assert(css.includes('.help-markdown-panel'), 'Help Markdown preview has dedicated CSS');
  assert(css.includes('.help-markdown-content'), 'Help rendered Markdown content has dedicated CSS');
  assert(css.includes('.help-disclaimer'), 'Help disclaimer has dedicated CSS');
  assert(css.includes('.filter-chip input[type="checkbox"]:checked + span'), 'selected tag chips have a distinct active style');
  assert(css.includes(':focus-visible'), 'menu controls have visible focus styling');
  assert(css.includes('@media (max-width: 560px)'), 'menu has narrow viewport behavior');
  assert(css.includes('.view-control-row-two'), 'View first row has dedicated CSS');
  assert(css.includes('.view-control-row-three'), 'View second row has dedicated CSS');
  assert(css.includes('.view-shortcut-row'), 'View shortcut row has dedicated CSS');
  assert(css.includes('.view-shortcut-button'), 'View shortcut buttons have dedicated CSS');

  assert(indexHtml.includes('MENU_COLLAPSE_STORAGE_KEY'), 'index persists collapsed accordion sections');
  assert(indexHtml.includes('renderMarkdown(markdown'), 'index renders Help Markdown locally');
  assert(indexHtml.includes('escapeHtml(value'), 'Markdown rendering escapes raw HTML');
  assert(indexHtml.includes('safeMarkdownHref'), 'Markdown links are sanitized before rendering');
  assert(indexHtml.includes('loadHelpMarkdown(source, title)'), 'index loads README and Releases History Markdown in Help');
  assert(indexHtml.includes('setupHelpMarkdownLink(readmeMarkdownLink)'), 'README Help action is wired to Markdown renderer');
  assert(indexHtml.includes('setupHelpMarkdownLink(releasesHistoryMarkdownLink)'), 'Releases History Help action is wired to Markdown renderer');
  assert(indexHtml.includes('updateSelectedSatelliteControlsVisibility'), 'index gates selected-satellite controls by selection state');
  assert(indexHtml.includes("'shareContent'"), 'Share starts collapsed with other non-default accordion sections');
  assert(indexHtml.includes("'helpContent'"), 'Help starts collapsed with other non-default accordion sections');
  assert(indexHtml.includes('checkAndLoadServerTleData'), 'index implements server connection and TLE fallback flow');
  assert(indexHtml.includes('tleDataOverride: serverTleData'), 'index passes server TLE data to the existing TLE loader only when available');
  assert(indexHtml.includes('copyCurrentShareLink'), 'index implements Copy Link behavior');
  assert(indexHtml.includes('preserveDrawingBuffer: true'), 'WebGL renderer keeps drawing buffer for Share image capture');
  assert(indexHtml.includes('canvas.toBlob'), 'Share image capture uses canvas.toBlob');
  assert(indexHtml.includes('ClipboardItem'), 'Share image copy checks ClipboardItem support');
  assert(indexHtml.includes('Canvas image capture is unavailable'), 'Share image capture has a fallback message');
  assert(indexHtml.includes('navigator.canShare({ files: [imageFile] })'), 'Native Share includes image only when canShare supports it');
  assert(indexHtml.includes('applyPendingShareStateAfterSatelliteLoad'), 'index restores share state after satellite data loads');
  assert(indexHtml.includes('updateApiDocsState'), 'index updates Swagger/API docs links');
  assert(indexHtml.includes('Swagger and API links still open in a separate page'), 'offline API docs remain clickable with separate-page guidance');
  assert(!indexHtml.includes('Swagger and OpenAPI documentation are available from the connected Python server.'), 'prohibited Swagger/API status sentence is not emitted');
  assert(indexHtml.includes('ensureYPRControlsVisibleForSelection'), 'index preserves YPR controls after satellite selection');
  assert(!/yawSlider\.value\s*=\s*0/.test(indexHtml), 'satellite selection does not reset yaw slider value');
  assert(!/pitchSlider\.value\s*=\s*0/.test(indexHtml), 'satellite selection does not reset pitch slider value');
  assert(!/rollSlider\.value\s*=\s*0/.test(indexHtml), 'satellite selection does not reset roll slider value');
  assert(indexHtml.includes('satelliteSearchText'), 'index implements satellite search matching');
  assert(indexHtml.includes('resetFiltersToDefaults'), 'index implements filter reset');
  assert(indexHtml.includes('setShowOnlySelectedSatellite(true)'), 'selecting a satellite auto-enables show-only-selected mode');
  assert(indexHtml.includes('setShowOnlySelectedSatellite(false)'), 'clearing a satellite disables show-only-selected mode');
  assert(indexHtml.includes('showOnlySelectedSatelliteCheckbox.checked'), 'show-only-selected checkbox is synchronized with simParams');
  assert(indexHtml.includes('enableHighDefForSelectedSatelliteIfNeeded(tleSatData)'), 'non-MEO/GEO selections auto-enable High Def Earth');
  assert(indexHtml.includes("orbitType === 'MEO' || orbitType === 'GEO'"), 'MEO and GEO selections do not force High Def on');
  assert(indexHtml.includes('clearSatelliteSearchInputForNextSelection'), 'search field clears the prior selected label before a new search');
  assert(indexHtml.includes('satelliteSearchClearedForNextSelection'), 'search clearing preserves the current selected satellite');
  assert(indexHtml.includes('findFirstStarlinkSatellite'), 'View shortcut can locate the first Starlink satellite');
  assert(indexHtml.includes('findIssSatellite'), 'View shortcut can locate ISS/ZARYA');
  assert(indexHtml.includes('selectSatelliteViaShortcut'), 'View shortcuts use the normal satellite selection path');
  assert(indexHtml.includes('starlinkShortcutState(findFirstStarlinkSatellite())'), 'Starlink shortcut uses dynamic state helper');
  assert(indexHtml.includes('issShortcutState(findIssSatellite())'), 'ISS shortcut uses dynamic state helper');
  assert(indexHtml.includes("s?.norad_id?.toString() === ISS_NORAD_ID"), 'ISS shortcut prefers NORAD 25544');
  assert(indexHtml.includes('iss-velocity-nadir-frame'), 'ISS selected model uses orbital-frame orientation mode');
  assert(indexHtml.includes('calibrationPitchDeg'), 'ISS orientation diagnostics include pitch calibration');
  assert(indexHtml.includes('calibrationRollDeg'), 'ISS orientation diagnostics include roll calibration');
  assert(indexHtml.includes('visible = !!currentSelectedSatellite'), 'show-only visibility is not constrained by current filters');
  assert(indexHtml.includes('earthInView: selectedCameraFrameKeepsEarthInView'), 'selected-satellite camera metadata checks Earth remains visible');
  assert(indexHtml.includes('isSatelliteDropdownOpen'), 'satellite search uses explicit dropdown open state');
  assert(indexHtml.includes('document.addEventListener(\'pointerdown\''), 'outside clicks close satellite search results');
  assert(indexHtml.includes("event.key === 'Tab'"), 'Tab closes satellite search results without trapping focus');
  assert(indexHtml.includes('if (forceOpen) isSatelliteDropdownOpen = true'), 'only explicit user actions open satellite search results');
  assert(indexHtml.includes('aria-activedescendant'), 'satellite search supports active descendant keyboard state');
  assert(indexHtml.includes('syncExclusiveTimelineSelection'), 'index enforces mutually exclusive timeline checkboxes');
  assert(indexHtml.includes("hideTimelineById('reentryTimelineToggle')"), 'launch selection hides re-entry timeline');
  assert(indexHtml.includes("hideTimelineById('launchTimelineToggle')"), 're-entry selection hides launch timeline');
  assert(indexHtml.includes('handle.setVisible(false)'), 'timeline exclusivity hides the inactive HUD through timeline handles');
  assert(launchTimeline.includes("toggle?.type === 'checkbox'"), 'launch timeline supports checkbox toggles');
  assert(reentryTimeline.includes("toggle?.type === 'checkbox'"), 're-entry timeline supports checkbox toggles');
  assert(launchTimeline.includes('setVisible: setVisibility'), 'launch timeline exposes explicit visibility control');
  assert(reentryTimeline.includes('setVisible: setVisibility'), 're-entry timeline exposes explicit visibility control');
  assert(launchTimeline.includes('isVisible()'), 'launch timeline exposes visibility state');
  assert(reentryTimeline.includes('isVisible()'), 're-entry timeline exposes visibility state');

  console.log('menuUx tests passed');
}

run();
