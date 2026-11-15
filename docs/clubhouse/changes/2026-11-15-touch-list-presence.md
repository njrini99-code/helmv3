# 2026-11-15 — list rows arrive and leave per S3.10

## 2026-11-15 — ListPresence: rise in, shrink out, FLIP the rest (MOT-04)

```text
Design package: none (production audit 2026-11-15, Batch 3 item 4, spec S3.10)
PR/commit:      mot/touch (6cb68cee7)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     before/after captures of a list insert and delete (Team Hub tasks, Roster requests, Bell)
```

### Changed

- `ui/ListPresence.tsx` (motion only, not its look): the default arrival is the
  rise, a row taking its height at once and rising 8px as it fades in over the
  base beat (260 ms). A leaving row fades and shrinks to .96 over the quick beat
  (180 ms), then unmounts, and the rows around it slide into its room by
  transform over 260 ms (the list bumps its layout key in the render that
  unmounts it). Nothing animates a height. The curve is `cubic-bezier(0.32,
  0.72, 0, 1)` through one constant (`LIST_EASE`, today `CH_EASE_SHEET`), to
  point at `--ch-ease-ios` when it lands.
- Reduce Motion: a 180 ms opacity fade in and out, never a snap; Animations off
  stays instant (`useChMotionMode`). `lib/reduced-motion.ts` names list rows
  among the readers of the mode.
- `arrive="inbox"` keeps its own fade-only arrival and 462 ms glide.

### Why

- Rows opened and closed their height on the main thread for about 462 ms, and
  snapped under Reduce Motion.

### Verification

- `ui/__tests__/ListPresence.test.tsx` (updated to S3.10): arrival rises from
  8px with no height or overflow; a leaving row scales toward .96 and never
  closes height, padding or margins; Reduce Motion fades both ways; Animations
  off is instant. `__tests__/hub.test.tsx` passes.
- Source and jsdom only; no browser or device run.
