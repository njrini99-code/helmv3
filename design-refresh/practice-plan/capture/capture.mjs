// Side-by-side shots and motion clips for CoachHelm practice plans (lane 6).
//
// Run on the Mac from the helmv3 repo root (it has Playwright). The design side is the local file
// ../redesign/coachhelm-practice.html; the app side is the /clubhouse-preview fixture routes from 02-PLAN.md §2.5.
// No sign-in, no network beyond localhost, nothing written outside --out.
//
//   npm run dev -- -p 3100                                   (one terminal, only for the app side)
//   node <pkg>/capture/capture.mjs --id S-ASK.plan-card                     every state of one screen, design and app, light and dark
//   node <pkg>/capture/capture.mjs --id S-ASK.plan-card --state ready       one state
//   node <pkg>/capture/capture.mjs --all --side design                      every drawn state, design only
//   node <pkg>/capture/capture.mjs --motion M-ASK-19                        one motion row, design and app, with and without Reduce Motion
//   node <pkg>/capture/capture.mjs --list                                   print every ID, state and motion row
//
// Options: --side design|app   --theme light|dark   --xxl (Text Size 1.36)   --out <dir> (default ../screenshots)
//          --base http://localhost:3100/clubhouse-preview/
// Files: screenshots/<ID>__<state>__{design,app}__{light,dark}[__xxl].png and clips/<M-ID>__{design,app}[__rm].webm
// One headless Chromium and one page at a time, closed as it goes, so it stays light on the laptop.
// Exit 0 when every shot saved; 1 when any failed. A missing preview state is listed, not fatal to the rest.

import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const OUT = resolve(opt('out', resolve(HERE, '../screenshots')));
const PAGE = pathToFileURL(resolve(HERE, '../redesign/coachhelm-practice.html')).href;
const BASE = (opt('base', process.env.BASE ?? 'http://localhost:3100/clubhouse-preview/')).replace(/\/?$/, '/');
const SIDES = opt('side') ? [opt('side')] : ['design', 'app'];
const THEMES = opt('theme') ? [opt('theme')] : ['light', 'dark'];
const XXL = flag('xxl');

// Frames on the design page. Phone frames are 390 wide; desktop frames are drawn at 1180.
const FRAME = { ask: '#phA', desk: '#dAwrap', fmt: '#phF', bld: '#phB', bldd: '#dB', ply: '#phC' };
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };

// Preview routes (02-PLAN.md §2.5). If the build names a state differently, change it here only.
const T = (s, x = '') => `coachhelm-practice-thread?state=${s}${x}`;
const P = (s, x = '') => `coachhelm-practice-plan?state=${s}${x}`;
const F = (s) => `coachhelm-practice-format?state=${s}`;
const B = (s, d = 'phone') => `coachhelm-practice-builder?state=${s}&density=${d}`;
const Y = (s) => `coachhelm-practice-player?state=${s}`;

