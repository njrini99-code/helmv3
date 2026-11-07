# 2026-11-07 — shared

## 2026-11-07 — Flags off keeps the look from before Nov 4

```text
Design package: none
PR/commit:      agent/ch-flags-off
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

The redesign train and the sweep changed some shared CSS with no flag: the page
head's top padding, the empty states, avatar spacing, the bell count's ring and
tabular figures. The tight page head (and the double rule it removes) now needs
the flag too, except on Roster, Recruiting and Tournaments, which were tight
before (`data-canopy-tight-always`). The live layout now passes `refresh: false`
when the flag is off, `.ch-root` carries `data-ch-pre-refresh`, and
`styles/pre-refresh.css` holds those looks. CoachHelm's large flat segmented
well now comes with `coachhelm_team_board_v1`. With the flag on nothing changes,
and previews draw as before unless they ask for `&refresh=off`.

With the flag off, the week view keeps its tints and its loading head height
from before the redesign.
