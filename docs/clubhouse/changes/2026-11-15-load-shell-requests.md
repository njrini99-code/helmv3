# Shell load — Changelog

## 2026-11-15 — No second fetch of the page; PostHog off the first load

```text
Design package: none (production audit 2026-11-15, MAC-11 and MAC-12, fix list item 9 "Load")
PR/commit: claude/project-thread-10vtd2 (worker F, load)
Contract IDs: none changed
Actions: none
Data impact: none (fewer requests; no write, no schema change)
Held items: the network-panel check on a phone (below); the first-load JS measurement (below)
```

### Changed

- `shell/link-prefetch.ts` (new), `shell/SectionStrip.tsx`, `shell/Sidebar.tsx`:
  the nav link to the page already on screen takes `prefetch={false}`; every
  other link keeps Next's default. Next prefetches every `<Link>` within 200px
  of the viewport, the current address included, and a document load's page is
  not in its segment cache, so that link asked the server for the page again
  (MAC-12, "each screen requests its own URL twice").
- `src/components/providers/PostHogProvider.tsx`,
  `src/components/demo/DemoEnterTracker.tsx` (outside Clubhouse, in the root
  layout and the shell): posthog-js loads on the first capture instead of in
  every route's first-load JavaScript (about 105 KB gzipped of the 846 KB every
  Clubhouse route shared in the earlier build, MAC-11). The guards are the same
  (nothing on localhost or without a key, and then posthog-js is never fetched);
  captures keep their order. The demo arrival event now waits for PostHog to
  start, so it is sent where it was dropped before (the tracker's effect ran
  before the root layout's init).
- `src/instrumentation-client.ts`,
  `src/lib/observability/repeat-error-sampler.ts` (new): a page load sends the
  first three events of each error (digits folded, so "Row 12 failed" and "Row
  13 failed" are one) and at most 30 error events in all; `dedupeIntegration` is
  named in the browser list. The Sentry tunnel returned 429 on Drills (MAC-12).
  DSN, project and server config unchanged.

### Why

- Fix list item 9: find the second request of each screen's own URL, stop the
  tunnel's 429s, and get every route nearer the 300 KB first-load budget.

### Verification

- Unit (vitest): `shell/__tests__/link-prefetch.test.tsx` (the helper, and the
  strip prefetching every section but the one on screen), `section-strip-nav`,
  `rail-toggle`, `identity-menu`;
  `components/providers/__tests__/posthog-lazy.test.ts` (no static import; the
  loader's guards, one init, event order, a failed chunk);
  `analytics-csp-hosts`;
  `lib/observability/__tests__/repeat-error-sampler.test.ts` (key folding,
  per-error and total caps, the beforeSend wiring);
  `instrumentation-client-privacy-sentinel`, `sentry-replay-privacy`,
  `sentry-application-key`.
- Not measured here (no build or browser in this container while other workers
  run): `node scripts/clubhouse/route-js-budget.mjs --next <.next>
  --report-only` on a production build should show the shared first-load JS
  about 105 KB lower; a Network panel on a phone-width cold load of Stats,
  Calendar and Settings should show one request for the page's own address,
  where it showed two. Engine tier for both: C (Chromium) is enough for the
  request count and the bundle; nothing here moves.
