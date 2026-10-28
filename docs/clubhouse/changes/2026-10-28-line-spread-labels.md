# 2026-10-28 — Line chart: spread point names never touch

## 2026-10-28 — `ends="spread"` thins its names to fit the width

```text
Design package: none (CoachHelm audit of main, 2026-10-28)
PR/commit:      fix/coachhelm-ask-polish
Contract IDs:   none (visual only)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `ui/charts/Line.tsx`: a `'spread'` line wrote every point name up to
  six points (else first, middle and last) whatever the width, and on a
  phone the Ask trend's dates ran together. `spreadLabels` now picks the
  names that fit: all, else every second or third, always ending on the
  newest, else first and last, else the newest alone. Each name is kept
  inside the plot. Only Ask's trend uses `'spread'`. The page note is
  `pages/P013-coachhelm/changes/2026-10-28-ask-polish.md`.

### Verification

- `ui/charts/__tests__/line-spread-labels.test.ts`.
