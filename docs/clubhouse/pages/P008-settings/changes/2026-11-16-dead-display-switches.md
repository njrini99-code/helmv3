# 2026-11-16 — settings

## 2026-11-16 — Two CoachHelm switches that did nothing are gone

```text
Design package: none (launch readiness 2026-11-15, DF-C-11)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none; the columns stay
Held items:     none
```

### Changed

- Settings, CoachHelm, Display (desktop and phone): "Show strokes gained"
  and "Show advanced statistics" are no longer offered. Insight detail
  stays. `show_strokes_gained` and `show_advanced_stats` stay on
  `golf_coaching_philosophy`, so a screen can honour them later.

### Why

- Both were saved, but no screen and no part of CoachHelm read either, so
  turning one off changed nothing a coach could see.

### Verification

- `__tests__/settings.test.tsx` asserts the two switches are absent. Not
  checked in a browser or on a device.
