// Side-by-side capture for the phone Stats redesign: player My stats (S-STATS), coach Stats (S-TEAMSTATS)
// and player Home "Your game" (S-HOMEGAME). Screen ids, states and the app routes come from screens.json,
// which 05-SCREENS.md is generated from, so the script and the inventory never disagree.
//
// Run on the Mac from the helmv3 repo root (it has Playwright). No sign-in: the app side uses the
// /clubhouse-preview fixture routes, the design side is the local design page. Nothing is written outside --out.
//
//   npm run dev -- -p 3100                                         (one terminal, only when the app side runs)
//   node <pkg>/capture/capture.mjs --list                          every id, its states, and which side has each
//   node <pkg>/capture/capture.mjs --id S-STATS.sg --state default
//   node <pkg>/capture/capture.mjs --id S-STATS --state all        every state in the id's 05 matrix
//   node <pkg>/capture/capture.mjs --id all --state default        every id
//   node <pkg>/capture/capture.mjs --motion M-STATS-01             one 07 row: video and frames, motion and reduce
//   node <pkg>/capture/capture.mjs --motion all
//   node <pkg>/capture/capture.mjs --compare                       pairs every design/app still already in --out
//
// Options
//   --side design|app|both     default both
//   --theme light|dark|both    default both (state `dark` is shot dark only)
//   --length full|top          full = the whole scroll (default), top = the phone as it opens.
//                              Ids whose action is a scroll are always shot top, or the scroll would be undone.
//   --base <url>               app base, default http://localhost:3100/clubhouse-preview/ (or $BASE)
//   --no-video                 motion: frames only, no .webm (lighter; also needed where Playwright's ffmpeg isn't installed)
//   --out <dir>                default <pkg>/screenshots (stills), <pkg>/screenshots/motion (motion)
//
// Files
//   stills  <out>/<ID>__<state>__<design|app>__<light|dark>.png
//   motion  <out>/motion/<M-ID>__<design|app>__<motion|reduce>.webm, plus
//           <out>/motion/<M-ID>__<design|app>__<motion|reduce>__<t>ms.png for each frame 07's Check column names
//   compare <out>/compare/<ID>__<state>__<light|dark>.png   (app left, design right)
//   log     <out>/capture-log.txt: saved, skipped (state not drawn on that side, or fixture still to add), failed
//
// Stills run with Reduce Motion (the design hash gets `reduce`, the context gets reducedMotion: 'reduce'), so every
// grow-once mark is at rest and nothing is mid-slide. Design stills are the `.device` element (phone with bezel) in a
// 1700-wide window, because narrower windows put the phone below the studio controls; app stills are the viewport at
// 393 x 852 (430 x 932 for w430). Text Size XXL is the design `xxl` token and the app's --ch-type-scale 1.36.
//
// Motion frames: CSS transitions and Web Animations are paused right after the trigger and seeked to each frame time,
// so a frame is exact, not a timer guess. Marks drawn by requestAnimationFrame (the hero line morph M-STATS-10, the
// scrub, Try again) have nothing to seek; those frames are taken on the clock and the log says "clock".
//
// One headless Chromium; one context and one page at a time, closed as it goes, so it stays light on memory.
// Exit 0 when nothing failed; skipped shots are not failures.

import { chromium } from 'playwright';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, '..');
const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const SCREENS = JSON.parse(readFileSync(join(HERE, 'screens.json'), 'utf8'));
const SIDE = opt('side', 'both');
const THEMES = { light: ['light'], dark: ['dark'], both: ['light', 'dark'] }[opt('theme', 'both')];
const LENGTH = opt('length', 'full');
const BASE = (opt('base') ?? process.env.BASE ?? 'http://localhost:3100/clubhouse-preview/').replace(/\/?$/, '/');
const OUT = resolve(opt('out', join(PKG, 'screenshots')));
const MOUT = join(OUT, 'motion');
if (!THEMES || !['design', 'app', 'both'].includes(SIDE) || !['full', 'top'].includes(LENGTH)) {
  console.error('bad option: --side design|app|both, --theme light|dark|both, --length full|top'); process.exit(1);
}

