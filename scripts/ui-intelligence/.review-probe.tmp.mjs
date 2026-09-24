// Untracked probe: log in as a persona and screenshot ONE round's review page,
// so the holes/shots path can be seen on a round the facelift capture set does
// not cover. Prints console + network errors and any horizontal overflow.
// usage: node scripts/ui-intelligence/.review-probe.tmp.mjs <roundId> <out.png> [width] [persona]
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { chromium } from '@playwright/test';

const [roundId, out, widthArg = '1440', persona = 'coach'] = process.argv.slice(2);
if (!roundId || !out) {
  console.error('usage: .review-probe.tmp.mjs <roundId> <out.png> [width] [persona]');
  process.exit(1);
}
const BASE = process.env.GOLFHELM_BASE_URL || 'http://localhost:3013';
const width = Number(widthArg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
const email = process.env[`GOLFHELM_${persona.toUpperCase()}_EMAIL`];
const password = process.env[`GOLFHELM_${persona.toUpperCase()}_PASSWORD`];
if (!email || !password) { console.error('credentials missing'); process.exit(1); }

const login = await context.newPage();
let ok = false;
for (let i = 1; i <= 6 && !ok; i++) {
  // The dev server restarts itself under memory pressure, so every step here
  // is retried rather than fatal: a cold compile can take well over a minute.
  try {
    await login.goto(`${BASE}/golf/login`, { timeout: 300_000, waitUntil: 'domcontentloaded' });
    await login.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await login.waitForSelector('#golf-signin-email', { timeout: 120_000 });
    await sleep(600);
    await login.fill('#golf-signin-email', email);
    await login.fill('#golf-signin-password', password);
    const submit = login.getByRole('button', { name: /sign in/i });
    // Same defect the capture script hit (fixed there in 80b719c2e): `fill`
    // writes the DOM value directly, and a fill that lands before React
    // hydrates is discarded when React attaches. The form LOOKS filled and
    // Sign in stays dead, so a plain click burns its whole timeout against a
    // control that will never enable. Typing after hydration registers.
    let enabled = await submit.isEnabled().catch(() => false);
    if (!enabled) {
      for (const [sel, value] of [['#golf-signin-email', email], ['#golf-signin-password', password]]) {
        const field = login.locator(sel);
        await field.fill('').catch(() => {});
        if (typeof field.pressSequentially === 'function') await field.pressSequentially(value, { delay: 5 }).catch(() => {});
        else await field.type(value, { delay: 5 }).catch(() => {});
      }
      enabled = await submit.isEnabled().catch(() => false);
    }
    if (!enabled) { console.error(`login attempt ${i}: Sign in never enabled (form not hydrated)`); await sleep(3_000); continue; }
    const clicked = await submit.click({ timeout: 8_000 }).then(() => true).catch(() => false);
    if (!clicked) { console.error(`login attempt ${i}: submit click did not land`); await sleep(3_000); continue; }
    ok = await login.waitForURL((u) => !u.toString().includes('/golf/login'), { timeout: 60_000 }).then(() => true).catch(() => false);
  } catch (err) {
    console.error(`login attempt ${i} failed: ${String(err).slice(0, 120)}`);
    await sleep(5_000);
  }
}
await login.close();
if (!ok) { console.error('login failed'); process.exit(1); }

const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
page.on('requestfailed', (r) => errors.push(`net: ${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ''}`));
await page.goto(`${BASE}/golf/dashboard/rounds/${roundId}/review`, { timeout: 300_000, waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
// Wait for the page's OWN content, not just the network. The review page
// mounts on skeletons and fetches the round, the stored review, the shots and
// the averages, so on a busy dev server a fixed sleep screenshots the loading
// surface. The verdict only renders once the round and the review are in.
const painted = await page
  .waitForSelector('[data-slot="verdict"]', { timeout: 120_000 })
  .then(() => true)
  .catch(() => false);
if (!painted) console.error('WARNING: verdict never rendered; this shot is a loading or error surface');
await sleep(2500);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shape = await page.evaluate(() => {
  const el = document.querySelector('[data-slot="hole-field"]');
  const table = document.querySelector('[data-slot="hole-ledger"]');
  return {
    columns: el ? el.querySelectorAll('button').length : 0,
    polyline: el ? el.querySelectorAll('polyline').length : 0,
    tableRows: table ? table.querySelectorAll('tbody tr').length : 0,
    verdict: document.querySelector('[data-slot="verdict"]')?.textContent ?? null,
  };
});
await page.screenshot({ path: out, fullPage: true });
console.log(`shot ${out} at ${width}px, horizontal overflow ${overflow}px`);
console.log(JSON.stringify(shape));
for (const e of errors.slice(0, 12)) console.log(e);
await browser.close();
