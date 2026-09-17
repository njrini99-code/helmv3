#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- repo-local capture script, same shape as capture-one-tap.cjs */
/**
 * Capture how a One-Tap shot is told (master plan §62–64): the reveal of the
 * shot just played, the illustrative arc over a full shot, the surface
 * connector under a putt, and the §63 hierarchy behind them. Each mark is
 * photographed twice — once mid-reveal, while the shot is still drawing
 * itself on, and once settled — so a regression in either state is visible.
 *
 * Run it twice, once per motion preference: `--motion=full` proves the
 * reveal, `--motion=reduce` proves Reduced Motion paints the finished shot
 * immediately and animates nothing.
 *
 *   node scripts/golf/course-geometry/capture-one-tap-motion.cjs --out-dir=<dir> \
 *     [--base=http://127.0.0.1:8772] [--course=peek-n-peak-upper] [--hole=7] \
 *     [--motion=full|reduce] [--viewport=phone|desktop]
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=') || true]; }));
const base = String(args.base || 'http://127.0.0.1:8772');
const course = String(args.course || 'peek-n-peak-upper');
const hole = Number(args.hole || 7);
const motion = String(args.motion || 'full') === 'reduce' ? 'reduce' : 'no-preference';
const viewport = String(args.viewport || 'phone') === 'desktop' ? { width: 1440, height: 1000 } : { width: 390, height: 844 };
const outDir = path.resolve(String(args['out-dir'] || `output/playwright/course-geometry/one-tap/${course}-${String(hole).padStart(2, '0')}-motion-${motion === 'reduce' ? 'reduced' : 'full'}`));
/** How long to wait for a completed shot to start drawing itself on. The
 * reveal rides the same fresh-mark signal as the anchor ripple, which the
 * screen raises about a second after the anchor finalizes, so this is a
 * generous ceiling rather than an expected duration. Reduced Motion never
 * raises it at all; that run waits this out once per mark and says so. */
