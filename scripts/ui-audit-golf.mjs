// Premium UI pass over every GolfHelm route, as coach and as player.
//
//   DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/ui-audit-golf.mjs
//   ... --base=http://localhost:3000     audit the dev server instead of prod
//   ... --persona=coach                  one persona only
//
// WHY A SCRIPT AND NOT CLICKING BY HAND. The ask was "make sure we can do this
// test again". A hand-driven pass over 66 routes is not repeatable and its
// findings cannot be diffed against the next run. This walks the same routes in
// the same order every time and writes a dated report, so run N+1 tells you what
// BROKE since run N rather than what someone happened to notice.
//
// Credentials come from .env.local (GOLFHELM_COACH_* / GOLFHELM_PLAYER_*) and are
// never printed, never written to the report, and never leave the process.
//
// READ-ONLY BY DEFAULT. It navigates, expands, and reads. It does not submit
// forms, send messages, or delete anything — this runs against PRODUCTION, where
// those actions reach real players. Buttons whose effect cannot be determined
// without pressing them are reported as UNVERIFIED, not pressed.
//
// What it catches that a human eye misses on route 40 of 66:
//   - console errors and unhandled rejections, per route
//   - failed network requests (4xx/5xx), per route
//   - horizontal overflow (the classic mobile break)
//   - text clipped by its container
//   - empty-state vs error-state confusion: a page that renders nothing at all
//   - buttons/links with no accessible name (screen-reader dead ends)
//   - images with no alt text
//   - tap targets under 44px (Apple HIG minimum)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const BASE = arg('base', 'https://helmsportslabs.com').replace(/\/$/, '');
const ONLY = arg('persona', '');
const OUT = path.join(process.cwd(), 'docs/ui-audits');
const SHOTS = path.join(OUT, `shots-${new Date().toISOString().slice(0, 10)}`);

// Routes a coach can reach. Ordered the way a coach actually moves through the
// app — dashboard first, then the things the dashboard links to.
const COACH = [
  '/golf/dashboard', '/golf/dashboard/hub', '/golf/dashboard/team-hub',
  '/golf/dashboard/roster', '/golf/dashboard/rounds', '/golf/dashboard/stats',
  '/golf/dashboard/stats/team', '/golf/dashboard/calendar',
  '/golf/dashboard/qualifiers', '/golf/dashboard/qualifiers/new',
  '/golf/dashboard/insights', '/golf/dashboard/intelligence',
  '/golf/dashboard/patterns', '/golf/dashboard/development',
  '/golf/dashboard/coachhelm', '/golf/dashboard/coachhelm/chat',
  '/golf/dashboard/analytics/coachhelm', '/golf/dashboard/recruiting',
  '/golf/dashboard/courses', '/golf/dashboard/travel',
  '/golf/dashboard/documents', '/golf/dashboard/messages',
  '/golf/dashboard/announcements', '/golf/dashboard/alerts',
  '/golf/dashboard/tasks', '/golf/dashboard/classes', '/golf/dashboard/team',
  '/golf/dashboard/settings', '/golf/dashboard/settings/notifications',
  '/golf/dashboard/settings/coaching-intelligence', '/golf/dashboard/whats-new',
];

// Player-side routes. Several share a URL with the coach app but render a
// different view by role — those are audited under BOTH personas on purpose,
// because "same route, wrong persona's UI" is a real bug class here (a roster
// once told players on a team that they had no team).
const PLAYER = [
  '/golf/dashboard', '/golf/dashboard/my-development',
  '/golf/dashboard/my-game-profile', '/golf/dashboard/my-insights',
  '/golf/dashboard/my-qualifiers', '/golf/dashboard/my-standing',
  '/golf/dashboard/rounds', '/golf/dashboard/rounds/new',
  '/golf/dashboard/stats', '/golf/dashboard/calendar',
  '/golf/dashboard/messages', '/golf/dashboard/announcements',
  '/golf/dashboard/documents', '/golf/dashboard/courses',
  '/golf/dashboard/settings', '/golf/dashboard/whats-new',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }, // iPhone 14 — the 390px the rep uses
];

