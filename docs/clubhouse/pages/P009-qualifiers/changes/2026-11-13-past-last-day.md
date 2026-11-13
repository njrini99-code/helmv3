# 2026-11-13 — a qualifier past its last day asks to be closed

## 2026-11-13 — Past last day, whatever its status; who is short, by name; the rules once

```text
Design package: none (coach audit, 13 Nov 2026, §12 #1–#3)
PR/commit:      agent/coach-fix-tournaments
Contract IDs:   none new
Actions:        none new (Close qualifier is the existing CH-09501 question)
Data impact:    none
Held items:     none
```

### Changed

- `model.ts`: `endedLive` (P009-D3) holds an `upcoming` qualifier against its
  end date too. One that never started reads "Past last day" (nothing to count),
  never "Upcoming": Guilford's "Test Qualy" (17–19 Sep) said Upcoming in
  November. The day is still `endDayFor` (UTC−12), as D3 decided.
- The list files such a qualifier under its open ones and never heads the
  section "Upcoming" for it; a coach's card says "Review and close".
- Close qualifier shows for any open qualifier past its last day (desk head,
  phone actions and sheet). `missingRounds(rows, numRounds)` names who is a
  round short ("Samanyu: no R3 posted", "Luke: no R2 or R3 posted") at the top
  of the close question; a player with no rounds in is not "a round short".
- The standings spread draws a card a round behind the field (fewer rounds than
  the most anyone has posted) as a dashed ring with no fill, so Samanyu's 2 of
  3 at +14 no longer looks level with Connor's three. Mid-round, cards level
  with the field are drawn as before.
- The scoring rules are said once, under Scoring rules (no longer appended to
  the board's caption), with the coach's line breaks (`RulesText`); long rules
  start folded to three lines with "Show all rules".
