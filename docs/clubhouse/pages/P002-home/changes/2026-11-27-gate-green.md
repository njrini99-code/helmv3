# P002 — Changelog

## 2026-11-27 — Home passes the presentation gate on a phone and a desk

```text
Design package: none
PR/commit:      agent/presentation-gate-green
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Phone: a section's link (Calendar, and a failed card's link) sits on the
  card's 16. The negative margin that bought its 44 drew its box 8 from the
  card's edge; the reach is the hit layer now, 44 tall and at least 8 past the
  words on each side.
- Phone, player: the Scoring avg caption says only the change ("−0.9 · Better
  than previous 10"). The picker in the same card already says Last 10, as
  coach Home's figures leave the window to the section's line (HOME-P-11). The
  desk keeps "Last 10 · …".
- Gate: the phone's scoreboard and the desk's week well are drawn inward (an
  inset shadow and a 1px lip), so the gate reads them as wells in their card,
  not as cards inside a card. See
  `docs/clubhouse/changes/2026-11-27-gate-wells.md`.

### Why

- The presentation gate on main failed 18 Home tests: row-inset on the
  section link (4), cramped-text on the player's figures, where the caption
  ran to three lines in a half-width cell (2), and nested-surface on the
  scoreboard (6) and the week well (6).

### Verification

- `player-game-windows.test.tsx`: the phone's picker names Last 10 and the
  caption carries only the change.
- Clubhouse quality, presentation gate, on this branch.
