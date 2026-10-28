# 2026-10-28 — Design picks after the visual pass

## 2026-10-28 — Six open design calls settled

```text
Design package: none (visual pass 2026-10-28; the owner said to go with the
                recommended pick on each call)
PR/commit:      polish/clubhouse-design-picks
Contract IDs:   none (visual only)
Actions:        none
Data impact:    none
Held items:     none
```

The visual pass left six calls open. Each is settled below. Two change code;
four keep what ships, and the reason is recorded so the next audit does not
raise them again.

### Changed

- `ui/Ledger.tsx` and `styles/ui.css`: `FigureRow`'s `under` tone no longer
  paints the figure red. "Under par" on Team rounds counts rounds; it is not a
  score, and a red tally read as an alert in a row of plain figures. The figure
  stays ink and its label carries the scoreboard's red under-par disc (8px,
  `--ch-score-under-fill`) as its key. Red stays on scores, the discs and the
  pin. Team rounds is the only user. Page note:
  `pages/P011-rounds/changes/2026-10-28-design-picks.md`.
- Classes, phone timetable header: a team event is named on its own 12px line
  under the days instead of an 11px chip in a 50px day column. Page note:
  `pages/P012-classes/changes/2026-10-28-design-picks.md`.

### Kept, with the reason

- Strokes gained keeps one decimal. The owner chose one decimal everywhere on
  2026-10-24 (`formatSG`, decision 11); the visual-pass rubric's "2dp" line
  predates that and is corrected.
- A loss on a green stage is the stage's gold (champagne-300, 6.5:1), and a
  gain its mint. Amber on the deep green was 1.6:1. Off the green stages a loss
  stays amber.
- Two green surfaces. The onboarding intro's two choices are peers, a player's
  door and a coach's door, so neither is drawn quiet; the owner's 2026-10-08
  night pass keeps "the green choices". On player Home, Up next is the one
  green feature card; the scorecard's green board is the scorecard's own
  material on every page (the hung board), not a second feature card.
- The sidebar fold keeps its width spring (owner motion pass, mot-01): the
  page's edge moves with the sidebar's as macOS sidebars do, the labels already
  fade out first and in last, and readers wait until it settles. A transform
  fold would reflow the page in one jump at the start.

### Verification

- `ledger-kit.test.tsx`: an under par cell carries `is-under` and its figure
  has no tone class; a gain keeps `is-gain`.
- `classes.test.tsx`: the header lists "Thu Pinehurst qualifier" on its event
  line.
