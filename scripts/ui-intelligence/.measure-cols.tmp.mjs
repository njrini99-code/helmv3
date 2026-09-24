import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3013';
const width = Number(process.argv[2] || 768);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height: 900 } });
const email = process.env.GOLFHELM_COACH_EMAIL;
const password = process.env.GOLFHELM_COACH_PASSWORD;
const login = await context.newPage();
await login.goto(`${BASE}/golf/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await login.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
await login.fill('#golf-signin-email', email);
await login.fill('#golf-signin-password', password);
await login.getByRole('button', { name: /sign in/i }).click();
await login.waitForURL((u) => !u.toString().includes('/golf/login'), { timeout: 60000 });
await login.close();

const page = await context.newPage();
await page.goto(`${BASE}/golf/dashboard/roster`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1500);

const result = await page.evaluate(() => {
  const table = document.querySelector('[data-slot="roster-table"]');
  if (!table) return { error: 'not found' };
  return Array.from(table.querySelectorAll('th')).map((th) => {
    const cs = getComputedStyle(th);
    return { text: th.textContent.trim(), display: cs.display, visible: th.getBoundingClientRect().width > 0 };
  });
});
console.log(`width=${width}`, JSON.stringify(result));
await browser.close();