// [ID, state, design capture id (null = not drawn), app route, viewport]. Same rows as 05-SCREENS.md.
export const SCREENS = [
  ['S-ASK.thread', 'default', 'ask-thread', T('thread'), 'phone'],
  ['S-ASK.steps', 'running', 'ask-steps', T('steps'), 'phone'],
  ['S-ASK.steps', 'stopped', null, T('stopped'), 'phone'],
  ['S-ASK.read-pictures', 'default', 'ask-reads', T('reads'), 'phone'],
  ['S-ASK.read-pictures', 'failed', null, T('failed'), 'phone'],
  ['S-ASK.intake', 'default', 'ask-intake', T('intake'), 'phone'],
  ['S-ASK.intake-folded', 'default', 'ask-reads', T('reads'), 'phone'],
  ['S-ASK.plan-card', 'writing', 'ask-writing', T('writing'), 'phone'],
  ['S-ASK.plan-card', 'ready', 'ask-card', T('card'), 'phone'],
  ['S-ASK.plan-card', 'lean', null, T('lean'), 'phone'],
  ['S-ASK.plan-card', 'empty-bank', null, T('empty-bank'), 'phone'],
  ['S-ASK.plan-card', 'long', null, T('long'), 'phone'],
  ['S-ASK.why', 'default', 'ask-card', T('card'), 'phone'],
  ['S-ASK.evidence', 'open', 'ask-evidence', T('evidence'), 'phone'],
  ['S-ASK.refine', 'default', 'ask-card', T('card'), 'phone'],
  ['S-ASK.block-sheet', 'open', 'ask-edit', T('edit'), 'phone'],
  ['S-ASK.swap', 'open', 'ask-swap', T('swap'), 'phone'],
  ['S-ASK.swap', 'swapped', 'ask-swapped', T('swapped'), 'phone'],
  ['S-ASK.full-plan', 'default', 'ask-full', T('full'), 'phone'],
  ['S-ASK.toast', 'default', null, T('card', '&density=desk'), 'desk'],
  ['S-ASK.save-to', 'open', 'ask-folders', T('folders'), 'phone'],
  ['S-ASK.save-to', 'new-folder', 'ask-newfolder', T('newfolder'), 'phone'],
  ['S-ASK.saved', 'saving', 'ask-saving', T('saving'), 'phone'],
  ['S-ASK.saved', 'saved', 'ask-saved', T('saved'), 'phone'],
  ['S-ASK.failed', 'default', null, T('failed'), 'phone'],
  ['S-ASK.undone', 'default', null, T('undone'), 'phone'],
  ['S-ASK.cancelled', 'default', null, T('cancelled'), 'phone'],
  ['S-ASK.publish-confirm', 'default', 'ask-confirm', T('confirm'), 'phone'],
  ['S-ASK.published', 'publishing', 'ask-publishing', T('publishing'), 'phone'],
  ['S-ASK.published', 'published', 'ask-published', T('published'), 'phone'],
  ['S-ASK.published', 'told', 'ask-told', T('told'), 'phone'],
  ['S-ASK.share-pdf', 'default', null, P('card', '&density=print'), 'phone'],
  ['S-ASKD.thread', 'built', 'desk-pane', T('card', '&density=desk'), 'desk'],
  ['S-ASKD.steps', 'default', null, T('steps', '&density=desk'), 'desk'],
  ['S-ASKD.intake', 'default', null, T('intake', '&density=desk'), 'desk'],
  ['S-ASKD.pane', 'default', 'desk-pane', T('card', '&density=desk'), 'desk'],
  ['S-ASKD.pane-v2', 'default', 'desk-v2', T('v2', '&density=desk'), 'desk'],
  ['S-ASKD.publish', 'default', null, T('confirm', '&density=desk'), 'desk'],
  ['S-DOC.sheet-coach', 'default', 'ask-full', P('card', '&copy=coach&density=phone'), 'phone'],
  ['S-DOC.sheet-player', 'default', null, P('card', '&copy=player&density=phone'), 'phone'],
  ['S-DOC.print-coach', 'default', null, P('card', '&copy=coach&density=print'), 'desk'],
  ['S-DOC.print-player', 'default', null, P('card', '&copy=player&density=print'), 'desk'],
  ['S-DOC.list-draft', 'default', null, 'team-hub-documents?state=practice-draft', 'phone'],
  ['S-DOC.list-shared', 'default', null, 'team-hub-documents?state=practice-shared', 'phone'],
  ['S-FMT.empty', 'default', 'fmt-home', F('empty'), 'phone'],
  ['S-FMT.upload-sheet', 'open', 'fmt-upload', F('upload-sheet'), 'phone'],
  ['S-FMT.upload-sheet', 'picked', 'fmt-picked', F('picked'), 'phone'],
  ['S-FMT.reading', 'default', 'fmt-scan', F('reading'), 'phone'],
  ['S-FMT.found', 'default', 'fmt-found', F('found'), 'phone'],
  ['S-FMT.set', 'default', 'fmt-set', F('set'), 'phone'],
  ['S-FMT.see', 'default', 'fmt-see', F('see'), 'phone'],
  ['S-FMT.undone', 'default', null, F('undone'), 'phone'],
  ['S-BLD.helper', 'empty', 'bld-empty', B('empty'), 'phone'],
  ['S-BLD.new-sheet', 'open', 'bld-new', B('new-sheet'), 'phone'],
  ['S-BLD.ghosts', 'default', 'bld-ghost', B('ghosts'), 'phone'],
  ['S-BLD.kept', 'default', 'bld-kept', B('kept'), 'phone'],
  ['S-BLDD.board', 'ghosts', 'bldd-ghost', B('ghosts', 'desk'), 'desk'],
  ['S-BLDD.board', 'kept', 'bldd-kept', B('kept', 'desk'), 'desk'],
  ['S-BLDD.inspector', 'default', 'bldd-ghost', B('ghosts', 'desk'), 'desk'],
  ['S-PLY.notify', 'default', 'ply-banner', Y('notify'), 'phone'],
  ['S-PLY.practice', 'default', 'ply-practice', Y('practice'), 'phone'],
  ['S-PLY.plan', 'default', null, Y('plan'), 'phone'],
  ['S-PLY.docs', 'default', null, Y('docs'), 'phone'],
];

