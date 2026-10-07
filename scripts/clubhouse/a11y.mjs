#!/usr/bin/env node
/* global document -- the sideways check runs inside the page (tab.evaluate) */
/**
 * Accessibility scan of every Clubhouse preview screen and state with axe-core
 * (WCAG 2.1 and 2.2 AA, contrast included). Needs the dev server:
 *
 *   npm run dev -- -p 3100        (in another terminal)
 *   npm run clubhouse:a11y        (CH_BASE=http://localhost:3100 by default)
 *   npm run clubhouse:a11y -- home settings   (only these screens)
 *
 * CH_ENGINES=chromium,webkit CH_MOTION=no-preference,reduce CH_WIDTHS=390,430
 * CH_HEIGHTS=480,844 customizes the engine/motion/viewport cross product.
 * These are development fixtures, not production/device evidence.
 *
 * Exits 1 when any page has a violation. The catalog's accessibility rows
 * (kind 8) cite this scan.
 */
import { pathToFileURL } from 'node:url';

const BASE = process.env.CH_BASE ?? 'http://localhost:3100';

/**
 * Every preview screen and the states that change what is on the page. An
 * optional third entry opens something first: `{ wide, phone }` selectors
 * clicked at 1280px and at 390px (an array is clicked in order, to reach a
 * screen two taps deep on the phone).
 */
