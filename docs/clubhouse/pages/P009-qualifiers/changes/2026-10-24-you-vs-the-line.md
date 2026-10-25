# 2026-10-24 — Qualifiers: you vs the line

## 2026-10-24 — A player's board opens on their row and its gap to the lines

```text
Design package: none (Clubhouse A+ handoff, section 0.4 Qualifiers: "add a 'you
                vs the line' card with your own row kept in view")
PR/commit:      agent/aplus-lane-d
Contract IDs:   CH-09908
Actions:        none
Data impact:    none
Held items:     decision 10 (row 115) changes the board's order; the card
                follows it as built. A sticky row in the list itself is not
                built (see Why)
```

### Changed

- At the top of the leaderboard, desktop and phone, a player with a ranked row
  sees "You vs the line": their place, to par and rounds in, then the top-score
  line and (when it differs) the travel cut: "Inside by 3 strokes. Eli is first
  below it.", "Outside by 2 strokes. Ava holds the last place above it.", or
  level ("total strokes decide").
- When the viewer and the row across the line have played a different number of
  rounds, no strokes are given ("…so the gap isn’t comparable yet"): totals over
  different rounds are not a gap.
- It reads the board's own order and the indices the lines are drawn at, never a
  sort of its own, so it moves with the ranking rule. Nothing for a coach.

### Why

- A player had to find their row and count strokes to the dashed line.
- "Kept in view" is met by the card at the top of the board (it carries the
  row's place, to par and rounds). A sticky row inside a long list needs the
  phone's bars and the dock measured on a device, so it waits for that check.

### Verification

- qualifiers.test › CH-09908 (the lines from the board's order, Outside and
  level wording, no strokes across different rounds, nothing for a coach, drawn
  on desktop and phone). Wants an iPhone and desktop look.
