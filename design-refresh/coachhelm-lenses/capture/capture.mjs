// Side-by-side shots and motion clips for CoachHelm Lenses: the design page and the app, by screen ID, state and motion ID.
// The IDs and state ids are 05-SCREENS.md's; the motion IDs are 07-MOTION.md's M-LNS rows; 08-ACCEPTANCE.md Part 4 says how to use the output.
//
// Run on the Mac from the helmv3 repo root (it has Playwright). No sign-in: the app side uses the /clubhouse-preview fixture
// routes and the design side is the local page in ../redesign/. Writes only to --out (default: the package's screenshots/ folder).
//
//   npm run dev -- -p 3100                                        one dev server, only needed for the app side (SHARED-9)
//   node <package>/capture/capture.mjs --list                      every screen ID, its states (drawn or app only) and every motion ID
//   node <package>/capture/capture.mjs --id S-FILE --state default
//   node <package>/capture/capture.mjs --id S-FILE.read             every state of one ID
//   node <package>/capture/capture.mjs --id S-FILE --state xxl --theme dark --side app
//   node <package>/capture/capture.mjs --id S-FILE.read --state long+desk
//   node <package>/capture/capture.mjs --all                        every ID and state (the full set; slow, still one browser)
//   node <package>/capture/capture.mjs --motion M-LNS-04            one motion row, full and Reduce Motion
//   node <package>/capture/capture.mjs --motion all                 every motion row that has a clip
//   node <package>/capture/capture.mjs --compare                    one sheet per pair already shot, app left, design right
//
// Stills:  <out>/<ID>__<state>__{design,app}__{light,dark}.png
// Clips:   <out>/<M-ID>__{design,app}__{full,reduce}.webm   (rows that share a clip are recorded once and copied)
// Sheets:  <out>/compare/<ID>__<state>__{light,dark}.png
//
// Options: --theme light|dark (default both)   --side design|app (default both)   --out <dir>
//          --base http://localhost:3100/clubhouse-preview/   (or BASE in the environment)
// Light on the laptop: one headless Chromium for the whole run, one page at a time, each closed as it goes.
// Exit 0 when everything asked for saved; 1 when anything failed. A state the page doesn't draw skips its design shot and
// says so (app side only); a motion row checked by a DOM test says so. Those are skips, not failures.
// If the build names a hook or fixture state differently, change it in the tables below only.

import { chromium } from 'playwright';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined; };

const OUT = resolve(opt('out') ?? resolve(HERE, '../screenshots'));
const PAGE = pathToFileURL(resolve(HERE, '../redesign/coachhelm-lenses.html')).href;
const BASE = (opt('base') ?? process.env.BASE ?? 'http://localhost:3100/clubhouse-preview/').replace(/\/?$/, '/');
const THEMES = opt('theme') ? [opt('theme')] : ['light', 'dark'];
const SIDES = opt('side') ? [opt('side')] : ['design', 'app'];
const XXL = '1.36'; // SHARED-5: --ch-type-scale 1.36, set directly on both sides

// ───── Viewports (05 "State ids") ─────
const VP = {
  phone: { width: 402, height: 874 },
  w390: { width: 390, height: 844 },
  w430: { width: 430, height: 932 },
  desk: { width: 1280, height: 800 },
};

