# P011 Rounds — Changelog

## 2026-11-18 — A round opened from Home goes Back to Home

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: D-41 (Back returns to where the round was opened), D-53
Actions: none
Data impact: none
Held items: none
```

### Changed

- `RoundReview.tsx`: a `fromHome` prop (`?from=home`, read by the dashboard route
  and `routes/round-review.tsx`). With it, Back is named Home on the phone bar and
  the desktop link, goes to `/golf/dashboard`, and steps back in history when
  there is history behind it. Without it nothing changes: a coach's review from
  Stats still says Stats (the player's name on the desktop), from Team rounds
  Rounds.
- `review-back-from-rounds.test.tsx`: its source checks no longer require
  `fromRounds` to be the last prop, since `fromHome` now follows it (the same
  check, not a looser one).

### Why

- Clubhouse audit 2026-11-18 (P2): the review opened from coach Home said
  "Stats" on its Back (RoundReview.tsx:602).

### Verification

- `screens/rounds/__tests__/review-back-from-home.test.tsx`.
