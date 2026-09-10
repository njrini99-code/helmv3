// Golf facelift capture: every golf surface, as coach and as player, phone and
// desktop, labelled with the code that renders it.
//
//   node scripts/ui-intelligence/capture-golf-facelift.mjs [--base=http://localhost:3013]
//        [--persona=coach|player] [--only=calendar,rounds] [--vp=phone|desktop]
//
// Output (git-ignored): ui-intelligence/facelift/
//   captures/<persona>/<slug>__<viewport>__fold.png   first screen, exactly what opens
//   captures/<persona>/<slug>__<viewport>__full.png   whole page (internal scrollers expanded)
//   manifest.json                                     route → shots → code files
//   INDEX.md                                          one section per surface: shots + code
//
// Credentials come from .env.local (GOLFHELM_COACH_* / GOLFHELM_PLAYER_*).
// They are never printed and never written. Read-only: it navigates, clicks
// tabs and opens sheets. It never submits a form.
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
}));
const BASE = args.base || process.env.GOLFHELM_BASE_URL || 'http://localhost:3013';
const ONLY = args.only ? String(args.only).split(',') : null;
const PERSONAS = args.persona ? [args.persona] : ['coach', 'player'];
const VIEWPORTS = [
  { name: 'phone', width: 393, height: 852, dpr: 2, mobile: true },
  { name: 'desktop', width: 1440, height: 900, dpr: 1, mobile: false },
].filter((v) => !args.vp || v.name === args.vp);
const OUT = path.join(ROOT, 'ui-intelligence', 'facelift');
const GOTO_TIMEOUT = 90_000;

