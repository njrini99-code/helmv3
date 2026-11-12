# 2026-11-12 — coachhelm (practice library)

## 2026-11-12 — The Drills area chips fade where they are cut (G3/G13)

```text
Design package: none (preview grade G3/G13, GRADE_A.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- On a phone the Drills area row's edge fade runs over its side padding too: 44px at 390pt (28 + 16), 48px at 414pt and
  wider (28 + 20). Before, most of the 28px fade fell on the padding and an area was cut at the edge nearly at full ink.

### Why

- Preview grade G3/G13 named six rows cut mid-word. A closer look at the stills found four already fading through
  `.ch-hscroll` (Team Hub tabs, the tournament desk tabs, Compare's metric tabs, the CoachHelm chips on Deep dive; the
  player file not checked): they read as cut only at contact-sheet size. The Drills areas were the one row whose fade
  did not show.

### Verification

- `screens/practice/__tests__/areas-fade-past-padding.test.ts`; practice + ui suites with look-feel-pass-css, 43 files,
  279 tests, exit 0. Not re-shot in WebKit (another session held the browser).
