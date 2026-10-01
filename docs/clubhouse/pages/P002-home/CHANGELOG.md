# P002 — Home: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-10-01 — The coach's team line is a day a point; a change of "0.0" is plain on both Homes

```text
PR/commit:      agent/swap-audit
Data impact:    none
```

- **Issue.** The coach phone's team scoring line drew a five-round moving
  average over every round in the window (about seventy points) and read as
  noise. A change that rounds to zero ("0.0" putts) was painted amber, and a
  strokes gained of "0.0" green, on both Homes.
- **Fix.** `teamForm` draws the team's average on each of its last ten round
  days (as Stats' scoring trend does), so the line has at most ten points. One
  `changeTone` (`lib/format`) paints a change or a signed figure green or amber
  only when it does not round to zero at the places it is shown with; the coach
  strip, the player's scoring figures, the leg pills (a plain pill at "0.0"),
  the latest round's SG and the desktop leaderboard and latest round use it.
- **Checked.** home.test (the daily line, the zero tones) and
  player-home-phone.test; the real coach Home at 390px.

## 2026-10-01 — The player's phone to the board: spacing, the scoring card, Today

```text
PR/commit:      agent/swap-audit
Data impact:    none
```

- **Issue.** The owner: the phone looked the same, with plain numbers and no
  spacing. The hero's brief sat hard against Up next and the greeting against
  the date: base.css zeroes every heading's and paragraph's margin, a
  one-class rule loses that, and a two-selector rule only ties it, so the
  order the stylesheets loaded in decided. Scoring and the parts of the game
  carried the desktop's in-card 20px title and caption, the window picker was
  a small desktop chip whose own labels were greyed by the caption rule, Today
  was a full section with a Calendar link and dimmed rows, the chart repeated
  one date under rounds posted on the same day, crammed ten ticks into the
  axis, and marked no round under par when the window mixed pars.
- **Fix.** Margins now carry enough specificity to win in any order. Scoring
  and By part of the game have their 17px title and one-line meta above the
  card; the card opens on the full-width Last 5 / 10 / 20 picker (all three,
  as the board does), then the line, the four 26px figures (11.5px captions,
  italic green note). Today is a label inside This week with Now / Next on
  the row and past rows in full ink. The chart labels each date once,
  keeps about six whole-stroke ticks, and marks a round against its own par.
  Up next reads "Up next · Qualifier" and a competition day draws a flag.
  The latest round's figures take the board's ruled strip.
- **Checked.** player-home-phone.test (18 cases: the axis and tick helpers, the
  change tones, the picker, Today's marks, the margin rules), player-home.test
  and the clubhouse suite; the preview route and the demo player compared
  with the board at 390px, section by section.

## 2026-09-30 — The Tour is the only benchmark (Q-88): no D1 anywhere

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The player Home's four parts of the game drew a D1 mark and "D1 60" under each bar.
- **Fix.** The mark is the Tour's average from `golf_pga_standards.pga_tour_value` for the team's own tour ("Tour 66"); a stat the tour has no value for (fairways, scrambling overall, putts per round) still draws no mark. `ChPlayerLeg.d1` is `bench`, `d1Error` is `benchError`, and the read is logged as `tourBenchmarks`.
- **Checked.** strokes-gained.test and player-home.test; a mutation back to "D1" is caught.

## 2026-09-30 — The player's strokes gained says vs Tour, not vs D1

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The player Home said "Per round vs D1" and "strokes gained vs D1". Stored strokes gained is measured against the Tour; there is no D1 value (Q-88). The figure is the season's, and the legs' header said "Last 10 rounds".
- **Fix.** "Season, per round vs Tour" and "Last 10 rounds · strokes gained this season vs Tour · D1 marks the stats" (the women's Tour baseline for a women's team; `ChPlayerHome.tour`).
- **Checked.** strokes-gained.test (2 cases), mutations caught for the label.

## 2026-09-30 — Latest round opens its review (Clickables); Latest rounds links to Team stats (Clickables gap 6)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Latest round opens its review (Clickables)

- **Issue.** Home's latest round linked to Stats, though the round review now exists.
- **Fix.** Open recap (desktop), Round recap (coach phone) and the player's phone card open the round's review, falling back to Stats when the review is not rebuilt for the viewer.
- **Checked.** home and player-home 94/94, 3 of 4 mutations caught (the fourth is equivalent today).

### Latest rounds links to Team stats (Clickables gap 6)

- **Issue.** The coach phone Home's Latest rounds header had no way on (the board's "All").
- **Fix.** It links to Team stats, only when rounds are listed (a coach has no rounds library, Q-79).
- **Checked.** home 58/58, 2 of 2 mutations caught.

## 2026-09-30 — Page docs; every contract proven by a test; two fixes

```text
Design package: design/handoff/ v2 (Coach - Home, Player - Home, and their phone boards)
PR/commit:      agent/clubhouse (this commit)
Contract IDs:   20101 to 22401 (60 on this page: 42 from the catalog, 18 new behaviour contracts without a code)
Actions:        13 (ACT-P002-*)
Data impact:    none
Held items:     none
```

### Changed

- The six page docs, the manifest's roles (coach and player), design files, tests and 13 actions, and the 18 behaviour contracts (the two Homes opening, links out, the clock, an unknown timezone, which Home a role gets, the team from the session, the player's own rounds only, a player's week naming no one, Message coach finding the coach, each role's own controls, Try again, the haptic grammar, the countdown's timer, the phone Home, loaders that never throw, failures reported, the tests).
- `home.test.tsx` now renders the real dashboard page for both roles (only the session, the flag and the request-scoped team resolvers are faked) and `player-home.test.tsx` covers what the player's loader reads and whom it names. Existing tests carry the new IDs in their titles; no assertion was weakened.
- The catalog and checklist headers name both roles.

### Fixed

- A stored team timezone that is not a real zone threw a `RangeError` in `homeClock` and failed the whole page. It now reads as Eastern, like a missing one, and is logged as `clubhouse.home.timezone` (20618). The test failed before the fix.
- The player's countdown was named "Starts in 1 days" for a screen reader. It now says "1 day" (21807). The expected string in the existing test changed to match, on purpose.

### Why

- D-62 and D-69: every page copies the Messages gold standard and answers every category, and Permission has to be real now that Home serves two roles from one address.

### Verification

- `npx vitest run` on `home.test.tsx` and `player-home.test.tsx` 90/90; `npm run -s typecheck:fast` exit 0; `npx eslint` on the changed files exit 0; 57 mutation checks, each failing the test that guards it (VERIFY.md).

## 2026-09-30 — Message coach finds the team's creating coach

```text
PR/commit: c7810ccf4
Contract IDs: 20805 (documented here)
```

### Changed

- `golf_teams.created_by` is a `golf_coaches.id`, not a user id (true of all ten live teams), so the lookup always fell back to whichever coach of the organisation came first. `coachFor` now matches it against `golf_coaches.id` and returns that coach's `user_id`.
- A loader test that a player's week names no teammates, only a count.

## 2026-09-30 — Player Home

```text
PR/commit: 4c7b2e8fc
Contract IDs: CH-2215 to CH-2217, CH-2310 to CH-2313 (new catalog rows); CH-2309 extended
```

### Changed

- `PlayerHome`, `PlayerHomePhone`, `PlayerGame` and `Countdown`, from `loadPlayerHome`, on the owner's `Player - Home.html` and `Player - Home - Mobile.html` (spec `phone/home-player.md`). The player's own rounds only; the week through `loadHomeWeek`, now shared with Coach Home along with `homeClock` and `latestWithHoles`.
- Message coach opens the coach's thread through a new Messages deep link, `?user=` (CH-7001). `/golf/dashboard` is now rebuilt for players.
- Gaps against the boards logged as Q-69.

## 2026-09-30 — v2 phone and first-run page

### Changed

- `HomePhone` on the owner's v2 phone board (spec `phone/home.md`): the hero, Up next, Today, the team's scoring form, This week and Latest rounds, each round opening its card in a sheet. The loader gains `phone`. New catalog rows CH-2211 to CH-2214, CH-2308 and CH-2309; gaps logged as Q-66.
- The v2 first-run page empty state on desktop and phone (CH-2308, D-71).

## 2026-09-29 — Fidelity pass and desktop build

### Changed

- Coach Home on `Coach Home v3`: the week and the latest round in one sheet, the leaderboard, and the full state catalog (CH-22xx to CH-28xx). The fidelity pass (D-17) added the brief under the greeting, Message team and New event (D-4), the agenda's invitee details and "5 of 6 confirmed", "No rounds 9 days", the Full roster arrow and the player stats link, compared side by side at 1280px.
