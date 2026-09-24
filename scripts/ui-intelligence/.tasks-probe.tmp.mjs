import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3013';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const email = process.env.GOLFHELM_COACH_EMAIL;
const pw = process.env.GOLFHELM_COACH_PASSWORD;
if (!email || !pw) { console.log('MISSING CREDS'); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 240)));

await page.goto(`${BASE}/golf/login`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
await sleep(800);
await page.locator('#golf-signin-email').pressSequentially(email, { delay: 5 });
await page.locator('#golf-signin-password').pressSequentially(pw, { delay: 5 });
await page.getByRole('button', { name: /sign in/i }).click({ timeout: 20000 });
await page.waitForURL((u) => !u.toString().includes('/golf/login'), { timeout: 60000 });

await page.goto(`${BASE}/golf/dashboard/tasks`, { waitUntil: 'domcontentloaded', timeout: 120000 });
for (const t of [3000, 5000, 7000, 10000, 15000]) {
  await sleep(t);
  const s = await page.evaluate(() => ({
    busy: !!document.querySelector('[role="status"][aria-busy="true"]'),
    field: !!document.querySelector('[data-slot="due-field"]'),
    verdict: document.querySelector('[data-slot="verdict"]')?.textContent?.slice(0, 220) ?? null,
    lanes: document.querySelectorAll('[data-slot="due-field"] [role="rowgroup"] [role="row"]').length,
    ledger: !!document.querySelector('[data-slot="tasks-ledger"]'),
    tableRows: document.querySelectorAll('[data-slot="tasks-ledger"] tbody tr').length,
  }));
  console.log(JSON.stringify(s));
  if (s.verdict) break;
}
console.log('ERRORS ' + JSON.stringify(errors.slice(0, 6)));
await browser.close();
