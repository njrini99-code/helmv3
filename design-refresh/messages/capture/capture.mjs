// Fidelity shots and clips for the Messages redesign: the design page and the app, screen by screen, state by state.
//
// Run on the Mac from the helmv3 repo root (it has Playwright). No sign-in: the app side uses the
// /clubhouse-preview/messages fixture route, the design side is a local file. Nothing is written anywhere but --out.
// One headless Chromium, one page at a time, closed as it goes, so it stays light on memory. One dev server.
//
//   npm run dev -- -p 3100                                            (one terminal, only for the app side)
//
// The build contract way (05-SCREENS.md gives every ID and state, 07-MOTION.md every M-ID):
//   node <package>/capture/capture.mjs --id S-MSG.thread                      every state of one screen, design and app
//   node <package>/capture/capture.mjs --id S-MSG.thread --state thread-phone-w430
//   node <package>/capture/capture.mjs --id all --side design                 the whole design set
//   node <package>/capture/capture.mjs --motion M-MSG-07                      the clip for one motion row, design and app,
//                                                                             normal and Reduce Motion, plus its interrupt cases
//   node <package>/capture/capture.mjs --list                                 print every ID, state and M-ID
//   Writes screenshots/<ID>__<state>__{design,app}__{light,dark}.png and clips/<M-ID>__{design,app}[__reduce].webm
//   Options: --side design|app|both (default both)   --theme light|dark (default both)   --out <dir> (default: the package)
//            --base http://localhost:3100/clubhouse-preview/
//
// A state is the design page's hash without the theme: <route>-<phone|desk>[-w430|-xxl|-w1280].
//   phone = 390 x 844, -w430 = 430 x 932 (20px edge), -xxl = 390 at the largest Text Size Clubhouse follows (23/17),
//   desk = 1440 x 900, -w1280 = 1280 x 800. Design shots are still frames: Reduce Motion on, so nothing is mid-move.
// The app takes the same route as ?state=design&view=<route> once PR 11 adds that fixture (04-FIDELITY-SPEC.md section 12),
// and ?play=<clip> for motion (08-ACCEPTANCE.md, side-by-side method). Today's main has neither: app shots then show the
// plain route, which is the honest "before", and the app clip is listed as not reachable yet.
//
// Older modes still work: design | app | compare | clips | motion (see the bottom of this header).
//   node <package>/capture/capture.mjs design  --out <package>/screenshots/after
//   node <package>/capture/capture.mjs app     --out <package>/screenshots/built
//   node <package>/capture/capture.mjs compare --a <dir> --b <dir> --out <dir>
//   node <package>/capture/capture.mjs clips   --out <package>/clips
//   node <package>/capture/capture.mjs motion                                  the design page's 11 interrupt cases
// Exit 0 when everything asked for saved or passed; 1 when anything failed. A state the app can't reach yet is listed.

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const mode = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
const args = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1]; if (v === undefined || v.startsWith('--')) args[k] = true; else { args[k] = v; i++; } }
const PAGE = pathToFileURL(resolve(HERE, '../redesign/clubhouse-messages.html')).href;
const BASE = (args.base ?? process.env.BASE ?? 'http://localhost:3100/clubhouse-preview/').replace(/\/?$/, '/');
const THEMES = args.theme ? [args.theme] : ['light', 'dark'];
const SIDES = args.side && args.side !== 'both' ? [args.side] : ['design', 'app'];
const XXL = 1.353; // 23 / 17, lib/dynamic-type.ts MAX_SCALE

