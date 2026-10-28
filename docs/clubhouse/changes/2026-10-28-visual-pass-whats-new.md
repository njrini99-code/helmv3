# 2026-10-28 — Visual pass: What's new row chevron

## 2026-10-28 — The What's new row chevron reads at 3:1 or more

```text
Design package: none (visual pass 2026-10-28, area B; RUBRIC H8)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none (visual only)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `styles/whats-new.css`: a What's new row's chevron is its only sign that
  the row opens. It drew in ink-400 (2.75:1 on the phone page, 3.0:1 on the
  desktop canvas) and now takes ink-500 (5.4:1 or more in both themes),
  scoped to `.ch-wn .ch-lgr__go`. The page note is
  `pages/P013-coachhelm/changes/2026-10-28-visual-pass-whats-new.md`.

### Verification

- stylelint clean on `whats-new.css`; `whats-new.test.tsx` passes.
