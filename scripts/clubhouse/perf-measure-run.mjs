/* global window, document, location, requestAnimationFrame, MutationObserver -- the probe and the page.evaluate callbacks run in the browser */
/**
 * The Playwright half of the Clubhouse perf harness (perf-measure.mjs `measure`). One signed-in browser context per run, 4x CPU
 * throttle (CDP), a probe injected before the page's own scripts, and the server's read trace (perf-fetch-trace.cjs) read back
 * for the same window. Everything is recorded per run and summarised as medians.
 *
 * What a run records (times in ms from the navigation, or from the click for a client navigation or a switch):
 *   skeleton   first frame after a route skeleton (`#ch-content > main[aria-busy=true][aria-label^=Loading]`) is in the page; null if none showed
 *   content    first frame after the route's main is live (not a skeleton, not aria-busy), on the expected address
 *   fcp, lcp   paint timings (cold loads)
 *   cls        layout shift the way the spec counts it (shifts within 500 ms of a click or key do not count)
 *   clsRaw     every shift from the start, counting the ones the spec forgives (a clicked navigation or switch that reflows is in here)
 *   long       long tasks: count, sum and the longest, and TBT (the part of each over 50 ms)
 *   reads      Supabase calls the page's own requests made (count, summed duration, and the serial depth: waves of overlapping calls)
 *   timeline   for a switch: what the page showed, as it changed ("live", "busy" = live and aria-busy, "skeleton", "none")
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { join } from 'node:path';

/** Load average and swap (macOS `vm.swapusage`): the conditions a run was taken in, so a timing is read against them. */
function machineNow() {
  let swapUsedMB = null;
  let swapTotalMB = null;
  try {
    const text = execFileSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' });
    swapTotalMB = Math.round(Number(/total = ([\d.]+)M/.exec(text)?.[1]));
    swapUsedMB = Math.round(Number(/used = ([\d.]+)M/.exec(text)?.[1]));
  } catch {
    /* not macOS */
  }
  return { load: loadavg().map((x) => Math.round(x * 10) / 10), swapUsedMB, swapTotalMB };
}

const median = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Installed before any page script runs. Plain function: Playwright serialises it. */
function probe() {
  if (window.__perf) return;
  const P = (window.__perf = { t0: 0, target: null, startPath: '', shifts: [], long: [], events: [], tl: [], skelAt: null, contentAt: null, lcp: null, fcp: null, clickAt: null, armed: false });
  const watch = (type, fn) => {
    try {
      new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true });
    } catch {
      /* unsupported entry type */
    }
  };
  // A shift keeps the elements that moved (a short selector and where each was and went), so a switch that shifts can be traced to its cause.
  const describe = (n) => {
    if (!n || !n.tagName) return '?';
    const cls = typeof n.className === 'string' ? n.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    const parent = n.parentElement && typeof n.parentElement.className === 'string' ? n.parentElement.className.split(/\s+/).filter(Boolean)[0] : '';
    return (parent ? parent + ' > ' : '') + n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (cls ? '.' + cls : '');
  };
  const box = (r) => [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
  watch('layout-shift', (e) =>
    P.shifts.push([e.startTime, e.value, e.hadRecentInput, (e.sources || []).slice(0, 3).map((src) => ({ el: describe(src.node), from: box(src.previousRect), to: box(src.currentRect) }))]),
  );
  watch('longtask', (e) => P.long.push([e.startTime, e.duration]));
  // Interactions (taps, keys): from the input to the next paint. INP is the longest of a run's.
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => e.interactionId && P.events.push([e.startTime, e.duration, e.name]))).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch {
    /* unsupported entry type */
  }
  watch('largest-contentful-paint', (e) => (P.lcp = e.startTime));
  watch('paint', (e) => {
    if (e.name === 'first-contentful-paint') P.fcp = e.startTime;
  });
  const state = () => {
    const c = document.getElementById('ch-content');
    const page = c && c.firstElementChild;
    if (!page) return null;
    const busy = page.getAttribute('aria-busy') === 'true';
    const skel = busy && /^Loading/.test(page.getAttribute('aria-label') || '');
    return { skel, busy, path: location.pathname + location.search };
  };
  let last = '';
  const sample = () => {
    const s = state();
    const now = performance.now();
    const key = s ? (s.skel ? 'skeleton' : s.busy ? 'busy' : 'live') + ' ' + s.path : 'none';
    if (key !== last) {
      last = key;
      P.tl.push([now, key]);
    }
    if (!s || now < P.t0) return;
    if (s.skel && P.skelAt == null) requestAnimationFrame(() => P.skelAt == null && (P.skelAt = performance.now()));
    const moved = P.target ? s.path === P.target : s.path !== P.startPath;
    if (!s.skel && !s.busy && P.contentAt == null && (P.target === null && P.startPath === '' ? true : moved))
      requestAnimationFrame(() => P.contentAt == null && (P.contentAt = performance.now()));
  };
  new MutationObserver(sample).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy', 'aria-label'] });
  (function frame() {
    sample();
    requestAnimationFrame(frame);
  })();
  // A click starts a client navigation or a switch: its time zero is the click's own timestamp.
  document.addEventListener(
    'click',
    (e) => {
      if (!P.armed) return;
      P.armed = false;
      P.t0 = e.timeStamp;
      P.clickAt = e.timeStamp;
    },
    true,
  );
  P.arm = (target) => {
    P.armed = true;
    P.target = target || null;
    P.startPath = target ? '' : location.pathname + location.search;
    P.skelAt = null;
    P.contentAt = null;
    P.t0 = performance.now();
  };
}

