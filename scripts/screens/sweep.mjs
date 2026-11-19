/* global window, document, location, getComputedStyle -- page.evaluate callbacks run in the page */
// Open every screen and look at it: each screen from `scripts/screens/list.mjs` in WebKit at phone size (W, iPhone 17 Pro)
// and Chromium at desk size (C, 1440×900), light and dark, with the layout probe and axe on each, into one gallery you
// can filter by product, access, viewport, theme and finding.
//
//   node scripts/screens/sweep.mjs --start-dev [--products fixtures,public,golf] [--access public,fixture] [--out <dir>]
//   node scripts/screens/sweep.mjs --base <url> --session golf:coach=.auth/coach.json --session golf:player=.auth/player.json
//
// Not production by default: the production site is refused (its logged-out pages have their own GET-only lane,
// scripts/clubhouse/audit/prod-public.mjs), so this is for a local server, a seeded local stack or a staging preview.
// An owner-approved production run (signed in as test accounts) sets HELM_ALLOW_PRODUCTION=1, the same override every
// other guarded script takes (scripts/lib/production-site-guard.mjs).
//
// Audit options: --desktop-engine webkit (desk in WebKit, tier W, instead of Chromium) · --contrast (painted text
// contrast, WCAG and APCA, scripts/clubhouse/audit/contrast.mjs, on every shot) · --scroll 0,400,bottom (a shot and
// its measurements at each position, in the page's own scroller). Each shot asserts the theme it asked for actually
// applied (data-fw-theme on <html> after load); a mismatch is reported as a finding, not silently shot.
// It only navigates: no click, no typing, no submit. Signed-in pages still write when opened
// (docs/clubhouse/audit/WRITES-ON-OPEN.md), which is why a signed-in sweep belongs on seeded local data, as in the
// journeys workflow. A route that makes a paid AI call on open is skipped unless --allow-paid.
//
// --start-dev starts `next dev` for the run with every key from the env files blanked except an allowlist (so no email,
// push or AI provider is reachable) and a fake Supabase, which is what the Clubhouse fixtures and the public pages need.
// Screens that need a session are listed as skipped, with why, unless a matching --session is given.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isProductionSite, productionAllowed } from '../lib/production-site-guard.mjs';
import { listScreens, ROOT } from './list.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIT = join(ROOT, 'scripts/clubhouse/audit');

