# 2026-11-12 — roster (desk top row)

## 2026-11-12 — The season card keeps its track on a wide desk (C5)

```text
Design package: none (C5 WebKit pass of the coordinator's combined branch, 12 Nov 2026)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- On a desk 1193px and wider the season card is its 320px track again. W24's
  leaders' rule spanned `1 / -1`, which in
  the column-flow top grid is the card's track alone: the line took it, and the
  card fell into a 200px track with its
  class bar, Freshmen and Top five running past its edge. The cards keep the
  first row, and the rule sits in the
  second, under the leaders, as wide as its words. The narrow desk (821–1192)
  and the phone are unchanged.

### Verification

- `roster/__tests__/leaders-rule-grid.test.ts`; the W24 and CRH design tests;
  look-feel guard, exit 0.
- WebKit, the rule injected into the combined branch's page: the card is 320px
  with nothing past its edge at 1920 and
  1440 (leaders 255 / 252 each); 1100 is one column as before
  (`$H/shots/f9b/c5/roster-team-card-fixed-page__*.png`).