// ── 05-SCREENS.md, as data. [ID, routes, phone?, desk?]. Every route is shot at phone, w430, xxl, desk, w1280.
const SCREENS = [
  ['S-MSG', ['inbox', 'longinbox', 'loading', 'rowtyping'], true, true],
  ['S-MSG.unread', ['unread'], true, true],
  ['S-MSG.row-menu', ['rowmenu', 'pinlimit'], true, true],
  ['S-MSG.new', ['new'], true, true],
  ['S-MSG.empty', ['empty'], true, true],
  ['S-MSG.fresh', ['fresh'], true, true],
  ['S-MSG.thread', ['thread', 'failed', 'long'], true, true],
  ['S-MSG.composer', ['thread'], true, true],
  ['S-MSG.team', ['team'], true, true],
  ['S-MSG.typing', ['typing', 'grouptyping'], true, true],
  ['S-MSG.times', ['times'], true, false],
  ['S-MSG.date-pill', ['datepill'], true, true],
  ['S-MSG.jump', ['jump'], true, true],
  ['S-MSG.toast', ['toast'], true, true],
  ['S-MSG.attach', ['attach'], true, true],
  ['S-MSG.file', ['file'], true, true],
  ['S-MSG.reply', ['reply'], true, true],
  ['S-MSG.edit', ['edit'], true, true],
  ['S-MSG.poll-composer', ['pollnew'], true, true],
  ['S-MSG.hold', ['hold'], true, true],
  ['S-MSG.holdseen', ['holdseen'], true, true],
  ['S-MSG.react', ['react'], true, true],
  ['S-MSG.seen', ['seen'], true, true],
  ['S-MSG.poll', ['poll'], true, true],
  ['S-MSG.votes', ['votes'], true, true],
  ['S-MSG.details', ['details'], true, true],
  ['S-MSG.groupdetails', ['groupdetails'], true, true],
  ['S-MSG.mute', ['mute'], true, true],
];
const SIZES = {
  phone: { dev: 'phone', w: 390, h: 844, flag: '' },
  'phone-w430': { dev: 'phone', w: 430, h: 932, flag: 'w430' },
  'phone-xxl': { dev: 'phone', w: 390, h: 844, flag: 'xxl', xxl: true },
  desk: { dev: 'desk', w: 1440, h: 900, flag: '' },
  'desk-w1280': { dev: 'desk', w: 1280, h: 800, flag: 'w1280' },
};
const statesOf = ([, routes, phone, desk]) => routes.flatMap((r) => Object.keys(SIZES).filter((k) => (SIZES[k].dev === 'phone' ? phone : desk)).map((k) => `${r}-${k}`));
const parseState = (st) => { const i = st.indexOf('-'); const route = st.slice(0, i); const size = SIZES[st.slice(i + 1)]; if (!size) throw new Error(`unknown state ${st}`); return { route, size }; };

// ── 07-MOTION.md, as data. M-ID → the design page's demo (its Replay button) and the motion-check cases it owns.
// Cases are numbered as the page runs them: 1 send twice, 2 reply lands mid-rise, 3 let go mid-lift, 4 hold again while
// settling, 5 votes sheet close mid-rise, 6 attach close and reopen, 7 back mid-push, 8 vote then change,
// 9 jump away and back, 10 desktop details close mid-open, 11 Reduce Motion send and reply.
const MOTION = {
  'M-MSG-01': ['open', [7]], 'M-MSG-02': ['open', [7]], 'M-MSG-03': ['filter', []], 'M-MSG-04': ['scrollglass', []],
  'M-MSG-05': ['times', []], 'M-MSG-06': ['type', []], 'M-MSG-07': ['send', [1, 2, 11]], 'M-MSG-08': ['reply', [2, 11]],
  'M-MSG-09': ['send', []], 'M-MSG-10': ['hold', [3, 4]], 'M-MSG-11': ['hold', [3, 4]], 'M-MSG-12': ['holdseen', []],
  'M-MSG-13': ['react', []], 'M-MSG-14': ['dbl', []], 'M-MSG-15': ['vote', [8]], 'M-MSG-16': ['votes', [5]],
  'M-MSG-17': ['seen', []], 'M-MSG-18': ['attach', [6]], 'M-MSG-19': ['file', []], 'M-MSG-20': ['details', [10]],
  'M-MSG-21': ['mute', []], 'M-MSG-22': ['empty-new', []], 'M-MSG-23': ['empty-fresh', []], 'M-MSG-24': ['jump', [9]],
  // No demo of their own: record by hand on the routes named in 07 (toast, rowmenu, desktop hover, loading).
  'M-MSG-25': [null, []], 'M-MSG-26': [null, []], 'M-MSG-27': [null, []], 'M-MSG-28': [null, []],
  'M-MSG-29': [null, []], 'M-MSG-30': ['reply', []], 'M-MSG-31': [null, []], 'M-MSG-32': [null, []], 'M-MSG-33': ['jump', []],
};

