# 2026-11-16 — stat definitions and the counting rule

## 2026-11-16 — A stat's name opens its definition (F-07)

```text
Design package: none (launch readiness 2026-11-15, F-07; no owner board)
PR/commit:      claude/project-thread-f0tqxu
Contract IDs:   none added (no new failure or empty state)
Actions:        none
Data impact:    none (reads nothing; words only)
Held items:     none
```

### Changed

- `lib/stat-definitions.ts` (new): one definition per stat a Stats page
  names (scoring average, to par, strokes gained and its four parts,
  fairways, greens, scrambling, sand saves, putts, putts per green, three-
  putts, birdies, penalties), each with what it measures, how Clubhouse
  counts it and which way is better; `statDefinition(label)` finds one from
  any spelling a page prints ("Scoring avg", "Putts / round", "GIR").
- The same file states the counting rule: finished rounds only, practice
  out, 18 holes by default, a nine counts as half a round, Last 10 is ten
  18-hole rounds, an unfinished round counts in nothing, a total without
  holes counts in scoring only, the stroke floor, and strokes gained's
  three-round floor. Its numbers are the loaders' own constants.
- `ui/StatTerm.tsx` (new): `StatTerm` draws a stat's name as the control
  (a dotted underline, no icon, no extra width); a tap or click opens a card
  under it with the definition and a "How stats are counted" link. A label
  that names no stat stays plain text. `HowStatsCount` is the sheet with the
  rule and every definition; `HowStatsCountLink` opens it from a page.
- `styles/stat-terms.css`: `.ch-term`, `.ch-term-card`, `.ch-howc` on the shared
  popover and sheet materials.

### Why

- Coaches compare Clubhouse's figures with Clippd and GolfStat, which define
  each stat; Clubhouse defined none on screen and stated no rule for nine-hole
  or unfinished rounds (launch readiness DATA-AND-FEATURES, F-07, P1).

### Verification

- `src/clubhouse/__tests__/stat-definitions.test.tsx`: every rule line is
  checked against the function that applies it (`isScoreCountable`,
  `roundWeight`, `weightedMean`, `lastTenRounds`, `roundsForFigures`), the
  floors are pinned to `MIN_SG_ROUNDS`, `LAST_TEN` and the stroke floor, and
  the card and sheet open, close and list every stat.