// ---------- the design page, wrapped as a standards-mode document (the published page is a body fragment) ----------
const DESIGN_SRC = join(PKG, 'redesign/stats-and-home-phone.html');
let DESIGN_URL = null;
const designUrl = () => {
  if (DESIGN_URL) return DESIGN_URL;
  const dir = mkdtempSync(join(tmpdir(), 'stats-design-'));
  const f = join(dir, 'page.html');
  writeFileSync(f, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + readFileSync(DESIGN_SRC, 'utf8') + '</body></html>');
  return (DESIGN_URL = pathToFileURL(f).href);
};

// ---------- selectors: one name, the design page's element and the app's data-ch hook (08 Part 3) ----------
// n = the nth match (0-based) after the name: drow-0, prow-2, rrow-1, gc-0, leg-1. v = a value: seg-last20, card-sg.
const SEL = {
  seg: { design: (v) => `#winSeg [data-v="${v}"], #twinSeg [data-v="${v}"]`, app: (v) => `[data-ch="stats-window-seg"][data-v="${v}"], [data-ch="team-window-seg"][data-v="${v}"]` },
  filter: { design: () => '#ph .fbtn', app: () => '[data-ch="stats-filter"]' },
  card: { design: (v) => `#phScroll [data-go="${v}"]`, app: (v) => `[data-ch="stats-card"][data-go="${v}"]` },
  back: { design: () => '#backBtn', app: () => '[data-ch="stats-back"]' },
  chart: { design: () => '#heroChart', app: () => '[data-ch="stats-hero-chart"]' },
  how: { design: () => '#phPushScroll .how', app: () => '[data-ch="stats-how"]' },
  retry: { design: () => '#ph [data-retry]', app: () => '[data-ch="stats-retry"]' },
  drow: { design: () => '#phPushScroll .drow:not(.total)', app: () => '[data-ch="stats-sg-row"]' },
  prow: { design: () => '#phPushScroll .prow', app: () => '[data-ch="team-player-row"]' },
  rrow: { design: () => '#phPushScroll .rrow:not(.lrow)', app: () => '[data-ch="stats-round-row"]' },
  gc: { design: () => '#phScroll .gc', app: () => '[data-ch="stats-glance"]' },
  leg: { design: () => '#phScroll .leg', app: () => '[data-ch="home-leg"]' },
  lrow: { design: () => '#phPushScroll .lrow', app: () => '[data-ch="stats-part-row"]' },
};
const locate = (page, side, name) => {
  const m = name.match(/^([a-z]+)(?:-(.+))?$/);
  const s = SEL[m[1]];
  if (!s) throw new Error(`no selector named ${m[1]}`);
  const nth = m[2] !== undefined && /^\d+$/.test(m[2]);
  const loc = page.locator(s[side](nth ? undefined : m[2]));
  return nth ? loc.nth(Number(m[2])) : loc.first();
};

// The page's scroller: the open detail's or the summary's on the design page; the tallest scrolling element in the app.
const scrollBy = (side, y) => side === 'design'
  ? `(()=>{const p=document.getElementById('phPush');const open=p&&p.getAttribute('aria-hidden')!=='true';const s=document.getElementById(open?'phPushScroll':'phScroll');s.scrollTop=${y};s.dispatchEvent(new Event('scroll'))})()`
  : `(()=>{let b=document.scrollingElement;for(const e of document.querySelectorAll('body *')){const cs=getComputedStyle(e);if(/(auto|scroll)/.test(cs.overflowY)&&e.scrollHeight-e.clientHeight>4&&e.scrollHeight>b.scrollHeight)b=e}b.scrollTop=${y};b.dispatchEvent(new Event('scroll'))})()`;

