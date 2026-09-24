// Temp width probe for the Intelligence field sheet. LANGUAGE.md asks for 768,
// 1024, 1280 and 1440, and the shared capture script only ships 393 + 1440.
// Untracked, deleted after the review.
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3013';
const OUT = path.join(process.cwd(), 'ui-intelligence', 'facelift', 'captures', 'coach');
const WIDTHS = [768, 1024, 1280];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(page, ms = 900) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await sleep(ms);
}
async function freeze(page) {
  await page.addStyleTag({ content: '*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important} nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}' }).catch(() => {});
}
async function login(context) {
  const email = process.env.GOLFHELM_COACH_EMAIL;
  const password = process.env.GOLFHELM_COACH_PASSWORD;
  if (!email || !password) throw new Error('coach credentials missing from .env.local');
  const page = await context.newPage();
  let ok = false;
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    await page.goto(`${BASE}/golf/login`, { timeout: 180_000, waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await sleep(600);
    await page.fill('#golf-signin-email', email);
    await page.fill('#golf-signin-password', password);
    const submit = page.getByRole('button', { name: /sign in/i });
    let enabled = await submit.isEnabled().catch(() => false);
    if (!enabled) {
      for (const [sel, value] of [['#golf-signin-email', email], ['#golf-signin-password', password]]) {
        const field = page.locator(sel);
        await field.fill('').catch(() => {});
        await field.pressSequentially(value, { delay: 5 }).catch(() => {});
      }
      enabled = await submit.isEnabled().catch(() => false);
    }
    if (!enabled) { console.log(`login attempt ${attempt}: never enabled`); continue; }
    const clicked = await submit.click({ timeout: 8_000 }).then(() => true).catch(() => false);
    if (!clicked) { console.log(`login attempt ${attempt}: click did not land`); continue; }
    ok = await page.waitForURL((u) => !u.toString().includes('/golf/login'), { timeout: 30_000 }).then(() => true).catch(() => false);
  }
  if (!ok) throw new Error('login did not complete');
  await settle(page, 1500);
  await page.close();
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
await login(context);
const page = await context.newPage();
for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/golf/dashboard/intelligence`, { timeout: 180_000, waitUntil: 'domcontentloaded' }).catch(() => {});
  await settle(page, 2500);
  // The route can still be streaming its Suspense fallback; wait for the real
  // masthead before shooting, or the shot captures loading.tsx.
  await page.waitForSelector('[data-slot="verdict"]', { timeout: 60_000 }).catch(() => {});
  await sleep(800);
  await freeze(page);
  const h = Math.min(Math.max(await page.evaluate(() => document.documentElement.scrollHeight), 900), 9000);
  await page.setViewportSize({ width, height: h });
  await sleep(400);
  const file = path.join(OUT, `intelligence__w${width}__full.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`w${width} -> ${file} (${h}px tall)`);
}
await browser.close();
