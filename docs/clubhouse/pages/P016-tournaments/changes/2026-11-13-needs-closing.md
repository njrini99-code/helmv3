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
