# 2026-11-12 — preview walk fixes (shared pieces)

## 2026-11-12 — Drills area chips fade past their bleed padding on a phone

```text
Design package: none (owner's preview walk, 11 Nov 2026, grading G3/G13)
PR/commit:      agent/preview-fixes-ui, 56d7d7aa02
Contract IDs:   none
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `styles/practice.css`: the Drills area chip row bleeds to the screen's edges, so most of its 28px edge fade landed on
  the 16 to 20px padding and "Approac…" was cut at nearly full ink. The row's `--ch-hs-fade` now reaches past the padding,
  so a cut chip fades out like every other `.ch-hscroll` row. No other row changes.
