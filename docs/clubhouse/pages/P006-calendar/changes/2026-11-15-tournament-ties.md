# 2026-11-15 — calendar tournament Ties log

## 2026-11-15 — The tournament section's Ties field (launch readiness F-04)

```text
Design package: none (launch readiness findings, 15 Nov 2026, §4 F-04); no owner board
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f04)
Contract IDs:   none new
Actions:        none new; the calendar's tournament create carries the tiebreak
Data impact:    golf_tournaments.tiebreak through the existing update RPC; no schema change
Held items:     none
```

### Changed

- The editor's tournament section shares the tournament form's fields, so it
  has **More details › Ties** too (see P016's entry of the same day). A
  tiebreak that didn't save after the create is said on the saved toast.

### Verification

- `src/clubhouse/screens/tournaments/fields/__tests__/rounds-model.test.ts`,
  `src/app/golf/actions/__tests__/tournaments-calendar.test.ts`.
