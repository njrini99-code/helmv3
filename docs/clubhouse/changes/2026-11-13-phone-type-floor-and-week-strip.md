# 2026-11-13 — Phone type never under its step; week strip days 44 wide

## 2026-11-13 — Text Size is followed upward only, and the week strip's gap gives way before a day goes under 44

```text
Design package: none (audit fixes, 13 Nov 2026: F-0014, F-0017)
PR/commit:      agent/ch-look-phone-type
Contract IDs:   P008-C1 (Real Dynamic Type) narrowed: upward only
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- **Phone type floor (F-0014, CR-03).** `--ch-type-scale` is no longer
  stamped under 1. Below the default Text Size the scale was clamped to
  14/17 (0.824), so the 12, 13 and 14 steps drew at 9.9, 10.7 and 11.5px on
  every phone page. All three writers of the scale now follow Text Size
  upward only, still capped at XXL (23/17):
  - `lib/type-scale.ts` (`typeScaleFor`: null at and under 17px;
    `MIN_BODY_PX` is gone), which `lib/dynamic-type.ts` uses;
  - `shell/TypeScaleScript.tsx` (the pre-paint stamp on the dashboard and
    the preview);
  - `src/components/golf/theme/ThemeScript.tsx`, which stamps the same
    property on every `/golf` path, sign-in included.
  Desktop is unchanged: none of them stamps without a coarse pointer.
- **Week strip (F-0017, TO-01).** `ui.css` `.ch-wks`: the gap is
  `--ch-wks-gap`, `clamp(0px, (strip - 7 x 44) / 6, --ch-wks-gap-max)`, so
  the gap shrinks before a day goes under 44 (at 375 a day was 43 wide on
  Home and Team Hub). A page widens the gap through `--ch-wks-gap-max`
  (Home: 4px), not `gap`. The chosen plate is now a step wide (a day and
  its gap), glides by its own width and clips the gap off its leading edge,
  so it still covers its day exactly at every width.

### Why

- The audit's WebKit iPhone scan found 9.9 to 11.5px text on every page.
  The ×0.824 is 14/17: emulated WebKit on a Mac reads `-apple-system-body`
  as 13px under a touch screen, and the clamp took it to 14/17. A real
  iPhone at Text Size xSmall, Small or Medium took the same path (14/17,
  15/17, 16/17). Any scale under 1 puts the 12 step under 12px, so the
  floor is 1.
- Trade-off: a phone set to a smaller Text Size now sees Clubhouse at its
  designed sizes, not smaller.

### Verification

- `src/clubhouse/__tests__/dynamic-type.test.tsx`,
  `src/clubhouse/__tests__/type-scale-script.test.tsx` and
  `src/components/golf/theme/__tests__/ThemeScript.test.tsx`: nothing is
  stamped at a 12 to 16px body (failed first with 0.824 and 0.941).
- `src/clubhouse/__tests__/target-size-css.test.ts`: the strip's gap and
  plate evaluated at 313 to 390px strips; seven days of 44 or more, and the
  plate on each day's edges.
- Not yet seen in a browser (no screenshots in this change); the lead
  checks the rendered pages.
