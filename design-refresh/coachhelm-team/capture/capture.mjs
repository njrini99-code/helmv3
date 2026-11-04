// Fidelity shots for the CoachHelm Team view (the hole): the design page and the app, state by state, plus motion clips.
//
// Run on the Mac from the helmv3 repo root (it has Playwright). No sign-in: the app side uses /clubhouse-preview
// fixture routes, and the design side is a local file. Nothing is written anywhere but --out.
//
//   npm run dev -- -p 3100                                   (one terminal, only for app shots and clips)
//
// By screen (BUILD_CONTRACT_STANDARD.md): screen IDs and states come from 05-SCREENS.md, motion IDs from 07-MOTION.md.
//   node <package>/capture/capture.mjs --id S-TEAM.course --state course-all-spot
//       writes screenshots/<ID>__<state>__{design,app,compare}__{light,dark}.png
//   node <package>/capture/capture.mjs --id 'S-TEAM*'        every screen
//   node <package>/capture/capture.mjs --motion M-TEAM-07    writes screenshots/<M-ID>__{design,app}[__reduce].webm
//
// By mode (the older form, still works; files use the same names):
//   node <package>/capture/capture.mjs design  --out <package>/screenshots/after
//   node <package>/capture/capture.mjs app     --out <package>/screenshots/before     (today's main)
//   node <package>/capture/capture.mjs app     --out <package>/screenshots/built      (your branch)
//   node <package>/capture/capture.mjs compare --a <package>/screenshots/built --b <package>/screenshots/after --out <package>/screenshots/compare
//   node <package>/capture/capture.mjs clips   --out <package>/screenshots/clips      (design and app motion, with and without Reduce Motion)
//
// Options: --only <stem prefix>   e.g. --only desk, --only read, --only early
//          --base http://localhost:3100/clubhouse-preview/
//          --side design|app      (clips only; default both)
// One headless Chromium, one page at a time, closed as it goes, so it stays light on the laptop's memory.
// Sizes: phone 390 x 844 and 430 x 932 (the "lg" shots), as BUILD_CONTRACT_STANDARD.md sets; desktop 1280 x 832, 1440 x 900, 1728 x 1117.
// XXL is the app's Text Size cap, 23/17 (lib/dynamic-type.ts), on both sides.
// Light and dark. That is the whole matrix. Exit 0 when every shot saved; 1 when any failed.

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const first = argv[0] && !argv[0].startsWith('--') ? argv.shift() : null;
const args = Object.fromEntries(argv.reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
// No mode word: --motion runs clips, --id/--state run the design and app shots side by side into screenshots/.
const mode = first ?? (args.motion ? 'clips' : 'pair');
args.out ??= resolve(HERE, '../screenshots');
if (!['design', 'app', 'compare', 'clips', 'pair'].includes(mode) || (mode === 'pair' && !args.id && !args.state && !args.only && !args.all)) {
  console.error(`usage:
  capture.mjs --id <screen ID> [--state <state>]      design + app + side by side for that screen (screen IDs and states: 05-SCREENS.md)
  capture.mjs --id 'S-TEAM.*'                          every screen under S-TEAM
  capture.mjs --motion <M-ID>                          design and app clips for one motion row (07-MOTION.md), with and without Reduce Motion
  capture.mjs design|app|clips [--out <dir>] [--only <stem>] [--id <ID>] [--state <state>]
  capture.mjs compare --a <app dir> --b <design dir> [--out <dir>]`);
  process.exit(1);
}
const OUT = resolve(args.out);
mkdirSync(OUT, { recursive: true });
const PAGE = pathToFileURL(resolve(HERE, '../redesign/coachhelm-team.html')).href;
const BASE = (args.base ?? process.env.BASE ?? 'http://localhost:3100/clubhouse-preview/').replace(/\/?$/, '/');

// The app's preview route, as 02-PLAN.md names it. If the build names a route, state or param differently, change it here only.
//   /clubhouse-preview/coachhelm-team ?state=default|early|long|failed|loading|empty &station=tee|app|sg|putt &open=read|player|story
const R = (q = '') => `coachhelm-team${q ? '?' + q : ''}`;

// stem, design hash tokens, app route, app action, device
//   device: 'phone' (390), 'lg' (430), 'xxl' (390 at the largest Text Size), or a desktop width '1280' | '1440' | '1728'
//   app action: a card to scroll to ('card:spot'), or a tap hook ('tap:...'); routes with &open= need no tap.

// Screen IDs from 05-SCREENS.md. Every shot belongs to one screen; its capture state is its design hash tokens.
const SCREEN = {
  board: 'S-TEAM', early: 'S-TEAM', failed: 'S-TEAM', loading: 'S-TEAM', empty: 'S-TEAM', xxl: 'S-TEAM', lg: 'S-TEAM',
  'desk-1280': 'S-TEAM', 'desk-1440': 'S-TEAM', 'desk-1728': 'S-TEAM', 'desk-early': 'S-TEAM', 'desk-failed': 'S-TEAM', 'desk-loading': 'S-TEAM', 'desk-empty': 'S-TEAM',
  'board-spot': 'S-TEAM.spot', 'board-putt': 'S-TEAM.spot', 'board-tee': 'S-TEAM.spot', 'board-sg': 'S-TEAM.spot', 'early-spot': 'S-TEAM.spot', 'long-spot': 'S-TEAM.spot', 'xxl-spot': 'S-TEAM.spot', 'desk-putt': 'S-TEAM.spot',
  'board-course': 'S-TEAM.course', 'board-course-all': 'S-TEAM.course', 'early-course': 'S-TEAM.course', 'desk-course': 'S-TEAM.course', 'desk-course-all': 'S-TEAM.course',
  'course-sheet': 'S-TEAM.course-sheet',
  read: 'S-TEAM.read-sheet', 'read-assigned': 'S-TEAM.read-sheet', 'course-read': 'S-TEAM.read-sheet',
  player: 'S-TEAM.player-sheet', 'empty-player': 'S-TEAM.player-sheet',
  story: 'S-TEAM.story',
  'board-huddle': 'S-TEAM.huddle', 'board-roster': 'S-TEAM.roster', 'board-work': 'S-TEAM.working',
  'board-record': 'S-TEAM.record', 'failed-record': 'S-TEAM.record',
  'desk-read': 'S-TEAM.inspector', 'desk-player': 'S-TEAM.inspector', 'desk-story': 'S-TEAM.inspector',
};
// The capture state of a shot: its hash tokens, plus the size when the tokens don't already say it.
const stateOf = (tokens, device) => (['xxl', 'lg'].includes(device) && !tokens.split('-').includes(device) ? `${tokens}-${device}` : tokens);
const SHOTS = [
  ['board',            'top',               R(),                               null,            'phone'],
  ['board-spot',       'spot',              R(),                               'card:spot',     'phone'],
  ['board-putt',       'putt-spot',         R('station=putt'),                 'card:spot',     'phone'],
  ['board-tee',        'tee-spot',          R('station=tee'),                  'card:spot',     'phone'],
  ['board-sg',         'sg-spot',           R('station=sg'),                   'card:spot',     'phone'],
  ['board-course',     'course-spot',       R('station=course'),               'card:spot',     'phone'],
  ['board-course-all', 'course-all-spot',   R('station=course&all=1'),         'card:spot',     'phone'],
  ['course-sheet',     'crs',               R('open=course'),                  null,            'phone'],
  ['early-course',     'course-early-spot', R('state=early&station=course'),   'card:spot',     'phone'],
  ['course-read',      'course-read',       R('station=course&open=read&read=course'), null,    'phone'],
  ['board-huddle',     'huddle',            R(),                               'card:huddle',   'phone'],
  ['board-roster',     'roster',            R(),                               'card:roster',   'phone'],
  ['board-work',       'work',              R(),                               'card:work',     'phone'],
  ['board-record',     'record',            R(),                               'card:record',   'phone'],
  ['read',             'read',              R('open=read'),                    null,            'phone'],
  ['read-assigned',    'assigned-read',     R('open=read&read=assigned'),      null,            'phone'],
  ['player',           'player',            R('open=player'),                  null,            'phone'],
  ['story',            'story',             R('open=story'),                   null,            'phone'],
  ['early',            'early',             R('state=early'),                  null,            'phone'],
  ['early-spot',       'early-spot',        R('state=early'),                  'card:spot',     'phone'],
  ['long-spot',        'long-spot',         R('state=long'),                   'card:spot',     'phone'],
  ['failed',           'failed',            R('state=failed'),                 null,            'phone'],
  ['failed-record',    'failed-record',     R('state=failed'),                 'card:record',   'phone'],
  ['loading',          'loading',           R('state=loading'),                null,            'phone'],
  ['empty',            'empty',             R('state=empty'),                  null,            'phone'],
  ['empty-player',     'empty-player',      R('state=empty&open=player'),      null,            'phone'],
  ['xxl',              'top',               R(),                               null,            'xxl'],
  ['xxl-spot',         'spot',              R(),                               'card:spot',     'xxl'],
  ['lg',               'top',               R(),                               null,            'lg'],
  ['desk-1280',        '1280',              R(),                               null,            '1280'],
  ['desk-1440',        '1440',              R(),                               null,            '1440'],
  ['desk-1728',        '1728',              R(),                               null,            '1728'],
  ['desk-putt',        '1440-putt',         R('station=putt'),                 null,            '1440'],
  ['desk-course',      '1440-course',       R('station=course'),               null,            '1440'],
  ['desk-course-all',  '1728-course-all',   R('station=course&all=1'),         null,            '1728'],
  ['desk-read',        '1440-read',         R('open=read'),                    null,            '1440'],
  ['desk-player',      '1440-player',       R('open=player'),                  null,            '1440'],
  ['desk-story',       '1440-story',        R('open=story'),                   null,            '1440'],
  ['desk-early',       '1440-early',        R('state=early'),                  null,            '1440'],
  ['desk-failed',      '1440-failed',       R('state=failed'),                 null,            '1440'],
  ['desk-loading',     '1440-loading',      R('state=loading'),                null,            '1440'],
  ['desk-empty',       '1440-empty',        R('state=empty'),                  null,            '1440'],
].filter((r) => !args.only || r[0].startsWith(args.only))
 .filter((r) => !args.id || SCREEN[r[0]] === args.id || (args.id.endsWith('*') && (SCREEN[r[0]] ?? '').startsWith(args.id.slice(0, -1))))
 .filter((r) => !args.state || stateOf(r[1], r[4]) === args.state);
for (const r of SHOTS) if (!SCREEN[r[0]]) throw new Error(`shot ${r[0]} has no screen ID`);
// File name: <ID>__<state>__<design|app>__<theme>.png (BUILD_CONTRACT_STANDARD.md).
const fileOf = (stem, tokens, device, side, theme) => `${SCREEN[stem]}__${stateOf(tokens, device)}__${side}__${theme}.png`;

const DESK = { 1280: 832, 1440: 900, 1728: 1117 };
const isDesk = (d) => d in DESK;
const THEMES = ['light', 'dark'];
const saved = [];
const failed = [];
const record = async (name, fn) => {
  try { await fn(); saved.push(name); console.log('saved ', name); }
  catch (e) { const m = String(e.message).split('\n')[0]; failed.push(`${name}: ${m}`); console.log('FAILED', name, m); }
};

// The design page draws its phone at 390 or 430 and scales its desktop to fit. This style sizes the phone's screen to the
// app viewport (390 x 844, or 430 x 932 for lg) and gives the desktop the full window so it draws at 1:1.
const DESIGN_STAGE = `.ph{width:412px!important;height:866px!important}.ph.lg{width:452px!important;height:954px!important}
  #desktop .wrap{max-width:none!important}.mast,#directions,#map,#build,#lanes,#research,#calls,footer{display:none!important}`;
async function openDesign(page, hash) {
  await page.goto(`${PAGE}#${hash}`);
  await page.addStyleTag({ content: DESIGN_STAGE });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(600);
}
const designHash = (tokens, theme, device, reduce = true) =>
  [tokens, theme === 'dark' ? 'dark' : null, reduce ? 'reduce' : null, device === 'xxl' ? 'xxl' : null, device === 'lg' ? 'lg' : null].filter(Boolean).join('-');

async function design(browser) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const [stem, tokens, , , device] of SHOTS) {
      const name = fileOf(stem, tokens, device, 'design', theme).slice(0, -4);
      await record(name, async () => {
        await openDesign(page, designHash(tokens, theme, device));
        const el = page.locator(isDesk(device) ? '#desk' : '#ph .scr').first();
        await el.waitFor({ state: 'visible', timeout: 10_000 });
        await el.screenshot({ path: join(OUT, `${name}.png`), animations: 'disabled' });
      });
    }
    await ctx.close();
  }
}

