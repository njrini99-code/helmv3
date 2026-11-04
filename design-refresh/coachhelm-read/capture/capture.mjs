// Fidelity shots and clips for the CoachHelm read redesign (lane 2): the design page and the app, state by state, side by side.
//
// Run on the Mac from the helmv3 repo root (it has Playwright). No sign-in: the app side uses the
// /clubhouse-preview/ fixture routes, the design side is a local file. Nothing is written anywhere but --out.
//
//   npm run dev -- -p 3100                                   (one terminal, only for app and clips)
//   node <package>/capture/capture.mjs design  --out <package>/screenshots/after
//   node <package>/capture/capture.mjs app     --out <package>/screenshots/before    (today's main: the Deep dive)
//   node <package>/capture/capture.mjs app     --out <package>/screenshots/built     (your branch: the new read)
//   node <package>/capture/capture.mjs compare --a <package>/screenshots/built --b <package>/screenshots/after --out <package>/screenshots/compare
//   node <package>/capture/capture.mjs clips   --out <package>/clips                 (motion: the push, the chart draw, Reduce Motion)
//
//   node <package>/capture/capture.mjs --id S-READ.why --state penalties   (one screen ID in one state: design and app pair)
//   node <package>/capture/capture.mjs --id S-READ.why                     (that ID in every state 05 lists for it)
//   node <package>/capture/capture.mjs --id all                            (every ID, its listed states)
//   node <package>/capture/capture.mjs --motion M-READ-11                  (design and app clips, normal and Reduce Motion)
//   node <package>/capture/capture.mjs --motion all
// --id and --motion write to <package>/screenshots/ unless --out is given: <ID>__<state>__<design|app>__<light|dark>.png
// and clips/<M-ID>__<design|app>__<normal|reduce>/. Add --side design or --side app to shoot one side, --theme light for one theme.
// --motion ... --dry runs the steps without video and saves end.png, to check the steps reach the right place.
// IDs, states and motion rows are the ones in 05-SCREENS.md and 07-MOTION.md; the tables are below (IDS, STATES, MOTION).
//
// Options: --only why          one screen (names below)
//          --read approach     one read (approach | penalties | putts)
//          --lean              light theme, 390 phone and desktop only (about a quarter of the shots)
//          --base http://localhost:3100/clubhouse-preview/
// One headless Chromium, one page at a time, closed as it goes, so it stays light on memory. No device matrix beyond
// 390, 430, 390 at XXL and a 1440 desktop.
// Exit 0 when every shot saved; 1 when any failed. A state the app can't reach yet is listed, not fatal to the rest.
//
// Both sides use the same names: <screen>-<read>-<viewer>-<phone-390|phone-430|desktop>[-xxl]-<theme>.png
// The design page takes them as #<screen>-<read>-<viewer>-<phone|desk>-<theme>[-reduce][-xxl][-w430][-shot].
// The app takes them as /clubhouse-preview/coachhelm-read?q=<read>&viewer=<viewer>&screen=<read|board>, then scrolls to
// [data-ch-hr-card="<screen>"] (02-PLAN.md sections 3.9 and 8; 04-FIDELITY-SPEC.md section 10). Until then `app` shoots today's Deep dive
// (coachhelm-coach-player and coachhelm-views, ?view=deep-dive), which is the honest "before".

// PLAYWRIGHT_MODULE and CHROME_PATH only matter off the Mac (a sandbox without a global playwright). On the Mac leave both unset.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const parse = (list) => Object.fromEntries(list.reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : a), []));
const mode = argv[0]?.startsWith('--') ? (parse(argv).motion ? 'motion' : parse(argv).id ? 'id' : '') : argv[0];
const args = parse(argv[0]?.startsWith('--') ? argv : argv.slice(1));
if (mode === 'id' || mode === 'motion') args.out ??= resolve(HERE, '../screenshots');
if (!['design', 'app', 'compare', 'clips', 'id', 'motion'].includes(mode) || !args.out) {
  console.error('usage: capture.mjs --id <ID|all> [--state <state>] | --motion <M-READ-nn|all> | design|app|clips --out <dir> [--only <screen>] [--read <read>] [--lean] | compare --a <dir> --b <dir> --out <dir>');
  process.exit(1);
}
const OUT = resolve(args.out);
mkdirSync(OUT, { recursive: true });
const PAGE = pathToFileURL(resolve(HERE, '../redesign/coachhelm-read.html')).href;
const BASE = (typeof args.base === 'string' ? args.base : process.env.BASE ?? 'http://localhost:3100/clubhouse-preview/').replace(/\/?$/, '/');

