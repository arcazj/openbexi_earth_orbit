import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const threeVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).dependencies.three;

test('orbit arcs remain complete as camera occlusion grows and shrinks their buffers', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/buffer size|WebGL|BufferAttribute/i.test(message.text()) && ['warning', 'error'].includes(message.type())) {
      errors.push(message.text());
    }
  });
  await page.route('**/orbit-render-check', route => route.fulfill({
    contentType: 'text/html',
    body: `<html><head><script type="importmap">{"imports":{"three":"/vendor/three/${threeVersion}/build/three.module.js"}}</script></head><body></body></html>`
  }));
  await page.goto('/orbit-render-check');
  const results = await page.evaluate(async () => {
    const THREE = await import('three');
    const { updateOrbitTrajectory, refreshSelectedOrbitOcclusion } = await import('/js/satelliteTLELoader.js');
    const { EARTH_SCENE_RADIUS } = await import('/js/SatelliteConstantLoader.js');
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(400, 400);
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_SCENE_RADIUS, 64, 32), new THREE.MeshBasicMaterial({ color: 0x225588 }));
    scene.add(earth);
    const startDate = new Date('2026-06-14T00:00:00Z');
    const root = updateOrbitTrajectory(scene, { showOrbit: true, simDate: startDate }, { satrec: { no: 2 * Math.PI / 95 } }, {
      satelliteLib: {
        propagate(_satrec, date) {
          const angle = (date.getTime() - startDate.getTime()) / (95 * 60000) * 2 * Math.PI;
          return { position: { x: 7000 * Math.cos(angle), y: 7000 * Math.sin(angle), z: 0 } };
        }
      }
    });
    const gl = renderer.getContext();
    const pixels = () => {
      const data = new Uint8Array(400 * 400 * 4);
      gl.readPixels(0, 0, 400, 400, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    };
    const results = [];
    for (const position of [[0, 0, 20], [0, 20, 0], [20, 0, 0], [0, 20, 0], [0, 0, -20], [0, 20, 0]]) {
      const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
      camera.position.set(...position);
      camera.up.set(0, position[1] ? 0 : 1, position[1] ? 1 : 0);
      camera.lookAt(0, 0, 0);
      const segments = refreshSelectedOrbitOcclusion(camera);
      renderer.render(scene, camera);
      const actual = pixels();
      // A freshly allocated path is the reference for the reused GPU geometry.
      const reference = new THREE.Scene();
      reference.add(earth.clone());
      for (const segment of segments) {
        reference.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(segment), root.userData.material));
      }
      renderer.render(reference, camera);
      const expected = pixels();
      let mismatchedPixels = 0;
      let redPixels = 0;
      for (let i = 0; i < actual.length; i += 4) {
        if (actual[i] !== expected[i] || actual[i + 1] !== expected[i + 1] || actual[i + 2] !== expected[i + 2]) mismatchedPixels++;
        if (actual[i] > 200 && actual[i + 1] < 20 && actual[i + 2] < 20) redPixels++;
      }
      results.push({ position, mismatchedPixels, redPixels });
      reference.children.filter(child => child.isLine).forEach(child => child.geometry.dispose());
      renderer.render(scene, camera);
    }
    return results;
  });
  for (const result of results) {
    expect(result.mismatchedPixels, `camera ${result.position}`).toBe(0);
    expect(result.redPixels).toBeGreaterThan(20);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('complete-orbit.png') });
});
