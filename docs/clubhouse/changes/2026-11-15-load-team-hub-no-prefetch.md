# 2026-11-15 — Team Hub joins CoachHelm on the no-prefetch list

## 2026-11-15 — `lib/prefetch-guard` refuses Team Hub as it refuses CoachHelm (PMAC-01)

```text
Design package: none (production audit 2026-11-15, PMAC-01, Batch 3 item 9)
PR/commit:      mot/load
Contract IDs:   none new
Actions:        none new
Data impact:    fewer golf_insight_exposure writes (hub_signal): only an opened Team Hub records its top insight
Held items:     recording hub_signal from the client once the card is on screen, and leaving existing
                hub_signal rows out of causality runs, are not in this change (PMAC-01's later steps)
```

### Changed

- `lib/prefetch-guard.ts`: `recordsOnRead` (and so `fullPrefetchAllowed`) now
  matches `/golf/dashboard/team-hub` as well as `/golf/dashboard/coachhelm`.
  Every caller follows: the section strip's full prefetch, the idle sweep, the
  press and idle-row prefetch, Welcome's destination prefetch, the quiet
  refresh and the quick-chat landing refresh.

### Why

- PMAC-01 (S0): the strip fetched a player's Team Hub whole on every app open,
  and its loader records the top insight as shown (`data/hub.ts`,
  `insight-delivery.ts`), so every player counted as having seen it once a
  day, and CoachHelm's causality runs credited that insight. The audit's
  decision: Team Hub joins CoachHelm on the no-prefetch list today. The
  address does not say whose hub it is, so the coach's is no longer fetched
  ahead either: its first open shows the route skeleton, then the page.

### Verification

- `shell/__tests__/prefetch-coachhelm.test.tsx` (new PMAC-01 block): the
  guard refuses Team Hub with and without a query and nothing that only
  starts like it; as a tab, a section and on press, every other page is
  fetched and Team Hub is not. `use-prefetch-tabs`, `use-quiet-refresh` and
  quick-chat landing suites pass unchanged.
