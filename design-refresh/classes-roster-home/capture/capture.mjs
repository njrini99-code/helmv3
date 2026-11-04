// Fidelity shots for the Classes, Roster and coach Home redesign: the design page and the app, state by state.
//
// Run on the Mac from the helmv3 repo root (it has Playwright). No sign-in: the app side uses the
// /clubhouse-preview fixture routes, and the design side is a local file. Nothing is written anywhere but --out.
//
//   npm run dev -- -p 3100                                   (one terminal, only for app/built)
//   node <package>/capture/capture.mjs design  --out <package>/screenshots/after
//   node <package>/capture/capture.mjs app     --out <package>/screenshots/before     (today's main)
//   node <package>/capture/capture.mjs app     --out <package>/screenshots/built      (your branch)
//   node <package>/capture/capture.mjs compare --a <package>/screenshots/built --b <package>/screenshots/after --out <package>/screenshots/compare
//
// Options: --only roster        one screen (classes, roster, home)
//          --base http://localhost:3100/clubhouse-preview/
// One headless Chromium, one page at a time, closed as it goes, so it stays light on memory.
// Exit 0 when every shot saved; 1 when any failed (missing preview states are listed, not fatal to the rest).

import { chromium } from 'playwright';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const [mode, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
if (!['design', 'app', 'compare'].includes(mode) || !args.out) {
  console.error('usage: capture.mjs design|app --out <dir> [--only classes|roster|home] | compare --a <dir> --b <dir> --out <dir>');
  process.exit(1);
}
const OUT = resolve(args.out);
mkdirSync(OUT, { recursive: true });
const PAGE = pathToFileURL(resolve(HERE, '../redesign/clubhouse-phone-redesign.html')).href;
const BASE = (args.base ?? process.env.BASE ?? 'http://localhost:3100/clubhouse-preview/').replace(/\/?$/, '/');

// One row per shot: file stem, design hash, app preview route ('' when the app has no fixture yet), clicks in the app.
// Shot names are the same on both sides so compare can pair them.
const SHOTS = [
  // screen, stem, design hash (without theme), app route, app click (optional)
  ['classes', 'classes', 'classes-phone', 'classes'],
  ['classes', 'classes-sheet', 'classes-phone', 'classes', 'class'],
  ['classes', 'classes-loading', 'classes-phone-loading', 'classes?state=loading'],
  ['classes', 'classes-empty', 'classes-phone-empty', 'classes?state=empty'],
  ['classes', 'classes-failed', 'classes-phone-failed', 'classes?state=failed'],
  ['classes', 'classes-long', 'classes-phone-long', 'classes?state=long'],
  ['classes', 'classes-xxl', 'classes-phone-xxl', 'classes', null, 'xxl'],
  ['classes', 'classes-desktop', 'classes-desktop', 'classes', null, 'desktop'],
  ['roster', 'roster-coach', 'roster-phone-coach', 'roster'],
  ['roster', 'roster-player', 'roster-phone-player', 'roster-player'],
  ['roster', 'roster-profile', 'roster-phone-coach-profile', 'roster', 'profile'],
  ['roster', 'roster-requests', 'roster-phone-coach', 'roster', 'reqs'],
  ['roster', 'roster-early', 'roster-phone-coach-early', 'roster?state=early'],
  ['roster', 'roster-loading', 'roster-phone-coach-loading', 'roster?state=loading'],
  ['roster', 'roster-empty', 'roster-phone-coach-empty', 'roster?state=empty'],
  ['roster', 'roster-player-empty', 'roster-phone-player-empty', 'roster-player?state=empty'],
  ['roster', 'roster-failed', 'roster-phone-coach-failed', 'roster?state=failed'],
  ['roster', 'roster-long', 'roster-phone-coach-long', 'roster?state=long'],
  ['roster', 'roster-big', 'roster-phone-coach-big', 'roster?state=big'],
  ['roster', 'roster-xxl', 'roster-phone-coach-xxl', 'roster', null, 'xxl'],
  ['roster', 'roster-desktop', 'roster-desktop-coach', 'roster', null, 'desktop'],
  ['home', 'home', 'home-phone', 'home'],
  ['home', 'home-round', 'home-phone', 'home', 'round'],
  ['home', 'home-strip', 'home-phone', 'home', 'strip'],
  ['home', 'home-loading', 'home-phone-loading', 'home?state=loading'],
  ['home', 'home-empty', 'home-phone-empty', 'home?state=empty'],
  ['home', 'home-failed', 'home-phone-failed', 'home?state=failed'],
  ['home', 'home-xxl', 'home-phone-xxl', 'home', null, 'xxl'],
  ['home', 'home-desktop', 'home-desktop', 'home', null, 'desktop'],
].filter((r) => !args.only || r[0] === args.only);

const THEMES = ['light', 'dark'];
const WIDTHS = [390, 430];
const saved = [];
const failed = [];
const record = async (name, fn) => {
  try { await fn(); saved.push(name); console.log('saved ', name); }
  catch (e) { const m = String(e.message).split('\n')[0]; failed.push(`${name}: ${m}`); console.log('FAILED', name, m); }
};

// Design page: the device frame is the shot. Clicks use the page's own data-act buttons.
const DESIGN_CLICK = {
  class: '#devwrap [data-act="class"]',
  reqs: '#devwrap [data-act="reqs"]',
  round: '#devwrap [data-act="round"]',
  strip: '#devwrap [data-act="strip"]',
};
async function design(browser) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: 1700, height: 1200 }, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      for (const [, stem, hash, , click, extra] of SHOTS) {
        const desk = hash.includes('desktop');
        if (desk && width !== 390) continue; // desktop has one size
        const name = `${stem}-${theme}${desk ? '' : '-' + width}`;
        await record(name, async () => {
          await page.goto(`${PAGE}#${hash}-${theme}-reduce${extra === 'xxl' ? '-xxl' : ''}`);
          await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
          if (!desk && width === 430) await page.click('button[data-set="size"][data-v="69"]');
          await page.waitForTimeout(400);
          if (click && DESIGN_CLICK[click]) { await page.locator(DESIGN_CLICK[click]).first().click(); await page.waitForTimeout(500); }
          const el = page.locator(desk ? '#devwrap .dfit' : '#devwrap .device').first();
          await el.waitFor({ state: 'visible', timeout: 10_000 });
          await el.screenshot({ path: join(OUT, `${name}.png`), animations: 'disabled' });
        });
      }
      await ctx.close();
    }
  }
}