// ───── State ids (05 "State ids"). tokens: page hash tokens (null: the page doesn't draw it). app: the fixture's ?state= ─────
const STATE = {
  default: { tokens: [], app: 'accepted' },
  loading: { tokens: ['loading'], app: 'loading' },
  empty: { tokens: ['empty'], app: 'empty' },
  failed: { tokens: ['failed'], app: 'failed' },
  early: { tokens: ['early'], app: 'early' },
  long: { tokens: ['long'], app: 'long' },
  many: { tokens: null, app: 'manyreads' },
  one: { tokens: null, app: 'oneread' },
  stale: { tokens: null, app: 'readsfailed' },
  xxl: { tokens: ['xxl'], app: 'accepted', xxl: true },
  reduce: { tokens: [], app: 'accepted' },
  w390: { tokens: null, app: 'accepted', vp: 'w390' },
  w430: { tokens: null, app: 'accepted', vp: 'w430' },
  desk: { tokens: [], app: 'accepted', vp: 'desk' },
  nofocus: { tokens: ['nofocus'], app: 'noplan' },
  suggested: { tokens: ['suggested'], app: 'proposed' },
  seen: { tokens: ['seen'], app: 'seen' },
  declined: { tokens: null, app: 'declined' },
  nofield: { tokens: ['nofield'], app: 'nofield' },
  fieldfew: { tokens: null, app: 'fieldfew' },
  nointent: { tokens: ['nointent'], app: 'nointent' },
  failwrites: { tokens: null, app: 'failwrites' },
  duplicate: { tokens: null, app: 'duplicate' },
};

// ───── Screen IDs (05 "Screen IDs" and "State matrices") ─────
// screen: page hash screen. route: app preview path. viewer: player for S-BOARD. lens: the player lens. device: desk when desktop only.
// overlay: page hash token for an open sheet or menu. open: app taps that open it (the page opens it from the hash).
// reveal: { design, app } scrolled to the middle before the shot. after: per-state app taps (a write that fails, so the toast shows).
// states: every capture state for the ID. drawn: the ones the page draws; the rest are app side only.
const F = 'coachhelm-player-file';
const IDS = {
  'S-LIST': {
    screen: 'list', route: 'coachhelm',
    states: ['default', 'loading', 'empty', 'failed', 'long', 'many', 'one', 'stale', 'xxl', 'reduce', 'w390', 'w430'],
    drawn: ['default', 'long', 'xxl', 'reduce'],
    note: "lane 1 owns this screen and its fixture; ?state= is passed only where lane 1's fixture takes it",
  },
  'S-FILE': {
    screen: 'file', route: F,
    states: ['default', 'loading', 'empty', 'failed', 'early', 'long', 'many', 'one', 'stale', 'nofield', 'fieldfew', 'nointent', 'xxl', 'reduce', 'w390', 'w430', 'desk'],
    drawn: ['default', 'loading', 'empty', 'failed', 'early', 'long', 'nofield', 'nointent', 'xxl', 'reduce', 'desk'],
  },
  'S-FILE.rail': {
    screen: 'file', route: F, device: 'desk',
    states: ['default', 'loading', 'failed', 'long', 'many', 'one', 'stale', 'reduce'],
    drawn: ['default', 'loading', 'long', 'reduce'],
  },
  'S-FILE.lens': {
    screen: 'file', route: F, lens: true,
    states: ['default', 'loading', 'empty', 'long', 'many', 'one', 'stale', 'fieldfew', 'xxl', 'reduce', 'w390', 'w430', 'desk'],
    drawn: ['default', 'empty', 'desk'],
  },
  'S-FILE.focus': {
    screen: 'file', route: F,
    states: ['default', 'nofocus', 'suggested', 'seen', 'declined', 'long', 'stale', 'xxl', 'reduce', 'w390', 'w430', 'desk'],
    drawn: ['default', 'nofocus', 'suggested', 'seen', 'long', 'xxl', 'reduce', 'desk'],
  },
  'S-FILE.undo': {
    screen: 'file', route: F,
    states: ['default', 'failwrites', 'long', 'many', 'xxl', 'reduce', 'w390', 'w430', 'desk'],
    drawn: ['default', 'long', 'xxl', 'reduce', 'desk'],
    reveal: { design: '[data-act="undo"]', app: '[data-ch-hf-undo]' },
    after: { failwrites: ['[data-ch-hf-undo]'] },
  },
  'S-FILE.read': {
    screen: 'file', route: F, overlay: 'sheet', open: ['[data-ch-hf-read="top"]'],
    states: ['default', 'failwrites', 'long', 'many', 'one', 'stale', 'suggested', 'xxl', 'reduce', 'w390', 'w430', 'desk'],
    drawn: ['default', 'long', 'suggested', 'xxl', 'reduce', 'desk'],
    after: { failwrites: ['[data-ch-hf-assign]'] },
  },
  'S-FILE.plan': {
    screen: 'file', route: F, overlay: 'intent', open: ['[data-ch-hf-intent-edit]'],
    states: ['default', 'nointent', 'failwrites', 'long', 'xxl', 'reduce', 'w390', 'w430', 'desk'],
    drawn: ['default', 'nointent', 'desk'],
    after: { failwrites: ['[data-ch-hf-intent-save]'] },
  },
  'S-FILE.more': {
    screen: 'file', route: F, overlay: 'menu', open: ['[data-ch-hf-more]'],
    states: ['default', 'loading', 'empty', 'failed', 'long', 'xxl', 'reduce', 'w390', 'w430', 'desk'],
    drawn: ['default', 'long', 'desk'],
  },
  'S-FILE.toast': {
    screen: 'file', route: F,
    states: ['default', 'duplicate'], drawn: [],
    stateApp: { default: 'failwrites' },
    after: { default: ['[data-ch-hf-assign]'], duplicate: ['[data-ch-hf-assign]'] },
    note: "today's toast, not drawn on the page; shot 900ms after the write answers",
  },
  'S-BOARD': {
    screen: 'board', route: F, viewer: 'player',
    states: ['default', 'loading', 'empty', 'failed', 'early', 'long', 'many', 'one', 'stale', 'nofield', 'fieldfew', 'xxl', 'reduce', 'w390', 'w430', 'desk'],
    drawn: ['default', 'loading', 'empty', 'failed', 'early', 'long', 'nofield', 'xxl', 'reduce', 'desk'],
  },
  'S-BOARD.focus': {
    screen: 'board', route: F, viewer: 'player',
    states: ['default', 'suggested', 'seen', 'nofocus', 'declined', 'failwrites', 'long', 'xxl', 'reduce', 'w390', 'w430', 'desk'],
    drawn: ['default', 'suggested', 'seen', 'nofocus', 'long', 'xxl', 'reduce', 'desk'],
    after: { failwrites: ['[data-ch-hf-accept]'] },
  },
  'S-BOARD.read': {
    screen: 'board', route: F, viewer: 'player', overlay: 'sheet', open: ['[data-ch-hf-read="top"]'],
    states: ['default', 'long', 'many', 'one', 'stale', 'xxl', 'reduce', 'w390', 'w430', 'desk'],
    drawn: ['default'],
  },
};

