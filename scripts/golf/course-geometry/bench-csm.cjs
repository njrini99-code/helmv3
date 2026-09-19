#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- repo-local bench script, same shape as capture-v2-canaries.cjs */
/**
 * Meridian V2 Task 22 — CSM high-tier benchmark (plan §73). Playwright
 * script modelled on capture-lab.cjs: opens the render-quality lab twice per
 * preset (CSM off, CSM on) via the `csm=1` query param, nudges the Yaw
 * slider through a short oscillation so the runtime's rolling last-30
 * `frameTimes`/`gpuTimes` buffers fill with real samples (the renderer is
 * event-driven — §72 — so a settled, static frame is exactly one sample),
 * and records the dataset telemetry for both states.
 *
 * `csm=1` is NOT honoured by the lab yet — see
 * docs/golf/course-geometry/csm-benchmark.md ("Wiring — controller-applied")
 * for the exact terrain-debug.ts (+ three-renderer.ts call-site) diff this
 * script depends on. Until that diff lands, both states render identically
 * and the `csm*` dataset fields read back as `undefined` (printed as
 * `not-wired` below) — that is expected, not a bug in this script.
 *
 * Always runs at `quality=high` — Task 22 is a high-tier-only benchmark
 * (§73: "Do not enable standard"); this script never exercises `csm=1` at
 * any other quality tier.
 *
 *   node scripts/golf/course-geometry/bench-csm.cjs \
 *     [--base=http://127.0.0.1:8768] [--course=peek-n-peak-upper] [--hole=7] \
 *     [--presets=approach,green] [--nudges=12] \
 *     [--out=output/playwright/course-geometry/csm-benchmark]
 *
 * Read-only against src. Per the task brief this script is delivered but
 * deliberately not run here (no capture against the lab's port from this
 * session) — the controller runs it.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=') || true]; }));
const base = String(args.base || 'http://127.0.0.1:8768');
const course = String(args.course || 'peek-n-peak-upper');
const hole = String(args.hole || '7');
const presets = String(args.presets || 'approach,green').split(',');
const nudges = Number(args.nudges || 12);
const outDir = path.resolve(String(args.out || 'output/playwright/course-geometry/csm-benchmark'));

async function settle(page) {
  await page.waitForFunction(() => document.querySelector('canvas[data-terrain-state=ready]'), null, { timeout: 90000 });
  let previous = null;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200);
    const next = await page.evaluate(() => document.querySelector('canvas[data-terrain-state=ready]')?.dataset.renderCount ?? null);
    if (next === previous) break;
    previous = next;
  }
}

/** Fills the rolling frameTimes/gpuTimes buffers (three-renderer.ts caps
 * both at 30) with real renders before reading a p95, instead of reporting
 * a "p95" over the single settled frame `settle()` already waited for. */
async function sampleFrames(page) {
  const yaw = page.locator('input[aria-label="Yaw"]');
  const start = Number(await yaw.inputValue());
  for (let i = 0; i < nudges; i++) {
    await yaw.fill(String(start + (i % 2 === 0 ? 1 : -1) * (i + 1) * 0.25));
    await page.waitForTimeout(60);
  }
  await yaw.fill(String(start));
  await page.waitForTimeout(150);
}

async function measure(page, preset, csmOn) {
  const params = `lab=1&course=${course}&hole=${hole}&preset=${preset}&viewport=desktop&quality=high${csmOn ? '&csm=1' : ''}`;
  await page.goto(`${base}/?${params}`);
  await settle(page);
  await sampleFrames(page);
  const dataset = await page.evaluate(() => ({ ...document.querySelector('canvas[data-terrain-state=ready]').dataset }));
  return { preset, csm: csmOn, params, dataset };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const results = [];
  for (const preset of presets) {
    for (const csmOn of [false, true]) {
      const result = await measure(page, preset, csmOn);
      results.push(result);
      fs.writeFileSync(path.join(outDir, `${preset}-csm${csmOn ? 1 : 0}.json`), JSON.stringify(result, null, 2) + '\n');
      const d = result.dataset;
      const gpu = d.gpuTimerBasis === 'ext_disjoint_timer_query' ? `${d.gpuFrameP95Ms}ms` : `unavailable(${d.gpuTimerBasis})`;
      process.stdout.write(`${preset} csm=${csmOn ? 1 : 0} gpuFrameP95=${gpu} cpuFrameP95=${d.frameP95Ms}ms `
        + `shadowMapSize=${d.shadowMapSize} shadowMemoryMb=${d.shadowMemoryMb} `
        + `csmActive=${d.csmActive ?? 'not-wired'} csmCascades=${d.csmCascades ?? ''} csmShadowMemoryMb=${d.csmShadowMemoryMb ?? ''} `
        + `draws=${d.drawCalls}${errors.length ? ` ERRORS ${errors.join(' | ')}` : ''}\n`);
    }
  }
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({ course, hole, presets, nudges, results, errors }, null, 2) + '\n');
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exit(1); });
