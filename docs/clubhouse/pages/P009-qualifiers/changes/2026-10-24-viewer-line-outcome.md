# 2026-10-24 — Qualifiers: you vs the line follows the row's state

## 2026-10-24 — The viewer card says Tie at cut, and after confirm gives the squad's outcome instead of the lines

```text
Design package: none (Clubhouse A+ Round 1, S3 item 1; #2361 follow-up review)
PR/commit:      agent/aplus-s3
Contract IDs:   CH-09908
Actions:        none
Data impact:    none
Held items:     before confirm, a Bubble player still reads "Inside" the travel cut (see Why)
```

### Changed

- `viewerVsLines` takes where the squad stands (`viewerSelection`: open,
  confirmed, or confirmed with the selections unread).
- Once the squad is confirmed, the card gives the outcome by the rule the
  player's notice uses (`selectionOutcomeFor`): "Selected" or "Coach’s pick"
  with "You made the travel squad.", or "Not selected" with "You were not
  selected this time." It draws no line then, so a picked player is never
  "Outside" and an unpicked one never "Inside". If the selections didn't load,
  there is no card.
- Before confirm, a viewer in the board's "Tie at cut" (level on to par and
  total strokes, Q-114) reads "Tie at cut, level with Eli on to par and total
  strokes: your coach decides." at the top-score line, on either side of it.

### Why

- The card measured from the index the lines are drawn at and ignored the row's
  state: a coach's pick from below the cut read "Outside", an unpicked player
  inside the squad read "Inside", and a true tie read "total strokes decide".
- The outcome rule is copied, not imported: player-notify.ts sends email and
  push, and model.ts ships to the browser.
- An unscored entrant has no row, so no card, which matches `not_scored`.
- Before confirm the lines are still the honest picture; the Bubble wording is
  left for the owner.

### Verification

- qualifiers.test › CH-09908: a coach's pick below the travel cut and a player
  on score after confirm; an unpicked player inside the squad after confirm;
  confirmed with unread selections; Tie at cut on both sides of the line, built
  with `buildBoard`; level on to par with different totals still says total
  strokes decide; the outcome drawn on desktop and phone.
