import assert from 'assert';
import fs from 'fs';

const menu = fs.readFileSync('js/SatelliteMenuLoader.js', 'utf8');
const panel = fs.readFileSync('js/conjunction/conjunctionPanel.js', 'utf8');
const visualization = fs.readFileSync('js/conjunction/conjunctionVisualization.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

assert(menu.includes('id="conjunctionAccordionSection"'), 'close-approach workspace exists');
assert(menu.includes('Experimental TLE-based screening'), 'experimental maturity is visible');
assert(menu.includes('Collision probability: unavailable'), 'missing probability is explicit');
assert(menu.includes('Legacy TLE coverage omits six-digit catalog objects'), 'catalog-format incompleteness is explicit');
assert(menu.includes('id="conjunctionRunButton"') && menu.includes('id="conjunctionCancelButton"'), 'run and cancellation controls exist');
assert(menu.includes('id="conjunctionScreeningRadiusKm"') && menu.includes('id="conjunctionRefinementToleranceSeconds"'), 'screening and refinement thresholds are configurable');
assert(menu.includes('id="conjunctionResultRows"') && menu.includes('id="conjunctionPlaybackOffset"'), 'event table and playback controls exist');

assert(index.includes("'conjunctionContent'"), 'conjunction workspace is collapsed by default');
assert(index.includes('EXPERIMENTAL_CONJUNCTION_SCREENING_ENABLED'), 'release feature flag gates conjunction initialization');
assert(css.includes('.conjunction-table') && css.includes('table-layout: fixed'), 'event table has stable dimensions');
assert(css.includes('.conjunction-playback-row'), 'playback controls have a stable layout');

assert(panel.includes("status: 'unavailable'"), 'panel request and export keep probability unavailable');
assert(panel.includes('Covariance and hard-body radius'), 'probability unavailability has a reason');
assert(panel.includes("Screening inputs changed. Run a new screen."), 'changed controls invalidate completed screening results');
assert(!panel.includes('selectedOrbitNearestPointDistance'), 'panel does not use display-orbit distance');
assert(visualization.includes('eciToSceneVector'), 'visualization maps physical state vectors through the rendering adapter');
assert(!visualization.includes('selectedOrbitNearestPointDistance'), 'visualization does not calculate conjunctions from paths');

console.log('conjunctionUx tests passed');