export const CH_A11Y_PAGES = [
  ['shell', '/clubhouse-preview/settings', { wide: '.ch-topbar button[aria-label^="Notifications"]', phone: '.ch-tabbar button[aria-controls="ch-more"]' }],
  ['shell', '/clubhouse-preview/settings?bell=empty', { wide: '.ch-topbar button[aria-label^="Notifications"]' }],
  // The phone Settings screen draws its own large title with no bell, so the phone bell is opened from Home.
  ['shell', '/clubhouse-preview/home?bell=empty', { phone: '.ch-topbar button[aria-label^="Notifications"]' }],
  ['shell', '/clubhouse-preview/home', { phone: '.ch-topbar button[aria-label^="Notifications"]' }],
  ['home', '/clubhouse-preview/home'],
  ['home', '/clubhouse-preview/home?state=empty'],
  ['home', '/clubhouse-preview/home?state=failed'],
  ['home', '/clubhouse-preview/home?state=loading'],
  ['home', '/clubhouse-preview/home?state=error'],
  ['roster', '/clubhouse-preview/roster'],
  ['roster', '/clubhouse-preview/roster?state=empty'],
  ['roster', '/clubhouse-preview/roster?state=failed'],
  ['roster', '/clubhouse-preview/roster?state=loading'],
  ['roster', '/clubhouse-preview/roster?state=partial', { wide: '.ch-rs-face', phone: '.ch-rsm-row' }],
  ['roster', '/clubhouse-preview/roster', { wide: '[aria-label="List view"]' }],
  ['roster', '/clubhouse-preview/roster?player=jonah', { phone: '.ch-pbar__icon[aria-label="More actions"]' }],
  ['roster', '/clubhouse-preview/roster', { phone: '.ch-rsm-banner' }],
  ['roster', '/clubhouse-preview/roster?player=luca'],
  ['stats-team', '/clubhouse-preview/stats'],
  ['stats-team', '/clubhouse-preview/stats?state=empty'],
  ['stats-team', '/clubhouse-preview/stats?state=loading'],
  ['stats-team', '/clubhouse-preview/stats?state=failed'],
  ['stats-team', '/clubhouse-preview/stats?state=partial'],
  ['stats-team', '/clubhouse-preview/stats?state=crash'],
  // The round filter: a filter on, none matching, two rounds; then its sheet (type, holes, time, course, the round list) open.
  ['stats-team', '/clubhouse-preview/stats?state=filtered'],
  ['stats-team', '/clubhouse-preview/stats?state=nomatch'],
  ['stats-team', '/clubhouse-preview/stats?state=earlyfilter'],
  ['stats-team', '/clubhouse-preview/stats?state=nines'],
  ['stats-team', '/clubhouse-preview/stats?state=filtered', { wide: '.ch-sf__open', phone: '.ch-sf__open' }],
  ['stats-team', '/clubhouse-preview/stats', { wide: ['.ch-sf__open', '.ch-sf-sheet .ch-sf-sec:last-child .ch-pill:nth-child(2)'], phone: ['.ch-sf__open', '.ch-sf-sheet .ch-sf-sec:last-child .ch-pill:nth-child(3)'] }],
  ['stats-player', '/clubhouse-preview/player'],
  ['stats-player', '/clubhouse-preview/player?state=early'],
  ['stats-player', '/clubhouse-preview/player?state=self'],
  ['stats-player', '/clubhouse-preview/player?state=failed'],
  ['stats-player', '/clubhouse-preview/player?state=filtered'],
  ['stats-player', '/clubhouse-preview/player?state=nomatch'],
  ['stats-player', '/clubhouse-preview/player?state=nines'],
  ['stats-player', '/clubhouse-preview/player?state=filtered', { wide: '.ch-sf__open', phone: '.ch-sf__open' }],
  ['stats-player', '/clubhouse-preview/player', { wide: ['.ch-sf__open', '.ch-sf-sheet .ch-sf-sec:last-child .ch-pill:nth-child(2)'], phone: ['.ch-sf__open', '.ch-sf-sheet .ch-sf-sec:last-child .ch-pill:nth-child(3)'] }],
  ['stats-player', '/clubhouse-preview/player', { wide: '#tab-game' }],
  ['stats-player', '/clubhouse-preview/player', { wide: '#tab-rounds' }],
  ['stats-player', '/clubhouse-preview/player', { wide: '#tab-dev' }],
  // The phone shows one Game detail section at a time with More detail closed: open each section's detail.
  ...[1, 2, 3, 4, 5].map((n) => ['stats-player', '/clubhouse-preview/player', { phone: [...(n > 1 ? [`.ch-gd__nav .ch-pill:nth-child(${n})`] : []), '.ch-gd .ch-gx-more > summary'] }]),
  ['calendar', '/clubhouse-preview/calendar'],
  ['calendar', '/clubhouse-preview/calendar?view=month'],
  ['calendar', '/clubhouse-preview/calendar?view=agenda'],
  ['calendar', '/clubhouse-preview/calendar?state=empty'],
  ['calendar', '/clubhouse-preview/calendar?state=failed'],
  ['calendar', '/clubhouse-preview/calendar?state=loading'],
  ['calendar', '/clubhouse-preview/calendar?new=1'],
  ['calendar', '/clubhouse-preview/calendar?event=e9'],
  ['calendar', '/clubhouse-preview/calendar?state=partial'],
  ['calendar', '/clubhouse-preview/calendar-player'],
  ['messages', '/clubhouse-preview/messages'],
  ['messages', '/clubhouse-preview/messages?state=empty'],
  ['messages', '/clubhouse-preview/messages?state=failed'],
  ['messages', '/clubhouse-preview/messages?state=thread-failed'],
  ['messages', '/clubhouse-preview/messages?state=loading'],
  ['messages', '/clubhouse-preview/messages-player'],
  ['messages', '/clubhouse-preview/messages?state=announcement'],
  ['messages', '/clubhouse-preview/messages?state=ann-failed'],
  ['messages', '/clubhouse-preview/messages', { wide: 'button[aria-label="Details"]', phone: 'button[aria-label="Details"]' }],
  ['messages', '/clubhouse-preview/messages?state=rail'],
  ['messages', '/clubhouse-preview/messages?state=rail', { wide: 'button[aria-label="New message"]', phone: 'button[aria-label="New message"]' }],
  ['messages', '/clubhouse-preview/messages?state=rail', { phone: ['button[aria-label="New message"]', '.ch-msp-new button:has-text("Announcement")'] }],
  ['messages', '/clubhouse-preview/messages-player?state=rail', { phone: 'button[aria-label="New message"]' }],
  ['messages', '/clubhouse-preview/messages?state=files-failed', { phone: 'button[aria-label="Details"]' }],
  ['messages', '/clubhouse-preview/messages', { phone: ['button[aria-label="Details"]', '.ch-msp-details .ch-msp-link:has-text("Add")'] }],
  ['settings', '/clubhouse-preview/settings'],
  ['settings', '/clubhouse-preview/settings?section=notifications'],
  ['settings', '/clubhouse-preview/settings?section=team'],
  ['settings', '/clubhouse-preview/settings?section=coachhelm'],
  ['settings', '/clubhouse-preview/settings?section=preferences'],
  ['settings', '/clubhouse-preview/settings?state=player&section=golf'],
  ['settings', '/clubhouse-preview/settings?state=failed'],
  ['settings', '/clubhouse-preview/settings?state=loading'],
  ['qualifiers', '/clubhouse-preview/qualifiers'],
  ['qualifiers', '/clubhouse-preview/qualifiers?state=empty'],
  ['qualifiers', '/clubhouse-preview/qualifiers?state=failed'],
  ['qualifiers', '/clubhouse-preview/qualifiers?state=partial'],
  ['qualifiers', '/clubhouse-preview/qualifiers?state=loading'],
  ['qualifiers', '/clubhouse-preview/qualifiers-player'],
  ['qualifiers', '/clubhouse-preview/my-qualifiers'],
  ['qualifiers', '/clubhouse-preview/my-qualifiers?state=empty'],
  ['qualifiers', '/clubhouse-preview/qualifier?q=live'],
  ['qualifiers', '/clubhouse-preview/qualifier?q=upcoming'],
  ['qualifiers', '/clubhouse-preview/qualifier?q=selected'],
  ['qualifiers', '/clubhouse-preview/qualifier?q=completed'],
  ['qualifiers', '/clubhouse-preview/qualifier?state=failed'],
  ['qualifiers', '/clubhouse-preview/qualifier?state=scores'],
  ['qualifiers', '/clubhouse-preview/qualifier?state=partial&q=selected'],
  ['qualifiers', '/clubhouse-preview/qualifier?state=loading'],
  ['qualifiers', '/clubhouse-preview/qualifier?q=live', { wide: 'button[aria-label^="Show"]', phone: 'button[aria-label*=". Show "]' }],
  ['qualifiers', '/clubhouse-preview/qualifier?q=live', { wide: '.ch-qf-head button:has-text("Close qualifier")' }],
  ['qualifiers', '/clubhouse-preview/qualifier-player?q=live'],
  ['qualifiers', '/clubhouse-preview/qualifier-player?q=selected'],
  ['qualifiers', '/clubhouse-preview/qualifier-new'],
  ['qualifiers', '/clubhouse-preview/qualifier-new?state=failed'],
  ['qualifiers', '/clubhouse-preview/qualifier-new?state=noroster'],
  ['qualifiers', '/clubhouse-preview/qualifier-new?state=loading'],
  ['qualifiers', '/clubhouse-preview/qualifier-new', { wide: 'button:has-text("Create qualifier")' }],
  ['qualifiers', '/clubhouse-preview/qualifier-new', { wide: 'button:has-text("Choose")' }],
  ['qualifiers', '/clubhouse-preview/qualifier-edit'],
  ['qualifiers', '/clubhouse-preview/qualifier-edit?state=courses'],
  ['hub', '/clubhouse-preview/hub'],
  ['hub', '/clubhouse-preview/hub?state=empty'],
  ['hub', '/clubhouse-preview/hub?state=failed'],
  ['hub', '/clubhouse-preview/hub?tab=travel'],
  ['hub', '/clubhouse-preview/hub?tab=docs'],
  ['hub', '/clubhouse-preview/hub?tab=tasks'],
  ['hub', '/clubhouse-preview/hub-player'],
  ['hub', '/clubhouse-preview/hub-player?state=empty'],
  ['rounds', '/clubhouse-preview/rounds'],
  ['rounds', '/clubhouse-preview/rounds?state=empty'],
  ['rounds', '/clubhouse-preview/rounds?state=failed'],
  ['rounds', '/clubhouse-preview/round'],
  ['rounds', '/clubhouse-preview/round?state=coach'],
  ['rounds', '/clubhouse-preview/round?state=noshots'],
  ['rounds', '/clubhouse-preview/round?state=nosg'],
  ['rounds', '/clubhouse-preview/setup'],
  ['rounds', '/clubhouse-preview/setup?state=failcourses'],
  ['rounds', '/clubhouse-preview/track'],
  ['rounds', '/clubhouse-preview/track?state=putt'],
  ['rounds', '/clubhouse-preview/track?state=holed'],
  ['rounds', '/clubhouse-preview/track?state=card'],
  ['rounds', '/clubhouse-preview/entry?state=recovery'],
  ['rounds', '/clubhouse-preview/entry?state=conflict'],
  ['rounds', '/clubhouse-preview/entry?state=practice'],
  ['rounds', '/clubhouse-preview/entry?state=reload'],
  ['rounds', '/clubhouse-preview/entry?state=error'],
  ['classes', '/clubhouse-preview/classes'],
  ['classes', '/clubhouse-preview/classes?state=empty'],
  ['classes', '/clubhouse-preview/classes?state=failed'],
  ['classes', '/clubhouse-preview/classes?state=partial'],
  ['classes', '/clubhouse-preview/classes?state=noteam'],
  ['classes', '/clubhouse-preview/classes?state=loading'],
  ['coachhelm', '/clubhouse-preview/coachhelm'],
  ['coachhelm', '/clubhouse-preview/coachhelm?state=assigned'],
  ['coachhelm', '/clubhouse-preview/coachhelm?state=empty'],
  ['coachhelm', '/clubhouse-preview/coachhelm?state=failed'],
  ['coachhelm', '/clubhouse-preview/coachhelm?state=off'],
  ['coachhelm', '/clubhouse-preview/coachhelm?state=loading'],
  ['coachhelm', '/clubhouse-preview/coachhelm-player'],
  ['coachhelm', '/clubhouse-preview/coachhelm-player?state=empty'],
  ['coachhelm', '/clubhouse-preview/coachhelm-player?state=norounds'],
  ['coachhelm', '/clubhouse-preview/coachhelm-player?state=failed'],
  ['recruiting', '/clubhouse-preview/recruiting'],
  ['recruiting', '/clubhouse-preview/recruiting?state=empty'],
  ['recruiting', '/clubhouse-preview/recruiting?state=nomatch'],
  ['recruiting', '/clubhouse-preview/recruiting?state=failed'],
  ['recruiting', '/clubhouse-preview/recruiting?state=loading'],
  ['recruiting', '/clubhouse-preview/recruiting?state=sparse'],
  ['recruiting', '/clubhouse-preview/recruiting?state=noteam'],
  ['recruiting', '/clubhouse-preview/recruiting?state=detail'],
  ['recruiting', '/clubhouse-preview/recruiting?state=add'],
  ['recruiting', '/clubhouse-preview/recruiting?state=edit'],
  ['recruiting', '/clubhouse-preview/recruiting?state=delete'],
  ['recruiting', '/clubhouse-preview/recruiting?state=docsfailed'],
  ['recruiting', '/clubhouse-preview/recruiting', { phone: '.ch-recm-sort' }],
  ['recruiting', '/clubhouse-preview/recruiting?state=detail', { phone: '.ch-recm-tile.is-stage' }],
];

