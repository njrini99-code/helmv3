#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- repo-local capture script, same shape as capture-player-view.cjs */
/**
 * Meridian lab capture (§94–95). Opens the render-quality lab with a URL
 * state, waits for a settled render, and writes the stage screenshot plus
 * the telemetry panel as JSON. One call per state; compose sweeps in shell.
 *
 *   node scripts/golf/course-geometry/capture-lab.cjs --out=<file.png> \
 *     [--base=http://127.0.0.1:8768] [--params="course=peek-n-peak-upper&hole=7&preset=terrain&viewport=desktop&mowing=0"]
 *
 * Read-only against src; the lab compiles the visual artifact at runtime.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=') || true]; }));
const base = String(args.base || 'http://127.0.0.1:8768');
const params = String(args.params || 'course=peek-n-peak-upper&hole=7&preset=terrain');
const out = path.resolve(String(args.out || 'output/playwright/course-geometry/visual-system/lab/capture.png'));
(async () => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?lab=1&${params}`);
  await page.waitForFunction(() => document.querySelector('canvas[data-terrain-state=ready]'), null, { timeout: 90000 });
  let previous = null;
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200);
    const next = await page.evaluate(() => document.querySelector('canvas[data-terrain-state=ready]')?.dataset.renderCount ?? null);
    if (next === previous) break;
    previous = next;
  }
  await page.locator('[data-slot=lab-stage]').screenshot({ path: out });
  const dataset = await page.evaluate(() => ({ ...document.querySelector('canvas[data-terrain-state=ready]').dataset }));
  fs.writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify({ params, dataset, errors }, null, 2) + '\n');
  process.stdout.write(`${path.basename(out)} draw=${dataset.drawCalls} tri=${dataset.renderTriangles} style=${dataset.visualStyleHash} artifact=${dataset.visualArtifactHash} code=${dataset.meridianCode ?? ''}${errors.length ? ` ERRORS ${errors.join(' | ')}` : ''}\n`);
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exit(1); });
