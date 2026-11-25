# P008-settings — Changelog

## 2026-11-24 — Both team codes, named, for a men's and women's coach

```text
Design package: owner request 2026-11-24 ("clearly displayed")
PR/commit: agent/clubhouse-dual-team-codes
Contract IDs: none
Actions: none (reads golf_team_coach_staff → golf_teams, which the coach can already read)
Data impact: one extra read on Settings for coaches; no writes
Held items: none
```

### Changed

- Settings › Team, for a coach staffed on more than one team: the invite
  card shows every team's code, each labelled "Men's team code" or
  "Women's team code" (or the team's own name), the active team first.
  The other team's code has its own Copy, and its toast names the team.
- "Make a new code" names the team it replaces and says to switch teams
  to replace the other one (regenerating still acts on the active team).
- Phone: the second code is its own green card under the first.
- A one-team coach sees exactly what they saw before.
- Preview: `/clubhouse-preview/settings?state=twoteams&section=team`.