// App: preview fixtures. Theme the way capture-shots.mjs does; Text Size XXL through --ch-type-scale.
const themeInit = (theme) => {
  try { localStorage.setItem('golf_theme', theme); } catch {}
  const h = document.documentElement;
  const set = () => { if (h.getAttribute('data-fw-theme') !== theme) h.setAttribute('data-fw-theme', theme); };
  set();
  new MutationObserver(set).observe(h, { attributes: true });
};
// Selectors for today's app and the built redesign; the first that exists is clicked.
const APP_CLICK = {
  class: '[data-ch-class-row], .ch-cl-today button, .ch-cl button[aria-haspopup="dialog"]',
  profile: '[data-ch-roster-row], .ch-rsm-list button',
  reqs: '[data-ch-roster-requests], button:has-text("Join requests"), button:has-text("requests")',
  round: '[data-ch-round-row], .ch-hm-rounds button',
  strip: '[data-ch-section-switch], .ch-topbar button[aria-expanded]',
};
async function app(browser) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const [, stem, , route, click, extra] of SHOTS) {
        const desk = extra === 'desktop';
        if (desk && width !== 390) continue;
        const name = `${stem}-${theme}${desk ? '' : '-' + width}`;
        if (!route) continue;
        const vp = desk ? { width: 1440, height: 900 } : { width, height: width === 430 ? 932 : 844 };
        const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: !desk, hasTouch: !desk, colorScheme: theme, reducedMotion: 'reduce' });
        await ctx.addInitScript(themeInit, theme);
        if (extra === 'xxl') await ctx.addInitScript(() => { document.documentElement.style.setProperty('--ch-type-scale', '1.36'); });
        const page = await ctx.newPage();
        await record(name, async () => {
          const res = await page.goto(BASE + route, { waitUntil: 'load', timeout: 240_000 });
          if (res && res.status() >= 400) throw new Error(`preview route ${route} answered ${res.status()} (add the fixture state)`);
          await page.waitForTimeout(1200);
          if (click) {
            const el = page.locator(APP_CLICK[click]).first();
            await el.waitFor({ state: 'visible', timeout: 10_000 });
            await el.click();
            await page.waitForTimeout(800);
          }
          await page.screenshot({ path: join(OUT, `${name}.png`), animations: 'disabled' });
        });
        await ctx.close();
      }
    }
  }
}

// Side by side: app on the left, design on the right, same name. Images inlined, no network.
async function compare(browser) {
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
}

const browser = await chromium.launch();
try { await ({ design, app, compare })[mode](browser); } finally { await browser.close(); }
console.log(`\n${saved.length} saved to ${OUT}${failed.length ? `, ${failed.length} failed:\n  ${failed.join('\n  ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
