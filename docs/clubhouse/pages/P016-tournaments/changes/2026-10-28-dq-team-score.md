# 2026-10-28 — A pending DQ is out of the team score

## 2026-10-28 — Provisional DQ counts as a DQ in the team total

```text
Design package: none (owner decision, 2026-10-28)
PR/commit:      fix/dq-team-score
Contract IDs:   none new
Actions:        none
Data impact:    none (no table, RPC or migration; shot tracking unchanged)
Held items:     none
```

### Changed

- The team format engine (`scoring.ts` `teamRound`) leaves a player marked
  "DQ?" (`dq_pending`) out of the counting scores exactly as a confirmed DQ.
  The team total, the event total, the field place and the record are what
  they will be if the DQ stands. Before, the pending DQ's score still
  counted while the desk already showed it as DQ?.
- The same holds while a round is played: a pending DQ is out of the live
  count.
- The engine's DQ swap preview is gone. It showed the total "if it were a
  DQ", which is now the total itself.
- The preview fixtures count through the engine (`teamRound`, `teamEvent`,
  `teamRoundView`) instead of their own fixture-only rule, so the preview,
  the desk, the field and the loaders share one computation on phone and
  desktop.
- The score key reads "disqualification pending, not counted" for a DQ?, so
  a coach can tell it can still change; the cell keeps "DQ?".

### Why

- Owner rule: a provisional DQ should not hold up a team total that is about
  to drop. Showing DQ? in the cell while the total still used the score read
  as two answers.

### Tests

- `scoring.test.ts`: no DQ, confirmed DQ, provisional DQ (equal to the
  confirmed result), too few scores, live rounds, counting rate.
- `tournaments-shape.test.ts`: Oakmont from rows with a pending DQ gives the
  same team, field and record as a confirmed DQ (292 in round 1, 863).
- `tournaments-desk.test.tsx`: desktop and phone show 292 / 863 and DQ?.
