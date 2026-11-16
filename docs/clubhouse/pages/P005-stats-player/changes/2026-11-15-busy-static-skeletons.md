# 2026-11-15 — stats (player)

## 2026-11-15 — The window change dims after 150 ms; static skeleton

```text
Design package: MOTION-AND-VISUAL.md 3.9 and 3.12; production audit 2026-11-15 A-13
PR/commit:      claude/project-thread-10vtd2 (f0705313b, 277108145)
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- A window change (`StatsPlayer.tsx`) marks the page busy from the tap
  (`aria-busy`, the updating note) and dims it through `useBusy`
  (`data-ch-busy='skeleton'`, `stats.css`) only after 150 ms, held at least 300
  ms, then lifts over the quick beat. It was a CSS `transition-delay` with no
  hold.
- The Stats skeleton (`stats-redesign.css`) is static: no sheen, no fade-in; its
  blocks wait the 150 ms busy delay. Shared entry:
  `docs/clubhouse/changes/2026-11-15-busy-static-skeletons.md`.

### Why

- 3.9: no dim for a wait under 150 ms and no flash; 3.12: no shimmer on
  skeletons.

### Verification

- vitest: stats-busy-delay, stats-player, stats-team, states, motion gate tests.
  Engine tier for feel: D owed.