// App: preview fixtures. Theme the way design-refresh/package/capture-shots.mjs does; Text Size XXL through --ch-type-scale.
const themeInit = (theme) => {
  try { localStorage.setItem('golf_theme', theme); } catch {}
  const h = document.documentElement;
  const set = () => { if (h.getAttribute('data-fw-theme') !== theme) h.setAttribute('data-fw-theme', theme); };
  set();
  new MutationObserver(set).observe(h, { attributes: true });
};
// The built view carries these hooks (04-FIDELITY-SPEC.md section 6). Today's main has none, so "before" shots skip them.
const CARD = (k) => `[data-ch-team-card="${k}"]`;
const appViewport = (d) => (isDesk(d) ? { width: +d, height: DESK[d] } : d === 'lg' ? { width: 430, height: 932 } : { width: 390, height: 844 });
async function app(browser) {
  for (const theme of THEMES) {
    for (const [stem, tokens, route, action, device] of SHOTS) {
      const name = fileOf(stem, tokens, device, 'app', theme).slice(0, -4);
      const desk = isDesk(device);
      const ctx = await browser.newContext({ viewport: appViewport(device), deviceScaleFactor: 2, isMobile: !desk, hasTouch: !desk, colorScheme: theme, reducedMotion: 'reduce' });
      await ctx.addInitScript(themeInit, theme);
      if (device === 'xxl') await ctx.addInitScript(() => { document.documentElement.style.setProperty('--ch-type-scale', String(23 / 17)); });
      const page = await ctx.newPage();
      await record(name, async () => {
        const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 240_000 });
        if (res && res.status() >= 400) throw new Error(`preview route ${route} answered ${res.status()} (add the fixture state)`);
        await page.waitForTimeout(1200);
        if (action?.startsWith('card:')) {
          const el = page.locator(CARD(action.slice(5))).first();
          await el.waitFor({ state: 'attached', timeout: 10_000 });
          await el.evaluate((n) => n.scrollIntoView({ block: 'start' }));
          await page.evaluate(() => window.scrollBy(0, -70));
          await page.waitForTimeout(400);
        }
        await page.screenshot({ path: join(OUT, `${name}.png`), animations: 'disabled' });
      });
      await ctx.close();
    }
  }
}

