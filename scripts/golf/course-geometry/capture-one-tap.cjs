#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- repo-local capture script, same shape as capture-player-view.cjs */
/**
 * Capture the One-Tap player screen from the lab fixture. The synthetic walker
 * plays the hole: mark on the tee, walk, mark, walk to the green, mark, hole
 * out — one screenshot per step plus a JSON record of what the screen said.
 *
 *   node scripts/golf/course-geometry/capture-one-tap.cjs --out-dir=<dir> \
 *     [--base=http://127.0.0.1:8768] [--course=peek-n-peak-upper] [--hole=7] [--viewport=phone|desktop] [--world=v2]
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=') || true]; }));
const base = String(args.base || 'http://127.0.0.1:8768');
const course = String(args.course || 'peek-n-peak-upper');
const hole = Number(args.hole || 7);
const viewport = String(args.viewport || 'phone') === 'desktop' ? { width: 1440, height: 1000 } : { width: 390, height: 844 };
const outDir = path.resolve(String(args['out-dir'] || `output/playwright/course-geometry/one-tap/${course}-${String(hole).padStart(2, '0')}`));
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce', isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Every capture starts from an empty hole: clear this course's local marks.
  await page.addInitScript(key => { try { localStorage.removeItem(key); } catch { /* private mode */ } }, `golfhelm-one-tap-anchors:local-one-tap:${course}`);
  const navigatedAt = Date.now();
  await page.goto(`${base}/?onetap=1&course=${course}&hole=${hole}${args.mode ? `&mode=${args.mode}` : ''}${args.world ? `&world=${args.world}` : ''}`);
  await page.waitForFunction(() => document.querySelector('canvas[data-terrain-state=ready]'), null, { timeout: 90000 });
  // Navigation → first ready canvas, wall clock: the load, the V1 build and (world=v2) the V2 compile together.
  const readyAfterMs = Date.now() - navigatedAt;
  const settle = async () => {
    let previous = null;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(200);
      const next = await page.evaluate(() => document.querySelector('canvas[data-terrain-state=ready]')?.dataset.renderCount ?? null);
      if (next === previous && i > 3) break;
      previous = next;
    }
  };
  const read = () => page.evaluate(() => {
    const screen = document.querySelector('[data-slot=one-tap-screen]'), canvas = document.querySelector('canvas[data-terrain-state=ready]');
    const text = selector => document.querySelector(selector)?.textContent?.trim() ?? null;
    return { state: screen?.dataset.oneTapState ?? null, holeKey: screen?.dataset.holeKey ?? null, holeStatus: screen?.dataset.holeStatus ?? null, strokes: text('[data-slot=one-tap-shots]'), cameraMode: screen?.dataset.cameraMode ?? null, cameraState: screen?.dataset.cameraState ?? null,
      currentView: screen?.querySelector('[data-current-view]')?.getAttribute('data-current-view') ?? null,
      status: text('[data-slot=one-tap-toast]'), gps: text('[data-slot=one-tap-location]'), completion: text('[data-slot=one-tap-hole-complete]'), distances: text('[data-slot=one-tap-distances]'), lie: text('[data-slot=one-tap-lie]'),
      markers: document.querySelectorAll('[data-marked-position]').length, links: document.querySelectorAll('[data-marked-link]').length,
      sigmaRings: Array.from(document.querySelectorAll('[data-marked-sigma]')).filter(n => n.getAttribute('display') !== 'none').length,
      cameraFraming: screen?.dataset.cameraFraming || null, cameraZoom: document.querySelector('[data-camera-zoom]')?.getAttribute('data-camera-zoom') ?? null,
      drawCalls: canvas?.dataset.drawCalls ?? null, projection: canvas?.dataset.projection ?? null,
      // Master plan Task 20 / §11: the render world, its mount compile, the shader precompile and the frame P95 the runtime reports.
      renderWorld: canvas?.dataset.renderWorld ?? null, v2BuildMs: canvas?.dataset.v2BuildMs || null, shaderCompileMs: canvas?.dataset.shaderCompileMs ?? null,
      frameP95Ms: canvas?.dataset.frameP95Ms ?? null, renderTriangles: canvas?.dataset.renderTriangles ?? null, drawCallStatus: canvas?.dataset.drawCallStatus ?? null, geometryMemoryMb: canvas?.dataset.geometryMemoryMb ?? null };
  });
  const steps = [];
  let index = 0;
  const snap = async (name, { settled = true } = {}) => {
    if (settled) await settle();
    const file = path.join(outDir, `${String(++index).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file });
    const record = { name, file: path.basename(file), ...(await read()) };
    steps.push(record);
    process.stdout.write(`${record.file} hole=${record.holeKey} ${record.holeStatus} strokes=${record.strokes ?? '-'} state=${record.state} camera=${record.cameraState}/${record.currentView}/${record.cameraFraming ?? "-"}@${record.cameraZoom ?? "-"} markers=${record.markers} links=${record.links} lie=${record.lie ?? '-'} draw=${record.drawCalls} world=${record.renderWorld ?? '-'} build=${record.v2BuildMs ?? '-'}ms shader=${record.shaderCompileMs ?? '-'}ms p95=${record.frameP95Ms ?? '-'}ms\n`);
  };
  const mark = async () => {
    await page.locator('[data-slot=one-tap-mark]').click();
    await page.waitForFunction(() => document.querySelector('[data-slot=one-tap-screen]')?.dataset.oneTapState !== 'CAPTURE_PENDING', null, { timeout: 10000 });
  };
  // Fixes land every 500 ms; the estimator window wants a few of them.
  const walkTo = async metres => { await page.evaluate(m => window.__oneTapWalker.walkTo(m), metres); await page.waitForTimeout(2200); };
  await page.waitForTimeout(2200);
  await snap('ready');
  await mark(); await snap('tee-marked');
  // The walker route runs tee → green → next tee; the green sits at greenAtM.
  const length = await page.evaluate(() => Number(document.querySelector('[data-walker-green-m]')?.dataset.walkerGreenM ?? window.__oneTapWalker.routeLengthM));
  await walkTo(Math.max(0, Math.min(length * .55, length - 40))); await mark(); await snap('approach-marked');
  // §79: the ••• menu carries the exceptions; the primary screen stays clean.
  await page.locator('button[aria-label="More"]').click(); await page.waitForTimeout(250); await snap('overflow', { settled: false });
  await page.locator('button[aria-label="More"]').click(); await page.waitForTimeout(250);
  await walkTo(Math.max(0, length - 3)); await mark(); await snap('green-marked');
  // The completion card (§19) fades after two seconds on a clean hole: snapshot it while it is up.
  await page.locator('[data-slot=one-tap-holed]').click(); await page.waitForTimeout(350); await snap('holed', { settled: false });
  // Explicit hole advance: NEXT HOLE becomes the primary action once the hole is closed.
  const before = await page.evaluate(() => document.querySelector('[data-slot=one-tap-screen]')?.dataset.holeKey ?? null);
  // The last hole has no NEXT HOLE: the round is over and the capture ends on the completion card.
  const nextHole = page.locator('[data-slot=one-tap-next-hole]');
  if (await nextHole.count()) {
    await nextHole.click();
    await page.waitForFunction(prev => document.querySelector('[data-slot=one-tap-screen]')?.dataset.holeKey !== prev, before, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelector('canvas[data-terrain-state=ready]'), null, { timeout: 90000 });
    await page.waitForTimeout(2200);
    await snap('next-hole-ready');
  }
  const summary = { course, hole, viewport, world: args.world ? String(args.world) : 'v1', readyAfterMs, routeLengthM: length, steps, errors };
  fs.writeFileSync(path.join(outDir, 'capture.json'), JSON.stringify(summary, null, 2) + '\n');
  if (errors.length) process.stdout.write(`ERRORS ${errors.join(' | ')}\n`);
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exit(1); });
