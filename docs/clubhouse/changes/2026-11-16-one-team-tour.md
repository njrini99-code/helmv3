# 2026-11-16 — team tour

## 2026-11-16 — One rule names a team's Tour on every page

```text
Design package: none (launch readiness 2026-11-15, DF-P-13, #2541 follow-up)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only; the team read embeds its settings row)
Held items:     none
```

### Changed

- `data/stats-common.ts`: `teamTour` names the Tour a team's strokes gained
  is measured against with the round review's rule (`reviewTour`): the
  team's own `golf_team_settings.sg_baseline`, else its gender's Tour. The
  team reads select `TEAM_TOUR_COLUMNS` (the gender and the embedded
  settings row) in one request.
- Home, Player Home, Roster, Stats Team, Stats Player, the CoachHelm team
  board and every CoachHelm Tour read (`coachTour`, `playerTeam`) use it in
  place of the gender alone, so the review and the other pages cannot name
  two Tours for one team.
- `data/stats-weight.ts`: `summarizeWindow` gives `trendDates` (oldest
  first), as `summarizePlayer` does, so a windowed form line can space its
  points by date.

### Why

- The round review read the team's baseline and the other pages its gender,
  so a team whose baseline differed from its gender saw two Tours. On
  staging (16 Nov, read only) no team has a baseline set, so nothing a coach
  sees changes today.

### Verification

- `data/__tests__/team-tour.test.ts` and the trend dates case in
  `data/__tests__/one-sg-source.test.ts`. Not checked in a browser.