// Side by side: app on the left, design on the right, same name. Images inlined, no network.
async function compare(browser) {
  // Pairs <ID>__<state>__app__<theme>.png with the same name's __design__ shot. --a holds app shots, --b design shots (both default to --out).
  const A = resolve(args.a ?? OUT), B = resolve(args.b ?? OUT);
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  for (const f of readdirSync(B).filter((x) => x.includes('__design__') && x.endsWith('.png'))) {
    const af = f.replace('__design__', '__app__');
    if (!existsSync(join(A, af))) { failed.push(`${f}: no app shot to compare`); continue; }
    const out = f.replace('__design__', '__compare__');
    await record(out, async () => {
      await page.setContent(`<body style="margin:0;background:#888;display:flex;gap:24px;padding:24px;align-items:flex-start;font:14px system-ui">
        <figure style="margin:0"><figcaption>app</figcaption><img style="max-width:1700px" src="data:image/png;base64,${readFileSync(join(A, af)).toString('base64')}"></figure>
        <figure style="margin:0"><figcaption>design</figcaption><img style="max-width:1700px" src="data:image/png;base64,${readFileSync(join(B, f)).toString('base64')}"></figure></body>`);
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(OUT, out), fullPage: true });
    });
  }
  await page.close();
}

// --id / --state with no mode word: design shots, app shots, then the side by side pairs, all in one folder.
async function pair(browser) {
  await design(browser);
  await app(browser);
  await compare(browser);
}

