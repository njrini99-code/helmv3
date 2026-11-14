# P003 Roster — 2026-11-13

## 2026-11-13 — SG names its rounds; past class year named

```text
Design package: none (audit 2026-11-13, F-0005 and F-0022)
PR/commit:      agent/ch-look-data-honesty
Contract IDs:   none new
Actions:        none new
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/roster.ts`, `data/sg-window.ts`: each player carries `sgWindow`, the
  rounds `sgPerRound` reads (its last ten counted rounds with strokes gained:
  how many, first and last date).
- `screens/roster/Roster.tsx` (desktop card), `RosterPeek.tsx` (peek) and
  `RosterProfileCrh.tsx` (phone profile, inside "This season"): under the
  strokes gained figure, "Last 8 · Jun–Jul" (`lib/sg-window-line.ts`).
  `styles/roster.css`: the peek's caption (`.ch-rs-peek__f`) in its label's type
  and ink.
- `screens/roster/format.ts`, `RosterTeamCard.tsx`: a graduation year that is
  set and past reads "Class of 2026" on the player's rows (`yearLineOf`) and in
  the class mix ("2 Class of 2026", `classPast`), on the neutral tone; "not set"
  keeps meaning no year, or one too far out.

### Why

- F-0005: Cole's card read "Strokes gained −6.1 a round" beside "Rounds 2" under
  "over the season"; the figure was his last eight rounds with strokes gained, 8
  Jun to 10 Jul, last season. The window stays (QA-1); it is now named.
- F-0022: Jackson and Dylan (graduation year 2026) were counted "2 not set" and
  their rows lost the class line.

### Verification

- `src/clubhouse/data/__tests__/sg-window.test.ts`,
  `src/clubhouse/screens/roster/__tests__/sg-window-label.test.tsx`,
  `src/clubhouse/screens/roster/__tests__/class-past-year.test.tsx` (RED, then
  GREEN); the page's own suites pass.
- No screenshots: no browser in this slice (lead's instruction).
