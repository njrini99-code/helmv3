# P013 CoachHelm — Changelog

## 2026-11-19 — Team's content-in answers a choice only

```text
Design package: none
PR/commit: agent/clubhouse-motion-batch3
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/coachhelm/team/team-motion.ts`: the spot and course content's
  rise (a fade under Reduce Motion) and the rows' reorder play only within a
  second of a tap or key. A station that settles as the page hydrates is drawn
  in place (F-27).

### Why

- Audit 2026-11-19, F-27: the blocks moved as the page opened with nobody
  touching anything, and faded under Reduce Motion. The motion gate's Team
  entries for it are gone from its known list.
