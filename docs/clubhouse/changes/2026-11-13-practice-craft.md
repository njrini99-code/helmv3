# 2026-11-13 — Practice craft pass, and a figure leading token

## 2026-11-13 — Practice: the tabs stay put, the week rests on the page's edges, today as Calendar marks it

```text
Design package: none (owner grade C, "Start improving the look and feel"; audit run 2026-11-13-main-9e7c86b P017; rubric CR-01…CR-15;
                no owner phone board for Practice: docs/clubhouse/phone/practice.md is the draft)
PR/commit:      agent/ch-look-craft
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     the page empty's medallion card (W19 B names Practice's call site) is unchanged
```

### Changed

- `screens/practice/PracticeHome.tsx`: Plans · Drills · Groups · Templates sit
  under the head at both widths, then the week,
  as Drills, Groups and Templates draw them. On a phone they sat under Up next
  (under the 400px page empty when nothing
  was coming, off the first screen) and on a desk under the week, so the tabs
  moved every time a tab was chosen. The
  route skeleton (`PracticeSkeletons.tsx`) draws them in the same place.
- `styles/practice.css`, the week: on a phone the tiles are three to the page's
  width and snap whole, so the strip rests
  on the page's edges (16, or 20 from 414 wide; CR-01). Fixed 112px tiles came
  to rest with today 34px in and a sliver of
  the day before cut at the screen's edge. Today's scroll reads the strip's own
  padding instead of a fixed 16.
- Today is the date on the accent disc on the selected fill, as Calendar marks
  it (`.ch-wk__day.is-today`), in place of a
  2px ring in the focus colour that read as keyboard focus. The disc takes back
  the 4px it overhangs, so today's practice
  sits on every tile's line.
- A week tile takes the card's corner, 16 (CR-05), as the plan rows under it
  do.
- A player's plans read at a reading measure on a desk (`.ch-prc--ply`): a row
  ran 1,112px with its name and chevron a
  screen apart (CR-14). The week keeps the page's width.
- `styles/tokens.css`: `--ch-lead-figure` (0.9), a big figure set solid beside a
  heading as a redline draws it; Roster's team
  card total is the first (P003 change of the same date).

### Why

- The owner graded Practice C. The tab bar that moves between its own tabs is
  the plainest fault; the others are rubric
  lines (CR-01 edges, CR-05 radius, CR-14 measure, CR-13 handcrafted).

### Verification

- `screens/practice/__tests__/craft-pass.test.tsx` (tabs under the head at both
  widths; tile, today, phone strip and
  player-measure rules); `skeleton-mirror.test.tsx` updated for the new order;
  `practice-states`, `print-studio`,
  `practice-screens`, `look-feel-pass-css`. Screenshots: the lead takes before
  and after on the preview.