// Motion rows from 07-MOTION.md. design: {lab: n} presses the motion lab's Play n; {run: name} presses a scene's Play.
// app: taps in order on the preview route ('wait:ms' pauses). Duration is how long to record after the trigger.
export const MOTION = {
  'M-ASK-01': { d: { run: 'askFull', f: 'ask' }, a: [T('thread'), '[data-ch-send]'], ms: 2500 },
  'M-ASK-02': { d: { lab: 0 }, a: [T('steps')], ms: 2600 },
  'M-ASK-03': { d: { lab: 0 }, a: [T('steps')], ms: 2600 },
  'M-ASK-04': { d: { lab: 0 }, a: [T('steps')], ms: 2600 },
  'M-ASK-05': { d: { run: 'askFull', f: 'ask' }, a: [T('steps')], ms: 9000 },
  'M-ASK-06': { d: { lab: 9 }, a: [T('intake'), '[data-ch-ask-first] [data-option]'], ms: 1600 },
  'M-ASK-07': { d: { run: 'askFull', f: 'ask' }, a: [T('intake'), '[data-ch-ask-first-submit]'], ms: 9000 },
  'M-ASK-08': { d: { lab: 1 }, a: [T('reads'), 'wait:2000'], ms: 2200 },
  'M-ASK-09': { d: { lab: 2 }, a: [T('writing')], ms: 3000 },
  'M-ASK-10': { d: { lab: 2 }, a: [T('writing')], ms: 3000 },
  'M-ASK-11': { d: { lab: 3 }, a: [T('writing')], ms: 3000 },
  'M-ASK-12': { d: { run: 'askFull', f: 'ask' }, a: [T('writing')], ms: 26000 },
  'M-ASK-13': { d: { lab: 7 }, a: [T('card'), '[data-ch-block]', 'wait:1200', '[data-ch-sheet-close]'], ms: 2400 },
  'M-ASK-14': { d: { lab: 4 }, a: [T('swap'), '[data-ch-swap-option]'], ms: 2000 },
  'M-ASK-15': { d: { run: 'askEdit', f: 'ask' }, a: [T('edit'), '[data-ch-stepper-minus]'], ms: 4000 },
  'M-ASK-16': { d: { lab: 6 }, a: [T('card'), '[data-ch-open-plan]', 'wait:1200', '[data-ch-back]'], ms: 2600 },
  'M-ASK-17': { d: { run: 'askSave', f: 'ask' }, a: [T('card'), '[data-ch-save-to]'], ms: 2500 },
  'M-ASK-18': { d: { run: 'askSave', f: 'ask' }, a: [T('folders'), '[data-ch-new-folder]'], ms: 4000 },
  'M-ASK-19': { d: { lab: 8 }, a: [T('card'), '[data-ch-save-draft]'], ms: 2400 },
  'M-ASK-20': { d: { lab: 8 }, a: [T('card'), '[data-ch-save-draft]'], ms: 2400 },
  'M-ASK-21': { d: { lab: 8 }, a: [T('card'), '[data-ch-save-draft]'], ms: 2400 },
  'M-ASK-22': { d: { lab: 12 }, a: [T('card'), '[data-ch-save-draft]'], ms: 2000 },
  'M-ASK-23': { d: { lab: 10 }, a: [T('saved')], ms: 8600 },
  'M-ASK-24': { d: { lab: 12 }, a: [T('confirm'), '[data-ch-confirm]'], ms: 2400 },
  'M-ASK-25': { d: { lab: 11 }, a: [T('published'), 'wait:8200'], ms: 9600 },
  'M-ASK-26': { d: { run: 'dskChange', f: 'desk' }, a: [T('card', '&density=desk'), '[data-ch-refine="2h"]'], ms: 5000, desk: true },
  'M-ASK-27': { d: { lab: 9 }, a: [T('intake'), '[data-ch-ask-first] [data-option]'], ms: 1200 },
  'M-ASK-28': { d: { run: 'askPublish', f: 'ask' }, a: [T('confirm'), '[data-ch-team-chat]'], ms: 1200 },
  'M-ASK-29': { d: { cap: 'desk-pane', click: '#dAwrap [data-act="save"]' }, a: [T('card', '&density=desk'), '[data-ch-pane-save]'], ms: 3200, desk: true },
  'M-ASK-30': { d: { run: 'dskBuild', f: 'desk' }, a: [T('writing', '&density=desk')], ms: 9000, desk: true },
  'M-ASK-31': { d: { cap: 'ask-thread', click: '#phA .seg button:nth-of-type(1)' }, a: [T('thread'), '[data-ch-seg] button:nth-of-type(1)'], ms: 1200 },
  'M-FMT-01': { d: { run: 'fmtUpload', f: 'fmt' }, a: [F('empty'), '[data-ch-upload]'], ms: 2000 },
  'M-FMT-02': { d: { run: 'fmtUpload', f: 'fmt' }, a: [F('reading')], ms: 9000 },
  'M-FMT-03': { d: { run: 'fmtUpload', f: 'fmt' }, a: [F('reading')], ms: 9000 },
  'M-FMT-04': { d: { run: 'fmtUpload', f: 'fmt' }, a: [F('found'), '[data-ch-use-format]'], ms: 3000 },
  'M-FMT-05': { d: { run: 'fmtSee', f: 'fmt' }, a: [F('set'), '[data-ch-see-plan]'], ms: 2400 },
  'M-BLD-01': { d: { run: 'bFill', f: 'bld' }, a: [B('empty'), '[data-ch-fill-draft]'], ms: 5000 },
  'M-BLD-02': { d: { lab: 5 }, a: [B('ghosts'), '[data-ch-keep]'], ms: 1200 },
  'M-BLD-03': { d: { run: 'bNew', f: 'bld' }, a: [B('empty'), '[data-ch-new-plan]'], ms: 2400 },
  'M-BLD-04': { d: { run: 'dbKeep', f: 'bldd' }, a: [B('ghosts', 'desk'), '[data-ch-keep-all]'], ms: 2400, desk: true },
  'M-PLY-01': { d: { lab: 13 }, a: [Y('notify')], ms: 1600 },
  'M-PLY-02': { d: { run: 'pOpen', f: 'ply' }, a: [Y('notify'), '[data-ch-banner]'], ms: 3000 },
};

