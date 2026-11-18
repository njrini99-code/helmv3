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

- `lib/prefetch-guard.ts`: Team Hub joins CoachHelm as an address read only when
  it is opened. Its player loader records the top
  insight as shown (`getTopInsightForPlayer`, `hub_signal`), and the strip
  fetched it whole on every player's first open of the day.
- `lib/__tests__/prefetch-exposure.test.ts` (new): walks each nav page's code,
  symbol by symbol, to the insight-delivery functions that
  record exposure, and fails when a page that reaches one can be fetched ahead.
- `lib/coachhelm/v3/causality/exposure-scope.ts`: causality runs (the cron, the
  comparable attribution and the confounding check) leave
  `hub_signal` rows out, since rows from before this change include prefetches
  nobody saw.
- `docs/clubhouse/audit/WRITES-ON-OPEN.md`: row 2 updated; row 15 (New round's
  live-share write on open, PMAC-04) added.

### Why

- Every player's first app open each day counted an insight as shown, which
  feeds the effectiveness ledger.

### Verification

- `lib/__tests__/prefetch-exposure.test.ts` (fails with Team Hub taken out of
  the guard), `shell/__tests__/prefetch-coachhelm.test.tsx`,
  the causality suites.
- Not checked in a browser or on a device in this change.

## 2026-11-15 — Team Hub records nothing; Standing records only what it draws

```text
Design package: none (launch readiness DF-P-02, DF-P-03)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        `getPlayerHubSummaryData` no longer returns `topInsight`; `getInsightsForCoach(WithMeta)` takes `drawnLater`
Data impact:    fewer writes: no `hub_signal` row at all; no `coach_feed` row for coach Standing; the coach dive records only the reads it draws
Held items:     what to do with the old hub_signal rows (Nick's call)
```

### Changed

- `app/golf/actions/player-hub-data.ts`: the hub aggregate no longer calls
  `getTopInsightForPlayer`. No Clubhouse code read
  `summary.topInsight`, so every open of Team Hub, and every prefetch of it,
  recorded an insight as shown that no screen drew. Team Hub
  goes back to being fetched ahead like any other tab (`lib/prefetch-guard.ts`
  is as it was on `main`).
- `app/golf/actions/insight-delivery.ts`: the coach feed takes `drawnLater`, as
  the player feed already did: the caller says which of the
  returned reads it drew, and only those are recorded.
- `clubhouse/data/coachhelm-player.ts`: the coach's player Standing passes a
  `drawnLater` that draws nothing (it reads the feed only to
  mark which metrics have an open read); the coach dive records the reads it
  draws, once the dive is sure to render.
- `lib/coachhelm/v3/causality/exposure-scope.ts`: the comment now says every
  `hub_signal` row is unseen; the exclusion stays.
- `docs/clubhouse/audit/WRITES-ON-OPEN.md`: rows 1 and 2 and the prefetch note.

### Why

- An exposure row says a person saw a read. These said so for reads nobody saw,
  and the effectiveness ledger counts them.

### Verification

- `lib/__tests__/prefetch-exposure.test.ts` (Team Hub reaches no recording
  function; the hub aggregate imports none),
  `data/__tests__/coachhelm-player.test.ts` (Standing's `drawnLater` resolves to
  none; the dive's to the reads it drew, and to none when it
  drew none), `lib/coachhelm/delivery/__tests__/player-feed-contract.test.ts`
  (the coach feed with `drawnLater` records only those ids).
- Not checked in a browser or on a device in this change.
