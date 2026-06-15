// Generate App Store screenshots from the LIVE app at iPhone 6.7" (1290 x 2796).
//
//   node scripts/gen-appstore-screenshots.mjs
//
// Targets production (no local server needed). Logs in with the demo coach,
// captures the key screens to ios/appstore/screenshots/. For the crispest result
// you can instead recapture on the iOS Simulator — but these are submittable.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SHOT_BASE_URL || 'https://www.helmsportslabs.com';
const EMAIL = process.env.SHOT_EMAIL || 'demo@golfhelmdemo.com';
const PASSWORD = process.env.SHOT_PASSWORD || 'Demo2026';
const OUT = 'ios/appstore/screenshots';
mkdirSync(OUT, { recursive: true });

// App Store 6.7" = exactly 1290 x 2796 px. Pin the CSS viewport to 430 x 932 at
// DPR 3 (the device descriptor's *visible* height is shorter, which yields the
// wrong 1290x2220 — App Store Connect requires the exact size).
const device = devices['iPhone 14 Pro Max'];
const SHOT_VIEWPORT = { width: 430, height: 932 };

const SCREENS = [
  { name: '1-stats',      path: '/golf/dashboard/stats' },
  { name: '2-dashboard',  path: '/golf/dashboard' },
  { name: '3-recruiting', path: '/golf/dashboard/recruiting' },
  { name: '4-calendar',   path: '/golf/dashboard/calendar' },
  { name: '5-roster',     path: '/golf/dashboard/roster' },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  userAgent: device.userAgent,
  viewport: SHOT_VIEWPORT,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

try {
  await page.goto(`${BASE}/golf/login`, { waitUntil: 'networkidle', timeout: 60000 });

  // Resilient field locators.
  const email = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
  const password = page.locator('input[type="password"], input[name="password"]').first();
  await email.fill(EMAIL, { timeout: 30000 });
  await password.fill(PASSWORD);

  const submit = page.getByRole('button', { name: /sign in|log ?in|continue/i }).first();
  await submit.click();

  // Wait until we've left the login route.
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);

  for (const s of SCREENS) {
    await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500); // let charts/animations settle
    await page.screenshot({ path: `${OUT}/${s.name}.png` });
    console.log(`captured ${s.name} → ${OUT}/${s.name}.png`);
  }
} catch (err) {
  console.error('screenshot run failed:', err.message);
  await page.screenshot({ path: `${OUT}/_debug-last.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
