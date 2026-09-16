#!/usr/bin/env node
/**
 * Meridian visual canaries (master plan §8, §125.A).
 *
 * Captures a fixed set of holes × presets × viewports from the local harness
 * and records render metadata beside each image. The set is the regression
 * baseline for every later visual change: a change that alters these images
 * must be intentional and reviewed against the previous label.
 *
 *   node scripts/golf/course-geometry/capture-visual-canaries.cjs \
 *     --label=v0-baseline [--base=http://127.0.0.1:8768] [--course=peek-n-peak-upper] \
 *     [--holes=1,7,9,11,12,15,17,18] [--presets=Top,Terrain,Side] \
 *     [--viewports=390x844,430x932,768x1024,1440x1000] [--debug=<view>]
 *
 * Output: output/playwright/course-geometry/visual-system/canaries/<label>/
 *   hole-NN-<preset>-<w>x<h>.png and canaries.json (one entry per capture with
 *   package hash, style version, renderer, projection, quality tier, draw calls,
 *   triangles, trees, pixel ratio and shadow-map size read from the canvas).
 * Read-only against the geometry package; nothing is written to src.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));
const label = String(args.label || 'unlabeled');
const base = String(args.base || 'http://127.0.0.1:8768');
const course = String(args.course || 'peek-n-peak-upper');
const holes = String(args.holes || '1,7,9,11,12,15,17,18').split(',').map(Number);
const presets = String(args.presets || 'Top,Terrain,Side').split(',');
const viewports = String(args.viewports || '390x844,430x932,768x1024,1440x1000').split(',').map(v => v.split('x').map(Number));
const debugView = typeof args.debug === 'string' ? args.debug : null;
const outDir = path.resolve(String(args.out || `output/playwright/course-geometry/visual-system/canaries/${label}`));
const packagePath = path.resolve(`src/test/fixtures/course-geometry/${course}.json`);
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

const pick = (dataset, keys) => Object.fromEntries(keys.map(key => [key, dataset[key] ?? null]));
const METADATA_KEYS = ['terrainRenderer', 'terrainProjection', 'visualStyleVersion', 'qualityTier', 'drawCalls', 'renderTriangles',
  'terrainTriangles', 'terrainTrees', 'pixelRatio', 'shadowMapSize', 'shadowMapType', 'terrainPitch', 'terrainYaw', 'terrainExaggeration',
  'terrainScale', 'terrainFov', 'crownDetail', 'bufferWidth', 'bufferHeight', 'renderCount', 'terrainHash', 'debugView', 'frameMs'];

async function settled(page, canvas) {
  // Reduced motion applies presets instantly; still wait until the render
  // counter has been stable for 200 ms so a late resize cannot be captured.
  let previous = await canvas.getAttribute('data-render-count');
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(200);
    const next = await canvas.getAttribute('data-render-count');
    if (next === previous) return;
    previous = next;
  }
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const report = { label, course, packageHash: pkg.contentHash, base, capturedAt: new Date().toISOString(),
    debugView, holes, presets, viewports: viewports.map(([w, h]) => `${w}x${h}`), captures: [], errors: [] };
  const browser = await chromium.launch();
  try {
    for (const [width, height] of viewports) {
      const mobile = width <= 500;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push({ viewport: `${width}x${height}`, message: error.message }));
      for (const hole of holes) {
        const url = `${base}/?matrix=1&course=${course}&hole=${hole}${debugView ? `&debug=${debugView}` : ''}`;
        await page.goto(url);
        await page.getByRole('button', { name: 'Expand course view' }).click();
        const dialog = page.getByRole('dialog');
        await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-slot=modal-shell]')).every(el => +getComputedStyle(el).opacity > .999));
        const canvas = dialog.locator('canvas');
        for (const preset of presets) {
          const button = dialog.getByRole('button', { name: preset, exact: true });
          await button.click();
          await page.waitForFunction(() => document.querySelector('[data-terrain-view-state=ready] canvas[data-terrain-state=ready]'));
          await page.waitForFunction(name => document.querySelector(`[aria-label="Terrain camera"] button[aria-pressed=true]`)?.textContent === name, preset);
          await settled(page, canvas);
          const file = `hole-${String(hole).padStart(2, '0')}-${preset.toLowerCase()}-${width}x${height}.png`;
          await page.screenshot({ path: path.join(outDir, file) });
          const dataset = await canvas.evaluate(el => ({ ...el.dataset }));
          const frame = await dialog.locator('[data-slot=course-drawing]').evaluate(el => ({ ...el.dataset }));
          report.captures.push({ hole, preset, viewport: `${width}x${height}`, file,
            metadata: { packageHash: pkg.contentHash, ...pick(dataset, METADATA_KEYS), cameraZoom: frame.cameraZoom ?? null, worldScale: frame.worldScale ?? null } });
          process.stdout.write(`${file} draw=${dataset.drawCalls} tri=${dataset.renderTriangles} proj=${dataset.terrainProjection ?? 'n/a'}\n`);
        }
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
      }
      await context.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(outDir, 'canaries.json'), JSON.stringify(report, null, 2) + '\n');
  }
  if (report.errors.length) { console.error(JSON.stringify(report.errors, null, 2)); process.exitCode = 1; }
  console.log(`${report.captures.length} captures → ${outDir}`);
})().catch(error => { console.error(error); process.exit(1); });
