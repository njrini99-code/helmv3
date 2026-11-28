# P001 — Changelog

## 2026-11-27 — The shell loads the card kernel's stylesheet

```text
Design package: none (design lab pilot P1, QUEUE dsx-02)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- `ClubhouseFrame` imports `styles/card.css` beside `ui.css`, so every
  page can compose `ui/Card.tsx` (shared change of the same date). Nothing
  on screen changes until a page uses it.

### Why

- One card for every page (Nick, 27 Nov: "I want the cards to be better").
