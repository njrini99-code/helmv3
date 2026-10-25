# 2026-10-25 — Nav entries behind a page's own flag

## 2026-10-25 — Tournaments in the nav only with golf_tournaments_v1

```text
Design package: none (D-80 placement: Team group, after Qualifiers)
PR/commit: branch claude/tournaments-wired (no PR, not pushed)
Contract IDs: none
Actions: none
Data impact: none (the flag rides in the shell's data)
Held items: none
```

### Changed

- `ChShellData.tournaments` carries `golf_tournaments_v1` from the dashboard
  layout (server side) to the shell. `navFor`, `phoneTabsFor`,
  `phoneSectionsFor`, `phoneSectionFor`, `activeNavItem`, `isRebuilt` and
  `rebuiltHref` take an optional `features` argument; with it, Tournaments
  sits in the Team group after Qualifiers (coach and player), on the phone's
  strip, and its nine routes count as rebuilt. Without it (every caller that
  passes nothing, including the command palette and shortcuts) nothing
  changes: `CH_NAV_COACH`, `CH_NAV_PLAYER` and `CH_REBUILT_ROUTES` are as
  they were.
- The Sidebar, the frame and the section switch pass the shell's data.
