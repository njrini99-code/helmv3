# P016 Tournaments — Changelog

## 2026-11-19 — The course key and tee-time key start with what they show

```text
Design package: none
PR/commit: agent/clubhouse-motion-batch3
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `screens/tournaments/fields/TournamentFields.tsx`: the course key reads
  "Search courses, course not chosen", or "<course>, course, <tees>".
- `screens/tournaments/fields/RoundRow.tsx`: "Add time for round N".

### Why

- Audit 2026-11-19, F-21 (axe label-content-name-mismatch on new Tournament,
  phone and desk): now 0.
