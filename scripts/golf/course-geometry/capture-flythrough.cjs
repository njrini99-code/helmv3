#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- repo-local capture script, same shape as capture-lab.cjs */
/**
 * Review flythrough (renderer redesign §18 / Meridian V6 storytelling): one
 * hole walked through the production camera states tee → approach → green →
 * putting in the Meridian lab, recorded as a video with the camera transitions
 * playing, plus one still and the canvas telemetry per state and a four-frame
 * strip for the review sheet. A review aid: it changes nothing and, like every
 * capture here, proves only what is on screen.
 *
 *   node scripts/golf/course-geometry/capture-flythrough.cjs --out=<dir> \
 *     [--base=http://127.0.0.1:8768] [--course=peek-n-peak-upper] [--hole=7] [--viewport=phone|desktop]
 *     [--states=tee,approach,green,putting] [--dwell=1400]
 *
 * Writes <dir>/hole-NN-flythrough.webm, <dir>/hole-NN-<state>.png (+ .json)
 * and <dir>/hole-NN-strip.png (composed with build-flythrough-strip.py when
 * python3 + Pillow are available; skipped otherwise).
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=') || true]; }));
const base = String(args.base || 'http://127.0.0.1:8768');
const course = String(args.course || 'peek-n-peak-upper');
const hole = Number(args.hole || 7);
const viewport = String(args.viewport || 'phone');
const states = String(args.states || 'tee,approach,green,putting').split(',').map(s => s.trim()).filter(Boolean);
// The production states frame their own course area (outside-world spec
// §22–23): the tee state the whole hole, the approach state the approach,
// the green and putting states the green complex.
const AREA_FOR_STATE = { tee: 'hole', approach: 'approach', green: 'green', putting: 'green', top: 'hole', terrain: 'hole', side: 'hole' };
// The lab scales its stage to fit the browser; a 1800 × 1100 window keeps
// both phone and desktop stages at scale 1 (as capture-lab.cjs does).
const window = { width: 1800, height: 1100 };
const dwell = Number(args.dwell || 1400);
const out = path.resolve(String(args.out || 'output/playwright/course-geometry/visual-system/flythrough'));
const tag = `hole-${String(hole).padStart(2, '0')}`;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  // Motion on: the transitions are the point of a flythrough.
  const context = await browser.newContext({ viewport: window, deviceScaleFactor: 2, reducedMotion: 'no-preference', recordVideo: { dir: out, size: window } });
  const page = await context.newPage();
  const errors = [], frames = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?lab=1&course=${course}&hole=${hole}&preset=${states[0]}&area=${AREA_FOR_STATE[states[0]] ?? 'hole'}&viewport=${viewport}`);
  const ready = () => page.waitForFunction(() => document.querySelector('[data-slot=lab-stage] canvas[data-terrain-state=ready]'), null, { timeout: 90000 });
  await ready();
  const settle = async () => {
    let previous = null;
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(200);
      const next = await page.evaluate(() => document.querySelector('[data-slot=lab-stage] canvas[data-terrain-state=ready]')?.dataset.renderCount ?? null);
      if (next === previous && i > 2) break;
      previous = next;
    }
  };
  for (const [index, state] of states.entries()) {
    if (index > 0) {
      const area = AREA_FOR_STATE[state] ?? 'hole';
      if ((AREA_FOR_STATE[states[index - 1]] ?? 'hole') !== area) { await page.getByLabel('Area', { exact: true }).selectOption(area); await ready(); }
      await page.getByRole('button', { name: state, exact: true }).click();
      await ready();
    }
    await page.waitForTimeout(dwell);
    await settle();
    const file = path.join(out, `${tag}-${state}.png`);
    await page.locator('[data-slot=lab-stage]').screenshot({ path: file });
    const dataset = await page.evaluate(() => ({ ...document.querySelector('[data-slot=lab-stage] canvas[data-terrain-state=ready]').dataset }));
    const frame = { state, area: AREA_FOR_STATE[state] ?? 'hole', file: path.basename(file), pitch: dataset.terrainPitch, projection: dataset.projection, drawCalls: dataset.drawCalls, renderTriangles: dataset.renderTriangles,
      frameP95Ms: dataset.frameP95Ms, visualStyleHash: dataset.visualStyleHash, visualArtifactHash: dataset.visualArtifactHash };
    frames.push(frame);
    fs.writeFileSync(file.replace(/\.png$/, '.json'), JSON.stringify({ course, hole, viewport, ...frame, dataset, errors: [...errors] }, null, 2) + '\n');
  }
  await page.waitForTimeout(dwell);
  const video = page.video();
  await context.close();
  const recorded = video ? await video.path() : null;
  const webm = path.join(out, `${tag}-flythrough.webm`);
  if (recorded && fs.existsSync(recorded)) fs.renameSync(recorded, webm);
  fs.writeFileSync(path.join(out, `${tag}-flythrough.json`), JSON.stringify({ course, hole, viewport, states, dwellMs: dwell, video: recorded ? path.basename(webm) : null, frames, errors }, null, 2) + '\n');
  const strip = spawnSync('python3', [path.join(__dirname, 'build-flythrough-strip.py'), out, tag], { encoding: 'utf8' });
  const stripNote = strip.status === 0 ? ` strip=${tag}-strip.png` : ' strip=skipped';
  process.stdout.write(`${tag} ${frames.map(f => `${f.state}:draw=${f.drawCalls}/tri=${f.renderTriangles}/pitch=${f.pitch}`).join(' ')} video=${recorded ? path.basename(webm) : 'none'}${stripNote}${errors.length ? ` ERRORS ${errors.join(' | ')}` : ''}\n`);
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exit(1); });
