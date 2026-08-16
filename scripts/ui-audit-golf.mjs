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
//
// ---------------------------------------------------------------------------
// WHAT THIS HARNESS USED TO GET WRONG (all fixed 2026-08-15; read before
// trusting any pre-2026-08-15 report in docs/ui-audits/)
// ---------------------------------------------------------------------------
// The 2026-08-15 post-deploy run produced 105 findings. Roughly 94 of them were
// artifacts of the harness, not defects in the app. Six separate bugs, each of
// which made a CORRECT implementation look broken — the worst failure mode a
// checker can have, because it trains people to ignore it:
//
//  1. TOUCH NEVER EMULATED. The mobile context set only a 390px viewport, so
//     `pointer: fine` still matched and every `[@media(pointer:coarse)]` rule
//     was inert. Fairway's Button already grows 36px→44px on coarse pointers,
//     so the harness measured the mouse size and filed 30 tap-target defects
//     against code that was already right. Now `hasTouch: true, isMobile: true`.
//
//  2. ACCESSIBLE NAME FROM `innerText`. `innerText` is layout-dependent and
//     returns '' for content that is present but not currently rendered — e.g.
//     inside a collapsed <details>. That filed 18 correctly-labelled buttons on
//     /my-game-profile as unnamed. Now derived from aria-label →
//     aria-labelledby → visible descendant text → title → img alt → svg title.
//
//  3. `alt=""` COUNTED AS MISSING. The check was `!i.alt`, and the empty string
//     is falsy — but `alt=""` is the CORRECT marking for a decorative image.
//     The app-header logo (correctly `alt=""` inside a Link that carries
//     aria-label="GolfHelm home") generated 46 findings, one per route, that no
//     product change could ever clear. Now `getAttribute('alt') === null`.
//
//  4. SCREENSHOT FILENAME COLLISION. The slug was route__viewport with no
//     persona, and 10 routes are walked by BOTH personas — so the player
//     capture overwrote the coach one and a 94-visit run yielded 74 images.
//     Now persona__route__viewport.
//
//  5. CLIPPED-TEXT DETECTOR SELECTED FOR CORRECT BEHAVIOUR.
//     `scrollWidth > clientWidth` is true BY DEFINITION of `truncate` — content
//     overflowing its box is what `text-overflow: ellipsis` is FOR. So the
//     check fired preferentially on elements truncating on purpose. Now split
//     three ways: `text-overflow: clip` on a fixed label is a real hard clip
//     (P1); ellipsis WITH a title/aria-label carrying the full string is
//     designed and dropped; ellipsis WITHOUT one is reported at P2.
//
//  6. TAP TARGETS MEASURED THE PAINTED BOX, NOT THE HIT AREA.
//     The house idiom for a small chip with a full-size touch target is an
//     absolutely-positioned `::before` with negative insets (`before:-inset-2`
//     = 8px a side). `getBoundingClientRect()` cannot see a pseudo-element, so
//     InstrumentTableToggle — 28px painted, 44px tappable, and commented as
//     such — reported as a 28px violation. Now the ::before insets are added
//     before the 44px test.
//
// The lesson the six share: a green check and a red check are equally useless
// if the harness cannot reproduce the condition the code responds to. Before
// filing anything from this script as a defect, ask what the probe can actually
// see. Two checks it still CANNOT see, by construction:
//   - anything that only manifests under prefers-reduced-motion (screenshots
//     are taken ~2200ms in, after any reveal animation has run)
//   - transient two-stage layout flashes (same settle delay erases them)
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

/**
 * A dev server compiles a route the first time it is asked for one.
 *
 * Against prod every route is prebuilt and the login flow is a couple of
 * seconds. Against `--base=http://localhost:*` the FIRST request to
 * `/golf/login` cost 7.3s of compile, and the redirect target has to compile
 * too — which outran the post-submit wait, so the run authenticated nothing
 * and walked zero routes while still exiting 0. A pass that proves nothing but
 * looks like a pass is worse than a failure.
 *
 * So: against a local base, pay the compile cost up front on both sides of the
 * redirect, and give the login itself a much longer leash. No effect on prod
 * runs, which skip this entirely.
 */
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);

