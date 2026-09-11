import { chromium, devices } from '@playwright/test';
import dotenv from 'dotenv'; dotenv.config({ path: '/Users/ricknini/worktrees/helmv3/calendar-makeover/.env.local' });
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 15'], baseURL: 'http://localhost:3013' });
const p = await ctx.newPage(); p.setDefaultTimeout(120000); p.setDefaultNavigationTimeout(120000);
await p.goto('/golf/login');
await p.locator('#golf-signin-email').fill(process.env.GOLFHELM_COACH_EMAIL); await p.locator('#golf-signin-password').fill(process.env.GOLFHELM_COACH_PASSWORD);
await p.getByRole('button', { name: 'Sign in' }).click();
await p.waitForURL(u => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 60000 });
await p.goto('/golf/dashboard/calendar');
await p.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 30000 });
await p.waitForTimeout(1200);
const all = p.getByRole('button', { name: 'New event' });
console.log('count', await all.count(), 'visible', await all.filter({ visible: true }).count());
for (let i = 0; i < await all.count(); i++) console.log(i, await all.nth(i).isVisible(), await all.nth(i).boundingBox());
try { await all.filter({ visible: true }).first().click({ timeout: 5000 }); console.log('clicked ok'); await p.waitForTimeout(800); console.log('dialog', await p.getByRole('dialog').count()); } catch (e) { console.log('click error:', String(e.message).split('\n').slice(0, 6).join(' | ')); }
await b.close();
