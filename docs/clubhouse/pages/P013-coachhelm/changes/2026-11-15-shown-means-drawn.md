# 2026-11-15 — a coach's player read counts as shown only when it is drawn

## 2026-11-15 — Standing records nothing; the dive records what it draws

```text
Design package: none (launch readiness DF-P-03)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        `getInsightsForCoach` takes `drawnLater` (as the player feed does)
Data impact:    fewer `golf_insight_exposure` (`coach_feed`) rows: none from the coach's player Standing; only the drawn reads from the dive
Held items:     none
```

### Changed

- `data/coachhelm-player.ts`: the coach's player Standing reads the coach feed
  only to mark which metrics have an open read. It drew no
  card, but every open recorded the whole feed (up to 30 reads) as shown to the
  coach. It now passes a `drawnLater` that draws nothing.
- `data/coachhelm-player.ts`: the coach's player dive records the reads it draws
  (not a note, not one the lifecycle leaves out, not a row
  of another player's), and only once the dive is sure to render; a dive that
  ends in "didn't load" records nothing.
- `app/golf/actions/insight-delivery.ts`: the coach feed records only the ids
  `drawnLater` returns, when a caller passes it.

### Why

- A coach opening one player's Standing marked every read on that player as
  seen, so the effectiveness ledger and Track record counted
  reads the coach never saw.

### Verification

- `data/__tests__/coachhelm-player.test.ts`,
  `lib/coachhelm/delivery/__tests__/player-feed-contract.test.ts`.
- Not checked in a browser or on a device in this change.

## 2026-11-15 — Track record leaves out unseen reads after the held migration

```text
Design package: none (launch readiness DF-P-04, prep)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none until applied; then `golf_coachhelm_shown_reads` leaves out `hub_signal` exposures
Held items:     `20261115141500_golf_coachhelm_shown_reads_seen_only.sql` (HELD.md row); apply before the flag `coachhelm_track_record_v1` turns on
```

### Changed

- `supabase/migrations/20261115141500_golf_coachhelm_shown_reads_seen_only.sql`
  (new, not applied): the Track record's read leaves out
  `hub_signal` exposures, as causality runs do. A read whose only exposures were
  Team Hub's unseen card drops out of the record.
- `data/coachhelm-track-record.ts`: the loader's comment says so.
- `data/__tests__/coachhelm-track-record-surfaces.test.ts` (new): the newest
  definition of the function must leave out every surface
  `exposure-scope.ts` leaves out.

### Why

- The Track record is off behind its flag. With it on, it would count reads
  nobody saw as shown (DF-P-04, P0 once on).

### Verification

- The new test; `npm run test:rls` not run (no Docker here). Coach Standing rows
  written before DF-P-03 share the `coach_feed` surface
  with seen reads and cannot be filtered; the migration header says so.
