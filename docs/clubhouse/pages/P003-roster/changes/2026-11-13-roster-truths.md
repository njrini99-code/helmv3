# 2026-11-13 — Roster shows differences and the player you pick

```text
Design package: none (coach audit, 13 Nov 2026, §8 Roster)
PR/commit:      agent/coach-fix-roster
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

## Strokes-gained bars scale to the team

- The card's strokes-gained bar is measured against the team's largest strokes
  gained, never less than 3 (`sgBarScale`, `sgBarWidth`). Capped at ±3, every
  Guilford bar was full, as every player is past −3. The scale is the whole
  team's, so a search or filter never rescales the bars.

## The side panel follows the coach's pick

- A click on a card's body shows that player in the side panel; the face and
  the name still open the profile, and so does Command-Enter on a focused card
  (Enter picks it). The whole card had opened the profile, so the panel never
  left the first player. A second click keeps the player (it no longer toggles
  back to the first). The picked card carries the selected look.
