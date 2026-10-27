// Real-browser regression check for the five WebGL destinations. Uses an
// installed Chrome/Edge executable; never connects to the user's browser profile.
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const base = process.env.ASTRAEA_TEST_URL || 'http://127.0.0.1:5173/';
const tag = process.env.ASTRAEA_TEST_TAG || 'detail';
const output = new URL(`../tmp/visual-${tag}/`, import.meta.url);
await mkdir(output, { recursive: true });
const executablePath = [process.env.ASTRAEA_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(path => path && existsSync(path));
assert(executablePath, 'Chrome or Edge is required for this local test');
const browser = await chromium.launch({ executablePath, headless: true });
const report = { url: base, browser: browser.version(), cases: [], failures: [] };
const names = ['LUNA', 'MARS', 'EUROPA', 'SATURN', 'TITAN'];

async function runCase(name, options, forceWebGL1 = false) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [], warnings = [], failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), reason: req.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(legacy => {
    window.__planetQA = { uploads: [], shaderErrors: [], draws: 0, liveTextures: 0, peakTextures: 0 };
    if (legacy) {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
    }
    for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!type) continue;
      const textures = new WeakSet();
      const originalCreate = type.prototype.createTexture, originalDelete = type.prototype.deleteTexture;
      type.prototype.createTexture = function () {
        const tex = originalCreate.call(this);
        if (tex) { textures.add(tex); window.__planetQA.liveTextures++; window.__planetQA.peakTextures = Math.max(window.__planetQA.peakTextures, window.__planetQA.liveTextures); }
        return tex;
      };
      type.prototype.deleteTexture = function (tex) {
        if (tex && textures.delete(tex)) window.__planetQA.liveTextures--;
        return originalDelete.call(this, tex);
      };
      const originalUpload = type.prototype.texImage2D;
      type.prototype.texImage2D = function (...args) {
        const result = originalUpload.apply(this, args);
        const source = args.at(-1);
        if (source instanceof HTMLImageElement) window.__planetQA.uploads.push({ url: source.src, width: source.naturalWidth, height: source.naturalHeight });
        return result;
      };
      const originalCompile = type.prototype.compileShader;
      type.prototype.compileShader = function (shader) {
        originalCompile.call(this, shader);
        if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) window.__planetQA.shaderErrors.push(this.getShaderInfoLog(shader));
      };
      const originalDraw = type.prototype.drawElements;
      type.prototype.drawElements = function (...args) { window.__planetQA.draws++; return originalDraw.apply(this, args); };
    }
  }, forceWebGL1);
  const result = { name, planets: [], errors, warnings, failedRequests };
  report.cases.push(result);
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.classList.contains('planetarium-ready'), { timeout: 15000 });
    assert.equal(await page.locator('#planet-canvas').isVisible(), true, 'WebGL canvas must be visible');
    for (const i of [3, 1, 2, 4, 0]) {
      await page.locator(`#planet-tabs [data-destination="${i}"]`).click();
      await page.waitForFunction(expected => document.querySelector('#hero-title')?.textContent === expected, names[i]);
      await page.waitForFunction(planet => window.__planetQA.uploads.some(upload => upload.url.includes(`planet-${planet}`) && upload.width >= 2048), names[i].toLowerCase());
      await page.waitForTimeout(options.reducedMotion === 'reduce' ? 250 : 1900);
      const state = await page.evaluate(() => {
        const canvas = document.querySelector('#planet-canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        return { title: document.querySelector('#hero-title').textContent,
          tab: document.querySelector('#planet-tabs [aria-selected="true"]').textContent,
          preview: document.querySelector('#preview-image').getAttribute('src'),
          size: [canvas.width, canvas.height], webglError: gl.getError(),
          contextLost: gl.isContextLost(), draws: window.__planetQA.draws,
          liveTextures: window.__planetQA.liveTextures, peakTextures: window.__planetQA.peakTextures,
          highResolution: window.__planetQA.uploads.filter(upload => upload.width >= 2048) };
      });
      assert.equal(state.title, names[i]); assert.equal(state.tab, names[i]);
      assert(state.preview.includes(names[i].toLowerCase()));
      assert.equal(state.webglError, 0); assert.equal(state.contextLost, false);
      assert(state.liveTextures <= 13, 'High-resolution texture cache must remain bounded');
      await page.screenshot({ path: new URL(`${name}-${names[i].toLowerCase()}.png`, output).pathname.replace(/^\/(\w:)/, '$1') });
      result.planets.push(state);
    }
    // Arrows, roving-tab keyboard navigation, and a pointer swipe exercise the
    // existing interaction layer, rather than calling renderer internals.
    await page.locator('#hero-next').click();
    await page.waitForFunction(() => document.querySelector('#hero-title').textContent === 'MARS');
    await page.locator('#hero-prev').click();
    await page.waitForFunction(() => document.querySelector('#hero-title').textContent === 'LUNA');
    await page.locator('#planet-tabs [data-destination="0"]').focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('#hero-title').textContent === 'TITAN');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('#hero-title').textContent === 'LUNA');
    const bounds = await page.locator('#planet-canvas').boundingBox();
    await page.mouse.move(bounds.width * .75, bounds.y + 130);
    await page.mouse.down();
    await page.mouse.move(bounds.width * .3, bounds.y + 135, { steps: 10 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#hero-title').textContent === 'MARS');
    result.controls = 'arrows, keyboard wraparound, pointer swipe, title/tab/preview synchronization passed';
    result.frames = await page.evaluate(() => new Promise(resolve => {
      const samples = []; let previous;
      function frame(time) {
        if (previous) samples.push(time - previous); previous = time;
        if (samples.length < 90) requestAnimationFrame(frame);
        else { samples.sort((a,b) => a-b); resolve({ medianMs: samples[45], p95Ms: samples[85] }); }
      }
      requestAnimationFrame(frame);
    }));
    result.shaderErrors = await page.evaluate(() => window.__planetQA.shaderErrors);
    assert.deepEqual(result.shaderErrors, []);
    assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
    console.log(`${name}: all five planets and carousel controls passed`);
  } catch (error) {
    result.failure = error.stack; report.failures.push(`${name}: ${error.message}`);
    await page.screenshot({ path: new URL(`${name}-failure.png`, output).pathname.replace(/^\/(\w:)/, '$1') }).catch(() => {});
    console.error(`${name}: ${error.message}`);
  } finally { await context.close(); }
}