const saved = [];
const failed = [];
const notYet = [];
const record = async (name, fn) => {
  try { await fn(); saved.push(name); console.log('saved ', name); }
  catch (e) { const m = String(e.message).split('\n')[0]; (e.notYet ? notYet : failed).push(`${name}: ${m}`); console.log(e.notYet ? 'NOTYET' : 'FAILED', name, m); }
};
const themeInit = (theme) => {
  try { localStorage.setItem('golf_theme', theme); } catch {}
  const h = document.documentElement;
  const set = () => { if (h.getAttribute('data-fw-theme') !== theme) h.setAttribute('data-fw-theme', theme); };
  set();
  new MutationObserver(set).observe(h, { attributes: true });
};
const designHash = (route, size, theme, { reduce = true, shot = true } = {}) =>
  [route, size.dev, theme, reduce ? 'reduce' : '', shot ? 'shot' : '', size.flag].filter(Boolean).join('-');

// One design still: shot mode frames the device alone at the app's own size with no safe areas.
async function designShot(browser, file, route, size, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' });
  try {
    const page = await ctx.newPage();
    await page.goto(PAGE + '#' + designHash(route, size, theme));
    await page.waitForTimeout(900); // first layout, fonts, the 120 ms crossfades, then the still-frame holds (jump, date pill)
    const el = page.locator('.dev').first();
    await el.waitFor({ state: 'visible', timeout: 10_000 });
    await el.screenshot({ path: file, animations: 'disabled' });
  } finally { await ctx.close(); }
}
let fixture = null; // known after the first app load: does the route take ?state=design?
async function appShot(browser, file, route, size, theme) {
  const isPhone = size.dev === 'phone';
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, isMobile: isPhone, hasTouch: isPhone, colorScheme: theme, reducedMotion: 'reduce' });
  try {
    await ctx.addInitScript(themeInit, theme);
    if (size.xxl) await ctx.addInitScript((k) => { document.documentElement.style.setProperty('--ch-type-scale', String(k)); }, XXL);
    const page = await ctx.newPage();
    const res = await page.goto(`${BASE}messages?state=design&view=${route}`, { waitUntil: 'load', timeout: 240_000 });
    if (res && res.status() >= 400) throw new Error(`preview route answered ${res.status()}`);
    await page.waitForTimeout(1200);
    if (fixture === null) fixture = (await page.locator('[data-ch-preview-view]').count()) > 0;
    if (!fixture && route !== 'inbox' && route !== 'thread') { const e = new Error('no ?state=design&view= fixture yet (PR 11 adds it)'); e.notYet = true; throw e; }
    await page.screenshot({ path: file, animations: 'disabled' });
  } finally { await ctx.close(); }
}

