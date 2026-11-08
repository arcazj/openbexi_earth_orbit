import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
import config from '../playwright.config.js';

const name = process.argv[2] || 'firefox';
const engine = { chromium, firefox, webkit }[name];
const profile = config.projects.find(project => project.name === name);
assert(engine && profile, `Unknown browser profile: ${name}`);
const browser = await engine.launch({ headless: profile.use.headless ?? true, ...profile.use.launchOptions });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  const result = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) return null;
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      version: gl.getParameter(gl.VERSION),
      renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      pixel: Array.from(pixel), error: gl.getError()
    };
  });
  assert(result, `${name} cannot create WebGL 2. ${errors.join(' ')}`);
  assert.deepEqual(result.pixel, [255, 0, 0, 255], `${name} did not render the probe pixel`);
  assert.equal(result.error, 0, `${name} reported a WebGL error`);
  console.log(JSON.stringify({ browser: name, ...result }));
} finally {
  await browser.close();
}
