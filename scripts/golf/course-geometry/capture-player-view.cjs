#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- repo-local capture script, same shape as capture-lab.cjs */
/**
 * Capture the production player view (HoleSceneFrame, entry context) from the
 * local play fixture: opens the expanded course view the way a player does and
 * screenshots the whole screen, so signoff sees the real chrome, not the lab.
 *
 *   node scripts/golf/course-geometry/capture-player-view.cjs --out=<file.png> \
 *     [--base=http://127.0.0.1:8768] [--course=peek-n-peak-upper] [--viewport=phone|desktop] [--view=terrain|top|green]
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=') || true]; }));
const base = String(args.base || 'http://127.0.0.1:8768');
const course = String(args.course || 'peek-n-peak-upper');
const viewport = String(args.viewport || 'phone') === 'desktop' ? { width: 1440, height: 1000 } : { width: 390, height: 844 };
const view = String(args.view || 'terrain');
const out = path.resolve(String(args.out || 'output/playwright/course-geometry/visual-system/player/capture.png'));
(async () => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce', isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/?play=1&course=${course}`);
  const expand = page.getByRole('button', { name: /Expand course view|Open green in 3D/ }).first();
  await expand.waitFor({ timeout: 60000 });
  await expand.click();
  await page.waitForFunction(() => document.querySelector('canvas[data-terrain-state=ready]'), null, { timeout: 90000 });
  if (view !== 'terrain') {
    await page.getByRole('group', { name: 'View' }).getByRole('button', { name: view === 'top' ? 'Top' : 'Green', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('canvas[data-terrain-state=ready]'), null, { timeout: 90000 });
  }
  let previous = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(200);
    const next = await page.evaluate(() => document.querySelector('canvas[data-terrain-state=ready]')?.dataset.renderCount ?? null);
    if (next === previous && i > 3) break;
    previous = next;
  }
  await page.screenshot({ path: out });
  const dataset = await page.evaluate(() => ({ ...document.querySelector('canvas[data-terrain-state=ready]').dataset }));
  const chrome = await page.evaluate(() => Array.from(document.querySelectorAll('[data-slot=course-explorer] button')).map(b => b.getAttribute('aria-label') || b.textContent.trim()).filter(Boolean));
  fs.writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify({ course, viewport, view, dataset, chrome, errors }, null, 2) + '\n');
  process.stdout.write(`${path.basename(out)} draw=${dataset.drawCalls} tri=${dataset.renderTriangles} proj=${dataset.projection ?? ''} chrome=[${chrome.join(', ')}]${errors.length ? ` ERRORS ${errors.join(' | ')}` : ''}\n`);
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exit(1); });
