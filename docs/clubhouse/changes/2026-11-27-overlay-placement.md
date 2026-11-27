# Shared pieces — Changelog

## 2026-11-27 — One placement for every menu, tooltip and popover

```text
Design package: none (design lab overlay base; research report review, BS-21)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- `lib/overlay-place.ts` places an overlay against its anchor: below by
  default, above only when it does not fit below and there is more room
  above, shifted to stay 8 px inside the window, its height capped at the
  room on its side, never under the keyboard, and growing from the corner
  nearest its anchor. `watchOverlayView` places it again on a resize, a
  rotation, a visual-viewport change or the keyboard.
- `Menu`, `ContextMenu`, `Tooltip` and `usePopoverFit` (Calendar, Classes,
  CoachHelm's read chip) use it instead of four hand-written placements. The
  context menu and the tooltip now follow a rotation or resize while open,
  and the context menu stays above the keyboard.

### Why

- Four copies of the same collision rules had drifted (gap, edge, keyboard
  and resize handling differed). The report's blind spot BS-21 (rotate or
  resize to 320 while open) now has tests.
