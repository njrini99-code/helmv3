# 2026-10-24 — Separators one device pixel on token colours (row 36)

## 2026-10-24 — 578 lines onto the hairline width, 164 raw colours onto tokens

```text
Design package: none (Clubhouse A+ handoff, row 36; lane B, logged by S1)
PR/commit:      e0703f724, fa775cd71 (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     `--ch-border-subtle` is a step above decision 6 (light 0.10 -> 0.13, dark 0.11 -> 0.15; decision J); lane A's `.ch-sidebar__foot`
```

### Changed

- `scripts/clubhouse/hairlines.mjs` (codemod/lines.md Appendix A) put 578 of 579 lines on `var(--ch-hairline-w)` and 164 raw colours on their token. `--ch-hairline-w` is 0.333px at 3dppx; new `--ch-stage-rule-soft` and `--ch-champagne-rule-strong`.
- hairlines.test.ts: exact per-file ratchets on full-pixel separators (67 deliberate) and 1px line elements (51), and the token pins.

### Why

- Row 36: separators half a pixel (one device pixel) on Retina.

### Verification

- hairlines.test.ts. Needs an iPhone look (row 43): ledger rules at one device pixel, and 36 raw light-mode lines that now draw in dark.