// ---------------------------------------------------------------------------
// Surfaces. `sub` = client-side sub-states captured after the base shot:
//   { kind:'tabs' }                      every tab of the first tablist
//   { kind:'click', name, sel, label }   click sel (or role button named name), shoot, Escape
//   { kind:'more' }                      the phone "More" sheet
// `dynamic` picks the first matching link off `from` to resolve [id] routes.
// ---------------------------------------------------------------------------
const COACH = [
  { slug: 'home', route: '/golf/dashboard', sub: [{ kind: 'more' }] },
  { slug: 'hub', route: '/golf/dashboard/hub', sub: [{ kind: 'tabs' }] },
  { slug: 'team-hub', route: '/golf/dashboard/team-hub', sub: [{ kind: 'tabs' }] },
  { slug: 'roster', route: '/golf/dashboard/roster', sub: [{ kind: 'tabs' }] },
  { slug: 'roster-player', route: '/golf/dashboard/roster/[id]', dynamic: { from: '/golf/dashboard/roster', match: /\/golf\/dashboard\/(roster|players)\/[^/?#]+$/ }, sub: [{ kind: 'tabs' }] },
  { slug: 'player-game', route: '/golf/dashboard/players/[playerId]/game', dynamic: { from: '/golf/dashboard/roster', match: /\/golf\/dashboard\/(roster|players)\/[^/?#]+$/, rewrite: (u) => u.replace(/\/roster\//, '/players/') + '/game' } },
  { slug: 'player-genome', route: '/golf/dashboard/players/[playerId]/genome', dynamic: { from: '/golf/dashboard/roster', match: /\/golf\/dashboard\/(roster|players)\/[^/?#]+$/, rewrite: (u) => u.replace(/\/roster\//, '/players/') + '/genome' } },
  { slug: 'rounds', route: '/golf/dashboard/rounds', sub: [{ kind: 'tabs' }] },
  { slug: 'round', route: '/golf/dashboard/rounds/[id]', dynamic: { from: '/golf/dashboard/rounds', match: /\/golf\/dashboard\/rounds\/(?!new|recover|continue)[^/?#]+$/ }, sub: [{ kind: 'tabs' }] },
  { slug: 'round-review', route: '/golf/dashboard/rounds/[id]/review', dynamic: { from: '/golf/dashboard/rounds', match: /\/golf\/dashboard\/rounds\/(?!new|recover|continue)[^/?#]+$/, rewrite: (u) => u + '/review' }, sub: [{ kind: 'tabs' }] },
  { slug: 'stats', route: '/golf/dashboard/stats', sub: [{ kind: 'tabs' }] },
  { slug: 'stats-team', route: '/golf/dashboard/stats/team', sub: [{ kind: 'tabs' }] },
  { slug: 'calendar', route: '/golf/dashboard/calendar', sub: [
    { kind: 'click', label: 'event-sheet', within: '[data-testid="calendar-body"]', role: 'button' },
    { kind: 'segment', names: ['Week', 'Day', 'Month'] },
  ] },
  { slug: 'qualifiers', route: '/golf/dashboard/qualifiers', sub: [{ kind: 'tabs' }] },
  { slug: 'qualifier', route: '/golf/dashboard/qualifiers/[id]', dynamic: { from: '/golf/dashboard/qualifiers', match: /\/golf\/dashboard\/qualifiers\/(?!new)[^/?#]+$/ }, sub: [{ kind: 'tabs' }] },
  { slug: 'qualifier-new', route: '/golf/dashboard/qualifiers/new' },
  { slug: 'insights', route: '/golf/dashboard/insights', sub: [{ kind: 'tabs' }] },
  { slug: 'intelligence', route: '/golf/dashboard/intelligence', sub: [{ kind: 'tabs' }] },
  { slug: 'patterns', route: '/golf/dashboard/patterns', sub: [{ kind: 'tabs' }] },
  { slug: 'development', route: '/golf/dashboard/development', sub: [{ kind: 'tabs' }] },
  { slug: 'coachhelm', route: '/golf/dashboard/coachhelm', sub: [{ kind: 'tabs' }] },
  { slug: 'coachhelm-chat', route: '/golf/dashboard/coachhelm/chat' },
  { slug: 'coachhelm-genome-compare', route: '/golf/dashboard/coachhelm/genome/compare' },
  { slug: 'analytics-coachhelm', route: '/golf/dashboard/analytics/coachhelm', sub: [{ kind: 'tabs' }] },
  { slug: 'recruiting', route: '/golf/dashboard/recruiting', sub: [{ kind: 'tabs' }] },
  { slug: 'courses', route: '/golf/dashboard/courses' },
  { slug: 'travel', route: '/golf/dashboard/travel', sub: [{ kind: 'tabs' }] },
  { slug: 'documents', route: '/golf/dashboard/documents' },
  { slug: 'messages', route: '/golf/dashboard/messages' },
  { slug: 'announcements', route: '/golf/dashboard/announcements' },
  { slug: 'alerts', route: '/golf/dashboard/alerts' },
  { slug: 'tasks', route: '/golf/dashboard/tasks', sub: [{ kind: 'tabs' }] },
  { slug: 'classes', route: '/golf/dashboard/classes' },
  { slug: 'team', route: '/golf/dashboard/team', sub: [{ kind: 'tabs' }] },
  { slug: 'settings', route: '/golf/dashboard/settings' },
  { slug: 'settings-notifications', route: '/golf/dashboard/settings/notifications' },
  { slug: 'settings-coaching-intelligence', route: '/golf/dashboard/settings/coaching-intelligence' },
  { slug: 'whats-new', route: '/golf/dashboard/whats-new' },
];
const PLAYER = [
  { slug: 'home', route: '/golf/dashboard', sub: [{ kind: 'more' }] },
  { slug: 'my-development', route: '/golf/dashboard/my-development', sub: [{ kind: 'tabs' }] },
  { slug: 'my-game-profile', route: '/golf/dashboard/my-game-profile', sub: [{ kind: 'tabs' }] },
  { slug: 'my-insights', route: '/golf/dashboard/my-insights', sub: [{ kind: 'tabs' }] },
  { slug: 'my-qualifiers', route: '/golf/dashboard/my-qualifiers', sub: [{ kind: 'tabs' }] },
  { slug: 'my-standing', route: '/golf/dashboard/my-standing', sub: [{ kind: 'tabs' }] },
  { slug: 'rounds', route: '/golf/dashboard/rounds', sub: [{ kind: 'tabs' }] },
  { slug: 'round', route: '/golf/dashboard/rounds/[id]', dynamic: { from: '/golf/dashboard/rounds', match: /\/golf\/dashboard\/rounds\/(?!new|recover|continue)[^/?#]+$/ }, sub: [{ kind: 'tabs' }] },
  { slug: 'round-review', route: '/golf/dashboard/rounds/[id]/review', dynamic: { from: '/golf/dashboard/rounds', match: /\/golf\/dashboard\/rounds\/(?!new|recover|continue)[^/?#]+$/, rewrite: (u) => u + '/review' }, sub: [{ kind: 'tabs' }] },
  { slug: 'round-new', route: '/golf/dashboard/rounds/new' },
  { slug: 'stats', route: '/golf/dashboard/stats', sub: [{ kind: 'tabs' }] },
  { slug: 'calendar', route: '/golf/dashboard/calendar', sub: [
    { kind: 'click', label: 'event-sheet', within: '[data-testid="calendar-body"]', role: 'button' },
  ] },
  { slug: 'messages', route: '/golf/dashboard/messages' },
  { slug: 'announcements', route: '/golf/dashboard/announcements' },
  { slug: 'documents', route: '/golf/dashboard/documents' },
  { slug: 'courses', route: '/golf/dashboard/courses' },
  { slug: 'settings', route: '/golf/dashboard/settings' },
  { slug: 'whats-new', route: '/golf/dashboard/whats-new' },
];

// ---------------------------------------------------------------------------
// Code labelling: route → page.tsx → transitive local imports (depth-limited).
// ---------------------------------------------------------------------------
const APP_GOLF = path.join(ROOT, 'src/app/golf/(dashboard)');
function pageFileFor(route) {
  const rel = route.replace(/^\/golf\//, '');
  const candidates = [
    path.join(APP_GOLF, rel, 'page.tsx'),
    path.join(ROOT, 'src/app/golf', rel, 'page.tsx'),
  ];
  return candidates.find((f) => fs.existsSync(f)) || null;
}
const EXT = ['.tsx', '.ts', '/index.tsx', '/index.ts'];
function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const e of EXT) if (fs.existsSync(base + e)) return base + e;
  return null;
}
const IMPORT_RE = /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm;
function codeGraph(entry, maxDepth = 4, cap = 60) {
  const seen = new Map();
  const queue = [[entry, 0]];
  while (queue.length && seen.size < cap) {
    const [file, depth] = queue.shift();
    if (seen.has(file)) continue;
    const rel = path.relative(ROOT, file);
    // Only UI code: pages, components, styles. Skip lib/hooks/server plumbing.
    if (depth > 0 && !/^src\/(components|app)\//.test(rel)) continue;
    if (/(__tests__|\.test\.|\.stories\.)/.test(rel)) continue;
    let src = '';
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    seen.set(file, { rel, lines: src.split('\n').length, depth,
      kit: rel.startsWith('src/components/fairway/') ? 'fairway' : rel.startsWith('src/components/ui/') ? 'legacy-ui' : rel.startsWith('src/app/') ? 'route' : 'feature' });
    if (depth >= maxDepth) continue;
    // barrels are cheap and hide the real files; step through them one level deeper.
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      const r = resolveImport(file, spec);
      if (r && !seen.has(r)) queue.push([r, /index\.tsx?$/.test(r) ? depth : depth + 1]);
    }
  }
  return [...seen.values()].sort((a, b) => a.depth - b.depth || a.rel.localeCompare(b.rel));
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(page, ms = 900) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await sleep(ms);
}
async function freeze(page) {
  await page.addStyleTag({ content: '*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important;animation-delay:0s!important;caret-color:transparent!important} nextjs-portal,[data-nextjs-toast],[data-next-badge-root]{display:none!important}' }).catch(() => {});
}
async function login(context, persona) {
  const email = process.env[`GOLFHELM_${persona.toUpperCase()}_EMAIL`];
  const password = process.env[`GOLFHELM_${persona.toUpperCase()}_PASSWORD`];
  if (!email || !password) throw new Error(`${persona} credentials missing from .env.local`);
  const page = await context.newPage();
  await page.goto(`${BASE}/golf/login`, { timeout: GOTO_TIMEOUT, waitUntil: 'domcontentloaded' });
  await page.fill('#golf-signin-email', email);
  await page.fill('#golf-signin-password', password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.toString().includes('/golf/login'), { timeout: 60_000 });
  await settle(page, 1500);
  await page.close();
}
async function fullHeight(page) {
  return page.evaluate(() => {
    const vw = innerWidth;
    let max = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4 && el.clientWidth > vw * 0.5) max = Math.max(max, el.scrollHeight + (el.getBoundingClientRect().top + scrollY));
    }
    return Math.ceil(max);
  }).catch(() => 0);
}
async function shoot(page, vp, file, { full = false } = {}) {
  await freeze(page);
  if (!full) { await page.screenshot({ path: file, fullPage: false }); return { h: vp.height }; }
  const h = Math.min(Math.max(await fullHeight(page), vp.height), 9000);
  if (h > vp.height) { await page.setViewportSize({ width: vp.width, height: h }); await sleep(400); }
  await page.screenshot({ path: file, fullPage: true });
  await page.setViewportSize({ width: vp.width, height: vp.height });
  return { h };
}
async function resolveDynamic(page, spec) {
  await page.goto(`${BASE}${spec.from}`, { timeout: GOTO_TIMEOUT, waitUntil: 'domcontentloaded' });
  await settle(page);
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
  let hit = hrefs.find((h) => h && spec.match.test(h));
  if (!hit) {
    // rows that navigate on click (no anchor): press the first data-href / row button
    const row = page.locator('[data-href], tr[role=link], [role=row] a').first();
    if (await row.count()) { await row.click().catch(() => {}); await settle(page); const u = new URL(page.url()).pathname; if (spec.match.test(u)) hit = u; }
  }
  if (!hit) return null;
  return spec.rewrite ? spec.rewrite(hit) : hit;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const manifest = { base: BASE, capturedAt: new Date().toISOString(), surfaces: [] };
const browser = await chromium.launch();
for (const persona of PERSONAS) {
  const list = (persona === 'coach' ? COACH : PLAYER).filter((s) => !ONLY || ONLY.includes(s.slug));
  const dynCache = new Map();
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr,
      isMobile: vp.mobile, hasTouch: vp.mobile, colorScheme: 'light',
      userAgent: vp.mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined,
    });
    try { await login(context, persona); } catch (e) { console.error(`[${persona}] login failed: ${e.message}`); await context.close(); continue; }
    const page = await context.newPage();
    const dir = path.join(OUT, 'captures', persona);
    fs.mkdirSync(dir, { recursive: true });
    for (const s of list) {
      let route = s.route;
      if (s.dynamic) {
        if (!dynCache.has(s.slug)) dynCache.set(s.slug, await resolveDynamic(page, s.dynamic));
        route = dynCache.get(s.slug);
        if (!route) { console.log(`[${persona}/${vp.name}] ${s.slug}: no instance found, skipped`); manifest.surfaces.push({ persona, viewport: vp.name, slug: s.slug, route: s.route, status: 'no-instance' }); continue; }
      }
      const entry = { persona, viewport: vp.name, slug: s.slug, route: s.route, url: route, shots: [], status: 'ok' };
      const t0 = Date.now();
      try {
        await page.goto(`${BASE}${route}`, { timeout: GOTO_TIMEOUT, waitUntil: 'domcontentloaded' });
        await settle(page, 1200);
        entry.finalUrl = new URL(page.url()).pathname;
        entry.title = await page.title();
        const base = `${s.slug}__${vp.name}`;
        await shoot(page, vp, path.join(dir, `${base}__fold.png`)); entry.shots.push(`${base}__fold.png`);
        const { h } = await shoot(page, vp, path.join(dir, `${base}__full.png`), { full: true }); entry.shots.push(`${base}__full.png`); entry.height = h;
        for (const sub of s.sub || []) {
          if (sub.kind === 'tabs') {
            const tabs = page.locator('[role=tablist]').first().locator('[role=tab]');
            const n = Math.min(await tabs.count(), 8);
            for (let i = 1; i < n; i++) {
              const name = ((await tabs.nth(i).textContent()) || `tab${i}`).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `tab${i}`;
              await tabs.nth(i).click({ timeout: 5000 }).catch(() => {}); await settle(page, 700);
              const f = `${base}__tab-${name}__full.png`; await shoot(page, vp, path.join(dir, f), { full: true }); entry.shots.push(f);
            }
            if (n > 1) { await tabs.nth(0).click({ timeout: 5000 }).catch(() => {}); await settle(page, 400); }
          } else if (sub.kind === 'segment') {
            for (const name of sub.names) {
              const b = page.getByRole('radio', { name }).or(page.getByRole('button', { name, exact: true })).or(page.getByRole('tab', { name })).first();
              if (!(await b.count())) continue;
              await b.click({ timeout: 5000 }).catch(() => {}); await settle(page, 700);
              const f = `${base}__${name.toLowerCase()}__fold.png`; await shoot(page, vp, path.join(dir, f)); entry.shots.push(f);
            }
          } else if (sub.kind === 'click') {
            const scope = sub.within ? page.locator(sub.within) : page;
            const target = sub.role ? scope.getByRole(sub.role, sub.name ? { name: sub.name } : {}).first() : scope.locator(sub.sel).first();
            if (await target.count()) {
              await target.click({ timeout: 5000 }).catch(() => {}); await settle(page, 900);
              const f = `${base}__${sub.label}__fold.png`; await shoot(page, vp, path.join(dir, f)); entry.shots.push(f);
              const f2 = `${base}__${sub.label}__full.png`; await shoot(page, vp, path.join(dir, f2), { full: true }); entry.shots.push(f2);
              await page.keyboard.press('Escape').catch(() => {}); await settle(page, 400);
            }
          } else if (sub.kind === 'more' && vp.mobile) {
            const more = page.locator('[data-slot="fw-bottom-nav"]').getByRole('button', { name: /more/i }).first();
            if (await more.count()) {
              await more.click({ timeout: 5000 }).catch(() => {}); await settle(page, 800);
              const f = `${base}__more-sheet__fold.png`; await shoot(page, vp, path.join(dir, f)); entry.shots.push(f);
              await page.keyboard.press('Escape').catch(() => {}); await settle(page, 400);
            }
          }
        }
      } catch (e) {
        entry.status = 'failed'; entry.error = String(e.message || e).slice(0, 300);
      }
      entry.ms = Date.now() - t0;
      console.log(`[${persona}/${vp.name}] ${s.slug} ${entry.status} ${entry.shots.length} shots ${entry.ms}ms${entry.finalUrl && entry.finalUrl !== route ? ` → ${entry.finalUrl}` : ''}`);
      manifest.surfaces.push(entry);
    }
    await context.close();
  }
}
await browser.close();

// Code graph per unique route (persona-independent).
const codeByRoute = {};
for (const s of [...COACH, ...PLAYER]) {
  if (codeByRoute[s.route]) continue;
  const pf = pageFileFor(s.route);
  codeByRoute[s.route] = pf ? codeGraph(pf) : [];
}
manifest.code = codeByRoute;
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

// INDEX.md — one section per surface, coach then player.
const lines = [`# Golf facelift capture — ${manifest.capturedAt}`, '', `Base: ${BASE}`, ''];
for (const persona of PERSONAS) {
  lines.push(`## ${persona.toUpperCase()}`, '');
  const list = persona === 'coach' ? COACH : PLAYER;
  for (const s of list) {
    const entries = manifest.surfaces.filter((e) => e.persona === persona && e.slug === s.slug);
    if (!entries.length) continue;
    lines.push(`### ${persona}/${s.slug} — \`${s.route}\``, '');
    for (const e of entries) {
      lines.push(`- ${e.viewport}: ${e.status}${e.error ? ` (${e.error})` : ''}${e.height ? `, full height ${e.height}px` : ''}`);
      for (const f of e.shots || []) lines.push(`  - captures/${persona}/${f}`);
    }
    const code = codeByRoute[s.route] || [];
    lines.push('', `Code (${code.length} files; fairway=${code.filter((c) => c.kit === 'fairway').length}, legacy-ui=${code.filter((c) => c.kit === 'legacy-ui').length}, feature=${code.filter((c) => c.kit === 'feature').length}):`, '');
    for (const c of code) lines.push(`- [${c.kit}] ${c.rel} (${c.lines})`);
    lines.push('');
  }
}
fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n'));
const ok = manifest.surfaces.filter((e) => e.status === 'ok').length;
console.log(`\n${ok}/${manifest.surfaces.length} surfaces captured → ui-intelligence/facelift/INDEX.md`);
