# 2026-11-13 — Week strip gap and team-legs link height

## 2026-11-13 — The week's days stay 44 wide at 375; the team-legs names are 24 tall on desktop

```text
Design package: none (audit fixes, 13 Nov 2026: F-0017, F-0018)
PR/commit:      agent/ch-look-phone-type
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `home.css` `.ch-hm-week`: the strip's 4px gap is set as
  `--ch-wks-gap-max: 4px` instead of `gap`, so the shared strip
  (`docs/clubhouse/changes/2026-11-13-phone-type-floor-and-week-strip.md`)
  can shrink it before a day goes under 44. At 375 the days were 43 wide;
  now the gap is about 3px there and each day is 44.
- `home.css` desktop `.ch-hm-legs__a` (The team's game names):
  `padding-block: 4px`. The link is inline, so the box is 26 tall and the
  line does not move (it measured 18).

### Why

- F-0017 (TO-01, phone 44 x 44) and F-0018 (WCAG 2.5.8, desktop 24).

### Verification

- `src/clubhouse/__tests__/target-size-css.test.ts` (failed first).
- Not yet seen in a browser; the lead checks the rendered page.
