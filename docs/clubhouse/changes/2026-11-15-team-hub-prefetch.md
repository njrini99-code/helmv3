# 2026-11-15 — prefetch guard

## 2026-11-15 — Team Hub is not fetched ahead of the tap

```text
Design package: none (prod audit 2026-11-15, PMAC-01)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    fewer writes: no `golf_insight_exposure` (`hub_signal`) row for a Team Hub nobody opened
Held items:     recording the Hub card from the client after 1 s on screen; what to do with the old hub_signal rows (Nick's call)
```

### Changed

- `lib/prefetch-guard.ts`: Team Hub joins CoachHelm as an address read only when it is opened. Its player loader records the top
  insight as shown (`getTopInsightForPlayer`, `hub_signal`), and the strip fetched it whole on every player's first open of the day.
- `lib/__tests__/prefetch-exposure.test.ts` (new): walks each nav page's code, symbol by symbol, to the insight-delivery functions that
  record exposure, and fails when a page that reaches one can be fetched ahead.
- `lib/coachhelm/v3/causality/exposure-scope.ts`: causality runs (the cron, the comparable attribution and the confounding check) leave
  `hub_signal` rows out, since rows from before this change include prefetches nobody saw.
- `docs/clubhouse/audit/WRITES-ON-OPEN.md`: row 2 updated; row 15 (New round's live-share write on open, PMAC-04) added.

### Why

- Every player's first app open each day counted an insight as shown, which feeds the effectiveness ledger.

### Verification

- `lib/__tests__/prefetch-exposure.test.ts` (fails with Team Hub taken out of the guard), `shell/__tests__/prefetch-coachhelm.test.tsx`,
  the causality suites.
- Not checked in a browser or on a device in this change.
