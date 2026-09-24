// Untracked probe: open the coach player dossier at the widths the capture
// script does not cover (768 / 1024 / 1280) and report clipping + overflow.
// usage: node scripts/ui-intelligence/.roster-player-width-probe.tmp.mjs <route> <outdir>
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { chromium } from '@playwright/test';

const [route, outdir, widthsArg] = process.argv.slice(2);
const BASE = process.env.GOLFHELM_BASE_URL || 'http://localhost:3013';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTHS = widthsArg ? widthsArg.split(',').map(Number) : [768, 1024, 1280];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const email = process.env.GOLFHELM_COACH_EMAIL;
const password = process.env.GOLFHELM_COACH_PASSWORD;
if (!email || !password) { console.error('credentials missing'); process.exit(1); }

// Same hydration-safe submit the capture script uses: `fill` before React
// attaches is thrown away and leaves Sign in permanently disabled.
const login = await context.newPage();
let ok = false;
for (let i = 1; i <= 6 && !ok; i++) {
 try {
  await login.goto(`${BASE}/golf/login`, { timeout: 90_000, waitUntil: 'domcontentloaded' });
  await login.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await sleep(600);
  await login.fill('#golf-signin-email', email);
  await login.fill('#golf-signin-password', password);
  const submit = login.getByRole('button', { name: /sign in/i });
  let enabled = await submit.isEnabled().catch(() => false);
  for (let t = 0; t < 6 && !enabled; t++) {
    await sleep(700);
    for (const [sel, value] of [['#golf-signin-email', email], ['#golf-signin-password', password]]) {
      const field = login.locator(sel);
      await field.fill('').catch(() => {});
      await field.pressSequentially(value, { delay: 5 }).catch(() => {});
    }
    enabled = await submit.isEnabled().catch(() => false);
  }
  if (!enabled) { console.log(`login attempt ${i}: Sign in never enabled; retrying`); continue; }
  const clicked = await submit.click({ timeout: 8_000 }).then(() => true).catch(() => false);
  if (!clicked) { console.log(`login attempt ${i}: click did not land; retrying`); continue; }
  ok = await login.waitForURL((u) => !u.toString().includes('/golf/login'), { timeout: 30_000 }).then(() => true).catch(() => false);
 } catch (e) { console.log(`login attempt ${i}: ${e.message.split('\n')[0]}`); await sleep(5000); }
}
await login.close();
if (!ok) { console.error('login failed'); process.exit(1); }

const page = await context.newPage();
for (const width of WIDTHS) {
  let report = null;
  for (let attempt = 1; attempt <= 3 && (report == null || report.bars === 0); attempt++) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}${route}`, { timeout: 120_000, waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
  await sleep(4000);
  report = await page.evaluate(() => {
    const clipped = [];
    const check = (sel, name) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 1) {
          clipped.push(`${name}: "${(el.textContent || '').trim().slice(0, 40)}" ${el.clientWidth}<${el.scrollWidth}`);
        }
      });
    };
    check('[data-slot="sg-ledger"] span', 'sg');
    check('[data-slot="field-readouts"] dt', 'readout-label');
    check('[data-slot="round-log"] td', 'table-cell');
    check('[data-slot="focus-ledger"] span', 'focus');
    const strip = document.querySelector('[data-slot="round-strip"]');
    const bars = document.querySelectorAll('[data-slot="round-strip"] a').length;
    const sgRow = document.querySelector('[data-slot="sg-ledger"] li:nth-child(4) a');
    const cells = sgRow ? Array.from(sgRow.children).map((c) => Math.round(c.getBoundingClientRect().width)) : [];
    const ledger = document.querySelector('[data-slot="sg-ledger"]');
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      stripWidth: strip ? Math.round(strip.getBoundingClientRect().width) : null,
      bars,
      ledgerWidth: ledger ? Math.round(ledger.getBoundingClientRect().width) : null,
      sgRowCells: cells,
      clipped: clipped.slice(0, 12),
    };
  }).catch(() => null);
  }
  console.log(`\n== ${width}px ==`);
  console.log(JSON.stringify(report, null, 1));
  await page.screenshot({ path: `${outdir}/roster-player__${width}.png`, fullPage: true });
}
await browser.close();