class Skip extends Error {}
// A card is tapped on its title row: its centre can be a chart, and a press on a chart scrubs instead of opening.
const tapAt = (name) => (/^card-/.test(name ?? '') ? { position: { x: 40, y: 18 } } : {});
// One action step, from screens.json (`tap:seg-last20`, `scroll:320`, `scrub:0.6`, `tap:drow-0`) or a motion row.
async function step(page, side, action) {
  if (!action) return;
  const [verb, arg] = action.split(':');
  if (verb === 'scroll') { await page.evaluate(scrollBy(side, Number(arg))); await page.waitForTimeout(250); return; }
  const el = locate(page, side, verb === 'scrub' ? 'chart' : arg);
  if (!(await el.count())) throw new Skip(`nothing matches "${verb === 'scrub' ? 'chart' : arg}" here`);
  await el.scrollIntoViewIfNeeded();
  if (verb === 'tap') {
    // A control that is inert in this state (the switch while loading) is a skip, not a failure.
    try { await el.click({ timeout: 4000, ...tapAt(arg) }); } catch (e) { if (/Timeout/.test(e.message)) throw new Skip(`"${arg}" is not interactive in this state`); throw e; }
    await page.waitForTimeout(side === 'design' ? 650 : 900); return;
  }
  if (verb === 'press') { const b = await el.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(200); return; }
  if (verb === 'scrub') {
    // Press at the given fraction of the chart's width and hold: the scrub state the still shows.
    const b = await el.boundingBox(); await page.mouse.move(b.x + b.width * Number(arg), b.y + b.height / 2);
    await page.mouse.down(); await page.waitForTimeout(300); return;
  }
  throw new Error(`unknown step ${action}`);
}

// ---------- design page ----------
// The screens.json design hash is the light, default-size view; the theme token is swapped and `reduce` added.
const designHash = (h, theme, reduce) => {
  const t = h.split('-').map((x) => (x === 'light' || x === 'dark' ? theme : x));
  if (reduce && !t.includes('reduce')) t.push('reduce');
  return t.join('-');
};
async function openDesign(page, hash) {
  await page.goto(designUrl() + '#' + hash, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(700);
  await page.locator('.device').first().waitFor({ state: 'visible', timeout: 10_000 });
}
const growDesign = () => {
  const push = document.getElementById('phPush');
  const open = push && push.getAttribute('aria-hidden') !== 'true';
  const s = document.getElementById(open ? 'phPushScroll' : 'phScroll');
  s.scrollTop = 0;
  document.querySelector('.device').style.height = 'auto';
  const ph = document.querySelector('.ph'); ph.style.height = s.scrollHeight + 'px'; ph.style.maxHeight = 'none';
};

// ---------- app ----------
const themeInit = (theme) => {
  try { localStorage.setItem('golf_theme', theme); } catch {}
  const h = document.documentElement;
  const set = () => { if (h.getAttribute('data-fw-theme') !== theme) h.setAttribute('data-fw-theme', theme); };
  set();
  new MutationObserver(set).observe(h, { attributes: true });
};
const growScroll = () => {
  let best = null;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) continue;
    if (el.scrollHeight - el.clientHeight > 4 && (!best || el.scrollHeight > best.scrollHeight)) best = el;
  }
  if (!best) return;
  const full = best.scrollHeight; best.scrollTop = 0;
  for (let n = best; n && n !== document.documentElement; n = n.parentElement) { n.style.height = 'auto'; n.style.maxHeight = 'none'; n.style.overflow = 'visible'; }
  best.style.height = full + 'px';
  document.documentElement.style.height = 'auto';
};
// Completeness pass, 4 Nov 2026: `wide` may also name w600 or w820 (05: 431 to 820 keeps the phone layout).
const WIDE = { w430: { width: 430, height: 932 }, w600: { width: 600, height: 960 }, w820: { width: 820, height: 1180 } };
async function appContext(browser, { theme, wide, xxl, reduce, video }) {
  const vp = WIDE[wide === true ? 'w430' : wide] ?? { width: 393, height: 852 };
  const ctx = await browser.newContext({
    viewport: vp, deviceScaleFactor: video ? 1 : 2,
    isMobile: true, hasTouch: true, colorScheme: theme, reducedMotion: reduce ? 'reduce' : 'no-preference',
    ...(video ? { recordVideo: { dir: video, size: vp } } : {}),
  });
  await ctx.addInitScript(themeInit, theme);
  if (xxl) await ctx.addInitScript(() => { document.documentElement.style.setProperty('--ch-type-scale', '1.36'); });
  return ctx;
}
async function openApp(page, route) {
  const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 240_000 });
  if (res && res.status() >= 400) throw new Error(`preview route ${route} answered ${res.status()} (add the fixture state)`);
  await page.waitForTimeout(1200);
}

