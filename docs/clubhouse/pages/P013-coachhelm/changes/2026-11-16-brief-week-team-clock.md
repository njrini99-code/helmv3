# 2026-11-16 — coachhelm

## 2026-11-16 — The brief's week is the team's week

```text
Design package: none (launch readiness 2026-11-15, DF-P-10)
PR/commit:      claude/project-thread-vledif-pa-data-23
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; one more read of the team's time zone)
Held items:     none
```

### Changed

- `lib/coachhelm/v3/monday-brief`: the brief's "Week of" date, its last
  day and the count of last week's rounds are dates on the team's clock
  (`golf_team_settings.timezone`), not UTC dates. The Monday email and the
  coach Brief both read the zone. An unset or unread zone uses the default.

### Why

- Late on a Sunday in the US it is already Monday in UTC, so the brief
  started its week a day late and counted Sunday's rounds as last week's.

### Verification

- `monday-brief/__tests__/brief-team-zone.test.ts`, which fails without the
  zone. Not checked in a browser or on a device.
