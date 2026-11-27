# P011 — Changelog

## 2026-11-27 — Live's player lists sit on the one card

```text
Design package: none (design lab card kernel, QUEUE dsx-02; card rollout)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- Each group on Live (coach) draws its card of player lanes through the card kernel (`ui/Card.tsx`, `kind="list"`). The material, radius and elevation are the one card's tokens, at the values Live already used. The lanes stay flush to the edges, so nothing looks different.

### Why

- Nick, 27 Nov: move the live pages' cards onto the card kernel. Home's Live now card belongs to the Home rollout.