/**
 * Known violations waiting on an owner decision, each with its reason. A known
 * violation is still printed; it just doesn't fail the run. Keep this short.
 */
const KNOWN = [
  {
    page: 'calendar',
    width: 390,
    rule: 'target-size',
    reason: 'The 7-day week at 390px squeezes overlapping events; the phone Calendar waits for its approved phone spec (docs/clubhouse/phone/).',
  },
];
const isKnown = (page, width, rule) => KNOWN.some((k) => k.page === page && k.width === width && k.rule === rule);

/** Validate the entire request before launching any browser. */
export function scanOptions(env = process.env, only = []) {
  const list = (name, fallback, allowed) => {
    const values = (env[name] ?? fallback).split(',').map((value) => value.trim());
    if (values.some((value) => !value || (allowed && !allowed.includes(value)))) {
      throw new Error(`${name} must contain ${allowed?.join(', ') ?? 'positive integer dimensions'}`);
    }
    return [...new Set(values)];
  };
  const dimensions = (name, fallback) => list(name, fallback).map((value) => {
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10000) {
      throw new Error(`${name} must contain integer dimensions between 1 and 10000`);
    }
    return Number(value);
  });
  const names = new Set(CH_A11Y_PAGES.map(([name]) => name));
  const unknown = only.filter((name) => !names.has(name));
  if (unknown.length) throw new Error(`Unknown Clubhouse pages: ${unknown.join(', ')}. Available: ${[...names].join(', ')}`);
  const pages = only.length ? CH_A11Y_PAGES.filter(([name]) => only.includes(name)) : CH_A11Y_PAGES;
  if (!pages.length) throw new Error('No Clubhouse pages selected');
  const engines = list('CH_ENGINES', 'chromium', ['chromium', 'webkit', 'firefox']);
  const motions = list('CH_MOTION', 'reduce', ['reduce', 'no-preference']);
  const widths = dimensions('CH_WIDTHS', '1280,390');
  const heights = env.CH_HEIGHTS === undefined ? null : dimensions('CH_HEIGHTS', '844');
  return { pages, engines, motions, widths, heights };
}

