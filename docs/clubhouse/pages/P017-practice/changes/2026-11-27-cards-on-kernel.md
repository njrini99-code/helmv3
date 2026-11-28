# P017 — Changelog

## 2026-11-27 — Practice's cards sit on the one card

```text
Design package: none (design lab card kernel, QUEUE dsx-02; card rollout)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed (CTL-P017-022 keeps its id)
Data impact: none
Held items: none
```

### Changed

- These cards now draw through the card kernel (`ui/Card.tsx`): Plan your first practice, Up next, the template cards (From GolfHelm and yours), the group cards, the builder's empty card, the builder's Before you publish strip, and their skeletons. Material, radius and elevation are the one card's tokens, which hold the values Practice used. Each card keeps its own padding and layout.
- A group card is a pressable kernel card. It takes the card press scale at any width, the card's focus outline, and the reading hover elevation under a pointer.
- The print studio's sheet is paper for printing, not an app card, and is unchanged.

### Why

- Nick, 27 Nov: move the live pages' cards onto the card kernel. Shared: `docs/clubhouse/changes/2026-11-27-card-kernel-roles.md`.
