# Stats (player) — Changelog

## 2026-11-27 — Player Stats cards run on the card kernel

```text
Design package: none (card kernel rollout, QUEUE dsx-12, on dsx-02's ui/Card)
PR/commit: claude/project-thread-60gc3s
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- The Rounds tab's cards and panels and the tab's section card are drawn by
  the shared card (`ui/Card`, kind list) with their own class kept. Nothing
  changes on screen.
