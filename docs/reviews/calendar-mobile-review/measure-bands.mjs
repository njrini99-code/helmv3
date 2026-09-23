// Where does the phone's vertical budget go on the calendar home? Logs the
// y-range of every horizontal band from the top of the viewport to the first
// event card, for a role, against a base URL.
import { chromium, devices } from '@playwright/test';
import dotenv from 'dotenv'; dotenv.config({ path: '/Users/ricknini/worktrees/helmv3/calendar-makeover/.env.local' });
const BASE = process.env.CAPTURE_BASE ?? 'http://localhost:3013';
const role = process.env.ROLE ?? 'coach';
const email = role === 'coach' ? process.env.GOLFHELM_COACH_EMAIL : process.env.GOLFHELM_PLAYER_EMAIL;
const password = role === 'coach' ? process.env.GOLFHELM_COACH_PASSWORD : process.env.GOLFHELM_PLAYER_PASSWORD;
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 15'], baseURL: BASE, reducedMotion: 'reduce' });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } }).catch(() => {});
await p.goto('/golf/login');
await p.locator('#golf-signin-email').fill(email); await p.locator('#golf-signin-password').fill(password);
await p.getByRole('button', { name: 'Sign in' }).click();
await p.waitForURL(u => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 60000 });
await p.goto('/golf/dashboard/calendar');
await p.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30000 });
await p.waitForTimeout(1500);
const bands = await p.evaluate(() => {
  const vh = window.innerHeight, vw = window.innerWidth;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) }; };
  const byText = (txt, sel = '*') => Array.from(document.querySelectorAll(sel)).find(e => e.children.length === 0 && (e.textContent || '').trim() === txt);
  const q = (s) => document.querySelector(s);
  const h1 = q('h1');
  const rg = q('[role="radiogroup"][aria-label="Calendar view"]');
  const out = {
    viewport: { w: vw, h: vh },
    topBar: box(q('header') || q('[data-slot="fw-topbar"]') || byText('Calendar', 'span,h1,h2,div')?.closest('header,div')),
    hubSubNav: box(byText('Travel', 'a,span')?.closest('nav') || byText('Travel', 'a,span')?.closest('div')),
    heroSection: box(q('section[aria-label="Calendar controls"]') || h1?.closest('section')),
    heroTitleRow: box(h1?.parentElement?.parentElement),
    viewSwitcher: box(rg),
    viewSwitcherOptions: rg ? Array.from(rg.querySelectorAll('[role="radio"]')).map(r => ({ label: r.textContent.trim(), w: Math.round(r.getBoundingClientRect().width) })) : null,
    prevNext: box(document.querySelector('button[aria-label^="Previous"]')),
    teamRow: box(byText('Team schedule', 'span,div,p,h2,h3')?.closest('div')?.parentElement),
    peopleRow: box(byText('People', 'span,button')?.closest('button')?.parentElement),
    firstDayHeading: box(Array.from(document.querySelectorAll('h2,h3')).find(h => /September|October/.test(h.textContent))),
    firstEventCard: box(q('[aria-label*=" — "]')),
    primaryCta: box(q('button[aria-label="New event"], a[aria-label="New event"]') || byText('New event','span')?.closest('button,a') || byText('Respond','span')?.closest('button,a')),
    bottomNav: box(q('nav[aria-label="Primary"]')),
    stickyOffsetVar: getComputedStyle(document.documentElement).getPropertyValue('--golf-mobile-header-offset') || getComputedStyle(document.querySelector('#main-content') || document.body).getPropertyValue('--golf-mobile-header-offset'),
  };
  return out;
});
console.log(JSON.stringify({ base: BASE, role, ...bands }, null, 1));
await b.close();
