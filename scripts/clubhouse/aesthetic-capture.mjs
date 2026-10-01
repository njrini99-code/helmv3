#!/usr/bin/env node
/**
 * Aesthetic-audit capture (docs/clubhouse/AESTHETIC_AUDIT.md): the same Clubhouse
 * preview screens, at the same widths and on the same fixture data, before and
 * after a change, filed and labeled by scripts/clubhouse/shots.mjs.
 *
 *   node scripts/clubhouse/aesthetic-capture.mjs --family messages-list --phase before --sha <7 hex> \
 *     [--base http://localhost:3100] [--widths 375,390,430,1440] [--only list]
 *
 * LOCAL ONLY: the /clubhouse-preview routes need a dev server (404 in production) and render
 * synthetic handoff fixtures. The page's real route goes in each manifest entry's `route`, the preview
 * URL in `fixture`, and the geometry report (overflow, clipped and off-screen text) in `geometry`.
 * --sha is explicit so a commit made by another session cannot change a label.
 */
/* global window, document, getComputedStyle, HTMLElement */
import { chromium } from '@playwright/test';
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordShot, shotPath } from './shots.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const HEIGHT = { 375: 812, 390: 844, 430: 932, 1440: 1000 };

const typeDraft = async (page) => {
  const box = page.locator('.ch-ms-comp textarea, .ch-msp-comp textarea, textarea').first();
  if (await box.count()) {
    await box.click();
    await box.fill('Tee times moved to 8:10. Bring the yardage books and a rain jacket, the front nine is wet.');
    await page.waitForTimeout(300);
  }
};

/** family -> page id, the real route, and its shots (surface and state are kebab-case labels). */
export const FAMILIES = {
  // The preview opens the Varsity thread; ?state=rail leaves nothing selected, which is the phone's list. Desktop shows both.
  'messages-list': { page: 'P007', route: '/golf/dashboard/messages', shots: [{ surface: 'list', role: 'coach', state: 'default', url: (w) => (w < 1000 ? '/clubhouse-preview/messages?state=rail' : '/clubhouse-preview/messages') }] },
  'messages-thread': {
    page: 'P007',
    route: '/golf/dashboard/messages',
    shots: [
      { surface: 'thread', role: 'coach', state: 'thread-open', url: '/clubhouse-preview/messages' },
      { surface: 'thread', role: 'coach', state: 'composer-draft', url: '/clubhouse-preview/messages', act: typeDraft },
    ],
  },
  home: {
    page: 'P002',
    route: '/golf/dashboard',
    shots: [
      { surface: 'dashboard', role: 'coach', state: 'default', url: '/clubhouse-preview/home' },
      { surface: 'dashboard', role: 'player', state: 'default', url: '/clubhouse-preview/home-player' },
    ],
  },
  'shot-tracking': {
    page: 'P011',
    route: '/golf/dashboard/rounds',
    shots: [
      { surface: 'track', role: 'player', state: 'approach', url: '/clubhouse-preview/track?state=approach' },
      { surface: 'track', role: 'player', state: 'putt', url: '/clubhouse-preview/track?state=putt' },
      { surface: 'track', role: 'player', state: 'submit-failed', url: '/clubhouse-preview/track?state=submitfail' },
    ],
  },
  calendar: {
    page: 'P006',
    route: '/golf/dashboard/calendar',
    shots: [
      { surface: 'calendar', role: 'coach', state: 'default', url: '/clubhouse-preview/calendar' },
      { surface: 'calendar', role: 'player', state: 'default', url: '/clubhouse-preview/calendar-player' },
    ],
  },
  qualifiers: {
    page: 'P009',
    route: '/golf/dashboard/qualifiers',
    shots: [
      { surface: 'list', role: 'coach', state: 'default', url: '/clubhouse-preview/qualifiers' },
      { surface: 'list', role: 'player', state: 'default', url: '/clubhouse-preview/qualifiers-player' },
      { surface: 'detail', role: 'coach', state: 'live', url: '/clubhouse-preview/qualifier?q=live' },
    ],
  },
  coachhelm: {
    page: 'P013',
    route: '/golf/dashboard/coachhelm',
    shots: [
      { surface: 'insights', role: 'coach', state: 'assigned', url: '/clubhouse-preview/coachhelm?state=assigned' },
      { surface: 'insights', role: 'player', state: 'default', url: '/clubhouse-preview/coachhelm-player' },
    ],
  },
};

