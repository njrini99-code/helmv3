# 2026-11-15 — stats-team

## 2026-11-15 — The team trend's score lens is judged against par, two points a half

```text
Design package: none (stats and charts audit 2026-11-15, CH-01 and CH-10, data side)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/stats-team.ts`: beside each raw-strokes series the loader now gives the same weeks, days and window per 18 holes against
  par: `team.toPar`, `team.toParMean`, `players[].toPar`, `players[].toParMean` and `days[].toPar`, each `weightedMean` of
  `score_to_par` (a nine counts half and is doubled). `score` and `scoreMean` stay raw strokes for the tooltip and the scoring
  average. `team.scoreHalves`, `players[].scoreHalves` and `daysHalves` now judge to-par, so a run of easier courses no longer
  reads as the team improving (CH-01). The interface lines match the "Make charts tell the truth" branch byte for byte; that
  branch draws the chart on `toPar` (par line at 0) and owns its caption and copy.
- `data/stats-weight.ts` `roundHalves`: a change needs `MIN_TREND_POINTS` (four) points with a value, two a half; with three the
  middle point was in neither half and the verdict was the last week against the first (CH-10). The team halves still pair each
  player with themselves (NP-01). The phone trend's reading (`StatsTeamPhone.tsx` `teamTrendReading`) needs the same four round
  days before it colours or words a change; `MIN_TREND_POINTS` lives in `lib/stats-signal.ts` so the client screen can read it.

### Why

- "Against par · lower is better" sat over a line of raw strokes: 72 on a par 70 and 74 on a par 72 drew as two strokes worse, and
  the Better/Worse note was worked out from the same totals.

### Verification

- `data/__tests__/stats-team.test.ts` (72 on par 70, 74 on par 72, 73 on par 71 give `[2, 2, 2]`; a steady team on longer courses
  reads delta 0; a weaker late joiner leaves the team delta at 0; three weeks give no verdict), `data/__tests__/stats-weight.test.ts`,
  the Stats suites.
- Not checked in a browser or on a device in this change: the chart side is the other branch's.