// ───── Motion IDs (07 "Motion table", last column) ─────
// Rows checked by a DOM test have no clip. Rows that share a clip are recorded once and copied to each name.
// Steps: 'play:<name>' presses the page's own Play button; 'tap:<sel>' taps inside the page's device (design) or the app;
//        'press:<sel>' holds 400ms then lets go; 'reveal:<sel>' scrolls it to the middle; 'wheel:<px>' scrolls under the
//        pointer; 'key:<key>'; 'back' is the browser's Back; 'wait:<ms>'.
const DOM_ONLY = {
  'M-LNS-03': 'no transform on rows during press', 'M-LNS-09': "drag thresholds against today's sheet",
  'M-LNS-14': 'no transform on cards', 'M-LNS-22': 'no transform or height animation on corrections',
  'M-LNS-24': 'skeleton, then content, no transition', 'M-LNS-28': 'scrollTop set before first paint',
};
const CLIPS = {
  push: { vp: 'w390', design: { hash: 'list-phone', steps: ['play:open', 'wait:1200'] }, app: { route: 'coachhelm', steps: ['tap:[data-ch-hf-open]', 'wait:1200'] } },
  pop: { vp: 'w390', design: { hash: 'file-phone', steps: ['wait:500', 'tap:[data-act="back"]', 'wait:1200'] }, app: { route: 'coachhelm', steps: ['tap:[data-ch-hf-open]', 'wait:1200', 'back', 'wait:1200'] } },
  lens: { vp: 'w390', design: { hash: 'file-phone', steps: ['play:lens', 'wait:3200'] }, app: { route: `${F}?state=accepted`, steps: ['tap:[data-ch-lens="player"]', 'wait:1600', 'tap:[data-ch-lens="coach"]', 'wait:1200'] } },
  sheet: { vp: 'w390', design: { hash: 'file-phone', steps: ['tap:[data-act="read"]', 'wait:1200', 'tap:[data-act="close"]', 'wait:1000'] }, app: { route: `${F}?state=accepted`, steps: ['tap:[data-ch-hf-read="top"]', 'wait:1200', 'tap:[data-ch-sheet-close]', 'wait:1000'] } },
  dialog: { vp: 'desk', design: { hash: 'file-desktop', steps: ['tap:[data-act="read"]', 'wait:900', 'tap:[data-act="close"]', 'wait:800'] }, app: { route: `${F}?state=accepted`, steps: ['tap:[data-ch-hf-read="top"]', 'wait:900', 'tap:[data-ch-sheet-close]', 'wait:800'] } },
  menu: { vp: 'w390', design: { hash: 'file-phone', steps: ['play:menu', 'wait:2400'] }, app: { route: `${F}?state=accepted`, steps: ['tap:[data-ch-hf-more]', 'wait:1300', 'key:Escape', 'wait:800'] } },
  press: { vp: 'w390', design: { hash: 'file-phone', steps: ['reveal:[data-act="intent"]', 'wait:300', 'press:[data-act="intent"]', 'wait:1200'] }, app: { route: `${F}?state=accepted`, steps: ['reveal:[data-ch-hf-intent-edit]', 'wait:300', 'press:[data-ch-hf-intent-edit]', 'wait:1200'] } },
  assign: { vp: 'w390', design: { hash: 'file-phone-nofocus', steps: ['play:assign', 'wait:4200'] }, app: { route: `${F}?state=noplan`, steps: ['tap:[data-ch-hf-assign]', 'wait:2400'] } },
  accept: { vp: 'w390', design: { hash: 'board-phone-suggested', steps: ['play:accept', 'wait:4200'] }, app: { route: `${F}?viewer=player&state=proposed`, steps: ['tap:[data-ch-hf-accept]', 'wait:2000'] } },
  dismiss: { vp: 'w390', design: { hash: 'file-phone', steps: ['tap:[data-act="read"]', 'wait:1000', 'tap:[data-act="dismiss"]', 'wait:1800'] }, app: { route: `${F}?state=accepted`, steps: ['tap:[data-ch-hf-read="top"]', 'wait:1000', 'tap:[data-ch-hf-dismiss]', 'wait:1800'] } },
  undo: { vp: 'w390', design: { hash: 'file-phone', steps: ['reveal:[data-act="undo"]', 'wait:400', 'tap:[data-act="undo"]', 'wait:1400'] }, app: { route: `${F}?state=accepted`, steps: ['reveal:[data-ch-hf-undo]', 'wait:400', 'tap:[data-ch-hf-undo]', 'wait:1400'] } },
  // Not drawn on the page (07 M-LNS-20). Rail rows link to playerFileHref; this taps the first that isn't the open player.
  rail: { vp: 'desk', design: null, app: { route: `${F}?state=accepted`, steps: ['tap:[data-ch-hf-open]:not([aria-current="page"])', 'wait:1200'] } },
  saveplan: { vp: 'w390', design: { hash: 'file-phone', steps: ['tap:[data-act="intent"]', 'wait:900', 'tap:[data-picks="aim"] button[aria-pressed="false"]', 'wait:500', 'tap:[data-act="saveintent"]', 'wait:1600'] }, app: { route: `${F}?state=accepted`, steps: ['tap:[data-ch-hf-intent-edit]', 'wait:900', 'tap:[data-ch-hf-pick][aria-pressed="false"]', 'wait:500', 'tap:[data-ch-hf-intent-save]', 'wait:1600'] } },
  loading: { vp: 'w390', design: { hash: 'file-phone-loading', steps: ['wait:3000'] }, app: { route: `${F}?state=loading`, steps: ['wait:3000'] } },
  scroll: { vp: 'w390', design: { hash: 'file-phone', steps: ['wait:400', 'wheel:240', 'wait:800', 'wheel:-240', 'wait:800'] }, app: { route: `${F}?state=accepted`, steps: ['wait:400', 'wheel:240', 'wait:800', 'wheel:-240', 'wait:800'] } },
  // Today's toast, not drawn on the page.
  toast: { vp: 'w390', design: null, app: { route: `${F}?state=failwrites`, steps: ['tap:[data-ch-hf-assign]', 'wait:3000'] } },
};
const MOTION = {
  'M-LNS-01': 'push', 'M-LNS-02': 'pop', 'M-LNS-04': 'lens', 'M-LNS-05': 'lens', 'M-LNS-06': 'lens', 'M-LNS-07': ['sheet', 'dialog'],
  'M-LNS-08': 'sheet', 'M-LNS-10': 'lens', 'M-LNS-11': 'menu', 'M-LNS-12': 'menu', 'M-LNS-13': 'press', 'M-LNS-15': 'assign',
  'M-LNS-16': 'assign', 'M-LNS-17': 'accept', 'M-LNS-18': 'dismiss', 'M-LNS-19': 'undo', 'M-LNS-20': 'rail', 'M-LNS-21': 'saveplan',
  'M-LNS-23': 'saveplan', 'M-LNS-25': 'loading', 'M-LNS-26': 'scroll', 'M-LNS-27': 'toast',
};

