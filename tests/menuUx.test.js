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
  assert(html.includes('aria-expanded="true" data-collapsible-target="filtersContent"'), 'Filters starts expanded in markup');
  assert(html.includes('aria-expanded="true" data-collapsible-target="satelliteSelectionContent"'), 'Satellite Selection starts expanded in markup');
  assert(html.includes('aria-expanded="false" data-collapsible-target="viewContent"'), 'View starts collapsed in markup');
  assert(html.includes('data-default-expanded="true"'), 'default-expanded accordion state is declared');
  assert(html.includes('data-default-collapsed="true"'), 'default-collapsed accordion state is declared');

  const filtersSection = indexOfOrFail(html, 'id="filtersAccordionSection"', 'filters accordion exists');
  const satelliteSection = indexOfOrFail(html, 'id="satelliteAccordionSection"', 'satellite accordion exists');
  const viewSection = indexOfOrFail(html, 'id="viewAccordionSection"', 'view accordion exists');
  const timelinesSection = indexOfOrFail(html, 'id="timelinesAccordionSection"', 'timelines accordion exists');
  const otherSection = indexOfOrFail(html, 'id="otherAccordionSection"', 'other accordion exists');
  const settingsSection = indexOfOrFail(html, 'id="settingsAccordionSection"', 'settings accordion exists');
  assert(
    filtersSection < satelliteSection && satelliteSection < viewSection && viewSection < timelinesSection &&
      timelinesSection < otherSection && otherSection < settingsSection,
    'accordion section order is Filters, Satellite Selection, View, Timelines, Other, Settings'
  );

  assert(indexHtml.includes("DEFAULT_EXPANDED_ACCORDION_SECTIONS = new Set(['filtersContent', 'satelliteSelectionContent'])"), 'Filters and Satellite Selection are forced open on page load');
  assert(indexHtml.includes('DEFAULT_COLLAPSED_ACCORDION_SECTIONS'), 'other accordion defaults are explicit');
  assert(indexHtml.includes('DEFAULT_EXPANDED_ACCORDION_SECTIONS.forEach(id => collapsedSections.delete(id))'), 'persisted collapsed state cannot close default-expanded sections on load');
  assert(indexHtml.includes('setAccordionSectionCollapsed(targetId, nextCollapsed, collapsedSections)'), 'accordion toggles only the targeted section');
  assert(indexHtml.includes('Multiple sections may remain open'), 'implementation documents multi-open accordion behavior');
  assert(indexHtml.includes("expandCollapsibleSection('satelliteSelectionContent')"), 'YPR-enabled selection opens Satellite Selection');
  assert(!indexHtml.includes("expandCollapsibleSection('filtersContent')"), 'YPR selection does not force unrelated sections open');

  assert(!/>\s*Active\s*</i.test(html), 'filter menu does not expose an Active control');
  assert(indexHtml.includes('EXCLUDED_COMPANY_FILTER_OPTIONS'), 'index defines generated company/tag exclusions');
  assert(indexHtml.includes("new Set(['ACTIVE'])"), 'Active is excluded from generated company/tag chips');
  assert(html.includes('id="satelliteSearchInput"'), 'satellite search input is present');
  assert(html.includes('role="combobox"'), 'satellite search uses combobox semantics');
  assert(html.includes('id="satelliteSearchResults"'), 'satellite search results list is present');
  assert(html.includes('id="satelliteSearchClear"'), 'satellite search clear action is present');
  assert(html.includes('id="resetFiltersButton"'), 'reset filters action is present');
  assert(html.includes('id="filterStatusSummary"'), 'active filter summary is present');
  assert(html.includes('id="filterEmptyState"'), 'filter empty state is present');

  const satelliteSelection = indexOfOrFail(html, 'Satellite Selection', 'satellite selection section exists');
  const searchInput = indexOfOrFail(html, 'id="satelliteSearchInput"', 'search input exists');
  const firstSatelliteCheckbox = indexOfOrFail(html, 'id="showYPRToggle"', 'satellite-specific checkboxes exist');
  assert(
    satelliteSelection < searchInput && searchInput < firstSatelliteCheckbox,
    'search/select satellite combo appears between the Satellite Selection header and checkboxes'
  );

  const timelinePanel = indexOfOrFail(html, 'id="timelineContent"', 'timeline content exists');
  const otherPanel = indexOfOrFail(html, 'id="otherSelectionsContent"', 'other content exists');
  const settingsPanel = indexOfOrFail(html, 'id="settingsContent"', 'settings content exists');
  assert(timelinePanel < otherPanel && otherPanel < settingsPanel, 'Other section appears between Timelines and Settings');
  assert(html.includes('type="checkbox" id="launchTimelineToggle"'), 'launch timeline toggle is a checkbox');
  assert(html.includes('type="checkbox" id="reentryTimelineToggle"'), 're-entry timeline toggle is a checkbox');
  assert(html.includes('other-selections-heading'), 'Other Selections has a blue styling hook');
  assert(html.includes('data-collapsible-target="otherSelectionsContent"'), 'Other Selections is collapsible');

  assert(css.includes('.menu-accordion-heading'), 'CSS defines accordion headers');
  assert(css.includes('--menu-metal'), 'CSS preserves the metallic blue expanded style');
  assert(css.includes('#controlsContainer h3.menu-accordion-heading[aria-expanded="true"]'), 'expanded accordion header contrast rule overrides global h3 color');
  assert(css.includes('color: #06182c !important;'), 'expanded accordion headers use dark high-contrast text');
  assert(css.includes('#controlsContainer h3.menu-accordion-heading[aria-expanded="true"] .toggle-icon'), 'expanded accordion chevron has an explicit readable color');
  assert(!css.includes('.menu-accordion-heading[aria-expanded="true"] {\n    color: #00aaff'), 'expanded accordion headers do not use light blue text');
  assert(css.includes('width: min(420px, calc(100vw - 20px))'), 'menu stays narrowed for release 1.5.4');
  assert(css.includes('.menu-accordion-section .collapsible-content:not(.collapsed)'), 'long active accordion panels have scroll constraints');
  assert(css.includes('overflow-y: auto'), 'narrowed menu keeps scrollable overflow');
  assert(css.includes('max-height: min(220px, calc(100vh - 260px))'), 'satellite search results stay bounded after narrowing');
  assert(css.includes('max-height: min(260px, calc(100vh - 330px))'), 'satellite metadata stays bounded after narrowing');
  assert(css.includes('#timeWarpBox'), 'time slider has responsive layout CSS');
  assert(css.includes('top: 50px !important'), 'narrow viewport time slider is moved away from top controls');
  assert(css.includes('top: 88px'), 'narrow viewport menu starts below the time slider');
  assert(css.includes('.menu-accordion-heading-satellite { border-left-color: #35b9a9; }'), 'Satellite keeps the legacy teal accent');
  assert(css.includes('.menu-accordion-heading-view { border-left-color: #f0b429; }'), 'View keeps the legacy yellow accent');
  assert(css.includes('.menu-accordion-heading-timelines { border-left-color: #d45187; }'), 'Timelines keeps the legacy pink accent');
  assert(css.includes('.menu-accordion-heading-other { border-left-color: #53a7ff; }'), 'Other keeps the legacy blue accent');
  assert(css.includes('.menu-accordion-heading-settings { border-left-color: #77859c; }'), 'Settings keeps the legacy gray-blue accent');
  assert(css.includes('.filter-chip input[type="checkbox"]:checked + span'), 'selected tag chips have a distinct active style');
  assert(css.includes(':focus-visible'), 'menu controls have visible focus styling');
  assert(css.includes('@media (max-width: 560px)'), 'menu has narrow viewport behavior');

  assert(indexHtml.includes('MENU_COLLAPSE_STORAGE_KEY'), 'index persists collapsed accordion sections');
  assert(indexHtml.includes('ensureYPRControlsVisibleForSelection'), 'index preserves YPR controls after satellite selection');
  assert(!/yawSlider\.value\s*=\s*0/.test(indexHtml), 'satellite selection does not reset yaw slider value');
  assert(!/pitchSlider\.value\s*=\s*0/.test(indexHtml), 'satellite selection does not reset pitch slider value');
  assert(!/rollSlider\.value\s*=\s*0/.test(indexHtml), 'satellite selection does not reset roll slider value');
  assert(indexHtml.includes('satelliteSearchText'), 'index implements satellite search matching');
  assert(indexHtml.includes('resetFiltersToDefaults'), 'index implements filter reset');
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
