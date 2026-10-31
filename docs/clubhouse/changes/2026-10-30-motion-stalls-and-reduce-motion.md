# 2026-10-30 — Motion: stalls, glides and Reduce Motion gestures

## 2026-10-30 — Shared motion pieces: push hold, plate retarget, sheet drag, Swap resize (F-0006, F-0007, F-0017, F-0018)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0006, F-0007,
                F-0017, F-0018; fix plan PR 5)
PR/commit:      claude/audit-fix-05-motion (#2416)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- lib/nav-motion.ts: holdForPush adds the held layer at the tap and playPush
  shows or drops it, so a push never commits a frame of the old page (F-0006).
- lib/slide-plate.ts: a plate already moving retargets from its live position
  and velocity instead of restarting (F-0017).
- lib/sheet-drag.ts: useSheetDrag takes reduced; under Reduce Motion the sheet
  still follows the finger and settles at once, so the gesture stays (F-0018).
  Applied at the five sheet sites: ui/Modal.tsx, ui/FormSheet.tsx,
  shell/AccountSheet.tsx, shell/AskSheetBody.tsx, CoachHelm History.
- ui/Swap.tsx: resize="instant" ends the B7 height glide for a swap that asks
  for it; Calendar asks (owner decision 3 default: Calendar only) (F-0007).

### Why

- The audit timed stalls between a tap and the push, plates that jumped back
  to restart, a height glide under Calendar view changes, and gestures that
  Reduce Motion removed.

### Verification

- New tests red on main and green after: nav-motion-hold,
  slide-plate-retarget, sheet-drag-reduced, Swap-height. Durations and springs
  are unchanged (D-64).
