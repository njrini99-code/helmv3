# 2026-10-25 — HelmMark is exported, with an ink variant

## 2026-10-25 — The sidebar's wheel and ball can be drawn on a light surface

```text
Design package: design/handoff v3 (unchanged)
PR/commit:      branch agent/coachhelm-ask
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `HelmMark` (`src/clubhouse/shell/BrandWord.tsx`) is exported. `variant="ink"` draws the same wheel and ball without the
  dimples and highlights (they turn to mud under about 30px) and with `ch-th-mk-*` part classes, so a page colours it
  on its own surface. The sidebar's mark is unchanged (`variant="brand"` is the default).
