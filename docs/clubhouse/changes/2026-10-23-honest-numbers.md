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