// Screens the design page draws. `board` is the summary card on the Board; the rest are the read scrolled to that card.
// [screen, phone, desktop, viewers]
const SCREENS = [
  ['board', true, true, ['coach', 'player']],
  ['read', true, true, ['coach', 'player']],
  ['where', true, false, ['coach', 'player']],
  ['why', true, false, ['coach', 'player']],
  ['sure', true, false, ['coach', 'player']],
  ['moved', true, false, ['coach']],
  ['rounds', true, false, ['coach']],
  ['do', true, false, ['coach', 'player']],
  ['assigned', true, true, ['coach']],
].filter((r) => !args.only || r[0] === args.only);
// approach = likely cause with both arms (Priya), penalties = counted path (Eli), putts = not traced yet, counting down (Jonah).
const READS = ['approach', 'penalties', 'putts'].filter((r) => !args.read || r === args.read);
const THEMES = args.lean ? ['light'] : ['light', 'dark'];
const VARIANTS = [
  { dev: 'phone', w: 390, h: 844, xxl: false },
  { dev: 'phone', w: 430, h: 932, xxl: false },
  { dev: 'phone', w: 390, h: 844, xxl: true },
  { dev: 'desk', w: 1440, h: 900, xxl: false },
].filter((v) => !args.lean || (v.w !== 430 && !v.xxl));
const XXL = 1.353; // 23 / 17, lib/dynamic-type.ts MAX_SCALE

const nameOf = (screen, read, who, theme, v) =>
  `${screen}-${read}-${who}-${v.dev === 'desk' ? 'desktop' : 'phone-' + v.w}${v.xxl ? '-xxl' : ''}-${theme}`;
const hashOf = (screen, read, who, theme, v, reduce = true) =>
  [screen, read, who, v.dev, theme, reduce ? 'reduce' : '', v.xxl ? 'xxl' : '', v.w === 430 ? 'w430' : '', 'shot'].filter(Boolean).join('-');

const saved = [];
const failed = [];
const record = async (name, fn) => {
  try { await fn(); saved.push(name); console.log('saved ', name); }
  catch (e) { const m = String(e.message).split('\n')[0]; failed.push(`${name}: ${m}`); console.log('FAILED', name, m); }
};

function* combos() {
  for (const theme of THEMES) for (const v of VARIANTS) for (const [screen, phone, desk, viewers] of SCREENS) {
    if ((v.dev === 'phone' && !phone) || (v.dev === 'desk' && !desk)) continue;
    for (const read of READS) for (const who of viewers) yield { theme, v, screen, read, who };
  }
}

// Design page: shot mode frames the device alone at the app's own size, no bezel or safe areas, motion settled.
async function design(browser) {
  for (const { theme, v, screen, read, who } of combos()) {
    const name = nameOf(screen, read, who, theme, v);
    await record(name, async () => {
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' });
      try {
        const page = await ctx.newPage();
        await page.goto(PAGE + '#' + hashOf(screen, read, who, theme, v));
        await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 8000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(OUT, name + '.png') });
      } finally { await ctx.close(); }
    });
  }
}

