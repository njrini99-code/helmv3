// The logged-out production lane: what an iPhone visitor gets on the five public pages of the live site, checked in W
// (Playwright WebKit, the iPhone 17 Pro preset), with nothing written anywhere.
//
//   node scripts/clubhouse/audit/prod-public.mjs [--out <dir>] [--base <origin>] [--json]
//
// Safe on production by construction, and it proves it on every run:
//   - It opens only the five public paths in config/clubhouse/prod-public-budgets.json, never signs in, never clicks,
//     types or submits, and starts each page in a fresh context with no cookies or storage.
//   - Every request that is not GET or HEAD is aborted before it leaves the browser, and recorded. A non-GET the page
//     tries on load that is not a known telemetry beacon fails the run: a public page that writes on open is a finding.
//   - Telemetry never leaves: navigator.sendBeacon is replaced before any page script runs (WebKit can send a beacon
//     past the request router), the Vercel Analytics and Speed Insights scripts, the Sentry tunnel and every Sentry,
//     Datadog and PostHog host are aborted, so these runs add no page views or sessions to real-user data.
//   - --base other than the production origin is allowed only for loopback (to test the lane itself).
//
// What it checks per page (each a hard failure against the budgets file):
//   status 200; no sideways scroll at 402 px; no axe WCAG 2.2 AA violation; LCP under the budget; no tap target under
//   44 pt beyond the recorded list; no clipped text; no console error; no request to an origin outside the list; no
//   unexpected write attempt.
//
// What it cannot say (tier W, `.claude/rules/browsers.md`): real Safari rendering, safe areas, frame rate, CLS (WebKit has
// no layout-shift entries), INP (needs a real tap). LCP here is an unthrottled Mac or CI runner, not a phone: it catches a
// regression, it is not a field number. Field LCP and INP live in Vercel Speed Insights and Sentry.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
export const PRODUCTION_ORIGIN = 'https://helmsportslabs.com';
export const BUDGETS_PATH = join(ROOT, 'config/clubhouse/prod-public-budgets.json');

/** Requests aborted even as GETs: analytics and error telemetry, so a lane run never counts as a visit. */
export const TELEMETRY = [
  /^\/[0-9a-f]{16}\/(script\.js|view|vitals)/i, // Vercel Analytics and Speed Insights, served from an obfuscated base path
  /^\/_vercel\/(insights|speed-insights)\//i,
  /^\/monitoring(\/|$|\?)/i, // the Sentry tunnel
];
// Datadog's browser intake hosts join the region with a dash (browser-intake-us5-datadoghq.com), so no dot is required there.
export const TELEMETRY_HOSTS = /(?:(?:^|\.)sentry\.io|(?:^|[.-])datadoghq\.(?:com|eu)|(?:^|\.)posthog\.com)$/i;

/** True for a request the lane never lets out: any non-GET, and telemetry on any method. */
export function classify(method, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return { abort: true, kind: 'unparseable' };
  }
  const telemetry = TELEMETRY_HOSTS.test(u.hostname) || TELEMETRY.some((r) => r.test(u.pathname));
  if (telemetry) return { abort: true, kind: 'telemetry' };
  if (!['GET', 'HEAD'].includes(method)) return { abort: true, kind: 'write' };
  return { abort: false, kind: 'read' };
}

