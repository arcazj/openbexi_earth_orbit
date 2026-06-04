import assert from 'assert';
import {
  issShortcutState,
  starlinkShortcutState
} from '../js/satelliteShortcutLabels.js';

function run() {
  const starlink = starlinkShortcutState({
    satellite_name: 'STARLINK-1001',
    norad_id: 12345
  });
  assert.strictEqual(starlink.disabled, false, 'resolved Starlink shortcut is enabled');
  assert.strictEqual(starlink.text, 'Starlink (12345)', 'Starlink shortcut includes NORAD in visible label');
  assert.strictEqual(starlink.ariaLabel, 'Select Starlink satellite NORAD 12345', 'Starlink shortcut aria-label includes NORAD');
  assert(starlink.title.includes('STARLINK-1001'), 'Starlink shortcut title includes resolved satellite name');

  const missingStarlink = starlinkShortcutState(null);
  assert.strictEqual(missingStarlink.disabled, true, 'missing Starlink shortcut is disabled');
  assert.strictEqual(missingStarlink.text, 'Starlink unavailable', 'missing Starlink shortcut has required fallback label');

  const iss = issShortcutState({
    satellite_name: 'ISS (ZARYA)',
    norad_id: 25544
  });
  assert.strictEqual(iss.disabled, false, 'resolved ISS shortcut is enabled');
  assert.strictEqual(iss.text, 'ISS', 'ISS shortcut keeps a short visible label');
  assert(iss.ariaLabel.includes('NORAD 25544'), 'ISS shortcut aria-label includes NORAD 25544');
  assert(iss.title.includes('ISS (ZARYA)'), 'ISS shortcut title includes resolved ISS name');

  const missingIss = issShortcutState(null);
  assert.strictEqual(missingIss.disabled, true, 'missing ISS shortcut is disabled');
  assert.strictEqual(missingIss.text, 'ISS unavailable', 'missing ISS shortcut has required fallback label');

  console.log('shortcutLabels tests passed');
}

run();