// ───── Bookkeeping ─────
const saved = [], failed = [], skipped = [];
const record = async (name, fn) => {
  try { await fn(); saved.push(name); console.log('saved  ', name); return true; }
  catch (e) { const m = String(e.message).split('\n')[0]; failed.push(`${name}: ${m}`); console.log('FAILED ', name, m); return false; }
};
const skip = (name, why) => { skipped.push(`${name}: ${why}`); console.log('skip   ', name, `(${why})`); };

// ───── Shared helpers ─────
// The page fits its device to the stage; this gives the stage the whole window and pins the device at 1:1.
const DESIGN_STAGE = `.top,.chapters,.stage__cap{display:none!important}.layout{display:block;max-width:none;padding:0}.stage{position:relative!important;top:0!important;height:1000px!important}#box .dev{transform:translate(-50%,-50%)!important}`;
const designViewport = (vp) => (vp === 'desk' ? { width: 1440, height: 1000 } : { width: 1000, height: 1000 });
async function openDesign(page, hash) {
  await page.goto(`${PAGE}?n=${Date.now()}#${hash}`);
  await page.addStyleTag({ content: DESIGN_STAGE });
  await page.evaluate(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); window.dispatchEvent(new Event('resize')); });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(400);
}
// Theme the app the way design-refresh/package/capture-shots.mjs does.
const themeInit = (theme) => {
  try { localStorage.setItem('golf_theme', theme); } catch {}
  const h = document.documentElement;
  const set = () => { if (h.getAttribute('data-fw-theme') !== theme) h.setAttribute('data-fw-theme', theme); };
  set();
  new MutationObserver(set).observe(h, { attributes: true, attributeFilter: ['data-fw-theme'] });
};
// Text Size XXL: hold --ch-type-scale at 1.36 on <html> from first paint, whatever the app's own Text Size code writes.
const xxlInit = (k) => {
  const h = document.documentElement;
  const set = () => { if (h.style.getPropertyValue('--ch-type-scale') !== k) h.style.setProperty('--ch-type-scale', k); };
  set();
  new MutationObserver(set).observe(h, { attributes: true, attributeFilter: ['style'] });
};
async function appContext(browser, vp, { theme = 'light', reduce = false, xxl = false, video } = {}) {
  const desk = vp === 'desk';
  const ctx = await browser.newContext({
    viewport: VP[vp], deviceScaleFactor: video ? 1 : 2, isMobile: !desk, hasTouch: !desk, colorScheme: theme,
    reducedMotion: reduce ? 'reduce' : 'no-preference', ...(video ? { recordVideo: { dir: video, size: VP[vp] } } : {}),
  });
  await ctx.addInitScript(themeInit, theme);
  if (xxl) await ctx.addInitScript(xxlInit, XXL);
  return ctx;
}
async function gotoApp(page, route) {
  const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 240_000 });
  if (res && res.status() >= 400) throw new Error(`preview route ${route} answered ${res.status()} (add the fixture state, 05 "State ids")`);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(1200);
}
const reveal = (page, sel) => page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
async function tap(page, sel) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: 'visible', timeout: 10_000 });
  await el.click();
}

