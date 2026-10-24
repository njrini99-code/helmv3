# 2026-10-24 — Phone: a drill-in you can drag back, even mid-push

## 2026-10-24 — The page slides itself, so a finger can take it (C1)

```text
Design package: none (Clubhouse A+ Phase 3, C1; rows 2 and 89)
PR/commit:      agent/aplus-phase3
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     an iPhone pass (drag, dark-mode copy, a grab mid-push)
```

### Changed

- A phone drill-in no longer slides by a view transition, whose snapshots can't
  be grabbed: the live page slides in over a copy of the page it left
  (`lib/nav-motion.ts`), and the view transition swaps at once (`shell.css`).
- A pushed route page can be dragged back from the left edge
  (`shell/use-route-swipe.ts`), with the pushed screen's rules, and a finger
  can take a push still sliding in (`grabPush`, `createEdgeSwipe(width, from)`).
- A swipe that lets go past the mark presses the bar's Back without the pop
  playing again (`lib/ua-pop.ts markHandPop`).
- The swipe's non-passive `touchmove` is attached only while a touch that
  landed at the edge is read, so other touches scroll without waiting on JS.
- The unused view-transition push keyframes are gone.

### Verification

- `lib/__tests__/grab-push.test.ts` (push, grab, Back mid-push, Animations
  off); `edge-swipe.test.tsx` (grabbed where it stands); `native-nav.test.tsx`
  updated for the new push; `route-swipe-listeners.test.tsx`. Owed: the iPhone
  pass above, and a WebKit check that the copy sits under the page and bars
  (the canvas has `container-type`, so its stacking must be confirmed).
