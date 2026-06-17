// One-time login → saves an authenticated Playwright session for screenshotting.
// YOU run this (you own the login). Usage:
//   DEMO_PW='your-demo-password' node scripts/save-golf-auth.mjs
// Optional: DEMO_EMAIL=... BASE_URL=http://localhost:3000 AUTH_OUT=playwright/.auth/golf-demo.json
import { chromium } from 'playwright';
const EMAIL = process.env.DEMO_EMAIL || 'demo@golfhelmdemo.com';
const PW = process.env.DEMO_PW;
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = process.env.AUTH_OUT || 'playwright/.auth/golf-demo.json';
if (!PW) { console.error('✗ Set DEMO_PW=... (the demo coach password). Aborting — no password entered.'); process.exit(1); }
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(`${BASE}/golf/login`, { waitUntil: 'networkidle', timeout: 60000 });
await p.fill('input[type="email"]', EMAIL);
await p.fill('input[type="password"]', PW);
await Promise.all([
  p.waitForURL('**/golf/dashboard**', { timeout: 30000 }).catch(() => {}),
  p.click('button[type="submit"]'),
]);
await p.waitForTimeout(2000);
const url = p.url();
if (url.includes('/login')) {
  console.error('✗ Login failed — still on the login page. Check DEMO_EMAIL/DEMO_PW.');
  await b.close(); process.exit(2);
}
await ctx.storageState({ path: OUT });
console.log(`✓ Saved authenticated session → ${OUT} (landed at ${url}). You can close this; Claude takes over from here.`);
await b.close();
