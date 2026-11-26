// Fidelity shots and motion clips for the CoachHelm quick chat: design page and app, state by state, side by side.
//
// Run on the Mac from the helmv3 repo root (it has Playwright). No sign-in: the app side uses the preview route
// /clubhouse-preview/calendar?qc=<state> that PR QC0 adds. The design side is the local page in ../redesign/.
// Nothing is written anywhere but the package's screenshots/ and clips/ folders (or --out).
//
//   npm run dev -- -p 3100                                        (one terminal; only needed for the app side)
//   node <pkg>/capture/capture.mjs --id S-TASK.cal --state default  (design + app, light + dark)
//   node <pkg>/capture/capture.mjs --id S-PANEL                     (every state listed for that ID)
//   node <pkg>/capture/capture.mjs --all                            (every ID and state; long)
//   node <pkg>/capture/capture.mjs --side design --all              (design only, no dev server needed)
//   node <pkg>/capture/capture.mjs --compare                        (pairs in screenshots/ into compare/ sheets)
//   node <pkg>/capture/capture.mjs --motion M-OPEN                  (clip of the move on both sides, then again with Reduce Motion)
//   node <pkg>/capture/capture.mjs --motion all
//   node <pkg>/capture/capture.mjs --motion-check                   (the design page's six in-page motion tests)
//
// Output: screenshots/<ID>__<state>__{design,app}__{light,dark}.png and clips/<M-ID>__{design,app}[__reduce].webm
// Options: --base http://localhost:3100/clubhouse-preview/   --out <dir>   --side design|app|both (default both)
// One headless Chromium, one context at a time, closed as it goes, so it stays light on the laptop.
// Exit 0 when everything saved; 1 when anything failed. A state the app can't reach yet is listed, not fatal.

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const PKG = resolve(HERE, '..');
const PAGE = pathToFileURL(resolve(PKG, 'redesign/quick-chat.html')).href;
const BASE = opt('base', process.env.BASE ?? 'http://localhost:3100/clubhouse-preview/').replace(/\/?$/, '/');
const SIDE = opt('side', 'both');
const SHOTS_DIR = resolve(opt('out', join(PKG, 'screenshots')));
const CLIPS_DIR = resolve(opt('out', join(PKG, 'clips')));
const XXL = 1.36; // SHARED-5

// ID -> { state: page state }. The page state is the hash name on the design page and the ?qc= value in the app.
// Modifiers xxl, reduce, w390, w430, desktop apply to the ID's `default` state. 05-SCREENS.md lists the same rows.
const SHOTS = {
  'S-KEY': { default: 'closed', open: 'hello', working: 'steps' },
  'S-LIVE': { default: 'live-work', wait: 'live' },
  'S-PANEL': { default: 'hello', closed: 'closed' },
  'S-PANEL.hello': { default: 'hello' },
  'S-PANEL.composer': { default: 'hello', running: 'steps' },
  'S-RUN.request': { default: 'steps', reply: 'confirm-cal' },
  'S-RUN.steps': { default: 'steps', folded: 'confirm-cal' },
  'S-RUN.ask-plan': { default: 'asking' },
  'S-RUN.ask-qual': { default: 'asking-qual' },
  'S-TASK.cal': { default: 'confirm-cal' },
  'S-TASK.msg': { default: 'confirm-msg' },
  'S-TASK.qual': { default: 'confirm-qual' },
  'S-TASK.plan': { default: 'confirm-plan' },
  'S-TASK.plan.folder-menu': { default: 'folder' },
  'S-TASK.plan.new-folder': { default: 'folder' },
  'S-RCPT': { default: 'receipt-cal', msg: 'receipt-msg', qual: 'receipt-qual', plan: 'receipt-plan' },
  'S-RCPT.told': { default: 'told-cal', msg: 'told-msg', qual: 'told-qual', plan: 'told-plan' },
  'S-RCPT.undone': { default: 'undone-cal', msg: 'undone-msg', qual: 'undone-qual', plan: 'undone-plan' },
  'S-RCPT.failed': { default: 'failed-cal', msg: 'failed-msg', qual: 'failed-qual', plan: 'failed-plan' },
  'S-RUN.cancelled': { default: 'cancelled' },
  'S-RUN.stopped': { default: 'stopped' },
};
const MODS = ['xxl', 'reduce', 'w390', 'w430', 'desktop'];

