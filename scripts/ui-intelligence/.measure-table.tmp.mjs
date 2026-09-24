import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3013';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
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
  const wrapper = document.querySelector('[data-slot="roster-table"]')?.parentElement;
  const table = document.querySelector('[data-slot="roster-table"]');
  if (!wrapper || !table) return { error: 'not found' };
  const headers = Array.from(table.querySelectorAll('th')).map((th) => ({
    text: th.textContent,
    accessibleName: th.getAttribute('aria-label') || th.textContent,
    rect: th.getBoundingClientRect(),
  }));
  const firstRowCells = Array.from(table.querySelectorAll('tbody tr:first-child td')).map((td) => ({
    text: td.textContent,
    rect: td.getBoundingClientRect(),
  }));
  return {
    wrapperScrollWidth: wrapper.scrollWidth,
    wrapperClientWidth: wrapper.clientWidth,
    internalOverflow: wrapper.scrollWidth - wrapper.clientWidth,
    headers,
    firstRowCells,
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