async function warm(page, routes) {
  for (const r of routes) {
    try {
      await page.goto(BASE + r, { waitUntil: 'domcontentloaded', timeout: 180000 });
    } catch { /* a warm-up miss is not a finding — the real pass will report it */ }
  }
}

async function login(page, email, password) {
  if (IS_LOCAL) await warm(page, ['/golf/login', '/golf/dashboard']);
  const settle = IS_LOCAL ? 180000 : 45000;
  await page.goto(`${BASE}/golf/login`, { waitUntil: 'domcontentloaded', timeout: settle });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    // Wait for the URL to stop being the LOGIN page — not merely to be
    // somewhere under /golf.
    //
    // This was `waitForURL('**/golf/**')`, which is vacuous: `/golf/login`
    // itself matches it, so the wait resolved instantly and gated nothing. The
    // only real settle was the fixed timeout below, and a measured prod login
    // takes 2548-3358ms against a 2500ms budget — so authentication was a coin
    // flip. On the 2026-08-15 post-deploy run, 2 of 4 persona/viewport contexts
    // silently failed to log in (coach/desktop and player/mobile), and the
    // earlier "coach only" baseline was almost certainly the same bug.
    //
    // A failed login is not a loud error either: the run continues and every
    // route reports as a login-redirect, which reads as broken auth rather than
    // as a broken harness.
    page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: settle })
      .catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(IS_LOCAL ? 6000 : 2500);
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
  const out = { overflow: null, noName: [], noAlt: 0, tiny: [], clipped: [], truncated: [], empty: false, counts: {} };
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
  /**
   * The control's accessible name, approximating what a screen reader computes.
   *
   * This was `el.innerText || aria-label || title || img.alt`. `innerText` is
   * LAYOUT-dependent: it returns '' for anything not currently rendered, even
   * when the element is present, named and reachable. On /my-game-profile that
   * reported 18 correctly-labelled buttons ("Make focus area" / "Acknowledge" /
   * "Dismiss", 6 cards x 3) as unnamed, purely because they sit inside a
   * COLLAPSED <details>. `getByRole('button', { name })` finds all 18.
   *
   * The fix must not overshoot into `textContent`, which would swing the other
   * way and hide a real defect: on /documents the "New folder" label lives in
   * `<span class="hidden sm:inline">`, and at 390px that span is `display:none`
   * — genuinely excluded from the accessible name, leaving a bare icon button
   * (`getByRole` finds 0 at mobile, 1 at desktop). That one MUST keep failing.
   *
   * So: walk the subtree and take text only from descendants that are not
   * themselves hidden. A closed <details> does not set `display:none` on its
   * descendants, so their text is collected; a `hidden sm:inline` span does,
   * so its text is not. That single distinction separates the two cases.
   *
   * Deliberately does NOT consult srOnly(): the visually-hidden recipe
   * (1px box / clip-path) is the CANONICAL way to label an icon button, and
   * that text must count as a name.
   */
  const visibleText = (node) => {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden') return '';
    if (node.getAttribute('aria-hidden') === 'true') return '';
    let s = '';
    node.childNodes.forEach((ch) => { s += visibleText(ch); });
    return s;
  };
  const named = (el) => {
    const aria = (el.getAttribute('aria-label') || '').trim();
    if (aria) return aria;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const txt = labelledBy.split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((n) => (n.textContent || '').trim())
        .join(' ').trim();
      if (txt) return txt;
    }
    const txt = visibleText(el).replace(/\s+/g, ' ').trim();
    if (txt) return txt;
    const title = (el.getAttribute('title') || '').trim();
    if (title) return title;
    const imgAlt = ((el.querySelector('img') || {}).alt || '').trim();
    if (imgAlt) return imgAlt;
    const svgTitle = (el.querySelector('svg title')?.textContent || '').trim();
    return svgTitle || '';
  };
  document.querySelectorAll('button, a[href], [role="button"], [role="tab"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (!named(el)) out.noName.push(el.tagName.toLowerCase() + (el.className || '').toString().slice(0, 40));
    // A skip link is not a tap target — it is never pointed at.
    if (srOnly(el)) return;
    // Measure the HIT AREA, not the painted box.
    //
    // This repo's idiom for "small visual chip, full-size touch target" is an
    // absolutely-positioned `::before` with negative insets — e.g.
    // InstrumentTableToggle is `h-7` (28px) plus
    // `before:absolute before:-inset-2` (8px every side) = a 44px hit area, and
    // the source comment says exactly that. `getBoundingClientRect()` returns
    // the element box and can never see a pseudo-element, so the documented,
    // deliberate 44px idiom reported as a 28px violation. Same pattern in
    // ChartFrame, PrivacySettingsForm and DocumentCard.
    const slop = { x: 0, y: 0 };
    try {
      const pb = getComputedStyle(el, '::before');
      const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
      if (pb && pb.content && pb.content !== 'none' && pb.content !== 'normal' && pb.position === 'absolute') {
        slop.x = Math.max(0, -px(pb.left)) + Math.max(0, -px(pb.right));
        slop.y = Math.max(0, -px(pb.top)) + Math.max(0, -px(pb.bottom));
      }
    } catch { /* pseudo-element unreadable — fall through to the class check */ }
    // Belt and braces: if the computed pseudo-element could not be read, honour
    // the Tailwind class that declares the intent.
    if (!slop.x && !slop.y && /before:-inset-/.test((el.className || '').toString())) {
      const m = (el.className || '').toString().match(/before:-inset-([\d.]+)/);
      const rem = m ? parseFloat(m[1]) * 4 : 0; // tailwind spacing unit = 4px
      slop.x = rem * 2; slop.y = rem * 2;
    }
    const hitW = r.width + slop.x, hitH = r.height + slop.y;
    if ((hitW < 44 || hitH < 44) && r.width > 0)
      out.tiny.push({ t: named(el).slice(0, 28), w: Math.round(hitW), h: Math.round(hitH) });
  });
  // MISSING alt is a defect; `alt=""` is not — it is the CORRECT way to mark an
  // image decorative. This was `!i.alt`, and the empty string is falsy, so every
  // correctly-decorative image counted: the app-header logo
  // (FairwayDashboardShell.tsx:205, `alt=""` inside a Link that already carries
  // aria-label="GolfHelm home") produced 46 findings on the 2026-08-15 run,
  // one per route. The right fix was already in the code and the check could
  // never go green, which is how a check teaches people to ignore it.
  document.querySelectorAll('img').forEach((i) => {
    if (i.getAttribute('alt') === null) out.noAlt++;
  });
  /**
   * Clipped text — but only where clipping is NOT the intended behaviour.
   *
   * `scrollWidth > clientWidth` is true BY DEFINITION for every element using
   * `truncate`: content overflowing its box is exactly what `text-overflow:
   * ellipsis` exists to handle. So the bare condition selects preferentially
   * for elements that are truncating on purpose, and it reported 26 rows of
   * which only a handful were defects.
   *
   * Split by whether the design provided an affordance:
   *   - `text-overflow: clip`  -> HARD clip, no ellipsis, no way to read the
   *     rest. On a label that never varies ("View as table") the container is
   *     simply too small. Real defect -> `hard`.
   *   - `ellipsis` + a title/aria-label carrying the full string -> the text
   *     stays reachable. Working as designed -> dropped entirely.
   *   - `ellipsis` with NO such affordance -> truncated and unreachable. Milder,
   *     usually long user data -> `soft`, reported at P2.
   */
  const fullTextAffordance = (el) => {
    let n = el;
    for (let i = 0; i < 3 && n; i++) {
      if ((n.getAttribute('title') || '').trim()) return true;
      if ((n.getAttribute('aria-label') || '').trim()) return true;
      n = n.parentElement;
    }
    return false;
  };
  document.querySelectorAll('h1,h2,h3,p,span,div,button,a').forEach((el) => {
    if (el.children.length) return;
    if (srOnly(el)) return; // clipping is the POINT of a visually-hidden element
    if (!(el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0)) return;
    const text = (el.innerText || '').trim();
    if (!text) return;
    const ellipsis = getComputedStyle(el).textOverflow === 'ellipsis';
    if (ellipsis && fullTextAffordance(el)) return; // designed truncation, full string reachable
    (ellipsis ? out.truncated : out.clipped).push(text.slice(0, 40));
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

async function auditRoute(page, route, vp, findings, persona) {
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
  // HARD clip (no ellipsis) is a defect: on a label that never varies the
  // container is simply too small and the rest is unreadable.
  if (probe.clipped?.length)
    findings.push({ route, vp: vp.name, sev: 'P1', what: `text hard-clipped (no ellipsis): ${probe.clipped.slice(0, 2).join(' | ')}` });
  // Ellipsis WITHOUT a title/aria-label carrying the full string: the text is
  // unreachable, but it degrades gracefully. Reported, not alarmed about.
  if (probe.truncated?.length)
    findings.push({ route, vp: vp.name, sev: 'P2', what: `${probe.truncated.length} truncated with no full-text affordance, e.g. ${probe.truncated.slice(0, 2).join(' | ')}` });
  if (vp.name === 'mobile' && probe.tiny?.length > 2)
    findings.push({ route, vp: vp.name, sev: 'P2', what: `${probe.tiny.length} tap targets under 44px, e.g. ${probe.tiny.slice(0, 2).map((t) => `"${t.t}" ${t.w}x${t.h}`).join(', ')}` });
  if (probe.noAlt) findings.push({ route, vp: vp.name, sev: 'P2', what: `${probe.noAlt} image(s) with no alt text` });

  fs.mkdirSync(SHOTS, { recursive: true });
  // Persona belongs in the filename. Without it the slug was route__viewport,
  // and 10 routes are walked by BOTH personas — so the player capture silently
  // overwrote the coach one and a 94-visit run produced 74 images. The coach's
  // view of /dashboard, /rounds, /stats, /calendar, /messages, /announcements,
  // /documents, /courses, /settings and /whats-new never reached disk, which is
  // precisely where "same route, wrong persona's UI" bugs live.
  const slug = persona + '__' + route.replace(/\//g, '_').replace(/^_/, '') + '__' + vp.name;
  try { await page.screenshot({ path: path.join(SHOTS, slug + '.png'), fullPage: false }); } catch {}
  return probe;
}

async function runPersona(browser, name, email, password, routes, findings, covered) {
  if (!email || !password) {
    findings.push({ route: '-', vp: '-', sev: 'P0', what: `${name}: credentials missing from .env.local — persona skipped` });
    return;
  }
  for (const vp of VIEWPORTS) {
    // The mobile context must emulate TOUCH, not merely a narrow window.
    //
    // Without `hasTouch`, a 390px-wide context still reports `pointer: fine`,
    // so every `[@media(pointer:coarse)]` rule is inert. The Fairway Button
    // primitive already does the right thing — `min-h-[36px]` for a mouse and
    // `[@media(pointer:coarse)]:min-h-[44px]` for touch
    // (controls/button.tsx:124, and h-9→h-11 for icon buttons at :268) — so the
    // harness was measuring the MOUSE size and reporting it as a mobile
    // tap-target defect. That produced 30 findings against code that was
    // already correct.
    //
    // `isMobile` additionally sets a mobile UA + meta-viewport handling, which
    // is the more faithful emulation; `hasTouch` alone is what flips
    // `pointer: coarse` if isMobile ever proves troublesome on chromium.
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      ...(vp.name === 'mobile' ? { hasTouch: true, isMobile: true } : {}),
    });
    const page = await ctx.newPage();
    const ok = await login(page, email, password);
    if (!ok) {
      findings.push({ route: '/golf/login', vp: vp.name, sev: 'P0', what: `${name}: login failed — still on the login page` });
      await ctx.close();
      continue;
    }
    console.log(`  ${name}/${vp.name}: logged in`);
    for (const r of routes) {
      const p = await auditRoute(page, r, vp, findings, name);
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