// M-ID -> the design page's Play button, and the qc state the app starts from (the app runs the same scripted
// demo with &play=<key>, which QC0 adds to the preview). 07-MOTION.md lists the same rows.
const MOTION = {
  'M-KEY-press': ['open', 'closed'], 'M-OPEN': ['open', 'closed'], 'M-CLOSE': ['close', 'hello'], 'M-RETARGET': ['pva', 'closed'],
  'M-SCRIM': ['open', 'closed'], 'M-CONTENT': ['open', 'closed'], 'M-TILE': ['cal', 'hello'], 'M-SEND': ['cal', 'hello'],
  'M-KEY-work': ['steps', 'hello'], 'M-STEPS': ['steps', 'hello'], 'M-STEPS-fold': ['cal', 'hello'], 'M-STOP': ['stop', 'hello'],
  'M-ASK': ['qual', 'hello'], 'M-TASK-in': ['cal', 'hello'], 'M-VISUAL-cal': ['cal', 'hello'], 'M-VISUAL-msg': ['msg', 'hello'],
  'M-VISUAL-qual': ['qual', 'hello'], 'M-VISUAL-plan': ['plan', 'hello'], 'M-CONFIRM': ['success', 'confirm-cal'],
  'M-LAND-cal': ['success', 'confirm-cal'], 'M-LAND-msg': ['success', 'confirm-msg'], 'M-LAND-qual': ['success', 'confirm-qual'],
  'M-LAND-plan': ['success', 'confirm-plan'], 'M-CHIP': ['success', 'confirm-cal'], 'M-WON': ['success', 'confirm-cal'],
  'M-RCPT': ['success', 'confirm-cal'], 'M-UNDO-ring': ['whole', 'confirm-cal'], 'M-TOLD': ['whole', 'confirm-cal'],
  'M-UNDO': ['undo', 'confirm-cal'], 'M-FAIL': ['fail', 'confirm-cal'], 'M-CANCEL': ['cancel', 'confirm-cal'],
  'M-LIVE': ['live', 'hello'], 'M-KEY-flag': ['live', 'hello'], 'M-FOLDER-menu': ['folder', 'confirm-plan'],
  'M-FOLDER-new': ['folder', 'confirm-plan'], 'M-GROW': ['whole', 'confirm-cal'],
  // Rows that share a parent's clip (07-MOTION.md names the clip in brackets).
  'M-KEY-press.down': ['open', 'closed'], 'M-STEPS-dot': ['steps', 'hello'], 'M-STEPS-check': ['steps', 'hello'], 'M-STEPS-band': ['steps', 'hello'],
  'M-ASK-pick': ['qual', 'hello'], 'M-ASK-fold': ['qual', 'hello'], 'M-SKEL': ['cal', 'hello'], 'M-FIELD': ['cal', 'hello'],
  'M-TYPE': ['msg', 'hello'], 'M-COIN': ['cal', 'hello'], 'M-TASK-settle': ['cal', 'hello'], 'M-CONFIRM-in': ['success', 'confirm-cal'],
  'M-LIVE-state': ['live', 'hello'], 'M-LIVE-out': ['live', 'hello'],
};
// Which design-page play needs which task first (the page's own plays pick the last kind run).
const PRIME = { success: 'kind', whole: 'kind', undo: 'kind', fail: 'kind', cancel: 'kind' };