/** Reads the server trace from `offset` on: { reqs, reads }, only what started at or after `since` (epoch ms): a request that began earlier and closed later is not this run's. */
function readTrace(file, offset, since) {
  if (!existsSync(file)) return { reqs: [], reads: [] };
  const text = readFileSync(file, 'utf8').slice(offset);
  const reqs = [];
  const reads = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const o = JSON.parse(line);
      if (o.t >= since - 2) (o.k === 'req' ? reqs : reads).push(o);
    } catch {
      /* a partial line */
    }
  }
  return { reqs, reads };
}

const traceSize = (file) => (existsSync(file) ? statSync(file).size : 0);

/** Waves: reads sorted by start, a new wave when a read starts after everything before it has ended. */
function waves(reads) {
  const sorted = [...reads].sort((a, b) => a.t - b.t);
  let n = 0;
  let end = -Infinity;
  for (const r of sorted) {
    if (r.t > end) n++;
    end = Math.max(end, r.t + r.ms);
  }
  return n;
}

/**
 * The page's own requests (a GET of the document or its RSC payload: not a prefetch, not a static file) and the reads they ran. A POST to the
 * page (a server action the shell or the page calls after it loads) is counted on its own (`action*`): it is real server work, but it is not the page's.
 */
function summariseTrace(trace) {
  const dynamic = (q) => !q.url.startsWith('/_next/') && (q.rsc || !/\.[a-z0-9]+$/i.test(q.url.split('?')[0]));
  const pageReqs = trace.reqs.filter((q) => !q.prefetch && q.method !== 'POST' && dynamic(q) && !q.url.startsWith('/api/'));
  const actionReqs = trace.reqs.filter((q) => !q.prefetch && q.method === 'POST' && dynamic(q));
  const idsOf = (qs) => new Set(qs.map((q) => q.id));
  const mine = trace.reads.filter((r) => idsOf(pageReqs).has(r.req));
  const actions = trace.reads.filter((r) => idsOf(actionReqs).has(r.req));
  const prefetch = trace.reads.filter((r) => trace.reqs.some((q) => q.id === r.req && q.prefetch));
  const tableOf = (r) => r.path.replace(/^rest\/v1\//, '');
  const byTable = {};
  for (const r of mine) byTable[tableOf(r)] = (byTable[tableOf(r)] ?? 0) + 1;
  const slowest = [...mine].sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => ({ table: tableOf(r), ms: r1(r.ms), bytes: r.bytes }));
  return {
    requests: pageReqs.map((q) => ({ url: q.url.slice(0, 90), rsc: q.rsc, ms: r1(q.ms), reads: trace.reads.filter((r) => r.req === q.id).length })),
    reads: mine.length,
    readMs: r1(mine.reduce((a, r) => a + r.ms, 0)),
    readMax: r1(Math.max(0, ...mine.map((r) => r.ms))),
    readBytes: mine.reduce((a, r) => a + (r.bytes ?? 0), 0),
    waves: waves(mine),
    byTable,
    slowest,
    serverMs: r1(Math.max(0, ...pageReqs.map((q) => q.ms))),
    actionRequests: actionReqs.length,
    actionReads: actions.length,
    actionMs: r1(Math.max(0, ...actionReqs.map((q) => q.ms))),
    prefetchReads: prefetch.length,
    prefetchRequests: trace.reqs.filter((q) => q.prefetch).length,
  };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const P = window.__perf;
    const nav = performance.getEntriesByType('navigation')[0];
    const h1 = document.querySelector('#ch-content h1');
    return {
      t0: P.t0,
      skelAt: P.skelAt,
      contentAt: P.contentAt,
      shifts: P.shifts,
      long: P.long,
      events: P.events,
      tl: P.tl,
      lcp: P.lcp,
      fcp: P.fcp,
      ttfb: nav ? nav.responseStart : null,
      docBytes: nav ? nav.encodedBodySize : null,
      jsBytes: performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'script' || /\.js(\?|$)/.test(e.name)).reduce((a, e) => a + (e.encodedBodySize || 0), 0),
      heading: h1 ? h1.textContent : null,
      clubhouse: !!document.getElementById('ch-content'),
      path: location.pathname + location.search,
    };
  });
}

