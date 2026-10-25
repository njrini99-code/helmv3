# 2026-10-25 — Live rounds (P-6): sharing in Round setup and the Exit sheet

## 2026-10-25 — Who sees a round live (slice 2)

```text
Design package: build plan P-6 section 4.6 (handoff 4.34.6) with the 2026-10-25 changelog and recheck
PR/commit:      claude/clubhouse-live-rounds (slice 2)
Contract IDs:   CH-16660 to CH-16666, CH-16684 (docs/clubhouse/catalog/live.md)
Actions:        setNextLiveShare, setLiveShare (src/app/golf/actions/round-live.ts)
Data impact:    reads golf_round_live_prefs and golf_round_live from the browser, only to draw the control; writes only
                through the two functions of held migration 20261025050000. Shot tracking, round-partial.ts,
                RoundTracking.tsx, draft_data, ChSetupForm and its payload are unchanged.
Held items:     docs/clubhouse/held/data/live-rounds.md
```

### Changed

- Round setup, inside Round details after the qualifier choice: "Show this round live to" with Not live, Coaches and
  Coaches and team (the first level reads "Not live", version 2 of open call a). Practice starts at the player's own
  default; a qualifier is fixed at Coaches with a caption; a tournament has a line instead of a control. Changing the level
  offers "Use this for future practice rounds". The choice reaches the database as it changes and applies to that one round.
- The Exit sheet gains a Sharing row (it shows the level in words) that opens a sheet with the same choices, applied at
  once and put back if the database refuses.
- Nothing is drawn until the live table exists: until migration 1 is applied the round screens are as they were.

### Why

- A practice round stays private until the player shares it (OQ-72), and the player should be able to change their mind
  mid-round without leaving it.

### Verification

- `screens/rounds/setup/__tests__/LiveShareField.test.tsx`, `screens/rounds/track/__tests__/LiveShareSheet.test.tsx`,
  `live/__tests__/share.test.ts`. No screenshots were captured (no browser was run here).