const saved = [], failed = [];
const record = async (name, fn) => {
  try { await fn(); saved.push(name); console.log('saved ', name); }
  catch (e) { const m = String(e.message).split('\n')[0]; failed.push(`${name}: ${m}`); console.log('FAILED', name, m); }
};
const variant = (mods) => ({
  dev: mods.includes('desktop') ? 'desk' : 'phone',
  w: mods.includes('desktop') ? 1280 : mods.includes('w390') ? 390 : mods.includes('w430') ? 430 : 402,
  h: mods.includes('desktop') ? 800 : mods.includes('w390') ? 844 : mods.includes('w430') ? 932 : 874,
  xxl: mods.includes('xxl'), reduce: mods.includes('reduce'),
});
function rows() {
  const ids = flag('all') ? Object.keys(SHOTS) : [opt('id')].filter(Boolean);
  if (!ids.length) return [];
  const out = [];
  for (const id of ids) {
    const map = SHOTS[id]; if (!map) { failed.push(`${id}: no such ID in SHOTS (see 05-SCREENS.md)`); continue; }
    const want = opt('state');
    const states = want ? [want] : [...Object.keys(map), ...MODS];
    for (const st of states) {
      if (MODS.includes(st)) out.push({ id, st, page: map.default, mods: [st] });
      else if (map[st]) out.push({ id, st, page: map[st], mods: [] });
      else failed.push(`${id}: no state "${st}"`);
    }
  }
  return out;
}

// Design page: shot mode frames the device alone at the app's own size. Reduce Motion so every state settles fast.
async function shootDesign(browser, r, theme) {
  const v = variant(r.mods);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const name = `${r.id}__${r.st}__design__${theme}`;
  await record(name, async () => {
    const hash = [r.page, v.dev, theme, v.w === 390 ? 'w390' : '', v.w === 430 ? 'w430' : '', v.xxl ? 'xxl' : '', 'reduce', 'shot'].filter(Boolean).join('-');
    await page.goto(PAGE + '#' + hash);
    await page.waitForFunction(() => document.body.dataset.want && document.body.dataset.qc === document.body.dataset.want, null, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.locator('#dev').screenshot({ path: join(SHOTS_DIR, name + '.png'), animations: 'disabled' });
  });
  await ctx.close();
}

// App: the preview fixture, themed the way the other packages do, Text Size through --ch-type-scale.
const themeInit = (theme) => {
  try { localStorage.setItem('golf_theme', theme); } catch {}
  const h = document.documentElement;
  const set = () => { if (h.getAttribute('data-fw-theme') !== theme) h.setAttribute('data-fw-theme', theme); };
  set(); new MutationObserver(set).observe(h, { attributes: true });
};
async function shootApp(browser, r, theme) {
  const v = variant(r.mods);
  const isPhone = v.dev === 'phone';
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2, isMobile: isPhone, hasTouch: isPhone, colorScheme: theme, reducedMotion: 'reduce' });
  await ctx.addInitScript(themeInit, theme);
  if (v.xxl) await ctx.addInitScript((k) => { document.documentElement.style.setProperty('--ch-type-scale', String(k)); }, XXL);
  const page = await ctx.newPage();
  const name = `${r.id}__${r.st}__app__${theme}`;
  await record(name, async () => {
    const res = await page.goto(BASE + 'calendar?qc=' + encodeURIComponent(r.page), { waitUntil: 'load', timeout: 240_000 });
    if (res && res.status() >= 400) throw new Error(`preview route answered ${res.status()}`);
    const ready = await page.waitForFunction((s) => document.body.dataset.qc === s, r.page, { timeout: 30_000 }).then(() => true, () => false);
    if (!ready) throw new Error('the app did not reach body[data-qc="' + r.page + '"] (QC0 adds ?qc=); shooting skipped');
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(SHOTS_DIR, name + '.png'), animations: 'disabled' });
  });
  await ctx.close();
}