// Motion clips, light only, design and app, with and without Reduce Motion: the rows in 07-MOTION.md.
// Each side is a list of steps. The design side opens the page at a hash (the "live" token keeps motion on) and presses
// the page's own Play buttons or clicks its elements; the app side opens a preview route and taps the section 6 hooks.
// Steps: 'wait:<ms>' | 'play:<name>' (design Play button) | 'click:<selector>' | 'hold:<ms>:<selector>' (mouse down, wait, up)
//        'holdoff:<ms>:<selector>' (mouse down, wait, move off, up: a press that does nothing) | 'drag:<dy>:<ms>:<selector>'
//        'key:<Key>' | 'scroll:<card>' (app: [data-ch-team-card=<card>]) | 'scrollsel:<selector>' (design)
const CLIPS = [
  // name, design { hash, steps }, app route, app steps, size ('phone' | '1440')
  ['fly', { hash: 'studio-live', steps: ['play:fly', 'wait:3600'] }, R(), ['wait:3600'], 'phone'],
  ['station', { hash: 'studio-live', steps: ['play:station', 'wait:3600'] }, R(), ['click:[data-ch-team-station="putt"]', 'wait:1200', 'scroll:spot', 'wait:1200'], 'phone'],
  ['course', { hash: 'studio-live', steps: ['play:course', 'wait:3600'] }, R(), ['click:[data-ch-team-station="course"]', 'wait:1400', 'scroll:spot', 'click:[data-ch-team-more="courses"]', 'wait:900'], 'phone'],
  ['course-back', { hash: 'course-live', steps: ['play:course', 'wait:3600'] }, R('station=course'), ['click:[data-ch-team-station="app"]', 'wait:1200'], 'phone'],
  ['more', { hash: 'studio-live', steps: ['play:course', 'wait:1600', 'click:#ph [data-act="cmall"]', 'wait:400', 'click:#ph [data-act="crsall"]', 'wait:400', 'click:#ph [data-act="crsall"]', 'wait:900'] },
    R('station=course'), ['scroll:spot', 'click:[data-ch-team-more="reads"]', 'wait:400', 'click:[data-ch-team-more="courses"]', 'wait:400', 'click:[data-ch-team-more="courses"]', 'wait:900'], 'phone'],
  ['sheet', { hash: 'studio-live', steps: ['scrollsel:#ph [data-spot]', 'click:#ph [data-spot] [data-act="read"]', 'wait:900', 'click:#ph .pan [data-act="close"]', 'wait:600', 'click:#ph [data-spot] [data-act="read"]', 'wait:900', 'click:#ph .scrim', 'wait:900'] },
    R(), ['scroll:spot', 'click:[data-ch-team-read]', 'wait:900', 'click:[data-ch-team-close]', 'wait:600', 'click:[data-ch-team-read]', 'wait:900', 'click:[data-ch-team-scrim]', 'wait:600', 'click:[data-ch-team-read]', 'wait:900', 'drag:240:200:[data-ch-team-grabber]', 'wait:900'], 'phone'],
  ['inspector', { hash: '1440-live', steps: ['click:#desk [data-spot] [data-act="read"]', 'wait:900', 'click:#desk [data-spot] [data-act="player"]', 'wait:600', 'click:#desk .insp [data-act="close"]', 'wait:900'] },
    R(), ['click:[data-ch-team-read]', 'wait:900', 'click:[data-ch-team-player]', 'wait:600', 'key:Escape', 'wait:900'], '1440'],
  ['assign', { hash: 'studio-live', steps: ['play:assign', 'wait:3600'] }, R('read=penalties'), ['click:[data-ch-team-read]', 'wait:900', 'click:[data-ch-team-assign]', 'wait:1200'], 'phone'],
  ['story', { hash: 'studio-live', steps: ['play:story', 'wait:7000'] }, R(), ['click:[data-ch-team-story="0"]', 'wait:6000'], 'phone'],
  // The page draws no pause; its side records the plain story for reference.
  ['story-hold', { hash: 'studio-live', steps: ['play:story', 'wait:7000'] }, R(), ['click:[data-ch-team-story="0"]', 'wait:1500', 'hold:2000:[data-ch-team-story-viewer]', 'wait:4000'], 'phone'],
  ['huddle', { hash: 'studio-live', steps: ['play:huddle', 'wait:3600'] }, R(), ['scroll:huddle', 'wait:1600'], 'phone'],  // the app plays the huddle once, when the card first scrolls into view
  ['press', { hash: 'studio-live', steps: ['scrollsel:#ph [data-spot]', 'hold:300:#ph .br', 'wait:400', 'click:#ph [data-spot] [data-act="read"]', 'wait:900', 'hold:300:#ph .pan .btn', 'wait:400'] },
    R(), ['scroll:spot', 'hold:300:[data-ch-team-player]', 'wait:400', 'click:[data-ch-team-read]', 'wait:900', 'holdoff:300:[data-ch-team-assign]', 'wait:400'], 'phone'],
  ['loading', { hash: 'loading-live', steps: ['wait:3000'] }, R('state=loading'), ['wait:3000'], 'phone'],
];
// Motion rows in 07-MOTION.md ("M-ID to clip") and the clip that proves each one. --motion <M-ID> records only that clip.
const MOTION = Object.fromEntries([
  ['fly', [1, 2, 3, 4]], ['station', [5, 6, 7, 8, 9, 10]], ['course', [11, 12, 13, 14, 15]], ['course-back', [16]], ['more', [17]],
  ['sheet', [18, 19, 20, 21, 22]], ['inspector', [23, 24, 25]], ['assign', [26, 27, 28]], ['story', [29, 30, 31, 32, 33, 34, 40]],
  ['huddle', [35, 36, 37]], ['press', [38]], ['loading', [39]],
].flatMap(([clip, ns]) => ns.map((n) => [`M-TEAM-${String(n).padStart(2, '0')}`, clip])).concat([['M-TEAM-32-hold', 'story-hold']]));
// M-TEAM-41 (the toast) has no clip: it isn't built.

