# 2026-10-29 — The line chart's opt-in draw-in

## 2026-10-29 — `ui/charts/Line.tsx` takes `drawIn`

```text
Design package: docs/architecture/coachhelm-visual-playbook.md §3 (owner, 2026-10-29)
PR/commit:      agent/coachhelm-visuals
Contract IDs:   none (no behaviour change for any existing caller)
Actions:        none
Data impact:    none
Held items:     the draw on a real iPhone (Safari)
```

### Changed

- `ui/charts/Line.tsx`: an opt-in `drawIn` prop (off by default) gives the path
  `pathLength={1}`, each point `--ch-i` and `--ch-n`, and the chart `data-draw`,
  so a caller's stylesheet can draw the line and fade its points in. Only the
  CoachHelm Ask's composed visuals pass it, and only for a visual that arrives
  in a live answer (the Q-153 exception in `.claude/rules/clubhouse.md`). Every
  other chart draws in place, as before.