/** Routes that cost money or act on someone else's behalf when merely opened. */
export const SKIP_ON_OPEN = [
  { re: /^\/golf\/dashboard\/rounds\/\[id\]$/, why: 'a coach opening a round without a recap makes a paid Claude call (WRITES-ON-OPEN §1); --allow-paid opens it', paid: true },
  { re: /\/view-as$/, why: 'admin impersonation' },
  { re: /\[\.\.\./, why: 'catch-all route: it is the not-found page' },
];

export const VIEWPORTS = {
  phone: { engine: 'webkit', device: 'iPhone 17 Pro', tier: 'W' },
  desktop: { engine: 'chromium', viewport: { width: 1440, height: 900 }, tier: 'C' },
};

/** `/golf/dashboard/roster/[id]` → a RegExp matching a concrete path for it. */
export function patternRegex(route) {
  const body = route
    .split('/')
    .map((s) => (/^\[\[?\.\.\./.test(s) ? '.+' : /^\[.+\]$/.test(s) ? '[^/?#]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${body}$`);
}

/** The first concrete path among `hrefs` (same origin, path only) for each dynamic route. */
export function resolveDynamic(routes, hrefs) {
  const out = new Map();
  for (const route of routes) {
    const re = patternRegex(route);
    const hit = hrefs.find((h) => re.test(h));
    if (hit) out.set(route, hit);
  }
  return out;
}

/** Which session a screen needs: `<product>:<role>` keys whose product matches; admin screens take an `admin:*` session. */
export function sessionsFor(screen, sessions) {
  if (screen.access === 'public' || screen.access === 'fixture') return [{ key: 'signed-out', file: null }];
  const product = screen.access === 'admin' ? 'admin' : screen.product;
  return Object.entries(sessions).filter(([k]) => k.split(':')[0] === product).map(([key, file]) => ({ key, file }));
}

/** The plan: each screen with the sessions it runs under, or the reason it is skipped. */
export function plan(screens, { sessions = {}, allowPaid = false } = {}) {
  const visits = [];
  const skipped = [];
  for (const s of screens) {
    const rule = SKIP_ON_OPEN.find((r) => r.re.test(s.route));
    if (rule && !(rule.paid && allowPaid)) { skipped.push({ screen: s, why: rule.why }); continue; }
    const as = sessionsFor(s, sessions);
    if (!as.length) { skipped.push({ screen: s, why: `needs a ${s.access === 'admin' ? 'admin' : `${s.product}`} session (--session ${s.access === 'admin' ? 'admin' : s.product}:<role>=<storage.json>)` }); continue; }
    for (const a of as) visits.push({ screen: s, session: a.key, storage: a.file });
  }
  return { visits, skipped };
}

/** Keys from the env files that may stay set for a fixture server; everything else is blanked for the run. */
const KEEP = /^(NEXT_PUBLIC_APP_URL|NEXT_PUBLIC_SITE_URL|NODE_ENV|NEXT_TELEMETRY_DISABLED|TZ)$/;
export function blankedEnv(base = process.env, root = ROOT) {
  const env = { ...base };
  for (const f of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/.exec(line);
      if (m && !KEEP.test(m[1])) env[m[1]] = ''; // set, so Next's env loading cannot fill it from the file
    }
  }
  Object.assign(env, {
    NEXT_TELEMETRY_DISABLED: '1',
    HELM_DEV_KEEP_ROUTES: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-presentation-fixture-only',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-presentation-fixture-only',
  });
  return env;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One self-contained HTML page over the run's results (images by relative path). */
export function gallery(report) {
  const rows = report.results;
  const cards = rows.map((r) => {
    const f = r.findings;
    const n = (f.axe?.length ?? 0) + (f.smallTargets?.length ?? 0) + (f.clipped?.length ?? 0) + (f.sideways ? 1 : 0) + (f.consoleErrors?.length ?? 0) + (f.contrast?.length ?? 0) + (f.themeMismatch ? 1 : 0);
    const chips = [
      r.status !== 200 ? `<b class="bad">${esc(r.status ?? 'no answer')}</b>` : '',
      r.signInWall ? '<b class="warn">sign-in wall</b>' : '',
      f.axe?.length ? `<b class="bad">axe ${f.axe.length}</b>` : '',
      f.contrast?.some((c) => c.grade === 'wcag') ? `<b class="bad">WCAG ${f.contrast.filter((c) => c.grade === 'wcag').length}</b>` : '',
      f.contrast?.some((c) => c.grade === 'apca') ? `<b>APCA ${f.contrast.filter((c) => c.grade === 'apca').length}</b>` : '',
      f.themeMismatch ? `<b class="bad">theme</b>` : '',
      f.smallTargets?.length ? `<b class="warn">&lt;44pt ${f.smallTargets.length}</b>` : '',
      f.clipped?.length ? `<b class="warn">clipped ${f.clipped.length}</b>` : '',
      f.sideways ? '<b class="bad">sideways</b>' : '',
      f.consoleErrors?.length ? `<b class="bad">console ${f.consoleErrors.length}</b>` : '',
    ].join('');
    const detail = [
      ...(f.axe ?? []).map((v) => `axe ${v.id} (${v.impact}) × ${v.nodes}`),
      ...(f.contrast ?? []).map((c) => `contrast ${c.grade === 'wcag' ? 'WCAG FAIL' : c.grade === 'review' ? 'review (covered by another layer)' : 'APCA only'}: ${c.wcagP5}:1 / Lc ${c.lcP5} (needs ${c.floorWcag} / Lc ${c.floorLc}) ${c.el} "${c.text}"`),
      ...(f.themeMismatch ? [`theme: ${f.themeMismatch}`] : []),
      ...(f.smallTargets ?? []).map((t) => `target ${t}`),
      ...(f.clipped ?? []).map((t) => `clipped ${t}`),
      ...(f.consoleErrors ?? []).map((t) => `console ${t}`),
    ].map((d) => `<li>${esc(d)}</li>`).join('');
    return `<figure data-product="${esc(r.product)}" data-access="${esc(r.access)}" data-vp="${r.viewport}" data-theme="${r.theme}" data-session="${esc(r.session)}" data-n="${n}">
<a href="${esc(r.shot)}" target="_blank"><img loading="lazy" src="${esc(r.shot)}" alt="${esc(r.url)} ${r.viewport} ${r.theme}"></a>
<figcaption><code>${esc(r.url)}</code><span>${esc(r.product)} · ${esc(r.session)} · ${r.viewport} (${r.tier}) · ${r.theme}</span><div class="chips">${chips}</div>${detail ? `<details><summary>${n} finding(s)</summary><ul>${detail}</ul></details>` : ''}</figcaption></figure>`;
  }).join('\n');
  const opts = (key) => [...new Set(rows.map((r) => r[key]))].sort().map((v) => `<option>${esc(v)}</option>`).join('');
  const skipped = report.skipped.map((s) => `<li><code>${esc(s.route)}</code>: ${esc(s.why)}</li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Every screen</title><style>
:root{--bg:#f6f5f1;--card:#fff;--ink:#1b1f1c;--muted:#5d655f;--bad:#b42318;--warn:#9a6700;--line:#e3e1da}
@media (prefers-color-scheme:dark){:root{--bg:#121513;--card:#1b1f1c;--ink:#ecebe6;--muted:#a5aca6;--bad:#ff8a80;--warn:#e7b85a;--line:#2b302c}}
body{margin:0;font:14px/1.45 -apple-system,system-ui,sans-serif;background:var(--bg);color:var(--ink)}
header{position:sticky;top:0;background:var(--bg);padding:12px 16px;border-bottom:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap;align-items:center;z-index:1}
h1{font-size:17px;margin:0 12px 0 0}select,label{font:inherit}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;padding:16px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
img{display:block;width:100%;height:260px;object-fit:cover;object-position:top;background:var(--line)}
figcaption{padding:8px 10px;display:grid;gap:4px}code{font-size:12px;word-break:break-all}span{color:var(--muted);font-size:12px}
.chips b{display:inline-block;font-size:11px;margin:0 4px 0 0;padding:1px 6px;border-radius:999px;border:1px solid currentColor}.bad{color:var(--bad)}.warn{color:var(--warn)}
details{font-size:12px}ul{margin:4px 0 0;padding-left:16px}.sum{color:var(--muted);padding:0 16px}
</style></head><body>
<header><h1>Every screen</h1>
<select id="product"><option value="">All products</option>${opts('product')}</select>
<select id="session"><option value="">All sessions</option>${opts('session')}</select>
<select id="vp"><option value="">Phone and desk</option><option>phone</option><option>desktop</option></select>
<select id="theme"><option value="">Light and dark</option><option>light</option><option>dark</option></select>
<label><input type="checkbox" id="only"> Only with findings</label><span id="count"></span></header>
<p class="sum">${esc(report.base)} · ${esc(report.at)} · ${rows.length} shots of ${report.screens} screens · tiers: phone W (Playwright WebKit, iPhone 17 Pro), desk C (Chromium 1440×900). Not real Safari, not a real iPhone, no frame timing.</p>
<main>${cards}</main>
${skipped ? `<section class="sum"><h2>Not opened (${report.skipped.length})</h2><ul>${skipped}</ul></section>` : ''}
<script>
const f=['product','session','vp','theme'].map(id=>document.getElementById(id));const only=document.getElementById('only');
function apply(){let n=0;for(const el of document.querySelectorAll('figure')){const ok=(!f[0].value||el.dataset.product===f[0].value)&&(!f[1].value||el.dataset.session===f[1].value)&&(!f[2].value||el.dataset.vp===f[2].value)&&(!f[3].value||el.dataset.theme===f[3].value)&&(!only.checked||+el.dataset.n>0);el.hidden=!ok;if(ok)n++}document.getElementById('count').textContent=n+' shown'}
for(const el of [...f,only])el.addEventListener('change',apply);apply();
</script></body></html>`;
}

function args(argv) {
  const get = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
  const all = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
  const sessions = Object.fromEntries(all('--session').map((s) => { const [k, file] = s.split('='); return [k, resolve(file)]; }));
  return {
    base: get('--base', null),
    startDev: argv.includes('--start-dev'),
    port: Number(get('--port', '3111')),
    products: get('--products', '')?.split(',').filter(Boolean),
    access: get('--access', '')?.split(',').filter(Boolean),
    viewports: get('--viewports', 'phone,desktop').split(','),
    themes: get('--themes', 'light,dark').split(','),
    limit: Number(get('--limit', '0')),
    out: resolve(get('--out', join(homedir(), 'helm-audit-runs', 'screens', new Date().toISOString().replace(/[:.]/g, '-')))),
    sessions,
    allowPaid: argv.includes('--allow-paid'),
    desktopEngine: get('--desktop-engine', 'chromium'),
    contrast: argv.includes('--contrast'),
    scroll: get('--scroll', '0').split(',').filter(Boolean),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* not up yet */ }
    await new Promise((d) => setTimeout(d, 2000));
  }
  throw new Error(`${url} did not answer within ${ms / 1000} s`);
}

export async function main(argv = process.argv.slice(2)) {
  const o = args(argv);
  if (o.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 20).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    return 0;
  }
  if (!o.base && !o.startDev) throw new Error('Give --base <url> or --start-dev.');
  const base = o.startDev ? `http://127.0.0.1:${o.port}` : new URL(o.base).origin;
  if (isProductionSite(base) && !productionAllowed()) throw new Error('The sweep does not open the production site unless HELM_ALLOW_PRODUCTION=1 (owner-approved runs only). Its public pages have a GET-only lane: node scripts/clubhouse/audit/prod-public.mjs');
  if (!['webkit', 'chromium'].includes(o.desktopEngine)) throw new Error('--desktop-engine is webkit or chromium.');
  const VP = { ...VIEWPORTS, desktop: { ...VIEWPORTS.desktop, engine: o.desktopEngine, tier: o.desktopEngine === 'webkit' ? 'W' : 'C' } };
  const { measureContrast } = o.contrast ? await import(pathToFileURL(join(AUDIT, 'contrast.mjs')).href) : {};
  mkdirSync(join(o.out, 'shots'), { recursive: true });

  let server;
  if (o.startDev) {
    server = spawn(join(ROOT, 'node_modules/.bin/next'), ['dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(o.port)], { cwd: ROOT, env: blankedEnv(), stdio: ['ignore', 'ignore', 'inherit'] });
    await waitFor(`${base}/manifest.json`, 240_000);
  }
  const require = createRequire(join(ROOT, 'package.json'));
  const pw = require('playwright');
  const { AxeBuilder } = require('@axe-core/playwright');
  const screens = (await listScreens({ products: o.products })).filter((s) => !o.access?.length || o.access.includes(s.access));
  const { visits, skipped } = plan(screens, { sessions: o.sessions, allowPaid: o.allowPaid });
  const dynamicRoutes = visits.filter((v) => v.screen.dynamic.length).map((v) => v.screen.route);
  const queue = visits.filter((v) => !v.screen.dynamic.length);
  const pending = visits.filter((v) => v.screen.dynamic.length);
  const seen = new Set();
  const results = [];
  const browsers = {};
  try {
    const shoot = async (visit, url, vp, theme, collect) => {
      const spec = VP[vp];
      browsers[spec.engine] ??= await pw[spec.engine].launch();
      const ctx = await browsers[spec.engine].newContext({
        ...(spec.device ? pw.devices[spec.device] : { viewport: spec.viewport }),
        colorScheme: theme,
        reducedMotion: 'reduce',
        storageState: visit.storage ?? undefined,
      });
      await ctx.addInitScript({ path: join(AUDIT, 'probe.js') });
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
      page.on('pageerror', (e) => consoleErrors.push(`pageerror ${String(e.message).slice(0, 160)}`));
      let status = null;
      try {
        const resp = await page.goto(base + url, { waitUntil: 'load', timeout: 120_000 });
        status = resp?.status() ?? null;
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        // The app sets data-fw-theme from the colour scheme at load. Check it took; preview fixtures skip the theme
        // script, so only there is the attribute set by hand. A signed-in page that ignores it is a finding.
        const applied = await page.evaluate(() => document.documentElement.getAttribute('data-fw-theme'));
        const themeMismatch = applied !== null && applied !== theme;
        if (applied !== theme) await page.evaluate((t) => document.documentElement.setAttribute('data-fw-theme', t), theme);
        await page.evaluate(() => document.fonts?.ready);
        await page.waitForTimeout(300);
        // Measure a settled page: an entrance still sliding moves text away from where its box was read (a calibration
        // false positive, 2026-11-18). Endless animations (a twinkling sky) are left running.
        // Then freeze what never ends (a twinkling sky): the painted and text-hidden shots the contrast probe compares must
        // differ only in the text, or clipped text over a moving background reads as painted (calibration, 2026-11-18).
        const settle = () => page.evaluate(async () => {
          await Promise.race([
            Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming?.().iterations !== Infinity).map((a) => a.finished.catch(() => {}))),
            new Promise((r) => setTimeout(r, 2500)),
          ]);
          document.getAnimations().forEach((a) => { if (a.effect?.getComputedTiming?.().iterations === Infinity) a.pause(); });
        });
        await settle();
        const finalPath = await page.evaluate(() => location.pathname);
        const signInWall = visit.session !== 'signed-out' ? /\/(login|signin|sign-in)(\/|$)/.test(finalPath) : false;
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze().catch(() => ({ violations: [] }));
        if (collect) collect(await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/')).map((h) => h.split(/[?#]/)[0])));
        for (const pos of o.scroll) {
          // Clubhouse scrolls its own canvas on desktop (#ch-canvas); elsewhere the largest scroller, else the window.
          const at = await page.evaluate((p) => {
            const els = [document.querySelector('#ch-canvas'), ...document.querySelectorAll('main, [data-ch-scroll], div')]
              .filter((e) => e && e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
            const el = els.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0] ?? document.scrollingElement;
            const max = el.scrollHeight - el.clientHeight;
            el.scrollTop = p === 'bottom' ? max : Math.min(max, Number(p) || 0);
            return Math.round(el.scrollTop);
          }, pos);
          await page.waitForTimeout(pos === '0' ? 0 : 350);
          await settle();
          const scan = await page.evaluate(() => window.__chAudit.scan());
          const contrast = measureContrast ? await measureContrast(page, { label: `${url} ${vp} ${theme} @${pos}` }).catch((e) => [{ error: String(e.message).slice(0, 120) }]) : null;
          const slug = `${url.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}__${visit.session.replace(/[^a-z0-9]+/gi, '-')}__${vp}__${theme}${pos === '0' ? '' : `__s${pos}`}`;
          const shot = `shots/${slug}.jpg`;
          await page.screenshot({ path: join(o.out, shot), type: 'jpeg', quality: 70 });
          const fails = contrast?.filter((r) => r.failWcag || r.failApca) ?? [];
          results.push({
            url, route: visit.screen.route, product: visit.screen.product, access: visit.screen.access, session: visit.session,
            viewport: vp, tier: spec.tier, theme, scroll: pos, scrolledTo: at, status, finalPath, signInWall, shot,
            findings: {
              axe: pos === o.scroll[0] ? axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) : [],
              smallTargets: vp === 'phone' ? scan.smallTargets.filter((t) => !/^1x1 /.test(t)) : [],
              clipped: scan.clipped.filter((c) => !/\.sr-only\b/.test(c)),
              sideways: scan.horizontalScroll,
              consoleErrors,
              ...(themeMismatch ? { themeMismatch: `asked ${theme}, page set ${applied}` } : {}),
              ...(contrast ? { contrast: fails.map((r) => ({ text: String(r.text ?? '').slice(0, 60), el: r.el, wcagP5: r.wcagP5, lcP5: r.lcP5, floorWcag: r.floorWcag, floorLc: r.floorLc, notPainted: !!r.notPainted, grade: r.notPainted ? 'review' : r.failWcag ? 'wcag' : 'apca' })), contrastChecked: contrast.length } : {}),
            },
          });
        }
      } catch (e) {
        results.push({ url, route: visit.screen.route, product: visit.screen.product, access: visit.screen.access, session: visit.session, viewport: vp, tier: spec.tier, theme, status, error: String(e.message).slice(0, 200), shot: '', findings: { consoleErrors } });
      } finally {
        await ctx.close();
      }
    };
    const hrefs = new Set();
    const run = async (list) => {
      for (const v of list) {
        const url = v.url ?? v.screen.route;
        if (seen.has(`${url}|${v.session}`)) continue;
        seen.add(`${url}|${v.session}`);
        for (const vp of o.viewports) for (const theme of o.themes) await shoot(v, url, vp, theme, vp === o.viewports[0] && theme === o.themes[0] ? (hs) => hs.forEach((h) => hrefs.add(h)) : null);
        process.stdout.write(`\r${results.length} shots`);
        if (o.limit && seen.size >= o.limit) return;
      }
    };
    await run(queue);
    const found = resolveDynamic(dynamicRoutes, [...hrefs]);
    const second = [];
    for (const v of pending) {
      const url = found.get(v.screen.route);
      if (url) second.push({ ...v, url });
      else skipped.push({ screen: v.screen, why: `no link to a ${v.screen.route} on the screens opened (it needs ${v.screen.dynamic.join(', ')})` });
    }
    if (!o.limit || seen.size < o.limit) await run(second);
  } finally {
    for (const b of Object.values(browsers)) await b.close();
    server?.kill('SIGTERM');
  }
  const report = { base, at: new Date().toISOString(), screens: screens.length, results, skipped: skipped.map((s) => ({ route: s.screen.route, product: s.screen.product, why: s.why })) };
  writeFileSync(join(o.out, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(o.out, 'index.html'), gallery(report));
  const withFindings = results.filter((r) => r.error || r.status !== 200 || r.findings.axe?.length || r.findings.smallTargets?.length || r.findings.clipped?.length || r.findings.sideways || r.findings.consoleErrors?.length || r.findings.contrast?.length || r.findings.themeMismatch);
  console.log(`\nscreens: ${results.length} shots of ${new Set(results.map((r) => r.url)).size} screens, ${withFindings.length} with findings, ${skipped.length} not opened. Gallery: ${join(o.out, 'index.html')}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((c) => process.exit(c), (e) => { console.error(`screens: ${e.message}`); process.exit(2); });
}
export { HERE };
