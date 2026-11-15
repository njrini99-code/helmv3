# 2026-11-15 — classes

## 2026-11-15 — Class cards named by their face

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md)
PR/commit:      claude/project-thread-7ygzj3 (QUEUE pa-ovl-01 to pa-ovl-12)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- A class card is named from its face in drawn order; its week strip's days and time are said in words after the instructor (PMAC-07, MAC-09).
- The in-class sheet follows the shared sheet motion.
- Class status keys reach 44 by 44 on the phone.

### Why

- The 15 Nov production audit: phone layout, overlays and names that disagreed with the screen.

### Verification

- `__tests__/classes*.test.tsx` (jsdom).
- A real-iPhone pass (tier D) is still owed.
