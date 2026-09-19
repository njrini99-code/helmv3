#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- repo-local probe, same shape as capture-visual-canaries.cjs */
/**
 * Reproducer for the still-frame overlay flake (2026-09-17): opens one hole ×
 * preset in the lab matrix fixture N times and, at the exact instant the canary
 * script would screenshot (render count stable for 200 ms), reads the computed
 * `visibility` of the estimated-pin group and every node under it, plus any
 * animation running inside the terrain overlay. Under reduced motion the global
 * 0.01 ms transition rule used to cascade the overlay's ready-time visibility
 * flip one DOM level per rendering update; 8 of 60 instants read the pin or its
 * flag paths hidden. `svg[data-slot=terrain-overlay] *` now starts no transition,
 * so every read must be `visible` and the overlay must carry no animation.
 *
 *   node scripts/golf/course-geometry/probe-overlay-still.cjs [--reps=30] [--hole=15] [--preset=Top] \
 *     [--base=http://127.0.0.1:8768] [--course=peek-n-peak-upper] [--viewport=390x844]
 *
 * Exit code 1 when any read is hidden or any overlay animation runs.
 */
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=') || true]; }));
const base = String(args.base || 'http://127.0.0.1:8768');
const course = String(args.course || 'peek-n-peak-upper');
const hole = Number(args.hole || 15), preset = String(args.preset || 'Top'), reps = Number(args.reps || 30);
const [width, height] = String(args.viewport || '390x844').split('x').map(Number);

async function settled(page, canvas) {
  let previous = await canvas.getAttribute('data-render-count');
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(200);
    const next = await canvas.getAttribute('data-render-count');
    if (next === previous) return;
    previous = next;
  }
}

(async () => {
  const browser = await chromium.launch();
  const mobile = width <= 500;
  let hidden = 0, animated = 0;
  for (let i = 1; i <= reps; i++) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${base}/?matrix=1&course=${course}&hole=${hole}`);
    await page.getByRole('button', { name: 'Expand course view' }).click();
    const dialog = page.getByRole('dialog');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-slot=modal-shell]')).every(el => +getComputedStyle(el).opacity > .999));
    const canvas = dialog.locator('canvas');
    await dialog.getByRole('button', { name: preset, exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-terrain-view-state=ready] canvas[data-terrain-state=ready]'));
    await page.waitForFunction(name => document.querySelector('[aria-label="Terrain camera"] button[aria-pressed=true]')?.textContent === name, preset);
    await settled(page, canvas);
    const read = await page.evaluate(() => {
      const overlay = document.querySelector('[role=dialog] svg[data-slot=terrain-overlay]');
      const pin = overlay?.querySelector('[data-target="estimated-pin"]');
      const nodes = pin ? [pin, ...pin.querySelectorAll('*')] : [];
      const reads = nodes.map(node => `${node.tagName}=${getComputedStyle(node).visibility}`);
      const animations = document.getAnimations().filter(animation => overlay?.contains(animation.effect?.target)).map(animation => `${animation.constructor.name}:${animation.effect.target.tagName}`);
      return { overlay: Boolean(overlay), pin: Boolean(pin), reads, animations };
    });
    const bad = read.reads.filter(entry => !entry.endsWith('=visible'));
    if (bad.length) hidden++;
    if (read.animations.length) animated++;
    if (bad.length || read.animations.length || i === 1) process.stdout.write(`rep ${i}: overlay=${read.overlay} pin=${read.pin} hidden=[${bad.join(' ')}] animations=[${read.animations.join(' ')}]\n`);
    await context.close();
  }
  await browser.close();
  process.stdout.write(`${reps} captures of hole ${hole} ${preset} ${width}x${height}: ${hidden} with hidden reads, ${animated} with overlay animations\n`);
  process.exitCode = hidden || animated ? 1 : 0;
})();
