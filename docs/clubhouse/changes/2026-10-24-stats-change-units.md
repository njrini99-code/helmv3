# 2026-10-24 — Stats changes say they are changes, and rates their unit (S2c)

## 2026-10-24 — The phone SG change names itself; rate changes read in points

```text
Design package: none (Clubhouse A+ Round 3 review)
PR/commit:      agent/aplus-s2c
Contract IDs:   CH-5310
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Phone player Stats: the strokes gained change under the figures reads
  "−1.3 Change in SG a round · No clear change vs previous 10", not "SG a
  round · …", so it no longer reads as a second SG figure two rows under
  "SG / round".
- The "What changed" card at the top of Stats (row 70): a rate's change
  carries its unit, percentage points ("+3 pts Greens in regulation"); stroke
  figures stay bare ("−0.9 Scoring average").

### Why

- Round 3's shots: the phone's change chip looked like a second SG value, and
  the card's "+3 Greens in regulation" had no unit, with no rate beside it to
  read it against.

### Tests

- `strokes-gained.test.tsx`: the phone chip's words.
- `data/__tests__/stats-insight.test.ts`, `stats-team.test.tsx`,
  `stats-player.test.tsx`: "+6 pts", "+3 pts", "−5.6 pts"; stroke changes
  unchanged.
