# 2026-10-28 — Ask: whole-team reads only where Clubhouse is on

## 2026-10-28 — Team rounds and qualifiers follow golf_clubhouse_ui

```text
Design package: none (WIRING_REVIEW-2026-10-27 item 5; owner decision)
PR/commit:      branch fix/ask-team-tools-flag
Contract IDs:   none (tool registration and a read's output only)
Actions:        none
Data impact:    none (read tools only; no flag value changed)
Held items:     none
```

### Changed

- `get_team_rounds` and `get_qualifiers` are registered only while
  Clubhouse is on for the coach's team (`isClubhouseForTeam`: the
  `golf_clubhouse_ui` flag, then the `HELM_CLUBHOUSE_TEAMS` allowlist).
  The chat engine is shared with Fairway, so before this every coach's
  chat had them. Left out, the model is never offered them and cannot
  call them. `get_tournaments` keeps its own `golf_tournaments_v1` gate.
- The chat route makes that decision and passes it to `buildCoachTools`
  as `teamTools` (off when left out), because code outside src/clubhouse
  may not import the Clubhouse gate.
- `get_team_rounds` already asked for both `qualifier` and the older
  `qualifying` type; its round list now reports both as `qualifier`, so
  one qualifier never reads as two kinds of round.

### Verified

- `src/lib/coachhelm/v3/chat/__tests__/agent-tools.clubhouse-gate.test.ts`:
  absent
  with the flag off or the team off the allowlist, present otherwise.
- `src/lib/coachhelm/v3/chat/__tests__/team-read-tools.test.ts`: a
  `qualifying` round counts and reads as a qualifier round.
