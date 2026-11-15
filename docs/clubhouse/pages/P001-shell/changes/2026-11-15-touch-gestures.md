# 2026-11-15 — edge swipe and pull to refresh hold up no scroll

## 2026-11-15 — Blocking touchmove only for a real gesture (MOT-02, MOT-03)

```text
Design package: none (production audit 2026-11-15, Batch 3 items 1-2, spec S4.2, S4.6)
PR/commit:      mot/touch (51e62985f)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     the hand test on the iPhone (D tier)
```

### Changed

- `shell/use-edge-swipe.ts`: the pushed screen's non-passive `touchmove` is
  attached only after a touchstart within the 20px edge zone and removed when
  the touch ends, is cancelled or turns out to be a scroll, as
  `use-route-swipe.ts` does. The screen (and a covered screen beneath) gets
  `will-change: transform` at that touchstart instead of on the first move, and
  loses it on a refusal or a let-go that never dragged.
- `shell/PullToRefresh.tsx`: the medium haptic still marks the trigger
  mid-drag, but the read (`useRefresh`) starts on release, once per pull, and
  the spinner's minimum counts from it. The rubber band already follows the
  c = 0.55 formula. Its touchmove stays registered before the touch, at the
  top of the page only: WebKit settles at touchstart whether a touch's moves
  can be cancelled, so a listener added once the finger is down could not
  hold the page still for the pull.

### Why

- Every touch on a pushed screen waited on script for its whole life, and the
  pull re-read the page under the finger (scroll start sticking after
  navigation, MOT-02).

### Verification

- `shell/__tests__/phone-shell-gestures.test.tsx`: no touchmove for a touch
  away from the edge; armed and composited at an edge touchstart; disarmed and
  demoted when it turns out to be a scroll.
- `__tests__/motion-approved.test.tsx`: the haptic fires mid-drag with no
  refresh; one refresh on release.
- Source and jsdom only; no browser or device run.