const REVEAL_WAIT_MS = 4000;
/** Where along the stroke the held frame sits, so the frame is reproducible. */
const REVEAL_FRAME_FRACTION = .65;
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, reducedMotion: motion, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Every capture starts from an empty hole: clear this course's local marks.
  await page.addInitScript(key => { try { localStorage.removeItem(key); } catch { /* private mode */ } }, `golfhelm-one-tap-anchors:local-one-tap:${course}`);
  await page.goto(`${base}/?onetap=1&course=${course}&hole=${hole}`);
  await page.waitForFunction(() => document.querySelector('canvas[data-terrain-state=ready]'), null, { timeout: 90000 });
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
    const screen = document.querySelector('[data-slot=one-tap-screen]');
    const text = selector => document.querySelector(selector)?.textContent?.trim() ?? null;
    return {
      state: screen?.dataset.oneTapState ?? null, holeKey: screen?.dataset.holeKey ?? null, holeStatus: screen?.dataset.holeStatus ?? null,
      cameraMode: screen?.dataset.cameraMode ?? null, cameraState: screen?.dataset.cameraState ?? null, cameraFraming: screen?.dataset.cameraFraming || null,
      lie: text('[data-slot=one-tap-lie]'), distances: text('[data-slot=one-tap-distances]'),
      markers: document.querySelectorAll('[data-marked-position]').length,
      // §62–63: every drawn shot, with the shape it claims to be, whether it
      // is labelled art, where it sits in the hierarchy and whether it is
      // still drawing itself on.
      shots: Array.from(document.querySelectorAll('[data-marked-link]')).map(node => ({
        key: node.getAttribute('data-marked-link'), basis: node.getAttribute('data-trajectory-basis'),
        illustrative: node.getAttribute('data-illustrative'), opacity: node.getAttribute('opacity'),
        dash: node.getAttribute('stroke-dasharray'), dashOffset: node.getAttribute('stroke-dashoffset'),
        points: (node.getAttribute('d') ?? '').trim().split(' ').filter(Boolean).length,
        display: node.getAttribute('display'),
      })),
      revealing: document.querySelectorAll('[data-shot-reveal]').length,
    };
  });
  const steps = [];
  let index = 0;
  const snap = async (name, { settled = true, reveal = undefined } = {}) => {
    if (settled) await settle();
    const file = path.join(outDir, `${String(++index).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file });
    const record = { name, file: path.basename(file), ...(reveal === undefined ? {} : { reveal }), ...(await read()) };
    steps.push(record);
    const shots = record.shots.map(s => `${s.basis === 'illustrative_endpoint_arc' ? 'arc' : 'connector'}@${s.opacity ?? 1}`).join(' ') || '-';
    const drawing = reveal === undefined ? ''
      : ` reveal=${reveal.fired ? `fired@${reveal.fired.atMs}ms(${reveal.fired.animations})` : 'none'}${reveal.held ? ` held@${(reveal.held.fraction * 100).toFixed(0)}%of${reveal.held.lengthPx}px` : ''}`;
    process.stdout.write(`${record.file} ${record.holeStatus} camera=${record.cameraState}/${record.cameraFraming ?? '-'} marks=${record.markers} shots=[${shots}]${drawing} lie=${record.lie ?? '-'}\n`);
  };
  const mark = async () => {
    await page.locator('[data-slot=one-tap-mark]').click();
    await page.waitForFunction(() => document.querySelector('[data-slot=one-tap-screen]')?.dataset.oneTapState !== 'CAPTURE_PENDING', null, { timeout: 10000 });
  };
  // Fixes land every 500 ms; the estimator window wants a few of them.
  const walkTo = async metres => { await page.evaluate(m => window.__oneTapWalker.walkTo(m), metres); await page.waitForTimeout(2200); };
  /** Hold the newest drawn shot part-way along its own stroke, so the frame
   * is the same one every run. The dash is rebuilt from the overlay's own
   * geometry in absolute units: the shape is the overlay's, only the clock is
   * the capture's. `release` hands the shot back untouched. */
  const holdStroke = fraction => page.evaluate(target => {
    const node = [...document.querySelectorAll('[data-marked-link]')].filter(n => (n.getAttribute('d') ?? '').length > 0).at(-1) ?? null;
    if (!(node instanceof SVGPathElement)) return null;
    for (const painted of [node, node.previousElementSibling]) {
      if (!(painted instanceof SVGPathElement)) continue;
      painted.removeAttribute('pathLength');
      const length = painted.getTotalLength();
      painted.style.strokeDasharray = `${length} ${length}`;
      painted.style.strokeDashoffset = String((1 - target) * length);
    }
    return { key: node.getAttribute('data-marked-link'), basis: node.getAttribute('data-trajectory-basis'), lengthPx: Math.round(node.getTotalLength()), fraction: target };
  }, fraction);
  const release = () => page.evaluate(() => {
    for (const node of document.querySelectorAll('[data-marked-link]')) {
      for (const painted of [node, node.previousElementSibling]) {
        if (!(painted instanceof SVGPathElement)) continue;
        painted.style.strokeDasharray = ''; painted.style.strokeDashoffset = '';
      }
    }
  });
  /** A mark, the reveal it starts, the stroke held part-drawn, then settled.
   *
   * Two separate things are recorded, because photographing a WebGL page
   * takes longer than the overlay takes to draw a 520 ms stroke and tidy it
   * away. `fired` is the observation: the reveal animation really was
   * attached to the shot that was just completed, and how long after the mark
   * it appeared. The held frame is the illustration: the same shot, stopped
   * at a fixed point along its own path, so the picture is reproducible.
   * Reduced Motion never fires, and the held frame then shows what it draws
   * instead — the whole shot, at once. */
  const markAndWatch = async name => {
    await mark();
    const began = Date.now();
    let fired = null;
    try {
      await page.waitForFunction(() => document.querySelector('[data-shot-reveal]') != null, null, { timeout: REVEAL_WAIT_MS, polling: 'raf' });
      fired = { animations: await page.evaluate(() => document.querySelectorAll('[data-shot-reveal]').length), atMs: Date.now() - began };
    } catch { fired = null; }
    await settle();
    const held = await holdStroke(REVEAL_FRAME_FRACTION);
    await snap(`${name}-reveal`, { settled: false, reveal: { fired, held } });
    await release();
    await snap(`${name}-settled`);
  };
  await page.waitForTimeout(2200);
  await snap('ready');
  // The first mark opens the hole: one anchor, and so no shot to draw yet.
  await mark(); await snap('tee-marked');
  // The walker route runs tee → green → next tee; the green sits at greenAtM.
  const greenM = await page.evaluate(() => Number(document.querySelector('[data-walker-green-m]')?.dataset.walkerGreenM ?? window.__oneTapWalker.routeLengthM));
  await walkTo(Math.max(0, Math.min(greenM * .55, greenM - 40)));
  await markAndWatch('drive');
  await walkTo(Math.max(0, greenM - 6));
  await markAndWatch('approach');
  // A second mark on the green: green → green is a putt, and a putt never flies.
  await walkTo(greenM);
  await markAndWatch('putt');
  // Putt made: the cup mark where the phone is, and the hole closes on it.
  await page.locator('[data-slot=one-tap-putt-made]').click();
  await page.waitForFunction(() => document.querySelector('[data-slot=one-tap-screen]')?.dataset.holeStatus === 'COMPLETE', null, { timeout: 10000 });
  await page.waitForTimeout(350);
  await snap('holed', { settled: false });
  const summary = { course, hole, viewport, motion, greenAtM: greenM, revealWaitMs: REVEAL_WAIT_MS, steps, errors };
  fs.writeFileSync(path.join(outDir, 'capture.json'), JSON.stringify(summary, null, 2) + '\n');
  if (errors.length) process.stdout.write(`ERRORS ${errors.join(' | ')}\n`);
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exit(1); });
