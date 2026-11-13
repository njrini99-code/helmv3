/* global window, document -- injected into the page */
/*
 * INP and LCP from the browser's own Event Timing and LCP APIs (Safari 26.2 and later, Chromium). No package: the
 * same rules web-vitals uses, kept small.
 *
 *   Safari MCP (`safari-native`), after the page loads and before the interaction:
 *     evaluate_javascript: <this file's text>
 *     ...do the page's main interaction...
 *     evaluate_javascript: return window.__chVitals.read();
 *   Playwright: await context.addInitScript({ path: 'scripts/clubhouse/audit/safari-vitals.js' });
 *               ... await page.evaluate(() => window.__chVitals.read());
 *
 * read() returns { supported, lcp, inp, interactions }:
 *   supported      which entry types this browser has, and whether its event entries carry interactionId (needed for
 *                  INP; if false, inp is null and the report says so rather than guessing)
 *   lcp            { ms, element, size } of the last largest-contentful-paint entry, or null
 *   inp            the slowest interaction's duration in ms, skipping one per 50 interactions (the 98th percentile
 *                  rule); null with no interaction
 *   interactions   the slowest ten: { id, ms, type, target }
 * buffered observers mean an injection after load still sees the page's LCP and its earlier slow events.
 *
 * INP needs real input. Event Timing records only trusted events, and a scripted click (the Safari MCP's
 * page_interactions, element.click(), dispatchEvent) makes none, so inp stays null after one. Measure INP from a real
 * tap on the iPhone (tier D, Web Inspector) or a native click; LCP needs no input.
 */
(() => {
  if (window.__chVitals) return;
  const types = (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes) || [];
  // Support is read from the API, not from entries seen: a fast page can go a whole run without a slow event.
  const supported = {
    event: types.includes('event'),
    lcp: types.includes('largest-contentful-paint'),
    interactionId: typeof window.PerformanceEventTiming !== 'undefined' && 'interactionId' in window.PerformanceEventTiming.prototype,
  };
  const byInteraction = new Map();
  let lcp = null;
  const describe = (el) => {
    if (!el || !el.tagName) return null;
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  if (supported.event) {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.interactionId) continue;
        const prev = byInteraction.get(e.interactionId);
        if (!prev || e.duration > prev.ms) byInteraction.set(e.interactionId, { id: e.interactionId, ms: e.duration, type: e.name, target: describe(e.target) });
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  }
  if (supported.lcp) {
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1);
      if (last) lcp = { ms: Math.round(last.renderTime || last.loadTime || last.startTime), element: describe(last.element), size: last.size };
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  }
  window.__chVitals = {
    read() {
      const all = [...byInteraction.values()].sort((a, b) => b.ms - a.ms);
      const skip = Math.min(all.length - 1, Math.floor(all.length / 50));
      return {
        supported,
        url: document.location.pathname,
        lcp,
        inp: all.length && supported.interactionId ? Math.round(all[Math.max(0, skip)].ms) : null,
        interactions: all.slice(0, 10).map((i) => ({ ...i, ms: Math.round(i.ms) })),
      };
    },
  };
})();