function figures(snap, trace, cold) {
  const t0 = cold ? 0 : snap.t0;
  const rel = (x) => (x == null ? null : r1(x - t0));
  const since = (arr) => arr.filter(([t]) => t >= t0);
  const shifts = since(snap.shifts);
  const long = since(snap.long);
  const tl = snap.tl.filter(([t]) => t >= t0 - 1).map(([t, k]) => [r1(t - t0), k.split(' ')[0]]);
  return {
    skeleton: rel(snap.skelAt),
    content: rel(snap.contentAt),
    ttfb: cold ? r1(snap.ttfb) : null,
    docKB: cold && snap.docBytes != null ? Math.round(snap.docBytes / 1024) : null,
    jsKB: cold ? Math.round(snap.jsBytes / 1024) : null,
    fcp: cold ? r1(snap.fcp) : null,
    lcp: cold ? r1(snap.lcp) : null,
    cls: r1(shifts.filter(([, , input]) => !input).reduce((a, [, v]) => a + v, 0) * 1000) / 1000,
    clsRaw: r1(shifts.reduce((a, [, v]) => a + v, 0) * 1000) / 1000,
    shiftCount: shifts.length,
    shifts: shifts.map(([t, v, input, src]) => ({ t: r1(t - t0), v: Math.round(v * 10000) / 10000, input, src })),
    long: { count: long.length, ms: r1(long.reduce((a, [, d]) => a + d, 0)), max: r1(Math.max(0, ...long.map(([, d]) => d))), tbt: r1(long.reduce((a, [, d]) => a + Math.max(0, d - 50), 0)) },
    // The tap's own duration to the next paint (null on a cold load, or when the tap took under 16 ms).
    inp: cold
      ? null
      : (() => {
          const ev = (snap.events ?? []).filter(([t]) => t >= t0 - 1);
          return ev.length ? r1(Math.max(...ev.map(([, d]) => d))) : null;
        })(),
    timeline: tl,
    server: summariseTrace(trace),
    heading: snap.heading,
    path: snap.path,
  };
}

async function signIn(browser, base, who, stateFile) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Hydrated first: the form's Sign in button follows React's state, which a fill before hydration never reaches.
  await page.goto(`${base}/golf/login`, { waitUntil: 'networkidle' });
  await page.locator('#golf-signin-email').fill(who.email);
  await page.locator('#golf-signin-password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/golf/') && !u.pathname.endsWith('/login'), { timeout: 90_000 });
  await page.goto(`${base}/golf/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await ctx.storageState({ path: stateFile });
  await ctx.close();
  await sleep(1500); // the sign-in's own requests finish before the first run starts
}

async function openPage(browser, base, stateFile, viewport, problems, phoneHint = true) {
  const phone = viewport < 700;
  const ctx = await browser.newContext({
    storageState: stateFile,
    viewport: { width: viewport, height: phone ? 844 : 800 },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
  });
  await ctx.addInitScript(probe);
  // A returning phone: the layout cookie the app sets after its first phone render (F-36), so the server draws the phone structure from the first frame.
  // `--first-visit` leaves it out, which is the one-time desktop-to-phone swap a brand new device sees.
  if (phone && phoneHint) await ctx.addCookies([{ name: 'ch_phone', value: '1', url: base }]);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e.message).slice(0, 160)}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(base) && !r.url().includes('/_next/image')) problems.push(`${r.status()} ${r.request().method()} ${r.url().slice(base.length, base.length + 100)}`);
  });
  return { ctx, page };
}

async function loadCold(page, base, path, readsFile) {
  const off = traceSize(readsFile);
  const since = Date.now();
  await page.goto(`${base}${path}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__perf && window.__perf.contentAt != null, null, { timeout: 90_000 });
  await sleep(1000);
  const snap = await snapshot(page);
  await sleep(300);
  return { snap, trace: readTrace(readsFile, off, since) };
}

