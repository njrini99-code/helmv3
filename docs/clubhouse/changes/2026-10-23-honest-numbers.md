# 2026-10-23 — Honest numbers (Clubhouse A+ WP-1)

Phase 1 of the Clubhouse A+ handoff, work package 1: the figures, tones and
trend words agree with the data they are drawn from.

## 2026-10-23 — Zero is no change (A2)

```text
Design package: none (Clubhouse A+ handoff, section 5, A2)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Every gain or loss tone comes from `changeTone` in `lib/format.ts`, asked
  with the digits the screen prints. A change that shows as 0.0 is neutral ink
  with no arrow on Stats (team and player, desktop and phone), Roster, the
  round review and Home. About 30 sites tested `>= 0` themselves and painted
  "+0.0" green.
- Two small forms beside it: `changeInk` (the `ch-gain` / `ch-loss` text
  classes) and `changeVerdict` (`good` / `bad` for a figure's `tone` prop).
- `sgTint` takes the digits too; a zero cell is clear, unlike a no-data cell.
- The team tape's par dial and the figure gauge use the same zero test as the
  "E" they print, so the word and the tone can't disagree near zero.

### Why

- A user read a gain where nothing changed (F-54 already said so; most
  screens bypassed it).

### Verification

- `lib/__tests__/change-tone-zero.test.ts`: values that round to zero are
  untoned in all three forms; `sgTint` keeps zero apart from no data.
- `__tests__/no-raw-sign-tone.test.ts`: no screen, shell or ui file tests a
  sign to pick a gain or loss tone (bar geometry may still test the sign).

## 2026-10-23 — One change-signal rule (A1)

```text
Design package: none (Clubhouse A+ handoff, section 5, A1)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Every trend claim compares the newer half of the window with the older
  half (`halvesChange`) and words it as a change only past its standard
  error (`deltaTone`). Otherwise it says "No clear change". This covers the
  team trend note, the four leg cards, the phone team trend, Home's leg
  sparks and the phone player's scoring cell.
- The team grid's Trend column carries the change's standard error and
  paints it, with an arrow, only past it; otherwise neutral, no arrow, and
  "No clear change" on hover.
- The four leg cards share one scale, so the same height is the same strokes.
- The phone scoring cell's headline is "No clear change" when the change is
  inside its error, never "2.1 higher" beside "No clear change".

### Why

- Screens told a coach "up about 0.8 a round since Aug 30" from two end
  points, while other cells on the same data said "No clear change".

### Verification

- `strokes-gained.test.tsx`: the team and player notes from the halves,
  a real change worded as one, and the grid cell toned only past its error.
- `stats-player.test.tsx`, `stats-team.test.tsx`: the phone cell and trend.

## 2026-10-23 — Ahead of or behind the team, on the shown values (A5)

```text
Design package: none (Clubhouse A+ handoff, section 5, A5)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The player Overview's strokes gained and scoring lines decide ahead of,
  behind or level on the values as printed (`versusTeam` in `lib/format.ts`),
  and give the printed gap. Two figures that print alike read "level with the
  team".

### Why

- A player at +0.4 beside a team +0.4 was told they were 0.1 ahead or behind,
  because the test ran on unrounded values.

### Verification

- `screens/stats/__tests__/honest-deltas.test.tsx`: 0.44 against 0.36 and
  72.04 against 71.96 read level; real gaps read ahead or behind, lower is
  better for scoring.

## 2026-10-23 — Average to par is the window's weighted value (A6)

```text
Design package: none (Clubhouse A+ handoff, section 5, A6)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The player Overview's "to par a round" and the phone scoring gauge read the
  window's own weighted `win.toPar` (per 18, a nine-hole round counts as
  half), the same figure as the Stats hero. A round with no par is left out
  instead of counting as 0; with none, the line is not drawn.

### Why

- Both computed a plain mean of per-18 values, so mixing nine-hole rounds
  disagreed with the hero, and the Overview counted a missing par as even.

### Verification

- New `screens/stats/__tests__/overview-topar.test.tsx`: an 18-hole +4 and a
  9-hole +1 make +3.3; the Overview prints `win.toPar`; a round with no par
  does not pull it toward 0.

## 2026-10-23 — Rate floors on Fairways, GIR, Scrambling and Sand saves (A7)

