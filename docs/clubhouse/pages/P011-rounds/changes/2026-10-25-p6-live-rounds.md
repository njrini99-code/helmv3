# 2026-10-25 — Live rounds (P-6): sharing in Round setup and the Exit sheet

## 2026-10-25 — Who sees a round live (slice 2)

```text
Design package: build plan P-6 section 4.6 (handoff 4.34.6) with the 2026-10-25 changelog and recheck
PR/commit:      claude/clubhouse-live-rounds (slice 2)
Contract IDs:   CH-16660 to CH-16666, CH-16684 (docs/clubhouse/catalog/tournaments.md)
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

## 2026-10-25 — Team rounds band and the share chip (slice 4)

```text
Design package: build plan P-6 (handoff 4.34.6) with the 2026-10-25 changelog and recheck applied; Live rounds has no page of its own (P016 is Tournaments)
PR/commit:      claude/clubhouse-live-rounds (slice 4)
Contract IDs:   CH-16630, CH-16631
Actions:        none new (the share sheet uses the slice 2 actions)
Data impact:    The coach's Team rounds route loads the live lanes beside the book (Promise.all); the player library adds no read: the chip reads the round's level in the browser after the page is up, off the rounds-reads path
Held items:     none
```

### Changed

- Team rounds gets a "Live now" band (three lanes, See all) above the season figures; no band when nobody is out.
- The player's round in progress carries a chip with its sharing level (Not live, Coaches, Coaches and team) that opens
  the same sharing sheet as the Exit sheet. It is not drawn for a tournament round or while sharing is not there yet.

### Verification

- `screens/rounds/__tests__/live-surfaces.test.tsx`; the existing rounds tests and `rounds-reads.test.ts` pass unchanged.

## 2026-10-25 — Where the rest of P-6 is written down

P-6 (Live rounds) registers no page of its own: namespace 16 is P016 Tournaments (P-5). Its CH-16600 to CH-16677 (minus
CH-16650 to CH-16653, P-5's) and CH-16680 to CH-16685 rows are in `docs/clubhouse/catalog/tournaments.md` for now and
move into P016's catalog when #2369 lands. Its held plans are claimed by this page's manifest. The wiring map, the full
slice-by-slice change notes and the hand-offs (Lock Screen / Live Activity contract; what 4.33 must expose, the tournament
id behind `/golf/dashboard/tournaments/<id>/live`) are in `docs/clubhouse/live-rounds/`.
