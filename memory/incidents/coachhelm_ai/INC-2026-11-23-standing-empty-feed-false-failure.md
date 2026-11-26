# INC-2026-11-23: CoachHelm reported a failed read for a feed nobody asked for

- Feature: `coachhelm_ai`
- Surface: player Your Week / coach file standing (`src/clubhouse/data/coachhelm-standing.ts`)
- Status: RESOLVED. Fixed in PR #2612 (2feb73e8), live in production since dpl_HoG6pCe1DUfNaRZzLCJt7R3FvjZA (ready 2026-11-25 05:17Z); 0 occurrences since; e1c5ca86 and rel:ad746dec resolved 2026-11-26 05:17Z by the desktop health routine (two-write, ledger rows present).
- Risk: R1. Read path only. No schema, RLS, grant or data change.
- Signal: Bridge `e1c5ca86` and reliability signal `rel:ad746dec`, 1 occurrence 2026-11-23 18:10Z. The same player's real feed showed 10 rows 18:11–18:14Z, so no read actually failed.

## What was wrong

`loadPlayerYourWeek` passed `loadPlayerStanding` an intentionally empty feed
(`feed: () => Promise.resolve([])`), and the empty-feed check in
`readLadderReads` logged that as a failed feed. The coach's file had the same
hazard when every read is a note.

## Fix

A page that draws no ladder passes `ladder: false` and reads no feed.
Standing's own empty-feed check is unchanged and still tested.

## Proof

- `src/clubhouse/data/__tests__/coachhelm-file-loader.test.ts` and
  `src/clubhouse/__tests__/coachhelm-standing.test.tsx`: three new cases failed
  on 0a42b76a8f and pass with the fix.
- Replay: `replay/manifests/standing-no-ladder-no-feed-2026-11-24.yml`.

Backfilled 2026-11-26 by the desktop health routine: PR #2612 shipped the fix
without its incident file or release-queue item.
