# 2026-11-07 — P015

## 2026-11-07 — The welcome's date is the team's day

```text
Design package: design-refresh/classes-roster-home
PR/commit:      agent/lane-crh
Contract IDs:   none new
Actions:        none new
Data impact:    reads golf_team_settings.timezone for the signed-in team
Held items:     none
```

The date above the greeting uses `teamDateLabel`, the helper Home's hero uses,
in the team's zone. With no team, or a failed read, it stays on the viewer's
clock. The greeting and the sky stay on the viewer's clock.