if (flag('list')) {
  for (const [id, st, cap, route] of SCREENS) console.log(`${id}  ${st}  design:${cap ?? 'not drawn'}  app:${route}`);
  for (const k of Object.keys(MOTION)) console.log(k);
  process.exit(0);
}

const saved = [], failed = [];
const record = async (name, fn) => {
  try { await fn(); saved.push(name); console.log('saved ', name); }
  catch (e) { const m = String(e.message).split('\n')[0]; failed.push(`${name}: ${m}`); console.log('FAILED', name, m); }
};
// App theme and Text Size, the way design-refresh/package/capture-shots.mjs sets them.
const themeInit = (theme) => {
  try { localStorage.setItem('golf_theme', theme); } catch {}
  const h = document.documentElement;
  const set = () => { if (h.getAttribute('data-fw-theme') !== theme) h.setAttribute('data-fw-theme', theme); };
  set(); new MutationObserver(set).observe(h, { attributes: true });
};

// The design page plays the scene to the state, then holds it (window.__ppReady). Hash: #cap-<id>-<theme>[-xxl][-rm].
async function designShot(browser, cap, theme, file) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 2, colorScheme: theme });
  const page = await ctx.newPage();
  try {
    await page.goto(`${PAGE}?n=${Date.now()}#cap-${cap}-${theme}${XXL ? '-xxl' : ''}`);
    await page.waitForFunction(() => window.__ppReady === true, null, { timeout: 45_000 });
    await page.locator(FRAME[cap.split('-')[0]]).first().screenshot({ path: file, animations: 'allow' });
  } finally { await ctx.close(); }
}
async function appShot(browser, route, vp, theme, file) {
  const desk = vp === 'desk';
  const ctx = await browser.newContext({ viewport: desk ? DESK : PHONE, deviceScaleFactor: 2, isMobile: !desk, hasTouch: !desk, colorScheme: theme, reducedMotion: 'reduce' });
  await ctx.addInitScript(themeInit, theme);
  if (XXL) await ctx.addInitScript(() => { document.documentElement.style.setProperty('--ch-type-scale', '1.36'); });
  const page = await ctx.newPage();
  try {
    const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 240_000 });
    if (res && res.status() >= 400) throw new Error(`preview route ${route} answered ${res.status()} (add the fixture state)`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: file, animations: 'disabled' });
  } finally { await ctx.close(); }
}

