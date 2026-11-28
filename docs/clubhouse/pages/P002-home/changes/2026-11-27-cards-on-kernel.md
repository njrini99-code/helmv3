# Home — Changelog

## 2026-11-27 — Home's cards run on the card kernel

```text
Design package: none (card kernel rollout, QUEUE dsx-12, on dsx-02's ui/Card)
PR/commit: claude/project-thread-60gc3s
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- Your latest round (player and coach phone), Live now and Teammates on
  course are drawn by the shared card (`ui/Card`, kind list) with their own
  class kept. Before and after fixture shots at 390 and 1280 match pixel for
  pixel apart from one antialiased column (Player Home unchanged).