// The app. With the preview (02-PLAN.md 3.9) every state is reachable; without it, today's Deep dive opened on the nearest read.
const TODAY_Q = { approach: 'in-slope', penalties: 'in-pen', putts: 'in-brk' };
async function hasFixture(page) {
  const res = await page.goto(BASE + 'coachhelm-read?q=approach&viewer=coach&screen=read', { waitUntil: 'networkidle' }).catch(() => null);
  return !!res && res.ok() && (await page.locator('[data-ch-hr-page], [data-ch-hr-open]').count()) > 0;
}
async function app(browser) {
  const probe = await browser.newContext();
  const fixture = await hasFixture(await probe.newPage());
  await probe.close();
  console.log(fixture ? 'fixture found: shooting the new read' : 'no coachhelm-read fixture yet: shooting today\'s Deep dive as "before"');
  for (const { theme, v, screen, read, who } of combos()) {
    const name = nameOf(screen, read, who, theme, v);
    const url = fixture
      ? `${BASE}coachhelm-read?q=${read}&viewer=${who}&screen=${screen === 'board' ? 'board' : 'read'}${screen === 'assigned' ? '&state=assigned' : ''}${v.xxl ? '&text=xxl' : ''}`
      : screen === 'board'
        ? `${BASE}${who === 'coach' ? 'coachhelm' : 'coachhelm-player'}`
        : `${BASE}${who === 'coach' ? 'coachhelm-coach-player' : 'coachhelm-views'}?view=deep-dive&state=engine&q=${TODAY_Q[read]}`;
    await record(name, async () => {
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' });
      try {
        const page = await ctx.newPage();
        if (v.xxl) await page.addInitScript((k) => { window.__CH_TEXT_SCALE__ = k; }, XXL);
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        if (fixture && screen !== 'board' && screen !== 'read' && screen !== 'assigned') {
          await page.locator(`[data-ch-hr-card="${screen}"]`).first().scrollIntoViewIfNeeded();
        }
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(OUT, name + '.png') });
      } finally { await ctx.close(); }
    });
  }
}

// Side by side: built on the left, design on the right, same name, with a 24px gutter. Pure browser canvas, no extra deps.
async function compare(browser) {
  const A = resolve(args.a), B = resolve(args.b);
  const names = readdirSync(B).filter((f) => f.endsWith('.png') && existsSync(join(A, f)));
  const missing = readdirSync(B).filter((f) => f.endsWith('.png') && !existsSync(join(A, f)));
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const f of names) {
    await record(f.replace('.png', ''), async () => {
      const left = pathToFileURL(join(A, f)).href, right = pathToFileURL(join(B, f)).href;
      await page.setContent(`<body style="margin:0;background:#888"><canvas id=c></canvas></body>`);
      const dataUrl = await page.evaluate(async ([l, r]) => {
        const load = (s) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = s; });
        const [a, b] = await Promise.all([load(l), load(r)]);
        const c = document.getElementById('c'); const g = 24;
        c.width = a.width + b.width + g; c.height = Math.max(a.height, b.height) + 56;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = '#1c1b18'; x.font = '600 28px system-ui'; x.fillText('Built', 8, 36); x.fillText('Design', a.width + g + 8, 36);
        x.drawImage(a, 0, 56); x.drawImage(b, a.width + g, 56);
        return c.toDataURL('image/png');
      }, [left, right]);
      await page.goto(dataUrl);
      await page.screenshot({ path: join(OUT, f), fullPage: true });
    });
  }
  await ctx.close();
  if (missing.length) console.log(`\nnot built yet (${missing.length}):\n  ` + missing.join('\n  '));
}

