import assert from 'assert';
import { createAnimationTimer } from '../js/animationTimer.js';
import fs from 'fs';

function assertNearlyEqual(actual, expected, message) {
  assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

function run() {
  let now = 1000;
  const timer = createAnimationTimer({
    performanceObj: {
      now: () => now
    }
  });

  now = 1250;
  assert.strictEqual(timer.getDelta(), 0.25, 'getDelta returns elapsed seconds since previous tick');
  now = 2000;
  assert.strictEqual(timer.getElapsedTime(), 1, 'getElapsedTime returns seconds since timer creation');
  assert.strictEqual(timer.getDelta(), 0.75, 'getDelta advances the previous tick');
  timer.reset();
  now = 2300;
  assertNearlyEqual(timer.getDelta(), 0.3, 'reset restarts delta measurement from reset time');

  const indexHtml = fs.readFileSync('index.html', 'utf8');
  const standalone = fs.readFileSync('SolarSystemOverview.html', 'utf8');
  assert(!indexHtml.includes('THREE.Clock'), 'index.html does not use deprecated THREE.Clock');
  assert(!standalone.includes('THREE.Clock'), 'SolarSystemOverview.html does not use deprecated THREE.Clock');
  assert(indexHtml.includes("import { createAnimationTimer } from './js/animationTimer.js';"), 'index imports local animation timer');
  assert(standalone.includes("import { createAnimationTimer } from './js/animationTimer.js';"), 'standalone Solar System page imports local animation timer');

  console.log('animationTimer tests passed');
}

run();