async function main() {
  const { pages, engines, motions, widths, heights } = scanOptions(process.env, process.argv.slice(2));
  const browsers = await import('playwright');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  let failed = 0;
  let scanned = 0;
  for (const engine of engines) {
    const browser = await browsers[engine].launch();
    try {
    for (const motion of motions) for (const width of widths) for (const height of heights ?? [width < 600 ? 844 : 800]) {
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: motion });
    try {
    for (const [page, path, open] of pages) {
      const tab = await ctx.newPage();
      const response = await tab.goto(BASE + path, { waitUntil: 'networkidle', timeout: 240_000 });
      if (!response?.ok()) throw new Error(`Preview unavailable: ${path} (${response?.status() ?? 'no response'}). Use next dev; production previews return 404.`);
      const opener = open?.[width < 600 ? 'phone' : 'wide'];
      if (open && !opener) {
        await tab.close();
        continue;
      }
      // Only the Clubhouse tree: the dev overlay and Next's portal are not ours.
      const label = `${engine} ${motion} ${page.padEnd(12)} ${width}x${height} ${path}${opener ? ` (opened ${[opener].flat().join(' > ')})` : ''}`;
      let stuck = null;
      for (const step of [opener ?? []].flat()) {
        try {
          await tab.click(step, { timeout: 10_000 });
        } catch {
          stuck = step;
          break;
        }
        await tab.waitForTimeout(400);
      }
      if (stuck) {
        failed++;
        console.log(`FAIL ${label}\n     could not tap ${stuck}`);
        await tab.close();
        continue;
      }
      if (!opener) await tab.waitForTimeout(400);
      let res;
      try {
        res = await new AxeBuilder({ page: tab }).include('.ch-root').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      } catch (e) {
        failed++;
        console.log(`FAIL ${label}\n     did not render a Clubhouse page: ${String(e.message).split('\n')[0]}`);
        await tab.close();
        continue;
      }
      scanned++;
      // A phone page must never scroll sideways.
      if (width < 600) {
        const wide = await tab.evaluate(() => document.documentElement.scrollWidth);
        if (wide > width) {
          failed++;
          console.log(`FAIL ${label}\n     scrolls sideways: ${wide}px wide at ${width}px`);
        }
      }
      const blocking = res.violations.filter((v) => !isKnown(page, width, v.id));
      if (res.violations.length === 0) console.log(`ok   ${label}`);
      else {
        if (blocking.length) failed++;
        console.log(`${blocking.length ? 'FAIL' : 'known'} ${label}`);
        for (const v of res.violations) {
          if (isKnown(page, width, v.id)) {
            console.log(`     ${v.id} (known): ${KNOWN.find((k) => k.page === page && k.rule === v.id).reason}`);
            continue;
          }
          console.log(`     ${v.id} (${v.impact}): ${v.help}`);
          for (const n of v.nodes.slice(0, 4)) console.log(`       ${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
          if (v.nodes.length > 4) console.log(`       …and ${v.nodes.length - 4} more`);
        }
      }
      await tab.close();
    }
    } finally { await ctx.close(); }
    }
    } finally { await browser.close(); }
  }
  if (!scanned) throw new Error('No Clubhouse pages were scanned');
  console.log(failed ? `\nclubhouse:a11y: ${failed} page(s) with violations` : `\nclubhouse:a11y clean: ${scanned} page(s)`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`clubhouse:a11y: ${error.message}`); process.exitCode = 1; });
}
