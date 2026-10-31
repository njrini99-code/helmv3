# 2026-10-23 — The 11-size type scale

## 2026-10-23 — Text on 11 sizes (mot-08)

```text
Design package: none (owner-approved from before/after renders, 2026-10-23)
PR/commit: branch claude/clubhouse-motion-apple-bar
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- This page's text sizes, and the shared tokens and shell it uses, moved to the
  nearest of the 11 steps (11 to 34px). Weights, line heights and colours are
  unchanged.

### Why

- The cross-page entry, docs/clubhouse/changes/2026-10-23-type-scale.md, holds
  the reasons.

### Verification

- look-feel-pass-css.test.ts pins the 11 steps.