// Side by side, app left and design right, one sheet per ID/state/theme. Images inlined, no network.
async function compare(browser) {
  const dir = join(SHOTS_DIR, 'compare'); mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  for (const f of readdirSync(SHOTS_DIR).filter((x) => x.includes('__design__') && x.endsWith('.png'))) {
    const a = f.replace('__design__', '__app__');
    if (!existsSync(join(SHOTS_DIR, a))) { failed.push(`${f}: no app shot to compare`); continue; }
    await record('compare ' + f, async () => {
      await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:24px;padding:24px;align-items:flex-start;font:14px system-ui">
        <figure style="margin:0"><figcaption>app</figcaption><img style="max-height:1800px" src="data:image/png;base64,${readFileSync(join(SHOTS_DIR, a)).toString('base64')}"></figure>
        <figure style="margin:0"><figcaption>design</figcaption><img style="max-height:1800px" src="data:image/png;base64,${readFileSync(join(SHOTS_DIR, f)).toString('base64')}"></figure></body>`);
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(dir, f.replace('__design', '')), fullPage: true });
    });
  }
}

// Motion: record the move on the design page (its Play button) and in the app (same demo via &play=), each twice:
// full motion, then Reduce Motion. Phone at 390 wide. Put both clips in the PR (SHARED-6, SHARED-12).
async function motion(browser, which) {
  mkdirSync(CLIPS_DIR, { recursive: true });
  const ids = which === 'all' ? Object.keys(MOTION) : [which];
  for (const mid of ids) {
    const m = MOTION[mid]; if (!m) { failed.push(`${mid}: no such motion ID (see 07-MOTION.md)`); continue; }
    const [play, start] = m;
    for (const reduce of [false, true]) {
      for (const side of SIDE === 'both' ? ['design', 'app'] : [SIDE]) {
        const name = `${mid}__${side}${reduce ? '__reduce' : ''}`;
        const ctx = await browser.newContext({
          viewport: side === 'design' ? { width: 1600, height: 1000 } : { width: 390, height: 844 },
          isMobile: side === 'app', hasTouch: side === 'app',
          recordVideo: { dir: CLIPS_DIR, size: side === 'design' ? { width: 800, height: 500 } : { width: 390, height: 844 } },
          reducedMotion: reduce ? 'reduce' : 'no-preference',
        });
        const page = await ctx.newPage();
        await record(name, async () => {
          if (side === 'design') {
            const kind = ['cal', 'msg', 'qual', 'plan'].find((k) => start.endsWith(k));
            await page.goto(`${PAGE}#${start}-phone-light-w390-shot${reduce ? '-reduce' : ''}`);
            await page.waitForFunction(() => document.body.dataset.qc === document.body.dataset.want, null, { timeout: 60_000 }).catch(() => {});
            await page.waitForTimeout(600);
            if (PRIME[play] && !kind) throw new Error('needs a task state to start from');
            await page.evaluate((k) => document.querySelector(`[data-play="${k}"]`).click(), play);
          } else {
            const res = await page.goto(`${BASE}calendar?qc=${start}&play=${play}`, { waitUntil: 'load', timeout: 240_000 });
            if (res && res.status() >= 400) throw new Error(`preview route answered ${res.status()}`);
          }
          await page.waitForTimeout(play === 'whole' || play === 'undo' ? 11_000 : play === 'plan' || play === 'qual' ? 16_000 : 6_000);
        });
        const video = page.video();
        await ctx.close();
        if (video) { try { renameSync(await video.path(), join(CLIPS_DIR, name + '.webm')); } catch {} }
      }
    }
  }
}

// The design page's six in-page motion tests in real Chromium. The build passes the same six (08 QC-MOT).
async function motionCheck(browser) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(PAGE + '#motion-check');
  await page.waitForFunction(() => Array.isArray(window.__motionCheck), null, { timeout: 180_000 });
  const res = await page.evaluate(() => window.__motionCheck);
  for (const r of res) { (r.pass ? saved : failed).push(r.name); console.log(r.pass ? 'pass  ' : 'FAIL  ', r.name, '|', r.note); }
}

if (!flag('compare') && !flag('motion-check') && !opt('motion') && !opt('id') && !flag('all')) {
  console.error('usage: capture.mjs --id <ID> [--state <state>] | --all | --compare | --motion <M-ID|all> | --motion-check  [--side design|app|both] [--base <url>] [--out <dir>]');
  process.exit(1);
}
mkdirSync(SHOTS_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  if (flag('motion-check')) await motionCheck(browser);
  else if (flag('compare')) await compare(browser);
  else if (opt('motion')) await motion(browser, opt('motion'));
  else for (const r of rows()) for (const theme of ['light', 'dark']) {
    if (SIDE !== 'app') await shootDesign(browser, r, theme);
    if (SIDE !== 'design') await shootApp(browser, r, theme);
  }
} finally { await browser.close(); }
console.log(`\n${saved.length} ok${failed.length ? `, ${failed.length} failed:\n  ${failed.join('\n  ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
