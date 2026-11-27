# P008 — Changelog

## 2026-11-27 — Settings' grouped lists sit on the one card

```text
Design package: none (design lab card kernel, QUEUE dsx-02; card rollout)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- Every grouped list on the phone's Settings (the hub, Account, Notifications,
  Team, Golf and the loading skeleton) now draws its rounded card through the
  card kernel (`ui/Card.tsx`, `kind="list"`), through one `RowCard` in
  `phone/ui.tsx`. Its material, radius and elevation are the one card's
  tokens, which hold the same values Settings used, so nothing looks
  different. The rows stay direct children, flush to the edges.
- The picker sheet's radio list is unchanged: it is a list inside a sheet,
  not a card.

### Why

- Nick, 27 Nov: move the live pages' cards onto the card kernel. Shared kernel
  fix: `docs/clubhouse/changes/2026-11-27-list-card-rows.md`.
