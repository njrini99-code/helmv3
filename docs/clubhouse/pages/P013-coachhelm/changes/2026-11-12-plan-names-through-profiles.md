# 2026-11-12 — coachhelm

## 2026-11-12 — Practice plans: names come through the profile function

```text
Design package: none (release readiness: the 20261017005000 re-audit)
PR/commit:      #2504 (agent/documents-file-url-shim), e739032651
Contract IDs:   none new
Actions:        none
Data impact:    none (read path only)
Held items:     20261017005000_golf_players_select_drop_teammate_branch.sql
```

### Fixed

- A player's plan sheet and their Practice card name their group-mates.
  The names came from a `golf_players` embed on the roster, read in the
  player's own session. Once 20261017005000 drops the teammate branch
  from `golf_players_select`, every mate would have read "—" on the sheet
  and dropped off the card ("with Eli and Owen").
- The plan page and Practice home now read the roster's ids and, beside
  them, the team's profiles through `readGolfPlayerProfiles`. Only active
  members are kept, so a coach's "seen N of M" is unchanged. Until the
  profile function is deployed, the helper reads the table as before.
- Nothing a coach or player sees changes today.
