# Shared pieces — Changelog

## 2026-11-27 — The card kernel keeps a page card's hooks

```text
Design package: none (card kernel rollout, QUEUE dsx-12, on dsx-02's ui/Card)
PR/commit: claude/project-thread-60gc3s
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- `Card` takes `labelledBy` (the page heading that names a section card), `data`
  (the page's own data attributes), `ref` and `as` (`div` for a card that is
  part of its page's section), so a page card moves onto the kernel with its
  class, element, name and rows exactly where they were. Nothing changes on
  screen.
