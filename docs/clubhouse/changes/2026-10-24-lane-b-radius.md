# 2026-10-24 — Four radius steps and the nested-corner rule (row 35)

## 2026-10-24 — every raw corner on four steps

```text
Design package: none (Clubhouse A+ handoff, row 35; lane B, logged by S1)
PR/commit:      c7eefa4d0, fa775cd71 (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     md buttons 10 -> 12 is not ruled on (OQ-59, decision J); two
                growing Messages composer fields keep raw corners
```

### Changed

- tokens.css: xs 4, sm 8, md 12, lg 16, xl 20, plus `--ch-radius-mark` (2) and
  `--ch-radius-tail` (6). Button corners stay 8 / 12 (decision 7) through sm and
  md.
- `scripts/clubhouse/radius-steps.mjs` moved 233 raw corners: capsules to 999px,
  Messages' tails to the tail token, marks to mark, 4-5px to xs, 6px and up to
  the nearest step; the six hand-written inner corners to
  `max(xs, calc(outer - var(--ch-space-n)))`.
- radius-steps.test.ts: exact ratchet, the nested rule, the scale pins.

### Why

- Row 35: four corner steps and inner = outer minus padding.

### Verification

- radius-steps.test.ts, radii-hairlines.test.ts. Visible: controls and panels
  1-2px rounder; Home hero bottom, Track course view and Ask composer 28/24 ->
  20; thin bars become capsules. Needs a look.