// ───── Stills ─────
function resolveState(idKey, stateKey) {
  const id = IDS[idKey];
  const parts = stateKey.split('+');
  for (const p of parts) {
    if (!STATE[p]) throw new Error(`unknown state "${p}" (05 "State ids")`);
    if (!id.states.includes(p)) throw new Error(`${idKey} has no state "${p}"; it has ${id.states.join(', ')}`);
  }
  const vp = id.device ?? parts.map((p) => STATE[p].vp).filter(Boolean).pop() ?? 'phone';
  const appState = parts.map((p) => id.stateApp?.[p] ?? STATE[p].app).filter((x) => x !== 'accepted').pop() ?? 'accepted';
  return {
    vp, appState,
    drawn: parts.every((p) => STATE[p].tokens && id.drawn.includes(p)),
    xxl: parts.some((p) => STATE[p].xxl),
    tokens: parts.flatMap((p) => STATE[p].tokens ?? []),
    after: parts.flatMap((p) => id.after?.[p] ?? []),
  };
}
// Stills are always shot with Reduce Motion so nothing is caught mid-move; the reduce state differs only on the app side's motion.
function designHash(id, r, theme) {
  const device = r.vp === 'desk' ? 'desktop' : 'phone';
  return [id.screen, device, ...(id.lens ? ['lens'] : []), ...(id.overlay ? [id.overlay] : []), ...r.tokens, theme, 'reduce'].join('-');
}
function appRoute(id, r) {
  if (id.screen === 'list') return r.appState === 'accepted' ? id.route : `${id.route}?state=${r.appState}`;
  const q = [...(id.viewer ? [`viewer=${id.viewer}`] : []), `state=${r.appState}`, ...(id.lens ? ['lens=player'] : [])];
  return `${id.route}?${q.join('&')}`;
}
async function still(browser, idKey, stateKey) {
  const id = IDS[idKey];
  const r = resolveState(idKey, stateKey);
  for (const theme of THEMES) {
    const stem = `${idKey}__${stateKey}`;
    if (SIDES.includes('design')) {
      const name = `${stem}__design__${theme}`;
      if (!r.drawn) skip(name, 'not drawn on the page; app side only');
      else await record(name, async () => {
        const ctx = await browser.newContext({ viewport: designViewport(r.vp), deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' });
        try {
          const page = await ctx.newPage();
          await openDesign(page, designHash(id, r, theme));
          if (id.reveal?.design) await reveal(page, `#box ${id.reveal.design}`);
          const el = page.locator('#box .dev').first();
          await el.waitFor({ state: 'visible', timeout: 10_000 });
          await el.screenshot({ path: join(OUT, `${name}.png`), animations: 'disabled' });
        } finally { await ctx.close(); }
      });
    }
    if (SIDES.includes('app')) {
      const name = `${stem}__app__${theme}`;
      await record(name, async () => {
        const ctx = await appContext(browser, r.vp, { theme, reduce: true, xxl: r.xxl });
        try {
          const page = await ctx.newPage();
          await gotoApp(page, appRoute(id, r));
          if (id.reveal?.app) await reveal(page, id.reveal.app);
          for (const sel of id.open ?? []) { await tap(page, sel); await page.waitForTimeout(800); }
          for (const sel of r.after) { await tap(page, sel); await page.waitForTimeout(900); }
          await page.screenshot({ path: join(OUT, `${name}.png`), animations: 'disabled' });
        } finally { await ctx.close(); }
      });
    }
  }
}

// ───── Clips ─────
async function runSteps(page, steps, inDevice) {
  const q = (sel) => (inDevice ? `#box ${sel}` : sel);
  for (const s of steps) {
    const i = s.indexOf(':'); const k = i < 0 ? s : s.slice(0, i); const a = i < 0 ? '' : s.slice(i + 1);
    if (k === 'wait') await page.waitForTimeout(+a);
    else if (k === 'play') await page.evaluate((p) => document.querySelector(`[data-play="${p}"]`).click(), a);
    else if (k === 'tap') await tap(page, q(a));
    else if (k === 'reveal') await reveal(page, q(a));
    else if (k === 'key') await page.keyboard.press(a);
    else if (k === 'back') await page.goBack();
    else if (k === 'press') {
      const box = await page.locator(q(a)).first().boundingBox();
      if (!box) throw new Error(`nothing to press at ${a}`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down(); await page.waitForTimeout(400); await page.mouse.up();
    } else if (k === 'wheel') {
      const vp = page.viewportSize();
      await page.mouse.move(vp.width / 2, vp.height / 2);
      await page.mouse.wheel(0, +a);
    } else throw new Error(`unknown step ${s}`);
  }
}
async function clip(browser, clipName, mIds) {
  const c = CLIPS[clipName];
  const tmp = join(OUT, '.video');
  for (const side of SIDES) {
    for (const reduce of [false, true]) {
      const names = mIds.map((m) => `${m}__${side}__${reduce ? 'reduce' : 'full'}${clipName === 'dialog' ? '__desk' : ''}`);
      const spec = c[side];
      if (!spec) { names.forEach((n) => skip(n, side === 'design' ? 'not drawn on the page (07)' : 'no app side')); continue; }
      mkdirSync(tmp, { recursive: true });
      let ctx;
      if (side === 'design') {
        const vp = designViewport(c.vp);
        ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: reduce ? 'reduce' : 'no-preference', recordVideo: { dir: tmp, size: vp } });
      } else ctx = await appContext(browser, c.vp, { reduce, video: tmp });
      const page = await ctx.newPage();
      const ok = await record(`${clipName} → ${names.join(', ')}`, async () => {
        if (side === 'design') { await openDesign(page, `${spec.hash}-light${reduce ? '-reduce' : ''}`); await runSteps(page, spec.steps, true); }
        else { await gotoApp(page, spec.route); await runSteps(page, spec.steps, false); }
      });
      const video = page.video();
      await ctx.close();
      if (ok && video) {
        const first = join(OUT, `${names[0]}.webm`);
        renameSync(await video.path(), first);
        for (const n of names.slice(1)) copyFileSync(first, join(OUT, `${n}.webm`));
      }
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// ───── Compare sheets ─────
async function compare(browser) {
  const dir = join(OUT, 'compare'); mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  const img = (f) => `data:image/png;base64,${readFileSync(join(OUT, f)).toString('base64')}`;
  for (const d of readdirSync(OUT).filter((f) => f.includes('__design__') && f.endsWith('.png'))) {
    const a = d.replace('__design__', '__app__');
    const out = d.replace('__design__', '__');
    if (!existsSync(join(OUT, a))) { skip(out, 'no app shot yet'); continue; }
    await record(`compare ${out}`, async () => {
      await page.setContent(`<body style="margin:0;background:#8a8f8b;display:flex;gap:24px;padding:24px;align-items:flex-start;font:14px system-ui;color:#111">
        <figure style="margin:0"><figcaption>app</figcaption><img style="max-height:1800px" src="${img(a)}"></figure>
        <figure style="margin:0"><figcaption>design</figcaption><img style="max-height:1800px" src="${img(d)}"></figure></body>`);
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(dir, out), fullPage: true });
    });
  }
  await page.close();
}

// ───── List ─────
function list() {
  for (const [k, id] of Object.entries(IDS)) {
    console.log(`${k}${id.note ? `   (${id.note})` : ''}`);
    for (const s of id.states) {
      const r = resolveState(k, s);
      console.log(`  ${s.padEnd(11)} ${r.drawn ? `#${designHash(id, r, 'light')}`.padEnd(46) : 'app only'.padEnd(46)} ${appRoute(id, r)}  ${r.vp}`);
    }
  }
  console.log('\nMotion');
  for (let i = 1; i <= 28; i++) {
    const m = `M-LNS-${String(i).padStart(2, '0')}`;
    console.log(`  ${m}  ${DOM_ONLY[m] ? `DOM test: ${DOM_ONLY[m]}` : `clip ${[].concat(MOTION[m]).join(', ')}`}`);
  }
}

// ───── Main ─────
const usage = 'usage: capture.mjs --list | --id <ID> [--state <state>[+<state>]] | --all | --motion <M-ID>|all | --compare   [--theme light|dark] [--side design|app] [--out <dir>] [--base <url>]';
if (flag('list')) { list(); process.exit(0); }
if (!(opt('id') || flag('all') || opt('motion') || flag('compare'))) { console.error(usage); process.exit(1); }
if (opt('id') && !IDS[opt('id')]) { console.error(`unknown screen ID ${opt('id')}; one of ${Object.keys(IDS).join(', ')}`); process.exit(1); }
if (opt('state') && !opt('id')) { console.error('--state goes with --id'); process.exit(1); }
if (opt('theme') && !['light', 'dark'].includes(opt('theme'))) { console.error('--theme is light or dark'); process.exit(1); }
if (opt('side') && !['design', 'app'].includes(opt('side'))) { console.error('--side is design or app'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  if (opt('id') || flag('all')) {
    for (const k of opt('id') ? [opt('id')] : Object.keys(IDS)) {
      for (const s of opt('state') ? [opt('state')] : IDS[k].states) {
        try { resolveState(k, s); } catch (e) { failed.push(`${k}__${s}: ${e.message}`); console.log('FAILED ', `${k}__${s}`, e.message); continue; }
        await still(browser, k, s);
      }
    }
  }
  if (opt('motion')) {
    const want = opt('motion') === 'all' ? [...Object.keys(MOTION), ...Object.keys(DOM_ONLY)].sort() : [opt('motion')];
    const byClip = new Map();
    for (const m of want) {
      if (DOM_ONLY[m]) { skip(m, `DOM test, no clip: ${DOM_ONLY[m]}`); continue; }
      if (!MOTION[m]) { failed.push(`${m}: unknown motion ID (07 has M-LNS-01 to M-LNS-28)`); continue; }
      for (const c of [].concat(MOTION[m])) byClip.set(c, [...(byClip.get(c) ?? []), m]);
    }
    for (const [c, ms] of byClip) await clip(browser, c, ms);
  }
  if (flag('compare')) await compare(browser);
} finally { await browser.close(); }

console.log(`\n${saved.length} saved to ${OUT}` +
  (skipped.length ? `\n${skipped.length} skipped:\n  ${skipped.join('\n  ')}` : '') +
  (failed.length ? `\n${failed.length} failed:\n  ${failed.join('\n  ')}` : ''));
process.exit(failed.length ? 1 : 0);
