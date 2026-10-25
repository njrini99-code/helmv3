# 2026-10-23 — Spacing scale and reading widths (Clubhouse A+ WP-11)

## 2026-10-23 — One spacing scale, moved screen by screen (B2)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, B2)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: phone gutter (16px now, 20px in section 13): owner decision
```

### Changed

- Tokens: `--ch-space-0_5` to `--ch-space-12` (2, 4, 6, 8, 12, 16, 20, 24,
  32, 40, 48px) and three reading widths, `--ch-measure-text` (68ch),
  `--ch-measure-form` (640px) and `--ch-measure-page` (1200px).
- What's new: a row's lines stop at the text measure. At 1280 they ran to
  about 130 characters.
- Off-scale values moved to the nearest step: Goals (the goal sheet's form
  gap 18 to 16, the suggestions block's bottom margin 18 to 16, a phone
  row's gap 10 to 12), the CoachHelm brief (a 3px gap to 4) and the track
  record (a row's 14px padding to 12, matching its other rows).
- Left: 2,284 off-scale values in the other stylesheets. They move screen
  by screen and join the guard's list as they do.

### Why

- Spacing ran on about 30 different values with no scale behind them.

### Verification

- New `spacing-scale.test.ts`: the tokens exist, and the six migrated
  stylesheets (whats-new, popup-lab, base, coachhelm-brief,
  coachhelm-track, goals) set padding, margin and gaps only on the scale.
  1px offsets are hairlines and scroll margins are not spacing.
- WebKit before and after on What's new at 1280, the track record and the
  brief at 390, and the suggested goals at 390: only the named gaps moved.

## 2026-10-23 — Local tabular figures, ratcheted (CONS-39)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, CONS-39)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `look-feel-pass-css.test.ts` counts the local `font-variant-numeric`
  declarations outside ui, controls and tokens (502) and lets the count
  only fall, so new figures take tabular numbers from a shared class.

### Why

- Tabular numbers were set again in each screen's stylesheet.

### Verification

- The ratchet passes at 502.
