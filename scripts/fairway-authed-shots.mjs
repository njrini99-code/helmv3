// Screenshot authed Fairway dashboard pages using the saved session.
// Run AFTER save-golf-auth.mjs. Usage:
//   node scripts/fairway-authed-shots.mjs [desktop|mobile] [label]
import { chromium } from 'playwright';
import fs from 'fs';
const STATE = process.env.AUTH_OUT || 'playwright/.auth/golf-demo.json';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const vp = process.argv[2] || 'desktop';
const label = process.argv[3] || 'authed';
if (!fs.existsSync(STATE)) { console.error(`✗ No saved session at ${STATE} — run save-golf-auth.mjs first.`); process.exit(1); }
const VPS = { desktop: { width: 1280, height: 1100 }, mobile: { width: 390, height: 844 } };
const ROUTES = [
  ['dashboard', '/golf/dashboard'],
  ['roster', '/golf/dashboard/roster'],
  ['rounds', '/golf/dashboard/rounds'],
  ['calendar', '/golf/dashboard/calendar'],
  ['stats', '/golf/dashboard/stats'],
  ['messages', '/golf/dashboard/messages'],
  ['announcements', '/golf/dashboard/announcements'],
  ['travel', '/golf/dashboard/travel'],
  ['documents', '/golf/dashboard/documents'],
  ['tasks', '/golf/dashboard/tasks'],
  ['qualifiers', '/golf/dashboard/qualifiers'],
  ['team', '/golf/dashboard/team'],
  ['settings', '/golf/dashboard/settings'],
  ['intelligence', '/golf/dashboard/intelligence'],
  ['recruiting', '/golf/dashboard/recruiting'],
  ['development', '/golf/dashboard/development'],
  ['courses', '/golf/dashboard/courses'],
];
const b = await chromium.launch();
const ctx = await b.newContext({ storageState: STATE, viewport: VPS[vp] || VPS.desktop, deviceScaleFactor: 2, isMobile: vp === 'mobile' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
let firstUrl = '';
for (const [name, route] of ROUTES) {
  try {
    await p.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(1500);
    if (!firstUrl) firstUrl = p.url();
    if (p.url().includes('/login')) { console.log(`AUTH-LOST at ${name} → ${p.url()}`); break; }
    const out = `/tmp/fw-${label}-${name}-${vp}.png`;
    await p.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${name} → ${out}`);
  } catch (e) { console.log(`✗ ${name}: ${e.message}`); }
}
if (errs.length) console.log('CONSOLE/PAGE ERRORS:\n' + errs.slice(0, 10).join('\n'));
await b.close();