async function runSteps(page, steps, side) {
  const sel = (x) => (side === 'app' && x.startsWith('[data-ch-team-card') ? x : x);
  for (const t of steps) {
    const [op, ...restParts] = t.split(':');
    const rest = restParts.join(':');
    if (op === 'wait') { await page.waitForTimeout(+rest); continue; }
    if (op === 'play') { await page.evaluate((p) => document.querySelector(`[data-play="${p}"]`).click(), rest); continue; }
    if (op === 'key') { await page.keyboard.press(rest); continue; }
    if (op === 'scroll') { await page.locator(CARD(rest)).first().evaluate((n) => n.scrollIntoView({ behavior: 'smooth', block: 'start' })); await page.waitForTimeout(700); continue; }
    if (op === 'scrollsel') { await page.locator(rest).first().evaluate((n) => n.scrollIntoView({ block: 'start' })); await page.waitForTimeout(500); continue; }
    if (op === 'click') { await page.locator(sel(rest)).first().click({ timeout: 10_000 }); await page.waitForTimeout(300); continue; }
    if (op === 'hold' || op === 'holdoff' || op === 'drag') {
      const parts = rest.split(':');
      const target = op === 'drag' ? parts.slice(2).join(':') : parts.slice(1).join(':');
      const box = await page.locator(target).first().boundingBox();
      if (!box) throw new Error(`no box for ${target}`);
      const x = box.x + box.width / 2, y = box.y + Math.min(box.height / 2, 20);
      await page.mouse.move(x, y);
      await page.mouse.down();
      if (op === 'drag') {
        const [dy, ms] = [+parts[0], +parts[1]];
        const n = Math.max(4, Math.round(ms / 16));
        for (let i = 1; i <= n; i++) { await page.mouse.move(x, y + (dy * i) / n); await page.waitForTimeout(ms / n); }
      } else {
        await page.waitForTimeout(+parts[0]);
        if (op === 'holdoff') await page.mouse.move(x, y + 120, { steps: 6 });
      }
      await page.mouse.up();
      continue;
    }
    throw new Error(`unknown step ${t}`);
  }
}

