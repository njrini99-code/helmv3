// Headless-Chrome smoke test for the team-toggle build.
// Logs in as the demo coach and visits every coach surface touched in Phase B,
// asserting no console errors / page errors / 5xx / Next error overlay.
// Usage: node scripts/ui-smoke.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';
const EMAIL = process.env.SMOKE_EMAIL || 'demo@golfhelmdemo.com';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Demo2026';
const SHOTS = '/tmp/ui-shots';
mkdirSync(SHOTS, { recursive: true });

const SURFACES = [
  ['dashboard', '/golf/dashboard'],
  ['stats-team', '/golf/dashboard/stats/team'],
  ['roster', '/golf/dashboard/roster'],
  ['recruiting', '/golf/dashboard/recruiting'],
  ['travel', '/golf/dashboard/travel'],
  ['documents', '/golf/dashboard/documents'],
  ['announcements', '/golf/dashboard/announcements'],
  ['insights', '/golf/dashboard/insights'],
  ['intelligence', '/golf/dashboard/intelligence'],
  ['calendar', '/golf/dashboard/calendar'],
  ['tasks', '/golf/dashboard/tasks'],
  ['messages', '/golf/dashboard/messages'],
  ['development', '/golf/dashboard/development'],
  ['patterns', '/golf/dashboard/patterns'],
  ['alerts', '/golf/dashboard/alerts'],
  ['settings', '/golf/dashboard/settings'],
];

const results = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Per-navigation error buckets
let bucket = { console: [], pageerror: [], http5xx: [] };
page.on('console', (m) => {
  if (m.type() === 'error') {
    const t = m.text();
    // Ignore noise: favicon, ResizeObserver, third-party analytics blocked, etc.
    if (/favicon|ResizeObserver|net::ERR_|Failed to load resource: the server responded.*40[34]/.test(t)) return;
    bucket.console.push(t.slice(0, 300));
  }
});
page.on('pageerror', (e) => bucket.pageerror.push(String(e).slice(0, 300)));
page.on('response', (r) => {
  if (r.status() >= 500) bucket.http5xx.push(`${r.status()} ${r.url().replace(BASE, '')}`);
});

function resetBucket() { bucket = { console: [], pageerror: [], http5xx: [] }; }

async function errorTextPresent() {
  // Real error signals only. <nextjs-portal> ALWAYS exists in dev (devtools
  // container) so its mere presence is NOT an error — inspect its shadow root
  // for the actual error-overlay dialog, plus check rendered body text.
  return await page.evaluate(() => {
    const txt = document.body?.innerText || '';
    const textHit = /Application error: a (client|server)-side exception|Unhandled Runtime Error|Build Error|Internal Server Error|This page could not be found|missing required error components/i.test(txt);
    let overlayHit = false;
    const portal = document.querySelector('nextjs-portal');
    if (portal && portal.shadowRoot) {
      const sr = portal.shadowRoot.textContent || '';
      overlayHit = /Unhandled Runtime Error|Build Error|Failed to compile|Console Error/i.test(sr);
    }
    return textHit || overlayHit;
  });
}

// ---- Login ----
resetBucket();
await page.goto(`${BASE}/golf/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await page.click('button[type="submit"]');
let loginOk = true;
try {
  await page.waitForURL('**/golf/dashboard**', { timeout: 20000 });
} catch {
  loginOk = false;
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/00-after-login.png`, fullPage: false });
results.push({ surface: 'login', url: page.url(), httpStatus: 200, navOk: loginOk, overlay: await errorTextPresent(), ...bucket });

if (loginOk) {
  for (const [name, path] of SURFACES) {
    resetBucket();
    let navOk = true;
    let httpStatus = 0;
    try {
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
      httpStatus = resp?.status() ?? 0;
      // give RSC + client hydration a beat
      await page.waitForTimeout(2500);
    } catch (e) {
      navOk = false;
      bucket.pageerror.push(`NAV_FAIL: ${String(e).slice(0, 200)}`);
    }
    const overlay = await errorTextPresent();
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {});
    results.push({ surface: name, url: page.url(), navOk, httpStatus, overlay, ...bucket });
  }
}

await browser.close();

const summary = results.map((r) => ({
  surface: r.surface,
  ok: r.navOk && (r.httpStatus ? r.httpStatus < 400 : true) && !r.overlay && r.pageerror.length === 0 && r.http5xx.length === 0 && r.console.length === 0,
  httpStatus: r.httpStatus,
  overlay: r.overlay,
  console: r.console,
  pageerror: r.pageerror,
  http5xx: r.http5xx,
  url: r.url,
}));
writeFileSync(`${SHOTS}/report.json`, JSON.stringify(summary, null, 2));
const failed = summary.filter((s) => !s.ok);
console.log('=== UI SMOKE SUMMARY ===');
for (const s of summary) {
  console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.surface.padEnd(16)} ${s.overlay ? '[OVERLAY] ' : ''}${s.pageerror.length ? '[pageerr:' + s.pageerror.length + '] ' : ''}${s.http5xx.length ? '[5xx:' + s.http5xx.length + '] ' : ''}${s.console.length ? '[console:' + s.console.length + ']' : ''}`);
}
console.log(`\n${summary.length - failed.length}/${summary.length} surfaces clean. Shots+report in ${SHOTS}`);
if (failed.length) {
  console.log('\n=== FAILURE DETAIL ===');
  console.log(JSON.stringify(failed, null, 2));
  process.exit(1);
}
