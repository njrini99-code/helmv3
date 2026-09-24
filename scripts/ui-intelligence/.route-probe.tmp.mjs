// Untracked probe: log in as a persona, open one route at an arbitrary width,
// screenshot it full page, and print console/network errors.
// usage: node scripts/ui-intelligence/.route-probe.tmp.mjs <route> <out.png> [width] [persona]
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { chromium } from '@playwright/test';

const [route, out, widthArg = '1280', persona = 'coach'] = process.argv.slice(2);
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
for (let i = 1; i <= 4 && !ok; i++) {
  await login.goto(`${BASE}/golf/login`, { timeout: 90_000, waitUntil: 'domcontentloaded' });
  await login.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await sleep(600);
  await login.fill('#golf-signin-email', email);
  await login.fill('#golf-signin-password', password);
  await login.getByRole('button', { name: /sign in/i }).click();
  ok = await login.waitForURL((u) => !u.toString().includes('/golf/login'), { timeout: 30_000 }).then(() => true).catch(() => false);
}
await login.close();
if (!ok) { console.error('login failed'); process.exit(1); }

const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
page.on('requestfailed', (r) => errors.push(`net: ${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ''}`));
await page.goto(`${BASE}${route}`, { timeout: 120_000, waitUntil: 'domcontentloaded' });
await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
await sleep(2500);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
await page.screenshot({ path: out, fullPage: true });
console.log(`shot ${out} at ${width}px, horizontal overflow ${overflow}px`);
for (const e of errors.slice(0, 12)) console.log(e);
await browser.close();
