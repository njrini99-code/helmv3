# 2026-11-15 — calendar

## 2026-11-15 — The phone More is a menu; Undo lasts ten seconds

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md)
PR/commit:      claude/project-thread-7ygzj3 (QUEUE pa-ovl-01 to pa-ovl-12)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- The coach's phone More is the shared Menu anchored to its key, not a sheet
  with a title, grab and Close (CALMORE-03, S3.5).
- A page popover opens and leaves on the menu motion (180 in from .96, 110 out).
- Undo before the players hear lasts the ten-second Undo window (NP-06).
- Small keys reach 44 by 44 on the phone.

### Why

- The 15 Nov production audit: phone layout, overlays and names that disagreed
  with the screen.

### Verification

- `__tests__/calendar*.test.tsx` (jsdom).
- A real-iPhone pass (tier D) is still owed.