async function clips(browser) {
  const sides = args.side ? [args.side] : ['design', 'app'];
  if (args.motion && !MOTION[args.motion]) { console.error(`no motion row ${args.motion}; known: ${Object.keys(MOTION).join(', ')}`); process.exit(1); }
  const list = args.motion ? CLIPS.filter((c) => c[0] === MOTION[args.motion]) : CLIPS.filter((c) => !args.only || c[0].startsWith(args.only));
  for (const reduce of [false, true]) {
    for (const side of sides) {
      for (const [name, design, route, appSteps, size] of list) {
        const stem = `${args.motion ?? name}__${side}${reduce ? '__reduce' : ''}`;
        const desk = size !== 'phone';
        const vp = side === 'design' ? (desk ? { width: 1600, height: 1000 } : { width: 1000, height: 1000 }) : appViewport(desk ? size : 'phone');
        const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: reduce ? 'reduce' : 'no-preference', recordVideo: { dir: OUT, size: vp }, isMobile: side === 'app' && !desk, hasTouch: side === 'app' && !desk });
        if (side === 'app') await ctx.addInitScript(themeInit, 'light');
        const page = await ctx.newPage();
        await record(stem, async () => {
          if (side === 'design') {
            await openDesign(page, `${design.hash}${reduce ? '-reduce' : ''}`);
            await page.waitForTimeout(2600);
            await runSteps(page, design.steps, 'design');
          } else {
            const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 240_000 });
            if (res && res.status() >= 400) throw new Error(`preview route ${route} answered ${res.status()}`);
            await page.waitForTimeout(2600);
            await runSteps(page, appSteps, 'app');
            await page.waitForTimeout(1200);
          }
        });
        const video = page.video();
        await ctx.close();
        if (video) { try { renameSync(await video.path(), join(OUT, `${stem}.webm`)); } catch {} }
      }
    }
  }
}

const browser = await chromium.launch();
try { await ({ design, app, compare, clips, pair })[mode](browser); } finally { await browser.close(); }
console.log(`\n${saved.length} saved to ${OUT}${failed.length ? `, ${failed.length} failed:\n  ${failed.join('\n  ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
