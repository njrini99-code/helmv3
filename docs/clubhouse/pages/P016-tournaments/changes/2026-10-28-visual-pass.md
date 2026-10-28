# 2026-10-28 — Visual pass: one way back on the phone, readable small type and marks

```text
Design package: visual-pass-2026-10-28 (RUBRIC.md, premium-research/team-tabs.md)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     tournaments-desk.css is in an open PR; its fixes are requested, not made (see findings G)
```

### Changed

- Event desk and Review on the phone drop the in-page crumb; the bar's Back is
  the one way back (desktop keeps the crumb).
- Home: the date tile's month is 12px on the phone (was 11, below the phone
  floor); the featured event's title gets a 44px hit area on the phone.
- History: the trend bars' labels and values are 12px (figures stay tabular
  through `.ch-num`);
  the mean line and the trend key read in ink-400 / tertiary text (ink-300 was
  under 3:1).
- History on the phone: the two filters (Lineup mode, Measured against) ran over
  "Across seasons" and off the right edge; the head now wraps and the filters
  take their own row. The note under the bars stands 16px clear of the labels.
- Compare: timeline legend dots and points are ink-400 (ink-300 was under 3:1
  for a graphic mark).
- Placeholder screens stay honest: no fake data added.

- Event desk: the "Open" links take the dark-safe green (they used --ch-accent,
  2.74:1 on the dark canvas, the one axe colour failure in the before pass). On
  the phone the tab counts and the score marks (NC, round) step up from 11 to
  12.

### Verification

- stylelint and eslint on the touched files: exit 0; tournaments tests pass via
  `scripts/test.sh`.
- Before/after: before-states-G2 and after-G2 (tournament-desk,
  tournament-review, tournament-history, tournaments at 393 and 1280).
