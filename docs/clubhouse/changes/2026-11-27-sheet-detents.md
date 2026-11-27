# Shared pieces — Changelog

## 2026-11-27 — Sheets can stop at medium and large

```text
Design package: none (design lab pilot P4, QUEUE dsx-05; vaul's rules, not vaul)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- `useSheetDrag` takes `detents` (shares of the screen, ascending) and `pin`.
  A sheet with stops is laid out at its largest and moved down to the
  smaller, so no layout runs per frame. It opens on the first stop, and a
  let-go projected 200 ms ahead settles on the nearest stop: a flick up from
  medium goes large, a flick down from large goes medium. Below medium it
  closes past a quarter of what medium shows, or on a flick that would carry
  it past medium. A new stop ticks once (selection); a close keeps the
  settle haptic. Below the largest stop an upward drag on the body grows the
  sheet before its content scrolls, a field taking focus grows it to the
  largest, the pinned part (the actions) stays at the foot of the screen,
  the dim clears only below medium, and a rotation or resize keeps the stop.
- `Modal` takes `detents` and pins its footer.
- Under Reduce Motion the stops are the same and the settle is at once.

### Why

- The Stats filter is long: medium shows the window and round types with
  Apply under them, and the rest is one drag away (gap register GAP-P4).