// Motion: records the same three moves on the design page and, when the fixture exists, the app.
// 1. Board card tap pushes the read (462ms). 2. The funnel and ladder draw once (360ms). 3. The same push with Reduce Motion (120ms fade).
async function clips(browser) {
  const runs = [
    { label: 'design-push', url: PAGE + '#board-approach-coach-phone-light-shot', reduce: false, tap: '#bcard' },
    { label: 'design-push-reduce', url: PAGE + '#board-approach-coach-phone-light-reduce-shot', reduce: true, tap: '#bcard' },
    { label: 'design-funnel', url: PAGE + '#read-approach-coach-phone-light-shot', reduce: false, scroll: '#cfun' },
    { label: 'app-push', url: BASE + 'coachhelm-read?q=approach&viewer=coach&screen=board', reduce: false, tap: '[data-ch-hr-open]' },
    { label: 'app-push-reduce', url: BASE + 'coachhelm-read?q=approach&viewer=coach&screen=board', reduce: true, tap: '[data-ch-hr-open]' },
    { label: 'app-funnel', url: BASE + 'coachhelm-read?q=approach&viewer=coach&screen=read', reduce: false, scroll: '[data-ch-hr-card="where"]' },
  ];
  for (const r of runs) {
    await record(r.label, async () => {
      const dir = join(OUT, r.label); mkdirSync(dir, { recursive: true });
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: r.reduce ? 'reduce' : 'no-preference', recordVideo: { dir, size: { width: 390, height: 844 } } });
      try {
        const page = await ctx.newPage();
        const res = await page.goto(r.url, { waitUntil: 'load' }).catch(() => null);
        if (r.url.startsWith('http') && (!res || !res.ok())) throw new Error('app route not reachable yet');
        await page.waitForTimeout(800);
        if (r.tap) await page.locator(r.tap).first().click();
        if (r.scroll) await page.locator(r.scroll).first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(1200);
      } finally { await ctx.close(); }
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// --id and --motion: the 05/07 IDs. One browser, one context at a time.

// Capture states (05, "Capture states"). read, viewer, width, Text Size, motion, the design page state and the preview state.
const PAGE_STATES = ['loading', 'assigning', 'proposed', 'declined', 'noassign', 'stale', 'dismissed', 'more', 'notthis', 'answered',
  'answerfail', 'allrounds', 'notrend', 'partfail', 'failed', 'gone', 'nopool', 'long'];
const TO_PREVIEW = { nopool: 'teampooloff', partfail: 'roundsfailed', noassign: 'failwrites' };
const GALLERY = { gap: 'state-not-traced-a-shot-tag-is-thin-data-gap', cleared: 'state-cleared',
  contradicted: 'state-contradicted-coach-only-for-a-day', underreview: 'state-under-review' };
const APP_ONLY = ['noladder', 'nofunnel', 'funnelstopped', 'funnelunparsed', 'legacy', 'loadfailed', 'eli-likely', 'nodrill',
  'nostrokes', 'themesfailed', 'plansfailed', 'duplicate', 'verdict', 'failwrites', 'words', 'desk-1280'];
const PHONE = { dev: 'phone', w: 390, h: 844 }, BIG = { dev: 'phone', w: 430, h: 932 }, DESK = { dev: 'desk', w: 1440, h: 900 };
const STATES = {
  default: {}, penalties: { read: 'penalties' }, putts: { read: 'putts' },
  player: { who: 'player' }, 'player-penalties': { who: 'player', read: 'penalties' }, 'player-putts': { who: 'player', read: 'putts' },
  w430: { v: BIG }, xxl: { xxl: true }, reduce: { reduce: true },
  assigned: { screen: 'assigned', app: 'assigned' },
  'player-more': { who: 'player', page: 'more' }, 'xxl-more': { xxl: true, page: 'more' }, 'w430-more': { v: BIG, page: 'more' },
  desk: { v: DESK }, 'desk-player': { v: DESK, who: 'player' }, 'desk-penalties': { v: DESK, read: 'penalties' },
  'desk-putts': { v: DESK, read: 'putts' }, 'desk-more': { v: DESK, page: 'more' }, 'desk-loading': { v: DESK, page: 'loading' },
  'desk-failed': { v: DESK, page: 'failed', read: 'penalties' }, 'desk-gone': { v: DESK, page: 'gone' },
  'desk-partfail': { v: DESK, page: 'partfail' }, 'desk-long': { v: DESK, page: 'long', read: 'putts' },
};
for (const p of PAGE_STATES) STATES[p] = { page: p, ...(p === 'long' ? { read: 'putts' } : p === 'failed' ? { read: 'penalties' } : {}) };
for (const g of Object.keys(GALLERY)) STATES[g] = { gallery: GALLERY[g], app: g };
for (const a of APP_ONLY) STATES[a] = { appOnly: true, app: a === 'desk-1280' ? '' : a, ...(a === 'eli-likely' ? { read: 'penalties' } : {}),
  ...(a === 'desk-1280' ? { v: { dev: 'desk', w: 1280, h: 800 } } : {}) };
const stateOf = (name) => {
  const s = STATES[name]; if (!s) throw new Error(`unknown state "${name}" (05 lists: ${Object.keys(STATES).join(', ')})`);
  const page = s.page ?? '';
  return { read: 'approach', who: 'coach', v: PHONE, xxl: false, reduce: false, screen: '', ...s, page,
    app: s.app ?? (page ? TO_PREVIEW[page] ?? page : '') };
};

// Screen IDs (05, "Screen table"): the design page's screen name, the app card to scroll to, and the states 05 lists.
const CARD = { where: 'where', why: 'why', sure: 'sure', moved: 'moved', rounds: 'rounds', do: 'do', assigned: 'do' };
const IDS = {
  'S-DIVE.why': { screen: 'dive', states: ['player'], appUrl: 'coachhelm-views?view=deep-dive&state=engine&q=in-slope', designNot: 'a fix to today\'s Deep dive, not drawn' },
  'S-READ-BOARD': { screen: 'board', states: ['default', 'penalties', 'putts', 'player', 'player-penalties', 'player-putts', 'w430', 'xxl'] },
  'S-READ-BOARD.actions': { screen: 'board', states: ['default'] },
  'S-READ-BOARD.dismissed': { screen: 'board', states: ['dismissed'] },
  'S-READ-BOARD.loading': { screen: 'board', states: ['loading'] },
  'S-READ': { screen: 'read', states: ['default', 'player', 'w430', 'xxl', 'reduce'] },
  'S-READ.head': { screen: 'read', states: ['default', 'player'] },
  'S-READ.nopool': { screen: 'read', states: ['nopool'] },
  'S-READ.stale': { screen: 'read', states: ['stale'] },
  'S-READ.where': { screen: 'where', states: ['default', 'player'] },
  'S-READ.why': { screen: 'why', states: ['default', 'penalties', 'player', 'player-penalties'] },
  'S-READ.countdown': { screen: 'why', states: ['putts', 'player-putts'] },
  'S-READ.gap': { screen: 'why', states: ['gap'] },
  'S-READ.sure': { screen: 'sure', states: ['default', 'player'] },
  'S-READ.sure.corrections': { screen: 'sure', states: ['default', 'player'] },
  'S-READ.sure.reasons': { screen: 'sure', states: ['notthis'] },
  'S-READ.sure.answered': { screen: 'sure', states: ['answered'] },
  'S-READ.sure.answerfail': { screen: 'sure', states: ['answerfail'] },
  'S-READ.moved': { screen: 'moved', states: ['default', 'penalties'] },
  'S-READ.moved.notrend': { screen: 'moved', states: ['notrend'] },
  'S-READ.rounds': { screen: 'rounds', states: ['default'] },
  'S-READ.rounds-all': { screen: 'rounds', states: ['allrounds'] },
  'S-READ.partfail': { screen: 'read', states: ['partfail'] },
  'S-READ.do': { screen: 'do', states: ['default', 'player'] },
  'S-READ.assigning': { screen: 'do', states: ['assigning'] },
  'S-READ.assigned': { screen: 'assigned', states: ['assigned'] },
  'S-READ.proposed': { screen: 'do', states: ['proposed'] },
  'S-READ.declined': { screen: 'do', states: ['declined'] },
  'S-READ.noassign': { screen: 'do', states: ['noassign'] },
  'S-READ.dismissed': { screen: 'read', states: ['dismissed'] },
  'S-READ.more': { screen: 'read', states: ['more', 'player-more', 'xxl-more', 'w430-more'] },
  'S-READ.cleared': { screen: 'read', states: ['cleared'] },
  'S-READ.contradicted': { screen: 'read', states: ['contradicted'] },
  'S-READ.underreview': { screen: 'read', states: ['underreview'] },
  'S-READ.loading': { screen: 'read', states: ['loading'] },
  'S-READ.failed': { screen: 'read', states: ['failed'] },
  'S-READ.gone': { screen: 'read', states: ['gone'] },
  'S-READ.long': { screen: 'read', states: ['long'] },
  'S-READ-DESK': { screen: 'read', states: ['desk', 'desk-player', 'desk-penalties', 'desk-putts', 'desk-loading', 'desk-failed', 'desk-gone', 'desk-partfail', 'desk-long', 'desk-1280'] },
  'S-READ-DESK.rail': { screen: 'read', states: ['desk', 'desk-player'] },
  'S-READ-DESK.more': { screen: 'read', states: ['desk-more'] },
};
const NOT_SHOT = { 'S-READ.copied': 'today\'s toast, not drawn', 'S-READ-DESK.jump': 'motion only: use --motion M-READ-22' };

const designHash = (screen, st, theme) =>
  [screen, st.read, st.who, st.v.dev, theme, 'reduce', st.xxl ? 'xxl' : '', st.v.w === 430 ? 'w430' : '', st.page, 'shot'].filter(Boolean).join('-');
const appUrl = (id, screen, st) => IDS[id]?.appUrl ? BASE + IDS[id].appUrl
  : `${BASE}coachhelm-read?q=${st.read}&viewer=${st.who}&screen=${screen === 'board' ? 'board' : 'read'}${st.app ? '&state=' + st.app : ''}${st.xxl ? '&text=xxl' : ''}`;
const sides = () => (args.side === 'design' ? ['design'] : args.side === 'app' ? ['app'] : ['design', 'app']);
const themes = () => (typeof args.theme === 'string' ? [args.theme] : ['light', 'dark']);
const skipped = [];

async function shootDesign(browser, id, screen, stName, st, theme, file) {
  const gallery = !!st.gallery;
  const ctx = await browser.newContext({ viewport: gallery ? { width: 1440, height: 900 } : { width: st.v.w, height: st.v.h },
    deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' });
  try {
    const page = await ctx.newPage();
    await page.goto(PAGE + (gallery ? '' : '#' + designHash(screen, st, theme)));
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 8000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    if (gallery) {
      const el = page.locator('#' + st.gallery);
      if (!(await el.count())) throw new Error(`gallery card #${st.gallery} not on the design page`);
      await el.scrollIntoViewIfNeeded(); await el.screenshot({ path: file });
    } else await page.screenshot({ path: file });
  } finally { await ctx.close(); }
}
async function shootApp(browser, id, screen, st, theme, file) {
  const ctx = await browser.newContext({ viewport: { width: st.v.w, height: st.v.h }, deviceScaleFactor: 2, colorScheme: theme,
    reducedMotion: 'reduce' });
  try {
    const page = await ctx.newPage();
    if (st.xxl) await page.addInitScript((k) => { window.__CH_TEXT_SCALE__ = k; }, XXL);
    const res = await page.goto(appUrl(id, screen, st), { waitUntil: 'networkidle' }).catch(() => null);
    if (!res || !res.ok()) throw new Error('app route not reachable (is the dev server on, and is PR 1\'s preview route built?)');
    await page.evaluate(() => document.fonts.ready);
    const card = st.v.dev === 'phone' && CARD[screen];
    if (card) {
      const el = page.locator(`[data-ch-hr-card="${card}"]`).first();
      if (!(await el.count())) throw new Error(`[data-ch-hr-card="${card}"] not on the page`);
      await el.scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: file });
  } finally { await ctx.close(); }
}
async function byId(browser) {
  const ids = args.id === 'all' ? Object.keys(IDS) : [args.id];
  for (const id of ids) {
    if (NOT_SHOT[id]) { skipped.push(`${id}: ${NOT_SHOT[id]}`); continue; }
    const row = IDS[id]; if (!row) { failed.push(`${id}: not an ID in 05 (${Object.keys(IDS).join(', ')})`); continue; }
    const list = typeof args.state === 'string' ? [args.state] : row.states;
    for (const stName of list) {
      let st; try { st = stateOf(stName); } catch (e) { failed.push(`${id}: ${e.message}`); continue; }
      const screen = st.screen || row.screen;
      for (const theme of themes()) for (const side of sides()) {
        const name = `${id}__${stName}__${side}__${theme}`;
        if (side === 'design' && (st.appOnly || row.designNot)) { skipped.push(`${name}: ${row.designNot || 'app only (05)'}`); continue; }
        await record(name, () => side === 'design'
          ? shootDesign(browser, id, screen, stName, st, theme, join(OUT, name + '.png'))
          : shootApp(browser, id, screen, st, theme, join(OUT, name + '.png')));
      }
    }
  }
}

// Motion rows (07). Each side is a start address and a few steps. A design step clicks the studio's own Play buttons or the
// phone's own controls; an app step uses the 08 hooks (data-ch-hr-*) or the visible label. "today" rows compare against main.
const D = (hash) => PAGE + '#' + hash;
const A = (q) => BASE + 'coachhelm-read?' + q;
const RD = 'read-approach-coach-phone-light-shot', BD = 'board-approach-coach-phone-light-shot', DK = 'read-approach-coach-desk-light-shot';
const MOTION = {
  'M-READ-01': { d: [D(BD), [{ press: '#bcard' }]], a: [A('q=approach&viewer=coach&screen=board'), [{ press: '[data-ch-hr-open]' }]] },
  'M-READ-02': { d: [D(BD), [{ click: '#p-open' }]], a: [A('q=approach&viewer=coach&screen=board'), [{ click: '[data-ch-hr-open]' }]] },
  'M-READ-03': { d: [D(BD), [{ click: '#p-open' }, { wait: 900 }, { click: '[data-back]' }]], a: [A('q=approach&viewer=coach&screen=board'), [{ click: '[data-ch-hr-open]' }, { wait: 900 }, { back: true }]] },
  'M-READ-04': { d: [D(RD), [{ click: '#p-narrow' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ scroll: '[data-ch-hr-card="where"]' }]] },
  'M-READ-05': { d: [D(RD), [{ click: '#p-cause' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ scroll: '[data-ch-hr-card="why"]' }]] },
  'M-READ-06': { d: [D('read-penalties-coach-phone-light-shot'), [{ click: '#p-cause' }]], a: [A('q=penalties&viewer=coach&screen=read'), [{ scroll: '[data-ch-hr-card="why"]' }]] },
  'M-READ-07': { d: [D(BD), [{ reload: true }]], a: [A('q=approach&viewer=coach&screen=board'), [{ reload: true }]] },
  'M-READ-08': { d: [D(RD), [{ click: '#p-assign' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ click: '[data-ch-hr-assign]' }]] },
  'M-READ-09': { same: 'M-READ-08' }, 'M-READ-10': { same: 'M-READ-08' },
  'M-READ-11': { d: [D(RD), [{ click: '[data-more]' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ click: '[data-ch-hr-more]' }]] },
  'M-READ-12': { d: [D(RD), [{ click: '[data-more]' }, { wait: 900 }, { click: '[data-close]' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ click: '[data-ch-hr-more]' }, { wait: 900 }, { label: 'Cancel' }]] },
  'M-READ-13': { w: 1440, d: [D(DK), [{ click: '#desk [data-more]' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ click: '[data-ch-hr-more]' }]] },
  'M-READ-14': { w: 1440, d: [D(DK), [{ click: '#desk [data-more]' }, { wait: 600 }, { click: '#desk [data-close]' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ click: '[data-ch-hr-more]' }, { wait: 600 }, { key: 'Escape' }]] },
  'M-READ-15': { d: [D(RD), [{ click: '[data-more]' }, { wait: 900 }, { click: '[data-dismiss]' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ click: '[data-ch-hr-more]' }, { wait: 900 }, { label: 'Dismiss this read' }]] },
  'M-READ-16': { d: [D('read-approach-coach-phone-light-dismissed-shot'), [{ click: '[data-undo]' }]], a: [A('q=approach&viewer=coach&screen=read&state=dismissed'), [{ label: 'Undo' }]] },
  'M-READ-17': { d: [D('sure-approach-coach-phone-light-shot'), [{ click: '#csure [aria-expanded]' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ scroll: '[data-ch-hr-card="sure"]' }, { label: 'Not this' }]] },
  'M-READ-18': { d: [D('sure-approach-coach-phone-light-notthis-shot'), [{ click: '#csure .why2 button' }]], a: [A('q=approach&viewer=coach&screen=read&state=notthis'), [{ scroll: '[data-ch-hr-card="sure"]' }, { label: 'It’s wrong' }]] },
  'M-READ-19': { d: [D('rounds-approach-coach-phone-light-shot'), [{ click: '#crounds [aria-expanded]' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ scroll: '[data-ch-hr-card="rounds"]' }, { label: /Show all|Show newest/ }]] },
  'M-READ-20': { d: [D('read-approach-coach-phone-light-loading-shot'), [{ wait: 3400 }]], a: [A('q=approach&viewer=coach&screen=read&state=loading'), [{ wait: 3400 }]] },
  'M-READ-21': { d: [D('read-approach-coach-phone-light-loading-shot'), [{ wait: 800 }, { hash: 'read-approach-coach-phone-light-shot' }]], a: [A('q=approach&viewer=coach&screen=read'), [{ reload: true }]] },
  'M-READ-22': { w: 1440, d: null, why: 'the design page draws the ring (Assign flash) but has no desktop jump to record; compare the app clip with 07\'s values', a: [A('q=approach&viewer=coach&screen=read'), [{ rail: 1 }]] },
  'M-READ-23': { w: 1440, d: [D(DK), [{ click: '#desk [data-pick]', nth: 1 }]], a: [A('q=approach&viewer=coach&screen=read'), [{ rail: 1 }]] },
  'M-READ-24': { today: 'today\'s bar shade on scroll: record main and the branch, not the design page' },
  'M-READ-25': { today: 'today\'s toast: record main and the branch' },
  'M-READ-26': { today: 'today\'s push to the round review: record main and the branch' },
};
async function runSteps(page, steps, isDesign) {
  const root = (sel) => (isDesign && !sel.startsWith('#p-') && !sel.startsWith('#desk') && !sel.startsWith('#c') && sel !== '#bcard' ? '#ph ' : '') + sel;
  for (const s of steps) {
    if (s.wait) await page.waitForTimeout(s.wait);
    if (s.reload) await page.reload();
    if (s.back) await page.goBack();
    if (s.key) await page.keyboard.press(s.key);
    if (s.hash) await page.evaluate((h) => { location.hash = h; }, s.hash);
    if (s.scroll) await page.locator(s.scroll).first().scrollIntoViewIfNeeded();
    if (s.label) await page.getByRole('button', { name: s.label }).first().click();
    if (s.rail) await page.locator('[data-ch-hr-rail] a, [data-ch-hr-rail] button').nth(s.rail).click();
    if (s.click && isDesign) await page.evaluate(([sel, n]) => document.querySelectorAll(sel)[n]?.click(), [root(s.click), s.nth ?? 0]);
    if (s.click && !isDesign) await page.locator(s.click).nth(s.nth ?? 0).click();
    if (s.press) {
      const box = await page.locator(isDesign ? root(s.press) : s.press).first().boundingBox();
      if (!box) throw new Error(`${s.press} not on screen`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(300); await page.mouse.up();
    }
  }
}
async function byMotion(browser) {
  const ids = args.motion === 'all' ? Object.keys(MOTION) : [args.motion];
  for (const mid of ids) {
    let row = MOTION[mid]; if (!row) { failed.push(`${mid}: not a row in 07`); continue; }
    if (row.same) { skipped.push(`${mid}: recorded in the ${row.same} clip`); continue; }
    if (row.today) { skipped.push(`${mid}: ${row.today}`); continue; }
    const w = row.w ?? 390, h = w === 390 ? 844 : 900;
    for (const side of sides()) for (const rm of ['normal', 'reduce']) {
      const spec = side === 'design' ? row.d : row.a, name = `${mid}__${side}__${rm}`;
      if (!spec) { skipped.push(`${name}: ${row.why}`); continue; }
      await record(name, async () => {
        const dir = join(OUT, 'clips', name); mkdirSync(dir, { recursive: true });
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'light',
          reducedMotion: rm === 'reduce' ? 'reduce' : 'no-preference', ...(args.dry ? {} : { recordVideo: { dir, size: { width: w, height: h } } }) });
        try {
          const page = await ctx.newPage();
          let url = spec[0];
          if (side === 'design') url = url.replace('-shot', rm === 'reduce' ? '-reduce-shot' : '-shot');
          const res = await page.goto(url, { waitUntil: 'load' }).catch(() => null);
          if (side === 'app' && (!res || !res.ok())) throw new Error('app route not reachable yet');
          if (side === 'design') await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 8000 });
          await page.waitForTimeout(700);
          await runSteps(page, spec[1], side === 'design');
          await page.waitForTimeout(1400);
          if (args.dry) await page.screenshot({ path: join(dir, 'end.png') }); // --dry: no video, a still of where the steps ended
        } finally { await ctx.close(); }
      });
    }
  }
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {});
try {
  if (mode === 'design') await design(browser);
  if (mode === 'app') await app(browser);
  if (mode === 'compare') await compare(browser);
  if (mode === 'clips') await clips(browser);
  if (mode === 'id') await byId(browser);
  if (mode === 'motion') await byMotion(browser);
} finally { await browser.close(); }
if (typeof skipped !== 'undefined' && skipped.length) console.log(`\nskipped (${skipped.length}):\n  ` + skipped.join('\n  '));
console.log(`\n${saved.length} saved, ${failed.length} failed`);
if (failed.length) console.log(failed.map((f) => '  ' + f).join('\n'));
process.exit(failed.length ? 1 : 0);