async function byId(browser) {
  const OUT = resolve(args.out ?? join(HERE, '../screenshots'));
  mkdirSync(OUT, { recursive: true });
  const list = args.id === 'all' ? SCREENS : SCREENS.filter((s) => s[0] === args.id);
  if (!list.length) { console.error(`unknown --id ${args.id}; run --list`); process.exit(1); }
  for (const s of list) {
    const states = args.state ? [args.state] : statesOf(s);
    for (const st of states) {
      if (args.state && !statesOf(s).includes(st)) { failed.push(`${s[0]} ${st}: not a state of this screen (05-SCREENS.md)`); continue; }
      const { route, size } = parseState(st);
      for (const theme of THEMES) for (const side of SIDES) {
        const name = `${s[0]}__${st}__${side}__${theme}`;
        await record(name, () => (side === 'design' ? designShot : appShot)(browser, join(OUT, `${name}.png`), route, size, theme));
      }
    }
  }
}

// One motion row: the design page plays its demo at phone size (390 x 844, or desktop for desktop-only rows), recorded at
// the device's own size; the app plays the same move through ?play=. Both normal and Reduce Motion. Then its interrupt cases.
async function byMotion(browser) {
  const OUT = resolve(args.out ?? join(HERE, '../clips'));
  mkdirSync(OUT, { recursive: true });
  const ids = args.motion === 'all' ? Object.keys(MOTION) : [args.motion];
  for (const id of ids) {
    if (!MOTION[id]) { failed.push(`${id}: unknown M-ID; run --list`); continue; }
    const [clip, cases] = MOTION[id];
    const dev = id === 'M-MSG-20' && args.dev !== 'phone' ? (args.dev ?? 'phone') : (args.dev ?? 'phone');
    const size = dev === 'desk' ? SIZES['desk-w1280'] : SIZES.phone;
    if (!clip) { notYet.push(`${id}: no scripted demo; record by hand on the route 07 names`); continue; }
    for (const reduce of [false, true]) for (const side of SIDES) {
      const name = `${id}__${side}${reduce ? '__reduce' : ''}`;
      const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, recordVideo: { dir: OUT, size: { width: size.w, height: size.h } }, reducedMotion: reduce ? 'reduce' : 'no-preference', colorScheme: 'light', isMobile: dev === 'phone', hasTouch: dev === 'phone' });
      let page = null;
      await record(name, async () => {
        page = await ctx.newPage(); // video needs Playwright's ffmpeg: npx playwright install ffmpeg
        if (side === 'design') {
          await page.goto(`${PAGE}#${designHash('thread', size, 'light', { reduce })}`);
          await page.waitForTimeout(900);
          await page.evaluate((k) => document.querySelector(`[data-play="${k}"]`).click(), clip);
        } else {
          await ctx.addInitScript(themeInit, 'light');
          const res = await page.goto(`${BASE}messages?state=design&view=thread&play=${clip}`, { waitUntil: 'load', timeout: 240_000 });
          if (res && res.status() >= 400) throw new Error(`preview route answered ${res.status()}`);
          await page.waitForTimeout(1200);
          if ((await page.locator('[data-ch-preview-play]').count()) === 0) { const e = new Error('no ?play= in the preview fixture yet (PR 11 adds it)'); e.notYet = true; throw e; }
        }
        await page.waitForTimeout(5000);
      });
      const video = page && page.video();
      await ctx.close();
      if (video) { try { renameSync(await video.path(), join(OUT, `${name}.webm`)); } catch {} }
    }
    if (cases.length) await motionCheck(browser, cases);
  }
}

// The design page's own motion check: every interrupt case, in real Chromium. The build must pass the same cases.
async function motionCheck(browser, only) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  try {
    await page.goto(PAGE + '#motion-check');
    await page.waitForFunction(() => Array.isArray(window.__motionCheck), null, { timeout: 120_000 });
    const res = await page.evaluate(() => window.__motionCheck.map((r) => ({ name: r.name, ok: r.ok, detail: r.res.map((x) => `${x.name}: ${x.spikes ?? 0} jumps, ${x.gaps ?? 0} gaps, ${x.blinks ?? 0} blinks, ${x.glides ?? 0} glides`).join('; ') })));
    res.forEach((r, i) => { if (only && !only.includes(i + 1)) return; (r.ok ? saved : failed).push(`case ${i + 1} ${r.name}`); console.log(r.ok ? 'pass  ' : 'FAIL  ', `case ${i + 1}`, r.name, '|', r.detail); });
  } finally { await page.close(); }
}

