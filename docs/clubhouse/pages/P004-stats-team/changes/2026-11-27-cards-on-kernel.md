# Stats (team) — Changelog

## 2026-11-27 — Team Stats cards run on the card kernel

```text
Design package: none (card kernel rollout, QUEUE dsx-12, on dsx-02's ui/Card)
PR/commit: claude/project-thread-60gc3s
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- Season bests, Team putting's empty card, the phone panels (The round, Legs,
  Players, Putting, Team rank) and the filter card are drawn by the shared
  card (`ui/Card`, kind list) with their own class kept. Nothing changes on
  screen.
