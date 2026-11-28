# CoachHelm — Changelog

## 2026-11-27 — Team board cards run on the card kernel

```text
Design package: none (card kernel rollout, QUEUE dsx-12, on dsx-02's ui/Card)
PR/commit: claude/project-thread-60gc3s
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- Working on, Track record, This week and the course and station cards on the
  Team board are drawn by the shared card (`ui/Card`, kind list) with their
  own class, data hooks and refs kept. Nothing changes on screen.
