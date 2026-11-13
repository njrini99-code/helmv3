# P004 Stats (team) — 2026-11-12

## 2026-11-12 — Strokes gained by leg says why the team's legs sit below zero

```text
Design package: none (owner decision Q1, 12 Nov 2026)
PR/commit:      agent/preview-fixes
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `screens/stats/StatsTeamIslands.tsx`: the four leg cards' scale note adds the
  shared sentence (`sgBaseline(tour).why`); the scale words stay hidden from a
  screen reader, as the section's label says them.
- `screens/stats/StatsTeamPhoneShs.tsx`: the Strokes gained by leg card's
  caption is "Team strokes a round." and the sentence, in place of "against the
  Tour".

### Why

- Q1: keep the PGA Tour baseline and say what it means, once and quietly, so a
  coach does not read every negative as broken numbers. The sentence and where
  it goes: `docs/clubhouse/changes/2026-11-12-sg-below-zero.md`.

### Verification

- `src/clubhouse/lib/__tests__/sg-below-zero.test.ts`; the page's own suites
  pass unchanged.
