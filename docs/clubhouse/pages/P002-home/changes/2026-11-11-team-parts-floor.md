# 2026-11-11 — P002

## 2026-11-11 — The team's four parts read Team Stats' team figure

```text
Design package: none (a number made to agree with Stats)
PR/commit:      agent/train-ci-fix
Contract IDs:   20105 (meaning reworded)
Actions:        none
Data impact:    none (the same rounds are read; fewer of them are counted)
Held items:     none
```

Coach Home's strokes gained in each part pooled every round in the window, so
a player's first one or two rounds with hole scores moved Home's figure and
not Team Stats'. `teamLegs` now calls `teamStrokesGained`
(`src/clubhouse/data/stats-team-sg.ts`), the function Team Stats, CoachHelm
Team and Ask call: only the players with three rounds with strokes gained in
the window are read. With no player at that floor a part prints no figure.

The change against the previous ten rounds is computed as before.

Test: `src/clubhouse/__tests__/team-sg-parity.test.ts`.
