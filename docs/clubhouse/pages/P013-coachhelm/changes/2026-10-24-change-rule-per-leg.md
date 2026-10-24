# 2026-10-24 — Momentum and the Deep dive finish the one change rule (Clubhouse A+ S2)

## 2026-10-24 — Momentum's word is tested; the Deep dive judges each leg by its own spread (A1, row 93, review of #2361)

```text
Design package: none (Clubhouse A+ review of #2361, A1 and row 93)
PR/commit:      agent/aplus-s2
Contract IDs:   none
Actions:        none
Data impact:    none (reads only; the leg spreads were measured read-only on production)
Held items:     Momentum's stored result has no round counts, so its test is conservative (see Why)
```

### Changed

- How you play, Momentum: the big word no longer repeats the dimension's own
  "Improving" or "Regressing", which it gives at a fixed 0.3-stroke cut with
  no noise test. The change is said only past its standard error, else "No
  clear change", in plain ink. The signed figure ("−0.64") is unchanged, and
  the persona's strength or watch-out still colours the measure.
- Deep dive, the category trend: each strokes-gained theme is judged against
  its own leg's within-player spread (tee 1.3, approach 2.5, around the green
  1.4, putting 2.0 strokes a round; `POOLED_LEG_SD`), not the total's 3.8. A
  real swing on one leg can now be called "Improving" or "Slipping"; before,
  it almost never could.

### Why

- A1 was only partly done: Momentum printed an untested word
  (`coachhelm-profile-shape.ts:296`) and the Deep dive set every leg against
  the total's spread (`coachhelm-dive-shape.ts:402`).
- The leg spreads are measured the way `POOLED_SD` was: production rounds per
  18 holes, players with five or more rounds (51 players, 743 rounds, read on
  2026-10-24; the total read 4.0 on the same rounds).
- Momentum's stored result carries only its confidence (the smaller window's
  rounds over six), so each window is taken at that count, at most six, at
  the pooled score spread. With the dimension capping the change at two
  strokes, that error (about 2.1) is never cleared today: Momentum reads "No
  clear change" until the dimension stores its round counts or spread.

### Tests

- `coachhelm-profile.test.tsx`: Momentum's −0.64 "Improving" reads "No clear
  change" in plain ink; the persona's call still colours it; Back nine's word
  is untouched.
- `coachhelm-dive.test.tsx`: +1.5 on putting is Improving (it would not be
  against the total's spread); off the tee −1.0 is Slipping and −0.5 is not.
