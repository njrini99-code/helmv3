# 2026-11-13 — The pre-paint type scale follows Text Size upward only

## 2026-11-13 — TypeScaleScript stamps nothing at or under the default Text Size

```text
Design package: none (audit fix, 13 Nov 2026: F-0014)
PR/commit:      agent/ch-look-phone-type
Contract IDs:   P008-C1 (Real Dynamic Type) narrowed: upward only
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `shell/TypeScaleScript.tsx`: the boot returns at a body of 17px or less
  and no longer clamps up to 14/17, matching `lib/type-scale.ts`. The full
  entry, with the other two writers of `--ch-type-scale`, is
  `docs/clubhouse/changes/2026-11-13-phone-type-floor-and-week-strip.md`.

### Why

- F-0014 (CR-03): under 1 the scale drew the 12, 13 and 14 steps at 9.9,
  10.7 and 11.5px on every phone page.

### Verification

- `src/clubhouse/__tests__/type-scale-script.test.tsx`: nothing stamped at a
  12 to 16px body (failed first with 0.824 to 0.941); the hydration and
  page-scope cases still pass.
