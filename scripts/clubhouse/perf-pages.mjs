/* PAGES pass (perf 2026-10-01): CoachHelm, Rounds and Qualifiers. Helpers copied from perf-measure-run.mjs (the Stats/Home pass, no exports). Local only: http://localhost:<port>. Usage: node scripts/clubhouse/perf-pages.mjs --label before [--runs 3] [--only coachhelm,rounds,qualifiers] [--role coach,player] [--viewport 1280,390] */
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
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadavg } from 'node:os';
import { fileURLToPath } from 'node:url';

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
  const P = (window.__perf = { t0: 0, target: null, startPath: '', shifts: [], long: [], tl: [], skelAt: null, contentAt: null, optionalAt: null, lcp: null, fcp: null, clickAt: null, armed: false });
  const watch = (type, fn) => {
    try {
      new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true });
    } catch {
      /* unsupported entry type */
    }
  };
  watch('layout-shift', (e) => P.shifts.push([e.startTime, e.value, e.hadRecentInput]));
  watch('longtask', (e) => P.long.push([e.startTime, e.duration]));
  // Event timing: a tap's duration runs from the tap to the next paint, which is what INP counts (16 ms is the lowest threshold the API allows).
  P.events = [];
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
    // Optional-done: the page is live and no section placeholder (a streamed section's own skeleton, `aria-busy` + "Loading ...") is left in it.
    if (P.contentAt != null && P.optionalAt == null && !document.querySelector('#ch-content [aria-busy="true"][aria-label^="Loading"]'))
      requestAnimationFrame(() => P.optionalAt == null && !document.querySelector('#ch-content [aria-busy="true"][aria-label^="Loading"]') && (P.optionalAt = performance.now()));
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
    P.optionalAt = null;
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
      optionalAt: P.optionalAt,
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
    optional: rel(snap.optionalAt),
    ttfb: cold ? r1(snap.ttfb) : null,
    docKB: cold && snap.docBytes != null ? Math.round(snap.docBytes / 1024) : null,
    jsKB: cold ? Math.round(snap.jsBytes / 1024) : null,
    fcp: cold ? r1(snap.fcp) : null,
    lcp: cold ? r1(snap.lcp) : null,
    cls: r1(shifts.filter(([, , input]) => !input).reduce((a, [, v]) => a + v, 0) * 1000) / 1000,
    clsRaw: r1(shifts.reduce((a, [, v]) => a + v, 0) * 1000) / 1000,
    shiftCount: shifts.length,
    long: { count: long.length, ms: r1(long.reduce((a, [, d]) => a + d, 0)), max: r1(Math.max(0, ...long.map(([, d]) => d))), tbt: r1(long.reduce((a, [, d]) => a + Math.max(0, d - 50), 0)) },
    // The tap's own duration to the next paint (INP counts the longest of an interaction's events); null when no tap (a cold load) or under 16 ms.
    inp: cold ? null : (() => {
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
  await page.goto(`${base}/golf/login`, { waitUntil: 'domcontentloaded' });
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

async function openPage(browser, base, stateFile, viewport, problems) {
  const phone = viewport < 700;
  const ctx = await browser.newContext({
    storageState: stateFile,
    viewport: { width: viewport, height: phone ? 844 : 800 },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
  });
  await ctx.addInitScript(probe);
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

function summarise(runs) {
  const pick = (f) => median(runs.map(f));
  return {
    n: runs.length,
    skeleton: r1(pick((r) => r.skeleton)),
    content: r1(pick((r) => r.content)),
    optional: r1(pick((r) => r.optional)),
    fcp: r1(pick((r) => r.fcp)),
    lcp: r1(pick((r) => r.lcp)),
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


/** The view strip's control for `name`: a radio on desktop, a chip (button) on the phone. */
function viewControl(page, name) {
  const group = page.getByRole('radiogroup', { name: 'CoachHelm view' }).locator('visible=true').first();
  return {
    exists: async () => (await group.count()) > 0 || (await page.getByRole('group', { name: 'CoachHelm view' }).locator('visible=true').count()) > 0,
    click: async () => {
      if (await group.count()) return group.getByRole('radio', { name, exact: true }).click();
      return page.getByRole('group', { name: 'CoachHelm view' }).locator('visible=true').first().getByRole('button', { name, exact: true }).click();
    },
  };
}


/**
 * Geometry (docs/clubhouse/PAGE_PERFORMANCE.md rule 5): the route skeleton's blocks against the loaded page's. The swap replaces
 * nodes, so layout-shift never sees a skeleton that is the wrong height; this does. The page's own children are the landmarks: top (from the
 * page's top) and height of its first six blocks, in both frames. (Same method as the Stats and Home pass in perf-measure-run.mjs.)
 */
const BLOCKS = [1, 2, 3, 4, 5, 6].map((i) => `> main > :nth-child(${i})`);

async function landmarkRects(page, selectors) {
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
  await sleep(120);
  return page.evaluate((sels) => {
    const root = document.getElementById('ch-content');
    const top0 = root ? root.getBoundingClientRect().top : 0;
    return sels.map((s) => {
      const el = [...document.querySelectorAll(`#ch-content ${s}`)].find((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.top - top0), Math.round(r.height)];
    });
  }, selectors);
}

export async function measurePages(opts) {
  const base = `http://localhost:${opts.port}`;
  const runsN = Number(opts.runs ?? 3);
  const label = typeof opts.label === 'string' ? opts.label : 'pages';
  const roles = String(opts.role ?? 'coach,player').split(',');
  const viewports = String(opts.viewport ?? '1280,390').split(',').map(Number);
  const only = opts.only ? String(opts.only).split(',') : null;
  const wants = (name) => !only || only.some((o) => name.includes(o));
  const { seed, stateDir, readsFile } = opts;
  mkdirSync(join(stateDir, 'results'), { recursive: true });
  const res = await fetch(`${base}/golf/login`, { redirect: 'manual' }).catch(() => null);
  if (!res) throw new Error(`nothing is serving ${base}: run \`serve\` first`);

  const browser = await chromium.launch({ headless: true });
  const people = { coach: seed.coach, player: seed.players[0] };
  const all = [];
  const geo = [];
  const load0 = loadavg()[0];
  try {
    for (const role of roles) {
      const stateFile = join(stateDir, `state-${role}.json`);
      if (!existsSync(stateFile) || Date.now() - statSync(stateFile).mtimeMs > 40 * 60_000) await signIn(browser, base, people[role], stateFile);
      for (const viewport of viewports) {
        const problems = [];
        const record = (scenario, kind, run, f) => all.push({ role, viewport, scenario, kind, run, ...f });
        const cold =
          role === 'coach'
            ? {
                'coachhelm board': '/golf/dashboard/coachhelm',
                'coachhelm ask': '/golf/dashboard/coachhelm?view=ask',
                'qualifiers list': '/golf/dashboard/qualifiers',
                'qualifier detail': `/golf/dashboard/qualifiers/${seed.qualifierId}`,
              }
            : {
                'coachhelm board': '/golf/dashboard/coachhelm',
                'coachhelm profile': '/golf/dashboard/coachhelm?view=profile',
                'coachhelm standing': '/golf/dashboard/coachhelm?view=standing',
                'coachhelm deep-dive': '/golf/dashboard/coachhelm?view=deep-dive',
                'rounds library': '/golf/dashboard/rounds',
                'qualifiers list': '/golf/dashboard/qualifiers',
                'qualifier detail': `/golf/dashboard/qualifiers/${seed.qualifierId}`,
              };
        let reviewHref = null;

        // ── cold loads ──
        for (const [name, path] of Object.entries(cold)) {
          if (!wants(name)) continue;
          for (let i = 0; i < runsN; i++) {
            const { ctx, page } = await openPage(browser, base, stateFile, viewport, problems);
            try {
              const { snap, trace } = await loadCold(page, base, path, readsFile);
              if (!snap.clubhouse) throw new Error(`${path} did not render Clubhouse`);
              if (name === 'rounds library' && !reviewHref) reviewHref = await page.evaluate(() => document.querySelector('a.ch-rd-sc')?.getAttribute('href') ?? null);
              record(name, 'cold', i, { kind: 'cold', ...figures(snap, trace, true) });
              // Warm: the same page loaded again in the same browser context (its JS and CSS already fetched and cached).
              const warm = await loadCold(page, base, path, readsFile);
              record(name, 'warm', i, { kind: 'warm', ...figures(warm.snap, warm.trace, true) });
            } finally {
              await ctx.close();
            }
          }
        }
        if (reviewHref && wants('round review')) {
          for (let i = 0; i < runsN; i++) {
            const { ctx, page } = await openPage(browser, base, stateFile, viewport, problems);
            try {
              const { snap, trace } = await loadCold(page, base, reviewHref, readsFile);
              record('round review', 'cold', i, { kind: 'cold', ...figures(snap, trace, true) });
            } finally {
              await ctx.close();
            }
          }
        }

        // ── client navigations from a settled, prefetched page: tap the link ──
        const navs = [['qualifiers list -> detail', '/golf/dashboard/qualifiers', 'a.ch-qf-card, a.ch-qf-hero'], ...(role === 'player' ? [['rounds library -> review', '/golf/dashboard/rounds', 'a.ch-rd-sc']] : [])];
        for (const [name, fromPath, sel] of navs) {
          if (!wants(name.split(' ')[0]) && !wants(name)) continue;
          for (let i = 0; i < runsN; i++) {
            const { ctx, page } = await openPage(browser, base, stateFile, viewport, problems);
            try {
              await loadCold(page, base, fromPath, readsFile);
              await sleep(1500);
              const link = page.locator(sel).locator('visible=true').first();
              const href = await link.getAttribute('href');
              const { snap, trace } = await step(page, readsFile, { target: href, click: () => link.click() });
              record(name, 'nav', i, { kind: 'nav', ...figures(snap, trace, false) });
            } finally {
              await ctx.close();
            }
          }
        }

        // ── view switches on a settled CoachHelm page: the strip, then what the page showed ──
        if (wants('coachhelm') || wants('switch')) {
          const steps = role === 'coach' ? ['Ask', 'Board'] : ['Game profile', 'Standing', 'Deep dive', 'Board'];
          for (let i = 0; i < runsN; i++) {
            const { ctx, page } = await openPage(browser, base, stateFile, viewport, problems);
            try {
              await loadCold(page, base, '/golf/dashboard/coachhelm', readsFile);
              await sleep(1500);
              let at = 'board';
              for (const to of steps) {
                const ctl = viewControl(page, to);
                if (!(await ctl.exists())) break;
                const { snap, trace } = await step(page, readsFile, { click: () => ctl.click() });
                record(`coachhelm ${at} -> ${to.toLowerCase()}`, 'switch', i, { kind: 'switch', ...figures(snap, trace, false) });
                at = to.toLowerCase();
              }
            } finally {
              await ctx.close();
            }
          }
        }
        // ── geometry: the destination's data is held back 1.5 s so its route skeleton frame is stable, then the loaded frame ──
        if (opts.geometry || wants('geometry')) {
          const pairs =
            role === 'coach'
              ? [['/golf/dashboard', '/golf/dashboard/coachhelm'], ['/golf/dashboard', '/golf/dashboard/qualifiers'], ['/golf/dashboard/qualifiers', `/golf/dashboard/qualifiers/${seed.qualifierId}`]]
              : [['/golf/dashboard', '/golf/dashboard/coachhelm'], ['/golf/dashboard', '/golf/dashboard/rounds'], ['/golf/dashboard', '/golf/dashboard/qualifiers'], ['/golf/dashboard/qualifiers', `/golf/dashboard/qualifiers/${seed.qualifierId}`]];
          for (const [fromPath, toPath] of pairs) {
            const { ctx, page } = await openPage(browser, base, stateFile, viewport, problems);
            try {
              await loadCold(page, base, fromPath, readsFile);
              await sleep(1500);
              await ctx.route((u) => u.pathname === toPath && u.searchParams.has('_rsc'), async (route) => {
                await sleep(1500);
                await route.continue().catch(() => undefined);
              });
              const link = page.locator(`a[href="${toPath}"]`).locator('visible=true').first();
              await page.evaluate((t) => window.__perf.arm(t), toPath);
              await link.click();
              await page.waitForFunction(() => {
                const m = document.querySelector('#ch-content > main[aria-busy="true"]');
                return !!m && /^Loading/.test(m.getAttribute('aria-label') || '');
              }, null, { timeout: 30_000 });
              const skeleton = await landmarkRects(page, BLOCKS);
              await page.waitForFunction(() => {
                const m = document.querySelector('#ch-content > main');
                return !!m && m.getAttribute('aria-busy') !== 'true';
              }, null, { timeout: 60_000 });
              await sleep(800);
              const loaded = await landmarkRects(page, BLOCKS);
              geo.push({ role, viewport, scenario: `${fromPath.replace('/golf/dashboard', '') || 'home'} -> ${toPath.replace('/golf/dashboard/', '').replace(seed.qualifierId, '<id>')}`, landmarks: BLOCKS.map((sel, i) => ({ sel: `block ${i + 1}`, skeleton: skeleton[i], loaded: loaded[i] })) });
            } catch (e) {
              problems.push(`geometry ${fromPath} -> ${toPath}: ${String(e.message).slice(0, 120)}`);
            } finally {
              await ctx.close();
            }
          }
        }
        if (problems.length) all.push({ role, viewport, scenario: '(problems)', kind: 'problems', problems: [...new Set(problems)].slice(0, 20) });
      }
    }
  } finally {
    await browser.close();
  }

  const groups = new Map();
  for (const r of all.filter((x) => x.kind !== 'problems')) {
    const k = `${r.role} ${r.viewport} | ${r.kind} | ${r.scenario}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const rows = [...groups].map(([k, runs]) => ({ key: k, ...summarise(runs) }));
  const out = { label, at: new Date().toISOString(), runsPerCase: runsN, throttle: '4x CPU (CDP)', loadavg1m: { start: Math.round(load0 * 10) / 10, end: Math.round(loadavg()[0] * 10) / 10 }, rows, runs: all, geometry: geo };
  const file = join(stateDir, 'results', `${label}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  const headRow = '| case | skeleton ms | content ms | optional-done ms | LCP ms | CLS | CLS raw | long tasks | TBT ms | tap INP ms | reads | read ms | waves | server ms | flash |';
  console.log(headRow);
  console.log(headRow.replace(/[^|]/g, '-'));
  for (const r of rows) console.log(`| ${r.key} | ${r.skeleton ?? '-'} | ${r.content ?? '-'} | ${r.optional ?? '-'} | ${r.lcp ?? '-'} | ${r.cls} | ${r.clsRaw} | ${r.longCount} | ${r.tbt} | ${r.inp ?? '-'} | ${r.reads} | ${r.readMs} | ${r.waves} | ${r.serverMs} | ${r.flash ? 'YES' : ''} |`);
  for (const p of all.filter((x) => x.kind === 'problems')) console.log(`problems ${p.role} ${p.viewport}: ${p.problems.join(' ; ')}`);
  if (geo.length) {
    console.log('\nSkeleton geometry against the loaded page (top / height in px from the page top; delta = loaded - skeleton)\n');
    console.log('| case | block | skeleton | loaded | top delta | height delta |');
    console.log('| --- | --- | --- | --- | --- | --- |');
    for (const g of geo)
      for (const l of g.landmarks) {
        const d = l.skeleton && l.loaded ? [l.loaded[0] - l.skeleton[0], l.loaded[1] - l.skeleton[1]] : null;
        console.log(`| ${g.role} ${g.viewport} ${g.scenario} | ${l.sel} | ${l.skeleton ? l.skeleton.join(' / ') : '-'} | ${l.loaded ? l.loaded.join(' / ') : '-'} | ${d ? d[0] : '-'} | ${d ? d[1] : '-'} |`);
      }
  }
  console.log(`machine load (1 min average) at start ${out.loadavg1m.start}, at end ${out.loadavg1m.end}`);
  console.log(`saved ${file}`);
}

// ── CLI ──
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE_DIR = join(ROOT, '.helm', 'runtime', 'clubhouse-perf');
const argv = process.argv.slice(2);
const cliOpts = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const next = argv[i + 1];
  cliOpts[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : (i++, next);
}
const cliPort = Number(cliOpts.port ?? 3200);
if (!Number.isInteger(cliPort)) throw new Error('bad port');
await measurePages({ ...cliOpts, port: cliPort, stateDir: STATE_DIR, readsFile: join(STATE_DIR, 'reads.ndjson'), seed: JSON.parse(readFileSync(join(STATE_DIR, 'seed.json'), 'utf8')) });
