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
  Every team's code is drawn by the same box with the same actions (Copy
  code, Copy link, Share) in the same style, so neither team's code reads
  as the lesser one (owner: the first draft gave the men's code the
  primary button and the women's a single plain one). Toasts name the team.
- "New code" is one row under the codes that names the team being viewed
  and says to switch teams to replace the other (regenerating still acts
  on the active team only; the server allows nothing else).
- Phone: each team's code is the same green card with Share and Copy code;
  New code moves to its own row under them.
- A one-team coach sees exactly what they saw before.
- Preview: `/clubhouse-preview/settings?state=twoteams&section=team`.