function list() {
  for (const s of SCREENS) console.log(s[0].padEnd(20), statesOf(s).join(' '));
  console.log('');
  for (const [id, [clip, cases]] of Object.entries(MOTION)) console.log(id, clip ? `demo ${clip}` : 'by hand', cases.length ? `cases ${cases.join(',')}` : '');
}

// ── Older modes, kept for anyone who already scripted them.
const LEGACY = [...new Set(SCREENS.flatMap((s) => s[1]))].map((r) => [r, true, r !== 'times']).filter((r) => !args.only || r[0] === args.only);
const LEGACY_SIZES = [SIZES.phone, SIZES['phone-w430'], SIZES['phone-xxl'], SIZES.desk];
const legacyName = (state, theme, v) => `${state}-${v.dev === 'desk' ? 'desktop' : 'phone-' + v.w}${v.xxl ? '-xxl' : ''}-${theme}`;
async function legacy(browser) {
  const OUT = resolve(args.out);
  mkdirSync(OUT, { recursive: true });
  if (mode === 'design' || mode === 'app') {
    for (const theme of THEMES) for (const v of LEGACY_SIZES) for (const [state, phone, desk] of LEGACY) {
      if ((v.dev === 'phone' && !phone) || (v.dev === 'desk' && !desk)) continue;
      const name = legacyName(state, theme, v);
      await record(name, () => (mode === 'design' ? designShot : appShot)(browser, join(OUT, `${name}.png`), state, v, theme));
    }
  } else if (mode === 'compare') {
    const A = resolve(args.a), B = resolve(args.b);
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
    for (const f of readdirSync(B).filter((x) => x.endsWith('.png'))) {
      if (!existsSync(join(A, f))) { failed.push(`${f}: no app shot to compare`); continue; }
      await record(`compare-${f}`, async () => {
        await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:24px;padding:24px;align-items:flex-start;font:14px system-ui">
          <figure style="margin:0"><figcaption>app</figcaption><img style="max-height:1800px" src="data:image/png;base64,${readFileSync(join(A, f)).toString('base64')}"></figure>
          <figure style="margin:0"><figcaption>design</figcaption><img style="max-height:1800px" src="data:image/png;base64,${readFileSync(join(B, f)).toString('base64')}"></figure></body>`);
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(OUT, `compare-${f}`), fullPage: true });
      });
    }
    await page.close();
  } else if (mode === 'clips') {
    args.out = OUT; args.motion = 'all';
    await byMotion(browser);
  }
}

if (args.list) { list(); process.exit(0); }
if (!args.id && !args.motion && !['design', 'app', 'compare', 'clips', 'motion'].includes(mode)) {
  console.error('usage: capture.mjs --id <ID|all> [--state <state>] [--side design|app] [--theme light|dark] [--out dir]\n       capture.mjs --motion <M-ID|all> [--side design|app] [--dev phone|desk]\n       capture.mjs --list\n       capture.mjs design|app|clips --out <dir> | compare --a <dir> --b <dir> --out <dir> | motion');
  process.exit(1);
}
if ((mode && mode !== 'motion' && !args.out)) { console.error(`${mode} needs --out <dir>`); process.exit(1); }
const browser = await chromium.launch();
try {
  if (args.id) await byId(browser);
  else if (args.motion) await byMotion(browser);
  else if (mode === 'motion') await motionCheck(browser, null);
  else await legacy(browser);
} finally { await browser.close(); }
console.log(`\n${saved.length} ok${notYet.length ? `, ${notYet.length} not reachable yet:\n  ${notYet.join('\n  ')}` : ''}${failed.length ? `\n${failed.length} failed:\n  ${failed.join('\n  ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