/** Clicks `click()` and waits for the page to show new content (or a settled switch); returns the figures from the click on. */
async function step(page, readsFile, { target, click, wait }) {
  await page.evaluate((t) => window.__perf.arm(t), target ?? null);
  const off = traceSize(readsFile);
  const since = Date.now();
  await click();
  if (wait) await wait();
  else await page.waitForFunction(() => window.__perf.contentAt != null, null, { timeout: 60_000 });
  await sleep(1000);
  const snap = await snapshot(page);
  await sleep(300);
  return { snap, trace: readTrace(readsFile, off, since) };
}

/** `settle`: a wait (ms) after the More sheet opens, so its links are prefetched as they are for a user who looks before tapping. */
async function navTo(page, label, settle = 0) {
  const link = page.locator(`#ch-sidebar a[href="${label}"], aside.ch-sidebar a[href="${label}"], nav.ch-tabbar a[href="${label}"]`).locator('visible=true').first();
  if (await link.count()) return () => link.click();
  // Phone: not one of the four tabs, so it is in the More sheet.
  return async () => {
    await page.getByRole('button', { name: /^More/ }).click();
    if (settle) await sleep(settle);
    await page.getByRole('dialog', { name: 'More' }).locator(`a[href="${label}"]`).click();
  };
}

function summarise(runs) {
  const pick = (f) => median(runs.map(f));
  // The spread of the runs (min, max): on a shared machine a change smaller than it is noise.
  const range = (f) => {
    const v = runs.map(f).filter((x) => x != null && Number.isFinite(x));
    return v.length ? [r1(Math.min(...v)), r1(Math.max(...v))] : null;
  };
  return {
    n: runs.length,
    skeleton: r1(pick((r) => r.skeleton)),
    content: r1(pick((r) => r.content)),
    contentRange: range((r) => r.content),
    fcp: r1(pick((r) => r.fcp)),
    lcp: r1(pick((r) => r.lcp)),
    lcpRange: range((r) => r.lcp),
    serverRange: range((r) => r.server.serverMs),
    cls: Math.max(...runs.map((r) => r.cls)),
    clsRaw: Math.max(...runs.map((r) => r.clsRaw)),
    longCount: pick((r) => r.long.count),
    tbt: r1(pick((r) => r.long.tbt)),
    inp: r1(pick((r) => r.inp)),
    reads: pick((r) => r.server.reads),
    readMs: r1(pick((r) => r.server.readMs)),
    waves: pick((r) => r.server.waves),
    serverMs: r1(pick((r) => r.server.serverMs)),
    docKB: pick((r) => r.docKB),
    jsKB: pick((r) => r.jsKB),
    // A switch should keep the page on screen (dimmed): any frame with a skeleton or nothing in the page is a flash.
    flash: runs.some((r) => r.kind === 'switch' && r.timeline.some(([t, k]) => t >= 0 && (k === 'skeleton' || k === 'none'))),
  };
}

/**
 * Rule 5 of docs/clubhouse/PAGE_PERFORMANCE.md: the skeleton is the page's geometry. The route skeleton and the loaded page share their
 * class names (ch-st-head, ch-fg, ch-pf-hero, ...), so each landmark is found by one selector in both frames: its top (from the page's
 * top) and its height. The skeleton-to-page swap replaces nodes, so layout-shift never sees it; this does.
 */
const LANDMARKS = {
  // The phone's skeleton and page name their blocks differently (`ch-hm-skel__hero` and `ch-hm-hero`), so a landmark lists both.
  home: { desk: ['.ch-h-head', '.ch-h-sheet', '.ch-h-sec', '.ch-h-lb'], phone: ['.ch-hm-skel__hero, .ch-hm-hero', '.ch-hm-skel__body, .ch-hm-body'] },
  'stats-team': { desk: ['.ch-st-head', '.ch-sf', '.ch-fg', '.ch-sgt'], phone: ['.ch-stm-head', '.ch-stm-controls', '.ch-stm-figs', '.ch-stm-panel'] },
  'stats-player': { desk: ['.ch-st-back', '.ch-pf-hero', '.ch-pf-hero__av', '.ch-pf-hero__id', '.ch-pf-hero__figs', '.ch-pf-tabs', '.ch-sf', '.ch-st-panel, .ch-sgt'], phone: ['.ch-spm-head', '.ch-stm-controls', '.ch-stm-figs', '.ch-stm-panel'] },
};