/** Runs in the page: horizontal overflow, text clipped without an ellipsis, elements past the viewport edge. */
const geometry = () => {
  const vw = window.innerWidth;
  const name = (e) => `${e.tagName.toLowerCase()}${[...e.classList].filter((c) => c.startsWith('ch-')).slice(0, 1).map((c) => `.${c}`).join('')}`;
  const out = { overflowX: document.documentElement.scrollWidth > vw + 1, clipped: [], offscreen: [], truncated: 0, smallTargets: [], initialsCovered: [] };
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none' || e.closest('[aria-hidden="true"], nextjs-portal, .ch-sr-only') || e.classList.contains('ch-sr-only')) continue;
    // A child of a horizontal scroller (the hole strip, the chip row) is meant to run past the edge.
    let scroller = false;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX) && p.scrollWidth > p.clientWidth) scroller = true;
    }
    if ((r.right > vw + 1 || r.left < -1) && !scroller && !e.closest('[hidden]') && !/fixed|sticky/.test(cs.position)) out.offscreen.push(name(e));
    if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && e.textContent.trim() && !e.children.length) {
      if (cs.textOverflow === 'ellipsis') out.truncated += 1;
      else if (['hidden', 'clip'].includes(cs.overflowX)) out.clipped.push(name(e));
    }
  }
  // Touch targets whose hit area is under 44 CSS px on a phone (MOBILE.md), counting only what is on screen.
  if (vw < 1000) {
    for (const e of document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="tab"], [role="switch"]')) {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || r.bottom < 0 || r.top > window.innerHeight || e.closest('[aria-hidden="true"], nextjs-portal, .ch-sr-only') || e.classList.contains('ch-sr-only')) continue;
      if (Math.min(r.width, r.height) >= 44 || e.closest('[inert], .ch-search')) continue;
      // The drawn control may be small while a ::before enlarges what a finger hits: probe 21px either side of its centre.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hits = (x, y) => {
        const t = document.elementFromPoint(x, y);
        return !!t && (e === t || e.contains(t));
      };
      const okW = r.width >= 44 || (hits(cx - 21, cy) && hits(cx + 21, cy));
      const okH = r.height >= 44 || (hits(cx, cy - 21) && hits(cx, cy + 21));
      if (!(okW && okH)) out.smallTargets.push(`${name(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  // A stacked avatar whose initials run under the next coin.
  for (const a of document.querySelectorAll('.ch-avatar')) {
    if (a.firstChild?.nodeType !== 3) continue;
    const range = document.createRange();
    range.selectNodeContents(a);
    const t = range.getBoundingClientRect();
    for (let n = a.nextElementSibling; n; n = n.nextElementSibling) {
      const r = n.getBoundingClientRect();
      if (n.classList.contains('ch-avatar') && r.left < t.right - 0.5 && r.right > t.left) {
        out.initialsCovered.push(a.textContent);
        break;
      }
    }
  }
  const top = (a, n = 6) => [...new Set(a)].slice(0, n);
  return { ...out, clipped: top(out.clipped), offscreen: top(out.offscreen), smallTargets: top(out.smallTargets, 12), initialsCovered: top(out.initialsCovered) };
};

async function main() {
  const { values: o } = parseArgs({ options: { family: { type: 'string' }, phase: { type: 'string' }, sha: { type: 'string' }, base: { type: 'string' }, widths: { type: 'string' }, only: { type: 'string' } } });
  const fam = FAMILIES[o.family];
  if (!fam) throw new Error(`--family is one of ${Object.keys(FAMILIES).join(', ')}`);
  if (!/^[0-9a-f]{7}$/.test(o.sha ?? '')) throw new Error('--sha <7 hex>: the commit the code under capture is at');
  const base = o.base ?? 'http://localhost:3100';
  const widths = (o.widths ?? '375,390,430,1440').split(',').map(Number);
  const browser = await chromium.launch();
  const version = `chromium ${browser.version()}`;
  const report = [];
  try {
    for (const width of widths) {
      // Retina density, as a phone shows it; a 1x capture viewed on a phone is upscaled and reads as blurry.
      const ctx = await browser.newContext({ viewport: { width, height: HEIGHT[width] ?? 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      for (const shot of fam.shots.filter((s) => !o.only || s.surface === o.only || s.state === o.only)) {
        for (let tries = 0; ; tries += 1) {
          try {
            await page.goto(base + (typeof shot.url === 'function' ? shot.url(width) : shot.url), { timeout: 120_000 });
            break;
          } catch (e) {
            if (tries >= 2) throw e;
            await page.waitForTimeout(3000);
          }
        }
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
        await page.evaluate(() => document.fonts.ready);
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        await page.waitForTimeout(600);
        await shot.act?.(page, width);
        // A programmatic focus ring (the pushed thread's title) is a keyboard cue; a tap on a phone does not show it.
        if (!shot.act) await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        const file = shotPath({ page: fam.page, surface: shot.surface, role: shot.role, viewport: String(width), state: shot.state, phase: o.phase, sha: o.sha }, ROOT, today());
        await page.screenshot({ path: file });
        const geo = await page.evaluate(geometry);
        recordShot(file, { route: fam.route, fixture: `${typeof shot.url === 'function' ? shot.url(width) : shot.url} (synthetic preview fixture)`, browser: version, note: `${o.family}; local dev server ${base}` }, ROOT, { geometry: geo });
        report.push({ width, surface: shot.surface, role: shot.role, state: shot.state, ...geo });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  for (const r of report) {
    const flags = [r.overflowX && 'OVERFLOW-X', r.clipped.length && `clipped ${r.clipped.join(',')}`, r.offscreen.length && `offscreen ${r.offscreen.join(',')}`, r.smallTargets.length && `targets<44: ${r.smallTargets.join('; ')}`, r.initialsCovered.length && `initials under next coin: ${r.initialsCovered.join(',')}`].filter(Boolean);
    console.log(`${r.width} ${r.surface}/${r.role}/${r.state}: ${flags.join('; ') || 'no overflow, clipping or off-screen'}${r.truncated ? ` (${r.truncated} ellipsized)` : ''}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