/** The base the lane may open: production, or loopback for a self-test. Anything else is refused. */
export function checkBase(base) {
  const u = new URL(base);
  if (u.origin === PRODUCTION_ORIGIN) return u.origin;
  if (['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return u.origin;
  throw new Error(`prod-public.mjs opens ${PRODUCTION_ORIGIN} or a loopback address only, not ${base}.`);
}

/**
 * A visually hidden element (the sr-only pattern: a 1x1 box, clipped) is no tap target until it takes focus, and its
 * clipping is the point. The probe reports both; the lane drops them so they never read as findings.
 */
export function visible(scan) {
  return {
    smallTargets: scan.smallTargets.filter((t) => !/^1x1 /.test(t)),
    clipped: scan.clipped.filter((c) => !/\.sr-only\b/.test(c)),
  };
}

/** Pure: one page's measurements against the budgets. Returns the failures, each a short sentence. */
export function judge(page, budgets) {
  const fails = [];
  const known = new Set(budgets.knownSmallTargets?.[page.path] ?? []);
  if (page.status !== 200) fails.push(`status ${page.status}`);
  if (page.horizontalScroll) fails.push('scrolls sideways at the phone width');
  for (const v of page.axe) fails.push(`axe ${v.id} (${v.impact}) on ${v.nodes} node(s)`);
  if (page.lcpMs == null) fails.push('no LCP entry');
  else if (page.lcpMs > budgets.lcpMs) fails.push(`LCP ${Math.round(page.lcpMs)} ms over the ${budgets.lcpMs} ms budget (${page.lcpElement ?? 'unknown element'})`);
  for (const t of page.smallTargets) if (!known.has(t)) fails.push(`new tap target under 44 pt: ${t}`);
  for (const c of page.clipped) fails.push(`clipped text: ${c}`);
  for (const e of page.consoleErrors) fails.push(`console error: ${e}`);
  for (const o of page.origins) if (!budgets.origins.includes(o)) fails.push(`request to an unlisted origin: ${o}`);
  for (const w of page.writes) if (!budgets.knownWrites.some((k) => new RegExp(k).test(w))) fails.push(`write attempted on open: ${w}`);
  if (page.beacons > 0 && !budgets.beaconsExpected) fails.push(`${page.beacons} sendBeacon call(s)`);
  return fails;
}

const BEACON_STUB = `(() => {
  const calls = [];
  Object.defineProperty(window, '__chBeacons', { value: calls });
  try { Object.defineProperty(Navigator.prototype, 'sendBeacon', { configurable: true, value: function (url) { calls.push(String(url)); return true; } }); } catch {}
})();`;

function arg(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('node scripts/clubhouse/audit/prod-public.mjs [--out <dir>] [--base <origin>] [--json]\n' +
      'Logged-out W pass over the five public production pages. GET only, telemetry blocked, nothing written. Exit 1 on any budget failure.');
    return 0;
  }
  const base = checkBase(arg(argv, '--base', PRODUCTION_ORIGIN));
  const budgets = JSON.parse(readFileSync(BUDGETS_PATH, 'utf8'));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = resolve(arg(argv, '--out', join(homedir(), 'helm-audit-runs', 'prod-public', stamp)));
  mkdirSync(out, { recursive: true });
  const require = createRequire(join(ROOT, 'package.json'));
  const { webkit, devices } = require('playwright');
  const { AxeBuilder } = require('@axe-core/playwright');

  const browser = await webkit.launch();
  const results = [];
  try {
    for (const path of budgets.pages) {
      const ctx = await browser.newContext({ ...devices[budgets.device], serviceWorkers: 'block' });
      await ctx.addInitScript({ content: BEACON_STUB });
      await ctx.addInitScript({ path: join(HERE, 'probe.js') });
      await ctx.addInitScript({ path: join(HERE, 'safari-vitals.js') });
      const writes = [];
      const telemetry = [];
      const origins = new Set();
      await ctx.route('**/*', (route) => {
        const r = route.request();
        const verdict = classify(r.method(), r.url());
        const u = new URL(r.url());
        if (verdict.abort) {
          (verdict.kind === 'telemetry' ? telemetry : writes).push(`${r.method()} ${u.host}${u.pathname}`);
          return route.abort();
        }
        origins.add(u.origin === base ? PRODUCTION_ORIGIN : u.origin);
        return route.continue();
      });
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on('console', (m) => {
        // Requests the lane aborts on purpose log as errors; they are not the page's.
        if (m.type() === 'error' && !/Failed to load resource|access control checks|Load failed|blocked/i.test(m.text())) consoleErrors.push(m.text().slice(0, 200));
      });
      page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
      const resp = await page.goto(base + path, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForTimeout(budgets.settleMs); // idle callbacks, lazy chunks and prefetches get their chance to write
      const scan = { ...(await page.evaluate(() => window.__chAudit.scan())) };
      Object.assign(scan, visible(scan));
      const vitals = await page.evaluate(() => window.__chVitals.read());
      const beacons = await page.evaluate(() => window.__chBeacons.length);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const shot = join(out, `${path === '/' ? 'root' : path.slice(1).replace(/\//g, '_')}.png`);
      await page.screenshot({ path: shot });
      const measured = {
        path,
        status: resp?.status() ?? null,
        title: await page.title(),
        horizontalScroll: scan.horizontalScroll,
        smallTargets: scan.smallTargets,
        clipped: scan.clipped,
        lcpMs: vitals.lcp?.ms ?? null,
        lcpElement: vitals.lcp?.element ?? null,
        axe: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
        consoleErrors,
        origins: [...origins].sort(),
        writes,
        telemetry,
        beacons,
        screenshot: shot,
      };
      measured.failures = judge(measured, budgets);
      results.push(measured);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  const report = { tier: `W: Playwright WebKit (${budgets.device})`, base, at: new Date().toISOString(), lcpBudgetMs: budgets.lcpMs, results };
  writeFileSync(join(out, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  let failed = 0;
  for (const r of results) {
    const head = `${r.failures.length ? 'FAIL' : 'ok  '} ${r.path.padEnd(22)} ${r.status} LCP ${r.lcpMs == null ? '-' : `${Math.round(r.lcpMs)} ms`} axe ${r.axe.length} targets<44 ${r.smallTargets.length} writes-tried ${r.writes.length} telemetry-held ${r.telemetry.length + r.beacons}`;
    console.log(head);
    for (const f of r.failures) console.log(`       - ${f}`);
    failed += r.failures.length ? 1 : 0;
  }
  console.log(`prod-public: ${results.length - failed} of ${results.length} pages within budget (tier W). Evidence: ${out}`);
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => process.exit(code), (e) => { console.error(`prod-public: ${e.message}`); process.exit(2); });
}