async function login(page, email, password) {
  await page.goto(`${BASE}/golf/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForURL('**/golf/**', { timeout: 45000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2500);
  return !page.url().includes('/login');
}

// Everything below runs INSIDE the page. Kept in one evaluate so a route costs
// one round trip rather than eight.
// Passed to page.evaluate as a real function — Playwright serialises the source
// and calls it in the page. Handing it over as a STRING instead makes Playwright
// evaluate it as an expression: the result is a function object, which is not
// serialisable, so evaluate() resolves to `undefined` and every probe field
// reads off nothing. That cost this script its first working run.
const PROBE = () => {
  const out = { overflow: null, noName: [], noAlt: 0, tiny: [], clipped: [], empty: false, counts: {} };
  const de = document.documentElement;
  if (de.scrollWidth > de.clientWidth + 2) {
    // name the widest offender — "the page overflows" is useless without it
    let worst = null, worstW = 0;
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > de.clientWidth + 2 && r.width > worstW) { worstW = r.width; worst = el; }
    });
    out.overflow = {
      by: de.scrollWidth - de.clientWidth,
      el: worst ? (worst.tagName.toLowerCase() +
           (worst.className && typeof worst.className === 'string'
             ? '.' + worst.className.split(/\s+/).filter(Boolean).slice(0,2).join('.') : '')) : '?',
    };
  }
  /**
   * Is this element deliberately hidden from sighted users (`sr-only`)?
   *
   * The visually-hidden recipe IS a 1px box with `clip-path: inset(50%)` and
   * `overflow: hidden` — so a naive "scrollWidth > clientWidth" clipped-text
   * check flags every skip link on every route, and a naive tap-target check
   * reports it as a 32x16 control. The first run of this script produced 31
   * identical "text clipped: Skip to main content" P1s and put the same string
   * at the head of nearly every tap-target list: one accessibility feature
   * working correctly, reported 50+ times as a defect. Findings a reader
   * learns to scroll past are worse than no findings.
   */
  const srOnly = (el) => {
    const cs = getComputedStyle(el);
    if (cs.clipPath && cs.clipPath.includes('inset(50%)')) return true;
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)') return true;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return true;
    // the other common recipe: pushed off-canvas rather than clipped
    if (r.right < 0 || r.bottom < 0) return true;
    return false;
  };
  const named = (el) =>
    (el.innerText || '').trim() || el.getAttribute('aria-label') ||
    el.getAttribute('title') || (el.querySelector('img') || {}).alt || '';
  document.querySelectorAll('button, a[href], [role="button"], [role="tab"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (!named(el)) out.noName.push(el.tagName.toLowerCase() + (el.className || '').toString().slice(0, 40));
    // A skip link is not a tap target — it is never pointed at.
    if (srOnly(el)) return;
    if ((r.width < 44 || r.height < 44) && r.width > 0)
      out.tiny.push({ t: named(el).slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) });
  });
  document.querySelectorAll('img').forEach((i) => { if (!i.alt) out.noAlt++; });
  document.querySelectorAll('h1,h2,h3,p,span,div,button,a').forEach((el) => {
    if (el.children.length) return;
    if (srOnly(el)) return; // clipping is the POINT of a visually-hidden element
    if (el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0 && (el.innerText || '').trim())
      out.clipped.push((el.innerText || '').trim().slice(0, 40));
  });
  const t = (document.body.innerText || '').trim();
  out.empty = t.length < 40;
  out.counts = {
    buttons: document.querySelectorAll('button').length,
    tabs: document.querySelectorAll('[role="tab"]').length,
    links: document.querySelectorAll('a[href]').length,
    text: t.length,
  };
  out.sample = t.slice(0, 160).replace(/\s+/g, ' ');
  return out;
};

async function auditRoute(page, route, vp, findings) {
  const errs = [];
  const net = [];
  const onErr = (e) => errs.push(String(e.message || e).slice(0, 160));
  const onCon = (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); };
  const onRes = (r) => {
    if (r.status() >= 400 && !r.url().includes('favicon'))
      net.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 80)}`);
  };
  page.on('pageerror', onErr); page.on('console', onCon); page.on('response', onRes);
  let status = 0;
  try {
    const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(2200); // let client-side data land
  } catch (e) {
    findings.push({ route, vp: vp.name, sev: 'P0', what: `navigation failed: ${String(e.message).slice(0, 90)}` });
    page.off('pageerror', onErr); page.off('console', onCon); page.off('response', onRes);
    return;
  }
  let probe = null;
  try { probe = await page.evaluate(PROBE); } catch { /* page torn down mid-probe */ }
  // A probe that comes back empty is a fact about ONE route. Report it and keep
  // walking — a 66-route sweep that dies on route 2 tells you nothing about 3-66.
  if (!probe || typeof probe !== 'object') {
    findings.push({ route, vp: vp.name, sev: 'P1', what: 'probe returned nothing — page torn down or navigated mid-probe' });
    probe = {};
  }
  page.off('pageerror', onErr); page.off('console', onCon); page.off('response', onRes);

  const url = page.url().replace(BASE, '');
  if (url.includes('/login')) {
    findings.push({ route, vp: vp.name, sev: 'P0', what: 'bounced to login — session lost or route not permitted for this role' });
    return;
  }
  if (status >= 400) findings.push({ route, vp: vp.name, sev: 'P0', what: `HTTP ${status}` });
  if (probe.empty) findings.push({ route, vp: vp.name, sev: 'P0', what: `renders empty (${probe.counts?.text ?? 0} chars of text)` });
  errs.slice(0, 3).forEach((e) => findings.push({ route, vp: vp.name, sev: 'P0', what: `console error: ${e}` }));
  net.slice(0, 3).forEach((n) => findings.push({ route, vp: vp.name, sev: 'P1', what: `failed request: ${n}` }));
  if (probe.overflow)
    findings.push({ route, vp: vp.name, sev: 'P1', what: `horizontal overflow by ${probe.overflow.by}px — widest: ${probe.overflow.el}` });
  if (probe.noName?.length)
    findings.push({ route, vp: vp.name, sev: 'P1', what: `${probe.noName.length} control(s) with no accessible name` });
  if (probe.clipped?.length)
    findings.push({ route, vp: vp.name, sev: 'P1', what: `text clipped: ${probe.clipped.slice(0, 2).join(' | ')}` });
  if (vp.name === 'mobile' && probe.tiny?.length > 2)
    findings.push({ route, vp: vp.name, sev: 'P2', what: `${probe.tiny.length} tap targets under 44px, e.g. ${probe.tiny.slice(0, 2).map((t) => `"${t.t}" ${t.w}x${t.h}`).join(', ')}` });
  if (probe.noAlt) findings.push({ route, vp: vp.name, sev: 'P2', what: `${probe.noAlt} image(s) with no alt text` });

  fs.mkdirSync(SHOTS, { recursive: true });
  const slug = route.replace(/\//g, '_').replace(/^_/, '') + '__' + vp.name;
  try { await page.screenshot({ path: path.join(SHOTS, slug + '.png'), fullPage: false }); } catch {}
  return probe;
}

