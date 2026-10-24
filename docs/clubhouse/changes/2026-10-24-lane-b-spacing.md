# 2026-10-24 — Every sheet's spacing onto the 4pt scale (row 33)

## 2026-10-24 — 1,820 declarations onto the 4pt scale; gap tokens settled

```text
Design package: none (Clubhouse A+ handoff, row 33; lane B, logged by S1)
PR/commit:      3c4eb8580 (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     sub-pixel nudges, calc multipliers, values over 48, phone page
                roots' top and bottom and desktop roots' gap (CONS-34, OQ-63),
                lane A's sidebar rows
```

### Changed

- `scripts/clubhouse/spacing-scale.mjs` (codemod/spacing.md rule R) moved each
  integer px 3-47 off the scale in a padding, margin, gap or spacing property on
  all 30 sheets to the nearest step, ties to the coarser grid (10 -> 8, 14 ->
  16, 18 -> 16, 22 -> 24, 28 -> 32). Controls with no height of their own round
  vertical padding up.
- Medium buttons 4px wider (`--ch-btn-pad-x` 14 -> 16), small 2px (11 -> 12).
  `--ch-gap-grid` 18 -> 16, `--ch-gap-section` and `-phone` 28 -> 32,
  `-phone-snug` 22 -> 24.
- spacing-scale.test.ts: an exact per-file ratchet over every sheet, the
  custom-property guard and an inline-style guard at zero.

### Why

- Row 33: one spacing scale, kept by a guard.

### Verification

- spacing-scale.test.ts, page-spacing.test.ts. Every screen moves 1-4px: needs a
  screenshot pass at 390 and 1280 and the 44pt check on phone rows.
