# 2026-11-15 — the desk's green corner

## 2026-11-15 — Desk top bar clear at rest so the green corner shows

```text
Design package: none; Nick in the project chat, 15 Nov 2026
PR/commit: branch claude/project-thread-d9q2qs
Contract IDs: none changed
Actions: none changed
Data impact: none
Held items: none
```

### Changed

- The desk canvas keeps the gradient from before the 11 Nov release train: the
  ivory light across the top, the sidebar's green bleeding into the left edge
  and the green mist in the top-left corner (the layers match `1b74f7e85^`;
  only the linen underneath is the deeper #e8e3d5 Nick asked for).
- The desk top bar went solid on 10 Nov and covered that corner. It is now
  clear at rest, when nothing is under it, and paints the paper over the linen
  once the canvas scrolls under it (`data-scrolled`, light and dark). Reduce
  Transparency keeps it solid at rest too.

### Why

- Nick, 15 Nov: "Whatever gradient matched that had the green upper left
  corner and the ivory that's what needs to be reinstated".

### Verification

- Unit: `src/clubhouse/styles/__tests__/desk-green-corner.test.ts` pins the
  canvas layers, the mist and the bar's rest, scrolled and Reduce Transparency
  rules.
