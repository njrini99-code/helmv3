# 2026-11-15 — lists, late content and charts (MOTION-AND-VISUAL 3.5, 3.7, 3.12)

## 2026-11-15 — one insert and remove, the retired springs deleted, charts glide on the marks beat and grow on first view

```text
Design package: none (MOTION-AND-VISUAL section 3; production audit 2026-11-15, MOT-04, MOT-08)
PR/commit:      worker E2 "lists": 33f9610af, 8b7f1e5a9, edad5e3c6, ba84d5c80
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     D-tier (iPhone) check of a list insert, a remove and a first-view bar growth is owed
```

### Changed

- `ui/ListPresence.tsx`: the one list insert and remove. An insert rises 8px with opacity over 260 ms on the iOS curve;
  a remove goes to scale .96 and opacity 0 over 180 ms, then the rows around it FLIP over 260 ms on the iOS curve.
  `arrive`, `noArrival` and `useRowArrived` are gone; `cut` swaps a list's content at once (a filter or search change).
- `lib/motion.ts`: the `lift`, `send` and `launch` springs and their curve points are deleted (3.12). `pop` stays only for
  `ui/Toast.tsx` (overlays thread). Every caller moved to `settle`.
- `lib/motion-glide.ts`: a window change glides marks, the line and the mean over the marks beat (360 ms) on the iOS curve;
  gridlines and labels re-place at once (unchanged). New `useFirstViewGrow(screen, axis)`: a bar chart's bars grow from the
  origin each bar gives (`data-ch-grow`) over 360 ms on the iOS curve, once per screen per session (sessionStorage
  `ch:first-view:<screen>`), never on a revisit, under Reduce Motion, with Animations off, for a line chart, or over bars
  the server drew (hydration).
- `lib/use-busy.ts`: the phase effect is a layout effect, so the render that ends a request clears the skeleton's timer
  before anything paints. As a passive effect the timer could fire in between and bring the skeleton back over drawn
  content for its 300 ms hold (seen on the Messages rail).

### Why

- Spec 3.5 (insert, remove, late content), 3.7 (chart glide and first-view growth), 3.12 (retired springs).

### Verification

- `ui/__tests__/ListPresence.test.tsx`, `lib/__tests__/motion-glide.test.tsx` (glide pin, six first-view cases including
  hydration), `lib/__tests__/use-busy.test.tsx`, `__tests__/motion-physics.test.tsx` and the four motion tests pass.
- jsdom only (W tier not run); no browser or device run.