async function landmarkRects(page, selectors) {
  // No animation in flight (the reveal's rise would move a block by a few pixels mid-measure).
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
  await sleep(120);
  return page.evaluate((sels) => {
    const root = document.getElementById('ch-content');
    const top0 = root ? root.getBoundingClientRect().top : 0;
    return sels.map((s) => {
      const el = [...(root || document).querySelectorAll(s)].find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.top - top0), Math.round(r.height)];
    });
  }, selectors);
}

export async function measure(opts) {
  const base = `http://localhost:${opts.port}`;
  const runsN = Number(opts.runs ?? 3);
  const label = typeof opts.label === 'string' ? opts.label : 'run';
  const roles = String(opts.role ?? 'coach,player').split(',');
  const viewports = String(opts.viewport ?? '1280,390').split(',').map(Number);
  const only = opts.only ? String(opts.only).split(',') : null;
  const wants = (name) => !only || only.some((o) => name.includes(o));
  const { seed, stateDir, readsFile } = opts;
  mkdirSync(join(stateDir, 'results'), { recursive: true });
  const res = await fetch(`${base}/golf/login`, { redirect: 'manual' }).catch(() => null);
  if (!res) throw new Error(`nothing is serving ${base}: run \`serve\` first`);

  const machineAtStart = machineNow();
  console.log(`machine at start: load ${machineAtStart.load.join(' / ')} (1, 5, 15 min), swap ${machineAtStart.swapUsedMB}/${machineAtStart.swapTotalMB} MB`);
  const browser = await chromium.launch({ headless: true });
  const people = { coach: seed.coach, player: seed.players[0] };
  const all = [];
  const geo = [];
  try {
    for (const role of roles) {
      const stateFile = join(stateDir, `state-${role}.json`);
      if (!existsSync(stateFile) || Date.now() - statSync(stateFile).mtimeMs > 40 * 60_000) await signIn(browser, base, people[role], stateFile);
      for (const viewport of viewports) {
        const problems = [];
        const playerId = seed.players[0].playerId;
        const pathsCold = role === 'coach'
          ? { home: '/golf/dashboard', 'stats-team': '/golf/dashboard/stats', 'stats-player': `/golf/dashboard/stats?player=${playerId}` }
          : { home: '/golf/dashboard', 'stats-player': '/golf/dashboard/stats' };
        const record = (scenario, kind, run, f) => all.push({ role, viewport, scenario, kind, run, ...f });

        // ── cold loads: a fresh context (empty browser cache), one run each ──
        for (const [name, path] of Object.entries(pathsCold)) {
          if (!wants(name) || !wants('cold')) continue;
          for (let i = 0; i < runsN; i++) {
            const { ctx, page } = await openPage(browser, base, stateFile, viewport, problems, !opts['first-visit']);
            try {
              const { snap, trace } = await loadCold(page, base, path, readsFile);
              if (!snap.clubhouse) throw new Error(`${path} did not render Clubhouse (is the flag on for this build?)`);
              record(name, 'cold', i, { kind: 'cold', ...figures(snap, trace, true) });
            } finally {
              await ctx.close();
            }
          }
        }

        // ── client navigations: from a settled page, tap the nav (prefetched links, as a user's second tap is) ──
        if (wants('nav')) {
          const nav = role === 'coach'
            ? [['home', 'stats-team', '/golf/dashboard', '/golf/dashboard/stats'], ['stats-team', 'home', '/golf/dashboard/stats', '/golf/dashboard']]
            : [['home', 'stats-player', '/golf/dashboard', '/golf/dashboard/stats'], ['stats-player', 'home', '/golf/dashboard/stats', '/golf/dashboard']];
          for (const [from, to, fromPath, toPath] of nav) {
            if (!wants(from) && !wants(to)) continue;
            for (let i = 0; i < runsN; i++) {
              const { ctx, page } = await openPage(browser, base, stateFile, viewport, problems, !opts['first-visit']);
              try {
                await loadCold(page, base, fromPath, readsFile);
                await sleep(1500); // links in view are prefetched
                const click = await navTo(page, toPath);
                const { snap, trace } = await step(page, readsFile, { target: toPath, click });
                record(`${from} -> ${to}`, 'nav', i, { kind: 'nav', ...figures(snap, trace, false) });
              } finally {
                await ctx.close();
              }
            }
          }
        }

        // ── geometry: the skeleton's blocks against the loaded page's (the destination's data is held back 1.5 s so the skeleton frame is stable) ──
        if (wants('geometry')) {
          const phone = viewport < 700;
          const pairs = role === 'coach'
            ? [['home', 'stats-team', '/golf/dashboard', '/golf/dashboard/stats'], ['home', 'stats-player', '/golf/dashboard', `/golf/dashboard/stats?player=${playerId}`], ['stats-team', 'home', '/golf/dashboard/stats', '/golf/dashboard']]
            : [['home', 'stats-player', '/golf/dashboard', '/golf/dashboard/stats'], ['stats-player', 'home', '/golf/dashboard/stats', '/golf/dashboard']];
          for (const [from, to, fromPath, toPath] of pairs) {
            // `--only geometry,stats-team` narrows to a route; `--only geometry` is every route.
            const routes = (only ?? []).filter((o) => o !== 'geometry');
            if (routes.length && !routes.some((o) => to.includes(o))) continue;
            const sels = LANDMARKS[to]?.[phone ? 'phone' : 'desk'] ?? [];
            if (!sels.length) continue;
            // The phone's Home has no leaderboard row to tap into a player's page.
            if (phone && toPath.includes('?')) continue;
            const { ctx, page } = await openPage(browser, base, stateFile, viewport, problems, !opts['first-visit']);
            try {
              await loadCold(page, base, fromPath, readsFile);
              await sleep(1500);
              await ctx.route((u) => u.pathname === toPath.split('?')[0] && u.searchParams.has('_rsc'), async (route) => {
                await sleep(1500);
                await route.continue().catch(() => undefined);
              });
              // A coach's team -> player tap is a row of the players table, not a nav item.
              if (toPath.includes('?')) {
                const row = page.locator(`a[href*="player=${playerId}"]`).locator('visible=true').first();
                await page.evaluate((p) => window.__perf.arm(p), toPath);
                await row.click();
              } else {
                const click = await navTo(page, toPath, 1500);
                await page.evaluate(() => window.__perf.arm(null));
                await click();
              }
              await page.waitForFunction(() => {
                const m = document.querySelector('#ch-content > main[aria-busy="true"]');
                return !!m && /^Loading/.test(m.getAttribute('aria-label') || '');
              }, null, { timeout: 30_000 });
              const skeleton = await landmarkRects(page, sels);
              await page.waitForFunction(() => {
                const m = document.querySelector('#ch-content > main');
                return !!m && m.getAttribute('aria-busy') !== 'true';
              }, null, { timeout: 60_000 });
              await sleep(800);
              const loaded = await landmarkRects(page, sels);
              geo.push({ role, viewport, scenario: `${from} -> ${to}`, landmarks: sels.map((sel, i) => ({ sel, skeleton: skeleton[i], loaded: loaded[i] })) });
            } catch (e) {
              problems.push(`geometry ${from} -> ${to}: ${String(e.message).slice(0, 120)}`);
            } finally {
              await ctx.close();
            }
          }
        }

        // ── switches: windows (a server round trip) and tabs (client only) on a settled page ──
        if (wants('switch')) {
          const targets = role === 'coach'
            ? [['stats-team', '/golf/dashboard/stats'], ['stats-player', `/golf/dashboard/stats?player=${playerId}`]]
            : [['stats-player', '/golf/dashboard/stats']];
          for (const [name, path] of targets) {
            if (!wants(name)) continue;
            for (let i = 0; i < runsN; i++) {
              const { ctx, page } = await openPage(browser, base, stateFile, viewport, problems, !opts['first-visit']);
              try {
                await loadCold(page, base, path, readsFile);
                await sleep(1200);
                for (const win of ['Season', 'Qualifiers', 'Last 10']) {
                  const radio = page.getByRole('radiogroup', { name: 'Window' }).locator('visible=true').first().getByRole('radio', { name: win, exact: true });
                  if (!(await radio.count())) continue;
                  const { snap, trace } = await step(page, readsFile, { click: () => radio.click() });
                  record(`${name} window ${win}`, 'switch', i, { kind: 'switch', ...figures(snap, trace, false) });
                }
                if (name === 'stats-player') {
                  for (const tab of ['Game detail', 'Rounds', 'Development', 'Overview']) {
                    const t = page.getByRole('tab', { name: new RegExp(`^${tab}`) }).locator('visible=true').first();
                    if (!(await t.count())) continue;
                    // A tab is client state: content is the frame after the tab reads selected.
                    const { snap, trace } = await step(page, readsFile, {
                      click: () => t.click(),
                      wait: async () => {
                        await page.waitForFunction((n) => [...document.querySelectorAll('[role="tab"]')].some((e) => e.getAttribute('aria-selected') === 'true' && e.textContent.startsWith(n)), tab);
                        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => ((window.__perf.contentAt = performance.now()), r())))));
                      },
                    });
                    record(`${name} tab ${tab}`, 'switch', i, { kind: 'switch', ...figures(snap, trace, false) });
                  }
                }
              } finally {
                await ctx.close();
              }
            }
          }
        }
        if (problems.length) all.push({ role, viewport, scenario: '(problems)', kind: 'problems', problems: [...new Set(problems)].slice(0, 20) });
      }
    }
  } finally {
    await browser.close();
  }

  // ── summary ──
  const groups = new Map();
  for (const r of all.filter((x) => x.kind !== 'problems')) {
    const k = `${r.role} ${r.viewport} | ${r.kind} | ${r.scenario}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const rows = [...groups].map(([k, runs]) => ({ key: k, ...summarise(runs) }));
  const out = { label, at: new Date().toISOString(), runsPerCase: runsN, throttle: '4x CPU (CDP)', machineAtStart, machineAtEnd: machineNow(), rows, runs: all, geometry: geo };
  const file = join(stateDir, 'results', `${label}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  const head = '| case | skeleton ms | content ms | LCP ms | CLS | CLS raw | long tasks | TBT ms | INP ms | reads | read ms | waves | server ms | doc KB | JS KB | flash |';
  console.log(head);
  console.log(head.replace(/[^|]/g, '-'));
  for (const r of rows) console.log(`| ${r.key} | ${r.skeleton ?? '-'} | ${r.content ?? '-'} | ${r.lcp ?? '-'} | ${r.cls} | ${r.clsRaw} | ${r.longCount} | ${r.tbt} | ${r.inp ?? '-'} | ${r.reads} | ${r.readMs} | ${r.waves} | ${r.serverMs} | ${r.docKB ?? '-'} | ${r.jsKB ?? '-'} | ${r.flash ? 'YES' : ''} |`);
  if (geo.length) {
    console.log('\nSkeleton geometry against the loaded page (top / height in px from the page top; delta = loaded - skeleton)\n');
    console.log('| case | landmark | skeleton | loaded | top delta | height delta |');
    console.log('| --- | --- | --- | --- | --- | --- |');
    for (const g of geo) for (const l of g.landmarks) console.log(`| ${g.role} ${g.viewport} ${g.scenario} | ${l.sel} | ${l.skeleton ? l.skeleton.join(' / ') : '-'} | ${l.loaded ? l.loaded.join(' / ') : '-'} | ${l.skeleton && l.loaded ? l.loaded[0] - l.skeleton[0] : '-'} | ${l.skeleton && l.loaded ? l.loaded[1] - l.skeleton[1] : '-'} |`);
  }
  for (const p of all.filter((x) => x.kind === 'problems')) console.log(`problems ${p.role} ${p.viewport}: ${p.problems.join(' ; ')}`);
  console.log(`saved ${file}`);
}

