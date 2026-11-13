# 2026-11-12 — stats (team)

## 2026-11-12 — On a wide desk the chosen card's detail opens out to the right edge

```text
Design package: none (owner's preview walk, 11 Nov 2026)
PR/commit:      agent/preview-fixes-ui
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Team stats shares the player page's desk grid (`.ch-shs-desk`), so its detail
  also opens out to the right on a wide screen: the page has no width cap while
  a
  detail is open, the cards keep up to 680px and the detail takes the rest. See
  P005's fragment of the same date for the reason and the measurements.