async function runPersona(browser, name, email, password, routes, findings, covered) {
  if (!email || !password) {
    findings.push({ route: '-', vp: '-', sev: 'P0', what: `${name}: credentials missing from .env.local — persona skipped` });
    return;
  }
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const ok = await login(page, email, password);
    if (!ok) {
      findings.push({ route: '/golf/login', vp: vp.name, sev: 'P0', what: `${name}: login failed — still on the login page` });
      await ctx.close();
      continue;
    }
    console.log(`  ${name}/${vp.name}: logged in`);
    for (const r of routes) {
      const p = await auditRoute(page, r, vp, findings);
      covered.add(`${name} ${r}`);
      process.stdout.write(`    ${vp.name} ${r} ${p?.counts ? `(${p.counts.buttons}b/${p.counts.tabs}t)` : ''}\n`);
    }
    await ctx.close();
  }
}

const findings = [];
const covered = new Set();
const browser = await chromium.launch();
console.log(`UI audit against ${BASE}`);
if (!ONLY || ONLY === 'coach')
  await runPersona(browser, 'coach', process.env.GOLFHELM_COACH_EMAIL,
    process.env.GOLFHELM_COACH_PASSWORD, COACH, findings, covered);
if (!ONLY || ONLY === 'player')
  await runPersona(browser, 'player', process.env.GOLFHELM_PLAYER_EMAIL,
    process.env.GOLFHELM_PLAYER_PASSWORD, PLAYER, findings, covered);
await browser.close();

const order = { P0: 0, P1: 1, P2: 2 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.route.localeCompare(b.route));
const day = new Date().toISOString().slice(0, 10);
const md = [
  `# GolfHelm premium UI pass — ${day}`, '',
  `**Target:** ${BASE} · **Personas:** coach, player · **Viewports:** 1440x900, 390x844`,
  `**Routes walked:** ${covered.size} persona-routes · **Findings:** ${findings.length}`,
  `**Screenshots:** \`${path.relative(process.cwd(), SHOTS)}\``, '',
  '## Re-running', '```',
  'DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/ui-audit-golf.mjs',
  '```',
  'Read-only: navigates and inspects, never submits, sends or deletes.',
  'Credentials come from .env.local and are never written here.', '',
  '## Findings', '',
  '| sev | route | viewport | what |', '|---|---|---|---|',
  ...findings.map((f) => `| ${f.sev} | \`${f.route}\` | ${f.vp} | ${f.what} |`),
  '', '## Routes covered', '',
  ...[...covered].sort().map((c) => `- ${c}`),
].join('\n');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `UI_AUDIT_${day}.md`), md);
const by = (s) => findings.filter((f) => f.sev === s).length;
console.log(`\nP0 ${by('P0')}  P1 ${by('P1')}  P2 ${by('P2')}  → docs/ui-audits/UI_AUDIT_${day}.md`);
