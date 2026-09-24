import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3013';
const OUT = 'ui-intelligence/facelift/captures/coach';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const email = process.env.GOLFHELM_COACH_EMAIL;
const pw = process.env.GOLFHELM_COACH_PASSWORD;
if (!email || !pw) { console.log('MISSING CREDS'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

let ok = false;
for (let a = 1; a <= 4 && !ok; a++) {
  await page.goto(`${BASE}/golf/login`, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await sleep(800);
  await page.locator('#golf-signin-email').fill('').catch(() => {});
  await page.locator('#golf-signin-email').pressSequentially(email, { delay: 5 }).catch(() => {});
  await page.locator('#golf-signin-password').fill('').catch(() => {});
  await page.locator('#golf-signin-password').pressSequentially(pw, { delay: 5 }).catch(() => {});
  const btn = page.getByRole('button', { name: /sign in/i });
  if (!(await btn.isEnabled().catch(() => false))) { console.log(`login attempt ${a}: button disabled`); continue; }
  await btn.click({ timeout: 20000 }).catch(() => {});
  ok = await page.waitForURL((u) => !u.toString().includes('/golf/login'), { timeout: 60000 }).then(() => true).catch(() => false);
  if (!ok) console.log(`login attempt ${a} did not leave /golf/login`);
}
if (!ok) { console.log('LOGIN FAILED'); await browser.close(); process.exit(1); }

// The dev server's memory watchdog restarts it under four-agent load, so a
// single goto is not enough; retry, and gate on real content rather than on
// load state (the official pipeline does not, which is how it photographed
// the skeleton twice).
let landed = false;
for (let a = 1; a <= 4 && !landed; a++) {
  const nav = await page
    .goto(`${BASE}/golf/dashboard/tasks`, { waitUntil: 'domcontentloaded', timeout: 180000 })
    .then(() => true)
    .catch((e) => { console.log(`goto attempt ${a}: ${e.name}`); return false; });
  if (!nav) { await sleep(5000); continue; }
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  landed = await page
    .waitForSelector('[data-slot="verdict"]', { timeout: 90000 })
    .then(() => true)
    .catch(() => { console.log(`attempt ${a}: verdict never appeared`); return false; });
}
if (!landed) { console.log('NEVER RENDERED REAL CONTENT'); await browser.close(); process.exit(2); }
await sleep(1500);
await page.addStyleTag({ content: '*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important} nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}' }).catch(() => {});

const state = await page.evaluate(() => ({
  verdict: document.querySelector('[data-slot="verdict"]')?.textContent ?? null,
  field: !!document.querySelector('[data-slot="due-field"]'),
  lanes: document.querySelectorAll('[data-slot="due-field"] [role="rowgroup"] > [role="row"]').length,
  ledgerHeads: [...document.querySelectorAll('h2')].map((h) => h.textContent),
  tableRows: document.querySelectorAll('[data-slot="tasks-ledger"] tbody tr').length,
  stageText: document.querySelector('[data-slot="due-field"]')?.innerText?.slice(0, 600) ?? null,
}));
console.log(JSON.stringify(state, null, 1));

const measureH = () =>
  page.evaluate(() =>
    Math.min(Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)), 9000),
  );

for (const w of [390, 768, 1024, 1280, 1440]) {
  for (let a = 1; a <= 3; a++) {
    try {
      await page.setViewportSize({ width: w, height: 900 });
      await sleep(900);
      const h = await measureH();
      await page.setViewportSize({ width: w, height: h });
      await sleep(500);
      await page.screenshot({ path: `${OUT}/tasks__w${w}__full.png`, fullPage: false });
      console.log(`shot ${w} h=${h}`);
      break;
    } catch (e) {
      // Next dev's fast refresh can navigate out from under the evaluate.
      console.log(`shot ${w} attempt ${a} lost the context (${e.name}); reloading`);
      await page.goto(`${BASE}/golf/dashboard/tasks`, { waitUntil: 'domcontentloaded', timeout: 180000 }).catch(() => {});
      await page.waitForSelector('[data-slot="verdict"]', { timeout: 90000 }).catch(() => {});
      await sleep(1200);
    }
  }
  await page.setViewportSize({ width: w, height: 900 }).catch(() => {});
}
// Overflow check at each width.
for (const w of [390, 768, 1024, 1280, 1440]) {
  await page.setViewportSize({ width: w, height: 900 });
  await sleep(700);
  const over = await page.evaluate(() => ({
    docScrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  console.log(`overflow w=${w} scrollW=${over.docScrollW} clientW=${over.clientW} ${over.docScrollW > over.clientW + 1 ? 'HORIZONTAL OVERFLOW' : 'ok'}`);
}
await browser.close();
