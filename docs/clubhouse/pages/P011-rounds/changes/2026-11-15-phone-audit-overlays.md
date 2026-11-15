# 2026-11-15 — rounds

## 2026-11-15 — Round rows named by their face

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md)
PR/commit:      claude/project-thread-7ygzj3 (QUEUE pa-ovl-01 to pa-ovl-12)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- A round row is named from what it shows, in drawn order (day, month for a screen reader, 9 holes, fairways, greens, to par), with no aria-label to disagree (MAC-09, PMAC-07).
- The hole map's score marks inside a link are drawn only (MAC-20).
- Small keys reach 44 by 44 on the phone.

### Why

- The 15 Nov production audit: phone layout, overlays and names that disagreed with the screen.

### Verification

- `__tests__/rounds*.test.tsx` (jsdom).
- A real-iPhone pass (tier D) is still owed.