// ---------- log ----------
const log = { saved: [], skipped: [], failed: [] };
async function record(name, fn) {
  try { const note = await fn(); log.saved.push(name + (note ? `  (${note})` : '')); console.log('saved  ', name, note ?? ''); }
  catch (e) {
    const m = String(e.message).split('\n')[0];
    if (e instanceof Skip) { log.skipped.push(`${name}: ${m}`); console.log('skipped', name, m); }
    else { log.failed.push(`${name}: ${m}`); console.log('FAILED ', name, m); }
  }
}
function writeLog(dir) {
  mkdirSync(dir, { recursive: true });
  const body = [`capture ${argv.join(' ')}`, `${new Date().toISOString()}`, '',
    `saved ${log.saved.length}`, ...log.saved.map((x) => '  ' + x), '',
    `skipped ${log.skipped.length}`, ...log.skipped.map((x) => '  ' + x), '',
    `failed ${log.failed.length}`, ...log.failed.map((x) => '  ' + x), ''].join('\n');
  writeFileSync(join(dir, 'capture-log.txt'), body);
}

// ---------- stills ----------
const ids = () => {
  const want = opt('id', 'all');
  if (want === 'all') return Object.keys(SCREENS);
  if (!SCREENS[want]) { console.error(`unknown id ${want}; --list shows them`); process.exit(1); }
  return [want];
};
async function stills(browser) {
  mkdirSync(OUT, { recursive: true });
  const wantState = opt('state', 'default');
  for (const id of ids()) {
    const sc = SCREENS[id];
    const states = Object.keys(sc.states);
    if (!states.length) { log.skipped.push(`${id}: today's ${sc.kind}, not redrawn; shoot it in the app with the step "${sc.action ?? sc.app}"`); continue; }
    const list = wantState === 'all' ? states : [wantState];
    for (const st of list) {
      const cell = sc.states[st];
      if (!cell) { log.skipped.push(`${id} ${st}: not a state of this id`); continue; }
      const themes = st === 'dark' ? ['dark'] : THEMES;
      const top = LENGTH === 'top' || (sc.action ?? '').startsWith('scroll');
      for (const theme of themes) {
        const base = `${id}__${st}`;
        if (SIDE !== 'app') {
          const name = `${base}__design__${theme}`;
          if (!cell.design) log.skipped.push(`${name}: not drawn on the design page${cell.app ? ' (app only)' : cell.add ? '' : ' (state does not apply)'}`);
          else await record(name, async () => {
            const ctx = await browser.newContext({ viewport: { width: 1700, height: 1200 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' });
            try {
              const page = await ctx.newPage();
              await openDesign(page, designHash(cell.design, theme, true));
              await step(page, 'design', sc.action);
              if (!top && !(sc.action ?? '').startsWith('scrub')) { await page.evaluate(growDesign); await page.waitForTimeout(300); }
              await page.locator('.device').first().screenshot({ path: join(OUT, name + '.png'), animations: 'disabled' });
            } finally { await ctx.close(); }
          });
        }
        if (SIDE !== 'design') {
          const name = `${base}__app__${theme}`;
          if (!cell.app) log.skipped.push(`${name}: ${cell.add ? 'fixture to add (05 marks it add)' : 'no app view for this state'}`);
          else await record(name, async () => {
            const ctx = await appContext(browser, { theme, wide: st, xxl: st === 'xxl', reduce: true });
            try {
              const page = await ctx.newPage();
              await openApp(page, cell.app);
              await step(page, 'app', sc.action);
              const full = !top && !(sc.action ?? '').startsWith('scrub');
              if (full) { await page.evaluate(growScroll); await page.waitForTimeout(300); }
              await page.screenshot({ path: join(OUT, name + '.png'), animations: 'disabled', fullPage: full });
            } finally { await ctx.close(); }
          });
        }
      }
    }
  }
  writeLog(OUT);
}

// ---------- motion (07) ----------
// start: the screen id whose default state the clip opens on; pre: steps before recording; trig: the trigger;
// frames: ms after the trigger. press holds 200ms, then frames count from the release. clock: rAF-drawn, not seekable.
const PUSH = { start: 'S-STATS', trig: 'tap:card-scoring' };
const WIN = { start: 'S-STATS', trig: 'tap:seg-last20' };
const MOTION = {
  'M-STATS-01': { ...PUSH, frames: [0, 116, 231, 462] },
  'M-STATS-02': { ...PUSH, frames: [462] },
  'M-STATS-03': { ...PUSH, frames: [462] },
  'M-STATS-04': { start: 'S-STATS.scoring', trig: 'tap:back', frames: [0, 231, 462] },
  'M-STATS-05': { start: 'S-STATS.scoring', trig: 'swipe', frames: [], sides: ['app'], note: 'not drawn on the design page; compare with the Classes edge-swipe clip' },
  'M-STATS-06': { start: 'S-STATS', trig: 'scrub', frames: [], clock: true },
  'M-STATS-07': { ...WIN, frames: [0, 90, 180, 360] },
  'M-STATS-08': { ...WIN, frames: [100] },
  'M-STATS-09': { ...WIN, frames: [0, 130, 260] },
  'M-STATS-10': { ...WIN, frames: [0, 90, 180, 360], clock: true },
  'M-STATS-11': { start: 'S-STATS', trig: 'scroll:320', frames: [90] },
  'M-STATS-12': { start: 'S-STATS', trig: 'reveal:card-sg', frames: [0, 180, 360] },
  'M-STATS-13': { start: 'S-STATS', trig: 'reveal:card-rounds', frames: [180] },
  'M-STATS-14': { start: 'S-STATS', trig: 'reveal:card-goals', frames: [180] },
  'M-STATS-15': { start: 'S-STATS', trig: 'reveal:card-sg', frames: [0, 180, 360] },
  'M-STATS-16': { start: 'S-STATS', trig: 'press:card-sg', frames: [0, 140, 280] },
  'M-STATS-17': { start: 'S-STATS', trig: 'press:card-scoring', frames: [0, 140] },
  'M-STATS-18': { start: 'S-STATS.rounds', trig: 'press:rrow-0', frames: [0, 60, 120] },
  'M-STATS-19': { start: 'S-STATS', trig: 'press:gc-0', frames: [0] },
  'M-STATS-20': { start: 'S-STATS', trig: 'press:filter', frames: [0] },
  'M-STATS-21': { start: 'S-STATS.sg', trig: 'tap:drow-0', frames: [0, 100, 200] },
  'M-STATS-22': { start: 'S-STATS.scoring', trig: 'tap:how', frames: [0, 100, 200] },
  'M-STATS-23': { start: 'S-ALL.retry', trig: 'tap:retry', frames: [0, 130, 260] },
  'M-STATS-24': { start: 'S-ALL.retry', trig: 'tap:retry', frames: [0, 950] },
  'M-STATS-25': { start: 'S-ALL.retry', trig: 'tap:retry', frames: [1400], clock: true, note: 'compare the last frame with a cold load of S-STATS' },
  'M-STATS-26': { start: 'S-STATS.scoring', trig: 'load', frames: [0], clock: true, note: 'the first painted frame of the video must be the final frame' },
  'M-STATS-27': { dom: true, note: 'DOM test, not a clip: after Enter on a focused card, focus is on Back after 80ms (0 under Reduce Motion)' },
  'M-HOME-01': { start: 'S-HOMEGAME', trig: 'tap:leg-1', frames: [0, 100], sides: ['app'], note: 'Home legs are not tappable on the design page' },
  // Completeness pass, 4 Nov 2026 (07): app-only rows; none is drawn on the design page.
  'M-STATS-28': { start: 'S-STATS.rounds', trig: 'tap:rrow-0', frames: [0, 231, 462], sides: ['app'], note: 'route push from a detail; compare with the Classes route-push clip' },
  'M-STATS-29': { dom: true, note: 'e2e stats-return: Back from the round page lands on the detail at its scroll, history.length unchanged' },
  'M-STATS-30': { start: 'S-STATS', trig: 'tap:filter', frames: [0, 231, 462], sides: ['app'], note: "today's sheet, regression against main's clip" },
  'M-STATS-31': { dom: true, note: "today's section strip, regression only (Classes M-CRH-08 to 10)" },
  'M-STATS-32': { dom: true, note: 'pull to refresh exists in the iPhone app only; check by hand: no card moves when data lands' },
  'M-STATS-33': { dom: true, note: 'fixture updating-failed: chip back at the old segment by 360ms; no figure changes' },
  'M-STATS-34': { dom: true, note: 'fixture loading#sd-goals: first frame shows the pushed bar; the landed frame equals a warm arrival' },
  'M-STATS-35': { dom: true, note: 'fixture filterempty: card opacity at 130ms' },
  'M-STATS-36': { dom: true, note: 'custom range set in StatsFilter: segment appears with no motion, chip springs' },
  'M-STATS-37': { start: 'S-STATS.sg', trig: 'tap:lrow-0', frames: [0, 16], note: 'instant swap: the frame after the tap is the part at its top' },
  'M-STATS-38': { dom: true, note: 'focus ring shows on :focus-visible with no transition' },
  'M-HOME-02': { start: 'S-HOMEGAME', trig: 'press:leg-0', frames: [0, 60, 120], sides: ['app'] },
  'M-HOME-03': { dom: true, note: 'Back from Stats to Home is a section fade; Home scroll within 1pt' },
  'M-HOME-04': { dom: true, note: 'fixture home-player?state=failed, Try again: nothing outside the card moves' },
};

// Pause every running animation and seek it to t ms after the trigger. Returns how many it moved.
const seekAll = (t) => {
  const as = document.getAnimations();
  for (const a of as) { a.pause(); a.currentTime = t; }
  return as.length;
};
const nextFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function trigger(page, side, trig) {
  const [verb, arg] = trig.split(':');
  if (verb === 'reveal') {
    // Scroll so the card's top sits 60% down the phone: past the .25 threshold, and the grow-once starts.
    const el = locate(page, side, arg);
    if (!(await el.count())) throw new Skip(`nothing matches "${arg}" here`);
    await el.evaluate((n) => { let s = n.parentElement; while (s && !/(auto|scroll)/.test(getComputedStyle(s).overflowY)) s = s.parentElement; (s || document.scrollingElement).scrollTop += n.getBoundingClientRect().top - (s ? s.getBoundingClientRect().top : 0) - (s ? s.clientHeight : innerHeight) * 0.6; });
    return;
  }
  if (verb === 'swipe') { await page.mouse.move(6, 420); await page.mouse.down(); for (let x = 6; x <= 300; x += 12) { await page.mouse.move(x, 420); await page.waitForTimeout(16); } await page.mouse.up(); return; }
  if (verb === 'scrub') {
    const el = locate(page, side, 'chart'); if (!(await el.count())) throw new Skip('no hero chart here');
    await el.scrollIntoViewIfNeeded(); const b = await el.boundingBox(); const y = b.y + b.height / 2;
    await page.mouse.move(b.x + b.width * 0.6, y); await page.mouse.down(); await page.waitForTimeout(300);
    return { scrub: b, y };
  }
  if (verb === 'scroll') { await page.evaluate(scrollBy(side, Number(arg))); return; }
  const el = locate(page, side, arg);
  if (!(await el.count())) throw new Skip(`nothing matches "${arg}" here`);
  await el.scrollIntoViewIfNeeded();
  if (verb === 'tap') { await el.click(tapAt(arg)); return; }
  if (verb === 'press') { const b = await el.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(200); await page.mouse.up(); return; }
  throw new Error(`unknown trigger ${trig}`);
}

async function motion(browser) {
  mkdirSync(MOUT, { recursive: true });
  const want = opt('motion', 'all');
  const rows = want === 'all' ? Object.keys(MOTION) : [want];
  for (const mid of rows) {
    const m = MOTION[mid];
    if (!m) { console.error(`unknown motion row ${mid}`); process.exit(1); }
    if (m.dom) { log.skipped.push(`${mid}: ${m.note}`); continue; }
    const sc = SCREENS[m.start];
    for (const side of (m.sides ?? ['design', 'app']).filter((s) => SIDE === 'both' || SIDE === s)) {
      for (const mode of ['motion', 'reduce']) {
        const name = `${mid}__${side}__${mode}`;
        const reduce = mode === 'reduce';
        await record(name, async () => {
          const vdir = flag('no-video') ? null : mkdtempSync(join(tmpdir(), 'stats-video-'));
          const ctx = side === 'design'
            ? await browser.newContext({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: reduce ? 'reduce' : 'no-preference', ...(vdir ? { recordVideo: { dir: vdir, size: { width: 1300, height: 1000 } } } : {}) })
            : await appContext(browser, { theme: 'light', reduce, video: vdir });
          let clock = false;
          try {
            const page = await ctx.newPage();
            const target = () => (side === 'design' ? page.locator('.device').first() : page);
            const shot = (t) => target().screenshot({ path: join(MOUT, `${name}__${t}ms.png`) });
            if (m.trig === 'load') {
              // Arrival by link: the clip is the load itself. Frame 0 is the first paint after navigation.
              if (side === 'design') await page.goto(designUrl() + '#' + designHash(sc.states.default.design, 'light', reduce), { waitUntil: 'commit' });
              else await page.goto(BASE + sc.states.default.app, { waitUntil: 'commit' });
              await page.waitForLoadState('load'); await shot(0); await page.waitForTimeout(1500); clock = true;
            } else {
              if (side === 'design') { if (!sc.states.default.design) throw new Skip('not drawn on the design page'); await openDesign(page, designHash(sc.states.default.design, 'light', reduce)); }
              else { if (!sc.states.default.app) throw new Skip('no app route'); await openApp(page, sc.states.default.app); }
              if (sc.action !== m.trig) await step(page, side, sc.action);
              const t0 = Date.now();
              const r = await trigger(page, side, m.trig);
              if (r?.scrub) {
                // Drag from 60% to 20% of the chart in eight steps, a frame at each.
                for (let i = 0; i <= 8; i++) { await page.mouse.move(r.scrub.x + r.scrub.width * (0.6 - 0.05 * i), r.y); await page.waitForTimeout(40); await shot(i * 40); }
                await page.mouse.up(); clock = true;
              } else if (m.clock) {
                for (const t of m.frames) { await page.waitForTimeout(Math.max(0, t - (Date.now() - t0))); await shot(t); }
                clock = true;
              } else {
                await page.evaluate(nextFrames);
                const n = await page.evaluate(seekAll, 0);
                if (!n) {
                  // Nothing to seek (instant under Reduce Motion, or an rAF mark): take the frames on the clock.
                  for (const t of m.frames) { await page.waitForTimeout(Math.max(0, t - (Date.now() - t0))); await shot(t); }
                  clock = true;
                } else {
                  for (const t of m.frames) { await page.evaluate(seekAll, t); await shot(t); }
                  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
                }
              }
              await page.waitForTimeout(900); // let the clip run out on video
            }
            const v = page.video();
            await ctx.close();
            if (v) await v.saveAs(join(MOUT, name + '.webm'));
          } catch (e) { await ctx.close().catch(() => {}); throw e; }
          return [clock ? 'clock' : 'seeked', m.note].filter(Boolean).join('; ');
        });
      }
    }
  }
  writeLog(MOUT);
}

// ---------- side by side ----------
async function compare(browser) {
  const dir = join(OUT, 'compare'); mkdirSync(dir, { recursive: true });
  const files = readdirSync(OUT).filter((f) => f.endsWith('.png'));
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  const b64 = (f) => readFileSync(join(OUT, f)).toString('base64');
  for (const f of files.filter((x) => x.includes('__design__'))) {
    const a = f.replace('__design__', '__app__');
    const name = f.replace('__design__', '__');
    if (!existsSync(join(OUT, a))) { log.skipped.push(`compare ${name}: no app shot`); continue; }
    await record(`compare ${name}`, async () => {
      await page.setContent(`<body style="margin:0;background:#8a8a8a;display:flex;gap:24px;padding:24px;align-items:flex-start;font:600 14px system-ui;color:#fff">
        <figure style="margin:0"><figcaption>app</figcaption><img style="width:393px" src="data:image/png;base64,${b64(a)}"></figure>
        <figure style="margin:0"><figcaption>design</figcaption><img style="width:407px" src="data:image/png;base64,${b64(f)}"></figure></body>`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(dir, name), fullPage: true });
    });
  }
  await page.close();
  writeLog(dir);
}

// ---------- list ----------
function list() {
  for (const [id, sc] of Object.entries(SCREENS)) {
    const st = Object.entries(sc.states);
    const both = st.filter(([, c]) => c.design && c.app).map(([k]) => k);
    const dOnly = st.filter(([, c]) => c.design && !c.app).map(([k]) => k);
    const add = st.filter(([, c]) => c.add).map(([k]) => k);
    console.log(`${id}  (${sc.kind})${sc.action ? `  step ${sc.action}` : ''}`);
    if (!st.length) { console.log('   today\'s, not redrawn: shoot in the app only'); continue; }
    console.log(`   both sides: ${both.join(', ') || 'none'}`);
    if (dOnly.length) console.log(`   design only (app fixture missing): ${dOnly.join(', ')}`);
    if (add.length) console.log(`   to add: ${add.join(', ')}`);
  }
  console.log('\nmotion rows: ' + Object.keys(MOTION).join(', '));
}

if (flag('list')) { list(); process.exit(0); }
if (!opt('id') && !opt('motion') && !flag('compare')) {
  console.error('usage: capture.mjs --id <ID|all> [--state <state|all>] | --motion <M-ID|all> | --compare | --list   (see the header)');
  process.exit(1);
}
const browser = await chromium.launch();
try {
  if (opt('id')) await stills(browser);
  if (opt('motion')) await motion(browser);
  if (flag('compare')) await compare(browser);
} finally { await browser.close(); }
console.log(`\n${log.saved.length} saved, ${log.skipped.length} skipped, ${log.failed.length} failed${log.failed.length ? ':\n  ' + log.failed.join('\n  ') : ''}`);
process.exit(log.failed.length ? 1 : 0);
