import assert from 'assert';
import fs from 'fs';
import { satelliteMenuLoader } from '../js/SatelliteMenuLoader.js';

const mojibakePatterns = [
  String.fromCharCode(0x00c3),
  String.fromCharCode(0x00c2),
  String.fromCharCode(0x00e2),
  String.fromCharCode(0xfffd),
  String.fromCharCode(0x00ef, 0x00bf, 0x00bd)
];

const filesToScan = [
  'index.html',
  'display_satellite.html',
  'css/style.css',
  'js/SatelliteMenuLoader.js',
  'js/ganttTimelineLoader.js',
  'js/reentryTimeline.js',
  'json/display_satellite_models.json',
  'markdown_viewer.html',
  'LICENSE.md',
  'README.md',
  'Test_and_Integration.md'
];

function assertCleanText(label, text) {
  mojibakePatterns.forEach((pattern) => {
    assert(
      !text.includes(pattern),
      `${label} contains mojibake marker U+${pattern.charCodeAt(0).toString(16).toUpperCase()}`
    );
  });
}

function run() {
  filesToScan.forEach((file) => {
    assertCleanText(file, fs.readFileSync(file, 'utf8'));
  });
  assertCleanText('generated satellite menu markup', satelliteMenuLoader());

  const indexHtml = fs.readFileSync('index.html', 'utf8');
  assert(indexHtml.includes('>Time x</label>'), 'time slider label uses an ASCII-safe label');
  assert(indexHtml.includes('>Close</button>'), 'initial menu toggle label uses readable text');
  assert(indexHtml.includes("textContent = hidden ? 'Menu' : 'Close'"), 'runtime menu toggle uses readable text');

  console.log('encodingUx tests passed');
}

run();
