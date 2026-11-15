# 2026-11-07 — shared

## 2026-11-07 — What Coach Home's pass changed outside Home

```text
Design package: design-refresh/classes-roster-home
PR/commit:      agent/lane-crh
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

- `tokens.css`: `--ch-radius-hero` (24), `--ch-radius-well` (13) and
  `--ch-type-brief` (15/1.45), the fidelity spec's values. The radius guard
  names the two new tokens.
- `ui.css`: the week strip's tile takes its height from its content (CRH-12)
  and its dots are `--ch-green-500`, 3:1 or better (CRH-11), on every strip.
- `lib/team-date.ts`: one date line for Home and the welcome.
