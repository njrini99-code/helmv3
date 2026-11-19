# Clubhouse shared — Changelog

## 2026-11-19 — `shell/use-warm-styles.ts`: section stylesheets warmed

```text
Design package: none
PR/commit: agent/clubhouse-heading-jump
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- New `shell/use-warm-styles.ts` (`useWarmStyles`), mounted in
  `ClubhouseShell`. When the thread is idle, it puts in place the
  stylesheet of each page fetched ahead. It reads the page's
  `<link rel="preload" as="style">` hints and calls React's `preinit`,
  one sheet per idle moment. A switch then finds the sheet already there.
- `src/lib/error-logging.ts`: an unhandled rejection whose reason is a
  stylesheet link's `error` Event is handled and logged as "Stylesheet
  failed to load: {address}" (medium). It is not logged while the page
  is going away. Every other rejection is unchanged
  (`src/lib/stylesheet-load-failure.ts`).

### Why

- F-26 (audit 2026-11-19): on the player phone, the first switch to
  Rounds or Team Hub drew the page before its stylesheet applied. React
  counts a sheet whose preload hint has loaded as ready, and WebKit
  applies a script-inserted sheet only after it loads. The headings
  then moved down 30 and 60 px, and the page showed unstyled for 1
  frame to about a second.
- The coach Home console error "Unhandled Promise Rejection: [object
  Event]" was React's promise on a stylesheet link it inserted
  (react-dom `acquireResource`), rejected with the link's error Event
  when WebKit cancelled the sheet's load.

### Verification

- Tier W (Playwright WebKit, iPhone 17 Pro, production build, staging):
  player CoachHelm, then Rounds, then Team Hub, each run in a new browser.
  - Before: Rounds moved +30 px in 3 of 4 runs and Team Hub +60 px in 2
    of 4. Every switch inserted its stylesheet.
  - After: no move in 6 of 6 runs, no frame with a sheet still loading,
    and no stylesheet inserted by a switch.
- Coach phone and player desktop (sidebar): no move before or after.
- Coach Home, two tabs tapped 80 ms apart, 6 runs: before, the
  rejection was reproduced in each set of runs; after, 0.
- `shell/__tests__/warm-styles.test.ts`,
  `src/lib/__tests__/stylesheet-load-failure.test.ts`. The fix stops a
  movement, so it has no still screenshots.
