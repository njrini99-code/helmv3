# P005 — Changelog

## 2026-11-27 — Strokes-gained reference label reads a real token

```text
Design package: none (design lab governance, dsx-09)
PR/commit: #2659, claude/project-thread-13od9x
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The strokes-gained trend's reference label (`.ch-sgt__reflab`, canopy
  look) fills with `--ch-text-tertiary`, which it already showed through the
  fallback of the undefined `--ch-champagne-600`.

### Why

- The new token-reference check (`scripts/clubhouse/token-refs.mjs`, run by
  `clubhouse:check`) fails any `var(--ch-*)` that names a custom property
  nothing defines (design lab GAP-B3). This was one of the three on main.

### Verification

- What renders is unchanged, except as noted above: each old reference computed
  to the value now written, or to nothing.
- `npm run clubhouse:token-refs` and `npm run clubhouse:css` are clean.
