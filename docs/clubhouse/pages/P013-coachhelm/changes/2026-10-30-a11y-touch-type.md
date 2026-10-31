# 2026-10-30 — CoachHelm: evidence region, reach and trend type

## 2026-10-30 — The evidence table is a keyboard region; small buttons reach 44pt (F-0042, F-0021, F-0050)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0042, F-0021,
                F-0050; fix plan PR 8)
PR/commit:      claude/audit-fix-08-a11y-touch-type (#2419)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- chat/Evidence.tsx: the sideways evidence table scrolls inside ScrollRegion,
  named "<caption>, scrolls sideways", with fade off (F-0042).
- coachhelm.css and coachhelm-standing.css: .ch-hl-since__b and .ch-hs-ld__why
  set position: relative so the shared 44pt reach has a box (F-0021).
  coachhelm-thread.css: the trend label floor is calc(12 * var(--ch-type-k)),
  not 12px (F-0050).

### Verification

- evidence-table-region.test and target-size-css: red on main, green after.
