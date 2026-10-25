# 2026-10-24 — The last class years turn in the team's zone

## 2026-10-24 — Qualifiers, the coach's player page and the player Roster

```text
Design package: none (review of #2361, nit; decision 9)
PR/commit:      agent/clubhouse-aplus-phase2
Contract IDs:   none
Actions:        none
Data impact:    one more read per page: golf_team_settings.timezone, in the
                first wave beside the page's other reads (no extra wave)
Held items:     none
```

### Changed

- The Qualifiers list, detail and form, the coach's CoachHelm player head and
  the player's Roster pass the team's time zone to `classYearLabel`, so a class
  year turns on 1 August where the team is, as Roster, Stats, Home, Calendar
  and Messages already do. Every caller now passes a zone.

### Verification

- `qualifiers-reads.test.ts`: the zone sits in the first wave of each page;
  `roster-player`, `coachhelm-player` and `qualifiers` tests pass.
