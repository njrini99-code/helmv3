# 2026-10-24 — NoData on Home, Roster and Rounds; bare dashes only fall (row 46)

## 2026-10-24 — 40 empty figures render NoData; a per-file ratchet on the rest

```text
Design package: none (Clubhouse A+ handoff, row 46; FINISH_DIRECTIONS S1 item 4)
PR/commit:      agent/aplus-s1
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     Stats (screens/stats/*) and CoachHelm data (data/*): another
                lane owns them this round, so their dashes are counted, not
                moved. Left on purpose: string-typed props (Meter, ZoneBig,
                string cell rows), aria labels, SVG text, formatters, Round
                review's hero score and the peek's failed CoachHelm counts
                (their own words sit beside the dash), and the lines on Roster's
                and Roster profile's tone-coloured SG cells (Roster's tone words
                are another lane's this round).
```

### Changed

- An empty figure on Home (phone and desktop team form, latest round, player
  game, the player's phone figures), Roster (the peek's focus areas and goals,
  the team roster's class year) and Rounds (round review's scorecard rows, the
  season figures, a round row's out and in, the team season figures, Track's
  round sheet, the round card's empty hole) renders `<NoData />`: the dash in
  tertiary ink, heard as "No data" ("Not played" for a hole with no score)
  instead of "dash".
- ui/__tests__/NoData.test.tsx: `BARE_NO_DATA`, the lines that still print the
  bare string, per file; only falls.

### Why

- Row 46: the no-data dash should read (4.5:1) and a screen reader should hear
  words, not a dash.

### Verification

- `npx vitest run src/clubhouse/ui/__tests__/NoData.test.tsx` and the Home,
  Roster and Rounds suites. Needs a look: the dash now in tertiary ink in those
  cells (it took the cell's ink before).
