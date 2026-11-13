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

## Unknown handicaps are unknown

- `displayHandicap` reads a `handicap` of 0 with no `handicap_index` as not
  known. Five Guilford players carry it and showed as the team's best ("0.0").
  An index of 0 (a verified scratch) and every other handicap stay. Not known
  is "—" in the table, sorts last, and the phone rows leave the slot empty
  rather than "— HCP" (`hcpWords`).
- No writer in the app stores a 0 default (onboarding sends nothing for an
  empty field; there is no column default). The zeros came with the team's own
  data, the same on the original team as on the Test Copy.

## "Needs a look" says why, and Home and Roster agree

- The Needs a look card shows its reason as the figure ("Scoring 4.0 worse",
  "No rounds in 51 days") with the strokes gained it was ranked by under it. It
  had shown "−7.1 SG/rd" for Will Gruse, who was there for his scoring.
- "Scoring up 4.0" is "Scoring 4.0 worse": a rise in strokes read as good news.
- A player with no round in 7 team-local days is flagged whether or not the
  team is posting, as Home's hero flags him (`attentionFor` lost its
  `teamPosting` argument). Home said Samanyu "hasn't posted in 51 days" while
  Roster said "Steady". In the off-season every quiet player is flagged on both.
- Existing tests changed on purpose: `logic.test.ts` (quiet regardless of the
  team; "worse"), `roster.test.tsx` (no `teamPosting`; "worse"), and the preview
  fixture's note.
