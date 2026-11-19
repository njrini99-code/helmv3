# P001 Shell — Changelog

## 2026-11-18 — Back lands at the saved place without a jump

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: CH-1904, PAGE_PERFORMANCE rule 1 (unchanged)
Actions: none
Data impact: none
Held items: none
```

### Changed

- `shell/RouteFrame.tsx`: `history.scrollRestoration` is `manual` while a Clubhouse
  frame is up (the previous value comes back when it unmounts). The frame already
  restores the scroll on Back itself (`restoreScroll`); the browser's own restore
  ran after it and the frame put it right a frame later.

### Why

- Clubhouse audit 2026-11-18 (P2), "layout jumps after Back". On the pre-fix
  build (WebKit, iPhone 17 Pro preset, coach), Back from a round to Home drew a
  first frame at scrollY 994 and the next at 946: the heading moved 48 px while
  the page itself did not move (heading top minus scroll was constant). That is
  the browser's restore landing after the frame's.
- The coach switch to Team Hub measured no movement (heading at 110 px from the
  first frame). The player's Rounds (+30) and Team Hub (+60) readings were not
  re-measured here: the auditor flagged them as not scroll-corrected.

### Verification

- `__tests__/route-frame-scroll.test.tsx` (new case) and the RouteFrame suites.
- Trade-off: a full reload of a scrolled Clubhouse page now opens at the top, as
  a new page does, rather than where the browser left it.
