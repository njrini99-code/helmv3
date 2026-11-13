# 2026-11-13 — an event past its day says it needs closing

## 2026-11-13 — Tournaments tell the truth about now

```text
Design package: none (coach audit, 13 Nov 2026, §10–§11)
PR/commit:      agent/coach-fix-tournaments
Contract IDs:   none new
Actions:        none new
Data impact:    none (read only; the stored round status is never rewritten)
Held items:     none
```

### Changed

- `data/tournaments-shape.ts`: `roundShow(round, today)` and `eventShow(rounds,
  today)` say what a coach is told on the team's calendar day: `live` only for a
  round live and dated today; a round not final on a past day `needs_closing`
  (left live, suspended or never started); one dated today and not in play
  `today`. Each `ChTourEvent` carries `show` and `close` (the first round to
  close, and whether it was left live). The loader passes the team's day.
- The hero, the events list and the desk's head read `show`: a past event that
  isn't final says "Needs closing" (a warn chip), never "Live now" or
  "Upcoming"; its one action is "Finish round 1" (left live) or "Score round 1"
  (never started) and opens that round's live page (`?round=1`). Up next's
  action is `close` for it.
- A player's list says "Scores pending" for the same state.
- Guilford's staging data: Tar Heel R1 (live since 25 Oct) and the Carolinas
  Classic (6–8 Nov, never started) both read "Needs closing".

## 2026-11-13 — Link rounds is one click from the season home and every event

```text
Design package: none (coach audit, 13 Nov 2026, §11 #1, corrected)
PR/commit:      agent/coach-fix-tournaments
Contract IDs:   none new
Actions:        none new
Data impact:    one more call of golf_tournament_link_candidates, on a coach's desk
Held items:     C5 (widen the candidates to a lineup player's practice rounds) waits on the owner
```

### Changed

- The Link rounds inbox (`LinkInbox`, `/tournaments/links`) had no way in: the
  home loaded its count and never showed it. The season home's head now offers
  "Link rounds (n)" with the team's candidates, 0 included ("Link rounds" when
  the count didn't load); every event's desk offers "Link rounds (n)" with the
  rounds matched to that event (`ChTourDeskData.links`, from `linkTeaser`'s new
  `matched`).

## 2026-11-13 — Small truths on the event pages

```text
Design package: none (coach audit, 13 Nov 2026, §11 #5, #7, #8)
PR/commit:      agent/coach-fix-tournaments
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- A finish carries the field size the coach entered (`finish.field`, from
  `field_size`). Where fewer teams have a score than the field, the ledger
  says "4 of 4 scored · 12 teams" and the desk the same (`finishOf`,
  `finishTeams`); the place is never said "of 12" alone, since it was taken
  among the teams scored. Guilford's ledger read "4 of 4", "1 of 6", "T2 of 5"
  against fields of 12, 14 and 10.
- History's eyebrow names the team (`teamName`) with the season, as the other
  tabs do; it said "Varsity" for every team.
- The desk's eyebrow leaves out the tees when none are set: "Oct 5 – 7, 2026 ·
  The Cardinal ·" had a dangling separator.
- Who counted folds alternates who played none of the rounds shown into one
  line under the table ("Alternates: Charley, James"); each had a row of "No
  data".
