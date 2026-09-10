// Functional probe for the phone masthead: (1) the sticky day heading pins
// under the masthead when the list scrolls, (2) a horizontal touch swipe on the
// schedule turns the period, (3) the masthead publishes its height.
import { chromium, devices } from '@playwright/test';
import dotenv from 'dotenv'; dotenv.config({ path: '/Users/ricknini/worktrees/helmv3/calendar-makeover/.env.local' });
const BASE = process.env.CAPTURE_BASE ?? 'http://localhost:3013';
const OUT = process.env.CAPTURE_OUT ?? 'docs/reviews/calendar-mobile-review/captures-v2/coach/iphone15';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 15'], baseURL: BASE, hasTouch: true, reducedMotion: 'no-preference' });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } }).catch(() => {});
await p.goto('/golf/login');
await p.locator('#golf-signin-email').fill(process.env.GOLFHELM_COACH_EMAIL); await p.locator('#golf-signin-password').fill(process.env.GOLFHELM_COACH_PASSWORD);
await p.getByRole('button', { name: 'Sign in' }).click();
await p.waitForURL(u => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 60000 });
await p.goto('/golf/dashboard/calendar');
await p.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30000 });
await p.waitForTimeout(1200);
const heroVar = await p.evaluate(() => getComputedStyle(document.querySelector('section[aria-label="Calendar controls"]').parentElement).getPropertyValue('--fw-calendar-hero-h'));
console.log('hero var:', heroVar.trim());
const title = () => p.getByRole('heading', { level: 1 }).first().innerText();
console.log('title before:', await title());
// Touch swipe left across the schedule → next period.
const body = p.getByTestId('calendar-body');
const box = await body.boundingBox();
const y = box.y + 40, x0 = box.x + box.width - 40, x1 = box.x + 40;
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 6, y }] });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await p.waitForTimeout(500);
console.log('title after swipe left:', await title());
await p.screenshot({ path: `${OUT}/12-after-swipe-next.png` });
// Today appears now (we are away from today) — tap it.
await p.getByRole('button', { name: 'Today' }).click();
await p.waitForTimeout(400);
console.log('title after Today:', await title());
// Sticky heading: switch to Agenda with earlier events shown, scroll, snapshot.
const show = p.getByRole('button', { name: /Show \d+ earlier/ });
if (await show.count()) await show.click();
await p.waitForTimeout(300);
await p.evaluate(() => window.scrollTo({ top: 260 }));
await p.waitForTimeout(400);
const pinned = await p.evaluate(() => {
  const hero = document.querySelector('section[aria-label="Calendar controls"]').getBoundingClientRect();
  const heads = Array.from(document.querySelectorAll('section[aria-label] h2')).map(h => { const r = h.parentElement.getBoundingClientRect(); return { text: h.textContent, top: Math.round(r.top) }; });
  return { heroBottom: Math.round(hero.bottom), heads: heads.slice(0, 4) };
});
console.log('pinned:', JSON.stringify(pinned));
await p.screenshot({ path: `${OUT}/13-scrolled-sticky-heading.png` });
await b.close();
