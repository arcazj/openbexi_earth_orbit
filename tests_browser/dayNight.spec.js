import { expect, test } from '@playwright/test';

test('night map stays on the correct hemisphere through seasons, time changes and resizing', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const results = await page.evaluate(async () => {
    const { drawDayNightMercator, sunECI, gmstFromJD } = await import('/js/drawDayNight.js');
    const { mercatorPixelFromLonLat } = await import('/js/orbit/orbitLinkGeometry.js');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const results = [];
    for (const [width, height] of [[720, 360], [360, 640]]) {
      canvas.width = width;
      canvas.height = height;
      for (const instant of ['2026-12-21T12:00:00Z', '2026-06-21T12:00:00Z', '2026-03-20T12:00:00Z', '2026-03-20T00:00:00Z']) {
        const date = new Date(instant);
        ctx.clearRect(0, 0, width, height);
        drawDayNightMercator(ctx, width, height, date);
        const jd = date.valueOf() / 86400000 + 2440587.5;
        const sun = sunECI(jd);
        const subLon = Math.atan2(sun.y, sun.x) - gmstFromJD(jd);
        const subLat = Math.asin(sun.z);
        for (const lat of [-60, -30, 0, 30, 60]) {
          for (let lon = -175; lon < 180; lon += 10) {
            const dot = Math.sin(lat * Math.PI / 180) * Math.sin(subLat) +
              Math.cos(lat * Math.PI / 180) * Math.cos(subLat) * Math.cos(lon * Math.PI / 180 - subLon);
            const { x, y } = mercatorPixelFromLonLat(lon, lat, width, height);
            if (y < 0 || y >= height) continue;
            const alpha = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3];
            if (dot > 0.1) results.push({ expected: 'day', alpha });
            if (dot < -0.2) results.push({ expected: 'night', alpha });
          }
        }
      }
    }
    return results;
  });
  expect(results.length).toBeGreaterThan(500);
  for (const sample of results) {
    expect(sample.alpha).toBe(sample.expected === 'day' ? 0 : 148);
  }
});

test('globe renders a smooth day/night boundary and the toggle restores full illumination', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.renderer && window.openbexiSimulation);
  await page.evaluate(() => {
    window.openbexiSimulation.setRate(0);
    window.openbexiSimulation.setTime('2026-12-21T12:00:00Z');
    const render = window.renderer.render;
    window.renderer.render = function (scene, camera) {
      window.dayNightTestScene = scene;
      return render.call(this, scene, camera);
    };
  });
  await page.waitForFunction(() => window.dayNightTestScene?.children.some(child => child.material?.userData.dayNightUniforms && child.material.map));
  const measure = () => page.evaluate(async () => {
    const THREE = await import('three');
    const earth = window.dayNightTestScene.children.find(child => child.material?.userData.dayNightUniforms);
    const uniforms = earth.material.userData.dayNightUniforms;
    // Render the actual Earth material in a controlled view across the terminator.
    const scene = new THREE.Scene();
    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earth.material);
    globe.rotation.copy(earth.rotation);
    scene.add(globe);
    const sun = uniforms.earthSunDirection.value;
    const camera = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0.1, 10);
    camera.position.copy(new THREE.Vector3().crossVectors(sun, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(3));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(256, 256);
    const originalMap = earth.material.map;
    earth.material.map = null;
    earth.material.needsUpdate = true;
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const pixels = new Uint8Array(256 * 4);
    gl.readPixels(0, 128, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const values = Array.from({ length: 160 }, (_, i) => pixels[(i + 48) * 4]);
    earth.material.map = originalMap;
    earth.material.needsUpdate = true;
    globe.geometry.dispose();
    renderer.dispose();
    return { min: Math.min(...values), max: Math.max(...values), steps: values.slice(1).map((v, i) => Math.abs(v - values[i])), enabled: uniforms.earthDayNightEnabled.value, colorSpace: originalMap.colorSpace };
  });
  const enabled = await measure();
  expect(enabled.enabled).toBe(1);
  expect(enabled.colorSpace).toBe('srgb');
  expect(enabled.max - enabled.min).toBeGreaterThan(100);
  expect(Math.max(...enabled.steps)).toBeLessThan(30);
  await page.locator('#viewMercatorToggle').check();
  await page.screenshot({ path: testInfo.outputPath('day-night-enabled.png') });
  await page.locator('#showDayNightToggle').uncheck();
  await expect.poll(async () => (await measure()).enabled).toBe(0);
  const disabled = await measure();
  expect(disabled.min).toBeGreaterThan(250);
  expect(disabled.max - disabled.min).toBeLessThan(2);
  expect(errors).toEqual([]);
});
