# 2026-11-12 — onboarding

## 2026-11-12 — The name fields are boxes, as every other field is (G19)

```text
Design package: none (preview grade G19, GRADE_A.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The first and last name fields on the player's and the coach's name step take
  the onboarding box (`.ch-ox-input`'s
  surface, 1px ring, medium radius, focus halo and red error edge) at its 16px
  type, in place of a 38px underline.
- Two look-feel ratchets for onboard.css fall with it: raw font longhands 23 →
  22, raw letter-spacing 4 → 3.

### Why

- Preview grade G19 (also in the test pass): the names were underlines while
  every other field is a box.

### Verification

- `screens/onboard/__tests__/name-fields-boxed.test.ts`; onboarding suites with
  look-feel-pass-css and dark-ink-guard,
  12 files, 133 tests, exit 0; eslint exit 0. Not re-shot in WebKit.