async function runRecovery() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const result = { name: 'texture-failure-and-context-recovery' };
  report.cases.push(result);
  try {
    // One missing background map must not hide the entire working hero. A
    // missing normal must still retain the successfully loaded color material.
    await page.route('**/planet-mars-mobile.webp', route => route.abort());
    await page.route('**/planet-luna-normal*.webp', route => route.abort());
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.classList.contains('planetarium-ready'));
    assert(await page.locator('#planet-canvas').isVisible());
    await page.locator('#planet-tabs [data-destination="0"]').click();
    await page.waitForFunction(() => document.querySelector('#hero-title').textContent === 'LUNA');
    await page.waitForTimeout(400);
    assert(await page.locator('#planet-canvas').isVisible());
    result.partialTextureFailures = 'hero stays visible and navigation works';
    const supported = await page.evaluate(() => {
      const canvas = document.querySelector('#planet-canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      window.__contextLossTest = gl.getExtension('WEBGL_lose_context');
      if (!window.__contextLossTest) return false;
      window.__contextLossTest.loseContext(); return true;
    });
    if (supported) {
      await page.waitForFunction(() => document.querySelector('#planet-canvas').style.display === 'none');
      await page.waitForTimeout(100);
      await page.evaluate(() => window.__contextLossTest.restoreContext());
      await page.waitForFunction(() => document.querySelector('#planet-canvas').style.display !== 'none');
      await page.waitForTimeout(500);
      assert.equal(await page.locator('#hero-title').textContent(), 'LUNA');
      const glError = await page.evaluate(() => {
        const canvas = document.querySelector('#planet-canvas');
        return (canvas.getContext('webgl2') || canvas.getContext('webgl')).getError();
      });
      assert.equal(glError, 0, 'Restored WebGL context must be error-free');
      await page.locator('#hero-next').click();
      await page.waitForFunction(() => document.querySelector('#hero-title').textContent === 'MARS');
      result.contextRestoration = 'selected destination preserved, rendering and navigation recovered';
    } else result.contextRestoration = 'extension unavailable; not tested';
    console.log('recovery: missing textures and context restoration passed');
  } catch (error) { result.failure = error.stack; report.failures.push(`recovery: ${error.message}`); console.error(error.message); }
  finally { await context.close(); }
}

try {
  if (process.env.ASTRAEA_RECOVERY_ONLY) await runRecovery();
  else {
    await runCase('desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    if (!process.env.ASTRAEA_BASELINE_ONLY) {
    await runCase('mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await runCase('reduced-motion', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await runCase('webgl1', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' }, true);
      await runRecovery();
    }
  }
} finally {
  await browser.close();
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
}
if (report.failures.length) process.exitCode = 1;