/**
 * A before and an after run side by side, as markdown (what docs/clubhouse/PROGRESS.md carries): per case, the figures that moved, as
 * "before -> after". `only` filters by a substring of the case name; cold loads, navigations and switches are separate tables.
 */
export function report({ stateDir, before, after, only, beforeGeometry, afterGeometry }) {
  const load = (label) => JSON.parse(readFileSync(join(stateDir, 'results', `${label}.json`), 'utf8'));
  const b = load(before);
  const a = load(after);
  // A run saved before the spread was recorded: take it from its runs.
  for (const run of [a, b]) {
    for (const row of run.rows) {
      if (row.contentRange !== undefined) continue;
      const mine = run.runs.filter((r) => r.kind !== 'problems' && `${r.role} ${r.viewport} | ${r.kind} | ${r.scenario}` === row.key);
      const range = (f) => {
        const v = mine.map(f).filter((x) => x != null && Number.isFinite(x));
        return v.length ? [r1(Math.min(...v)), r1(Math.max(...v))] : null;
      };
      row.contentRange = range((r) => r.content);
      row.lcpRange = range((r) => r.lcp);
      row.serverRange = range((r) => r.server.serverMs);
    }
  }
  // Geometry is its own pass (`measure --only geometry`), saved under its own label.
  const geometryOf = (run, label) => (label ? load(label).geometry : run.geometry);
  const bGeo = geometryOf(b, beforeGeometry);
  const aGeo = geometryOf(a, afterGeometry);
  const byKey = (run) => new Map(run.rows.map((r) => [r.key, r]));
  const bm = byKey(b);
  const pair = (x, y, digits = 0) => {
    const f = (v) => (v == null ? '-' : Number.isInteger(v) ? String(v) : v.toFixed(digits));
    return x === y || (x == null && y == null) ? f(x) : `${f(x)} -> ${f(y)}`;
  };
  // A timing with the spread of its runs: "310 (270-340)". Only a change larger than the spreads means anything on a shared machine.
  const spread = (r, key, rangeKey) => (r[rangeKey] ? `${pair(r[key], r[key])} (${r[rangeKey][0]}-${r[rangeKey][1]})` : pair(r[key], r[key]));
  const timing = (o, r, key, rangeKey) => `${spread(o, key, rangeKey)} -> ${spread(r, key, rangeKey)}`;
  const mach = (run) => (run.machineAtStart ? `load ${run.machineAtStart.load[0]}, swap ${run.machineAtStart.swapUsedMB}/${run.machineAtStart.swapTotalMB} MB` : 'not recorded');
  const out = [`Machine at the start of each run: before ${mach(b)}; after ${mach(a)}.`];
  for (const kind of ['cold', 'nav', 'switch']) {
    const rows = a.rows.filter((r) => r.key.split(' | ')[1] === kind && (!only || r.key.includes(only)));
    if (!rows.length) continue;
    out.push(`\n${kind === 'cold' ? 'Cold load' : kind === 'nav' ? 'Navigation (tap from a settled page)' : 'Switch (window or tab)'}\n`);
    out.push(`| case | ${kind === 'cold' ? 'LCP ms | ' : ''}content ms | CLS (raw) | long tasks / TBT ms | INP ms | reads | waves | server ms |` + (kind === 'switch' ? ' flash |' : ''));
    out.push(`| --- | ${kind === 'cold' ? '--- | ' : ''}--- | --- | --- | --- | --- | --- | --- |` + (kind === 'switch' ? ' --- |' : ''));
    for (const r of rows) {
      const o = bm.get(r.key);
      if (!o) continue;
      const [who, kindName, scenario] = r.key.split(' | ');
      out.push(
        `| ${who} ${scenario} | ${kind === 'cold' ? `${timing(o, r, 'lcp', 'lcpRange')} | ` : ''}${timing(o, r, 'content', 'contentRange')} | ${pair(o.clsRaw, r.clsRaw, 3)} | ${pair(o.longCount, r.longCount)} / ${pair(o.tbt, r.tbt)} | ${pair(o.inp, r.inp)} | ${pair(o.reads, r.reads)} | ${pair(o.waves, r.waves)} | ${timing(o, r, 'serverMs', 'serverRange')} |` +
          (kind === 'switch' ? ` ${o.flash ? 'YES' : 'no'} -> ${r.flash ? 'YES' : 'no'} |` : ''),
      );
      void kindName;
    }
  }
  // Skeleton geometry (rule 5): the loaded page's landmark minus the skeleton's, before -> after (0 is a skeleton that is the page's geometry).
  if (aGeo?.length && bGeo?.length) {
    out.push('\nSkeleton geometry: how far each landmark moves when the page lands (px; top / height)\n');
    out.push('| case | landmark | before | after |');
    out.push('| --- | --- | --- | --- |');
    const delta = (l) => (l?.skeleton && l?.loaded ? `${l.loaded[0] - l.skeleton[0]} / ${l.loaded[1] - l.skeleton[1]}` : '-');
    for (const g of aGeo) {
      const og = bGeo.find((x) => x.role === g.role && x.viewport === g.viewport && x.scenario === g.scenario);
      if (!og || (only && !g.scenario.includes(only))) continue;
      for (const l of g.landmarks) out.push(`| ${g.role} ${g.viewport} ${g.scenario} | ${l.sel} | ${delta(og.landmarks.find((x) => x.sel === l.sel))} | ${delta(l)} |`);
    }
  }
  console.log(out.join('\n'));
}
