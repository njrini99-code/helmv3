# 2026-11-12 — roster

## 2026-11-12 — Player card figures: unit with its number, no card inside the card, early said once (W25)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W25)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Strokes gained reads "−4.9 a round" on one line: the unit is a small tertiary
  label inside the figure, no longer
  wrapped under the bar.
- The Scoring and Strokes gained figures sit on the card under a hairline; the
  beige well with its own shadow is gone.
- An early player's scoring caption reads "Avg" instead of "Needs N more"; the
  "Early read" pill over the form line
  already says it.

### Why

- Nick's walk (W25): the unit wrapped under its bar, a panel sat inside the
  card, and the early state was said twice.

### Verification

- `screens/roster/__tests__/card-figures-flat.test.ts`; every roster-matching
  suite 50 files, 332 tests, exit 0;
  look-feel-pass-css exit 0; eslint exit 0.
