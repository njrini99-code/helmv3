# 2026-10-24 — The last two season cuts take the team's zone (Clubhouse A+ S2)

## 2026-10-24 — Track record and class year turn on 1 August, team zone

```text
Design package: none (Clubhouse A+ review of #2361, owner decision 9)
PR/commit:      agent/aplus-s2
Contract IDs:   none
Actions:        none
Data impact:    none (reads only)
Held items:     Standing's window (rows 105 and 121) is still blocked on a
                migration
```

### Changed

- CoachHelm's Track record asks for the reads shown since midnight on 1 August
  in the team's zone (`seasonStartInstant`), not midnight UTC, so an Eastern
  team's record no longer counts reads from the last four hours of 31 July.
- `classYearLabel` takes the academic year from `seasonStartDate` in the
  team's zone, not the server's UTC month. Roster, Stats player and Home pass
  the team's zone; Messages, Calendar, Qualifiers, the CoachHelm player head
  and the Roster player page use the product default (New York), which they
  already used for the season, without adding a read.

### Why

- Decision 9: the season, and the class year that turns with it, starts on
  1 August on the team's calendar. Both cuts still used UTC (review of #2361:
  `coachhelm-track-record.ts:42`, `season.ts:227`).

### Tests

- `coachhelm-track-record.test.tsx`: New York asks from
  `2026-08-01T04:00:00.000Z`, Los Angeles from `07:00`.
- `logic.test.ts`: at 11 PM on 31 July in New York the class of 2027 are
  juniors; on UTC's clock they would be seniors.
