# 2026-10-24 — Review and History

## 2026-10-24 — The review, and History across seasons

```text
Design package: design/handoff v3 (tour.jsx Review, History, Trend; tour-m.jsx)
PR/commit:      branch agent/tournaments-screens
Contract IDs:   CH-16201, CH-16401, CH-16235, CH-16236, CH-16335, CH-16336,
                CH-16337, CH-16340
Actions:        none (links only)
Data impact:    none (preview fixture, no tables, loaders or routes)
Held items:     none
```

### Changed

- `Review` replaces its placeholder: the layers (observation, evidence,
  possible reason) and the notes and reflections, as its own page and as the
  desk's Review tab, which now embeds it. Loading and failed are kept; the
  review read failing (CH-16235), a review that is not open (CH-16335), no
  review (CH-16336) and no notes (CH-16337) are new.
- `History` replaces its placeholder: the trend of team scoring against the
  course rating (a line a season on desktop, bars on the phone), the
  actual-lineups and returning-players switch, a measured-against switch for
  the field, the computed sentence under it, and the shared ledger of every
  event. The trend failing (CH-16236) and no results yet (CH-16340) are new.
- `history-model.ts` holds what the chart reads: the plotted figure, the
  season runs, the scale and the sentence.
- Not drawn, and said so in DESIGN.md: the review's three writes (no action
  exists), the leak table, the debrief lines, head-to-head, the splits and
  the band (no board draws them).

### Why

- The review is where a coach decides what to ask a player next, and History
  is where one season is read against the last.
- The sentence under the trend names who left and who joined, so a gain is
  never read as the same players improving.

### Verification

- `tournaments-review.test.tsx` and `tournaments-history.test.tsx`: desktop
  and phone for ready, loading and failed, the embedded review, the switches
  and the URL, and each catalog code above; the desk test covers the tab.
- Gates run with real exit codes: tsgo, vitest on the tournaments tests and
  the CSS guards, clubhouse:check, clubhouse:css, eslint and the catalog.
- Owed: WebKit shots against the board, light and dark, 390 and 1440.