async function shots(browser) {
  const id = opt('id'), st = opt('state');
  const rows = SCREENS.filter((r) => flag('all') || (r[0] === id && (!st || r[1] === st)));
  if (!rows.length) { console.error(`no screen ${id}${st ? ` / ${st}` : ''}; run --list`); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  for (const [sid, state, cap, route, vp] of rows) for (const theme of THEMES) for (const side of SIDES) {
    const name = `${sid}__${state}__${side}__${theme}${XXL ? '__xxl' : ''}`;
    if (side === 'design' && !cap) { console.log('skip  ', name, '(not drawn; build rule in 05)'); continue; }
    await record(name, () => side === 'design' ? designShot(browser, cap, theme, join(OUT, `${name}.png`)) : appShot(browser, route, vp, theme, join(OUT, `${name}.png`)));
  }
}

async function clip(browser) {
  const mid = opt('motion'), m = MOTION[mid];
  if (!m) { console.error(`no motion row ${mid}; run --list`); process.exit(1); }
  const dir = join(OUT, 'clips'); mkdirSync(dir, { recursive: true });
  for (const rm of [false, true]) for (const side of SIDES) {
    const stem = `${mid}__${side}${rm ? '__rm' : ''}`;
    const vp = side === 'design' ? { width: 1360, height: 1000 } : m.desk ? DESK : PHONE;
    const ctx = await browser.newContext({ viewport: vp, colorScheme: 'light', reducedMotion: rm ? 'reduce' : 'no-preference', recordVideo: { dir, size: vp }, isMobile: side === 'app' && !m.desk, hasTouch: side === 'app' && !m.desk });
    if (side === 'app') await ctx.addInitScript(themeInit, 'light');
    const page = await ctx.newPage();
    await record(stem, async () => {
      if (side === 'design') {
        if (m.d.cap) {
          // Land on a capture state, then tap one element in that frame (for motions no scene or lab button plays).
          await page.goto(`${PAGE}?n=${Date.now()}#cap-${m.d.cap}-light`);
          await page.waitForFunction(() => window.__ppReady === true, null, { timeout: 45_000 });
          await page.waitForTimeout(400);
          await page.locator(m.d.click).first().click();
          await page.waitForTimeout(m.ms);
        } else {
          await page.goto(`${PAGE}?n=${Date.now()}`);
          await page.waitForTimeout(800);
          const sel = m.d.lab != null ? `[data-lab="${m.d.lab}"]` : `[data-run="${m.d.run}"]`;
          await page.locator(sel).scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          await page.locator(sel).click();
          await page.waitForTimeout(m.ms);
        }
      } else {
        const [route, ...taps] = m.a;
        const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 240_000 });
        if (res && res.status() >= 400) throw new Error(`preview route ${route} answered ${res.status()}`);
        await page.waitForTimeout(1200);
        for (const t of taps) {
          if (t.startsWith('wait:')) { await page.waitForTimeout(+t.slice(5)); continue; }
          await page.locator(t).first().click({ timeout: 10_000 });
        }
        await page.waitForTimeout(m.ms);
      }
    });
    const video = page.video();
    await ctx.close();
    if (video) { try { renameSync(await video.path(), join(dir, `${stem}.webm`)); } catch {} }
  }
}

const browser = await chromium.launch();
try { await (opt('motion') ? clip(browser) : shots(browser)); } finally { await browser.close(); }
console.log(`\n${saved.length} saved to ${OUT}${failed.length ? `, ${failed.length} failed:\n  ${failed.join('\n  ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
