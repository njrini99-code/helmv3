# 2026-11-12 — messages

## 2026-11-12 — Reaction badges no longer cover a message's words (W16)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W16)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new (MSG-406 placement changed)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Reaction badges hang 22 px above the bubble (was 14). A 26 px badge now
  overlaps the bubble's top by 4 px, inside its
  rounded corner and padding, so it never sits on a word. They still sit 10 px
  past the corner that faces the other side
  of the thread.
- A row with badges leaves 24 px above it (was 16) for the risen badges.

### Why

- Nick's walk (W16): on a short bubble ("QA line A") two badges covered "line".

### Verification

- `screens/messages/__tests__/reaction-badge-placement.test.ts` pins the overlap
  at 6 px or less and the row's room.
- Not yet seen in WebKit; for the coordinator's check on :3100
  (`/clubhouse-preview/messages`, a thread with reactions).
