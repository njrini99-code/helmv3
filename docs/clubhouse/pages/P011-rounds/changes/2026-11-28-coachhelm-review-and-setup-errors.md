# P011-rounds — Changelog

## 2026-11-28 — a finished round with no CoachHelm review asks for one

```text
Design package: Clubhouse error tracking gaps (Fairway vs Clubhouse comparison)
PR/commit: agent/clubhouse-tracking-gaps (#2674)
Contract IDs: none new
Actions: generateAndStoreRoundReview (existing, called with ifMissing)
Data impact: writes the missing review row for a completed round, once per view
Held items: none
```

### Changed

- The round review read marks a completed round whose review row is missing
  (`coachHelmPending`). `RoundReview` then asks for it once through
  `useCoachHelmReview`, with `ifMissing: true`, so a round that already has a
  review is left alone. A failure is reported as `rounds.coachhelm-review`
  at low severity instead of being lost.
- A failed read in round setup (`setup-reads.ts`) is reported to the Bridge
  under `round_tracking`, including when the stale-action filter would have
  dropped it.

### Why

Since Fairway was retired, rounds finished in Clubhouse stopped getting their
CoachHelm review, and round setup failures never reached the Bridge.
