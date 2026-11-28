# P001 — Changelog

## 2026-11-27 — Icon wells get an edge, and every card the shell frames lifts

```text
Design package: none; Nick's ask (27 Nov 2026): "more depth more modern premium look", "color contrast has been an issue"
PR/commit: branch clubhouse-depth-contrast (local, not pushed)
Contract IDs: none changed
Actions: none changed
Data impact: none
Held items: before and after pictures still owed
```

### Changed

- `shell.css`: the tinted icon wells in the More list (desk) and the team
  switcher wear `--ch-icon-well-edge`, the card's ring inset. The well was
  1.07:1 on the card and read as a smudge. On the phone the More list's bare
  glyphs stay bare (`box-shadow: none`).
- The cards, sheets and popovers the shell frames take the deeper card and
  raised elevations from `tokens.css` (shared entry:
  `docs/clubhouse/changes/2026-11-27-depth-and-contrast.md`).

### Why

- An icon well is an object on the card; a fill a few percent off the card
  has no edge, so it reads as a stain, not a tile.

### Verification

- `src/clubhouse/styles/__tests__/depth.test.ts`: the token is the card ring
  inset, and both root wells use it.
