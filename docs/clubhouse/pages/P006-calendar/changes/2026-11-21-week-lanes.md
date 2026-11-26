# P006-calendar — Changelog

## 2026-11-21 — Overlaps side by side in the desk week (premium plan, batch 3)

```text
Design package: premium plan 2026-11-19, batch 3 (section 3.3); owner A26, 19 Nov 2026
PR/commit: agent/clubhouse-desk-screens
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- In the desk week, events that overlap sit side by side in lanes,
  each its own share of the day's column, as the Day view already
  did. They no longer cascade over one another, and a busy block no
  longer lies under the events it overlaps.
- The phone calendar is unchanged.
