# P006 Calendar — 2026-11-15

## 2026-11-15 — Skeleton by view; a plan that didn’t load is said

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-17, GAP-S-28)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   60690 (CH-6290); CH-6401 row updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `CalendarSkeleton` and `calendar/loading.tsx` read `?view=`: day, month or
  agenda load in their own shape at both widths, with the side panel where that
  view keeps it. Before, the week always drew first.
- `data/calendar.ts` flags a failed plan read (`plansError`, each practice's
  `planFailed`), and the event sheet (`inspector.tsx`) says "The practice plan
  didn’t load" + "Nothing you saved is lost. Try again." with Try again where
  the plan goes (CH-6290), never Build plan. A missing plan table still just
  leaves the row out.

### Why

- GAP-S-17: the skeleton jumped from week to month on arrival.
- GAP-S-28: a failed plan read looked like a practice with no plan.

### Verification

- `calendar.test.tsx` › CH-6290, CH-6401; `route-skeleton-address.test.tsx`.