```text
Design package: none (Clubhouse A+ handoff, section 5, A7)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The player's Fairways hit, Greens in regulation, Scrambling and Sand saves
  rows are held to their floors (`floorRate` in `lib/stats-signal.ts`).
  Fairways and greens count rounds with a chance at them (show 2, steady 5);
  scrambling and sand saves count the chances (show 10, steady 30). Under
  the show floor the row has no value and says what it needs ("Needs 10
  chances"); between the floors it keeps the value with "Early read · 12
  chances", untoned against the team or Tour.
- Game detail's Fairways hit, Greens in regulation, Scrambling and Sand saves
  figures follow the same floors (the fairway and green floors count the
  window's rounds), and the section's lead sentence gives the counts instead
  of a rate while under them.
- The team's Greens in regulation and Scrambling cards follow the same
  floors: under them the card is empty with what it needs; an early read
  takes the card's second line in place of the shared coverage line (still
  drawn once under the cards). Neither has a change chip until it is steady.

### Why

- "100% sand saves" from one bunker shot read as a real rate.

### Verification

- New `stats-player-floors.test.ts`: 1 sand attempt needs more, 12 are an
  early read, 40 read plain; fairways count rounds, not chances.
- `stats-team.test.tsx`: one round and six chances leave both cards empty
  with what they need.
- New `screens/stats/__tests__/game-detail-floors.test.tsx`: one bunker
  shot says "Needs 10 chances"; twelve are an untoned early read; forty are
  toned against the Tour.
- `stats-production-parity.test.ts`: a floored rate is a named, expected
  difference from the Fairway page (as the strokes gained floor already was).

## 2026-10-23 — Roster team average pooled per round (A3)

```text
Design package: none (Clubhouse A+ handoff, section 5, A3)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `loadRoster` returns `teamAvg`: every active player's 18-hole round in the
  season, pooled per round. These are the rounds the players' own averages
  read, and the rounds the Stats team scoring average reads by default. The
  Roster's "Team average X over the season" line and the spread chart's team
  marker read it.

### Why

- The line was the mean of each player's average, so a player with 3 rounds
  weighed the same as one with 30, and Roster disagreed with Stats.

### Verification

- `roster.test.tsx`: two rounds of 70 and ten of 80 make 78.3, not 75.0; the
  head-line pins compute the pooled figure from the fixture.

## 2026-10-23 — Team strokes gained obeys the three-round floor (A4)

```text
Design package: none (Clubhouse A+ handoff, section 5, A4)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The team's strokes gained headline, its change against the previous
  stretch and the four leg totals read only the players with three whole
  rounds with shots in the window (`MIN_SG_ROUNDS`), as each player's own
  figure and the previous stretch already did.
- With rounds with shots but no player at the floor yet, the headline is
  empty and says "Needs 3 rounds with shots from one player".

### Why

- A player's first one or two rounds swung the team headline, while the
  "previous" figure it was compared with applied the floor.

### Verification

- `stats-team.test.tsx`: a player at five rounds (+1.0) and one at one
  round (−4.0) give +1.0 and leg totals from the first only.
- `strokes-gained.test.tsx`: a player under the floor leaves the headline
  empty with what it needs and no leg totals.
- `stats-filter-data.test.tsx`: three nine-hole rounds are under the floor,
  six read per 18.
- `stats-production-parity.test.ts`: the team figure equals the Fairway
  page's over the players at the floor.
- Not changed: the weekly team strokes gained line under the headline still
  reads every round with shots.

## 2026-10-23 — Standing's "Refreshed" day and one-decimal strokes gained (A20)

```text
Design package: none (Clubhouse A+ handoff, section 5, A20)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Standing's "Refreshed" date is the day in the team's time zone
  (`golf_team_settings.timezone`, Eastern when it is missing or not a real
  zone), read by `loadPlayerStanding` and formatted by `refreshedOn`.
- Strokes gained and the signed deltas print to one decimal on Standing,
  its "Where strokes go" ladder, and the shared `figure` the Deep dive and
  coach brief use. Ahead, behind and level for them are decided on the one
  decimal they print. A par scoring average keeps two decimals.

### Why

- A nightly refresh at 02:30 UTC read as the next day for a US team, and
  Standing printed strokes gained to two decimals where every other screen
  prints one.

### Verification

- New `coachhelm-standing-shape.test.ts`: 02:30 UTC on Oct 23 is Oct 22 in
  Los Angeles; one-decimal labels; +0.44 against +0.36 is level.
- `coachhelm-standing.test.tsx`: the preview's refresh reads Sep 29 on the
  Eastern day; ladder and rows print one decimal.
