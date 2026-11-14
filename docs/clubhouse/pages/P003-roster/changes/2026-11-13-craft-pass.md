# 2026-11-13 — roster (craft pass)

## 2026-11-13 — Roster craft pass: spacing, alignment and one primary

```text
Design package: none (owner grade C+, "Start improving the look and feel"; audit run 2026-11-13-main-9e7c86b P003; rubric CR-01…CR-15)
PR/commit:      agent/ch-look-craft
Contract IDs:   none
Actions:        none (the panel's Message keeps its link; only its weight changes)
Data impact:    none
Held items:     the strokes-gained sentence's words, the class mix's "not set" and the profile's This season card belong to the
                data-honesty pass and are untouched here
```

### Changed

- Phone (coach): when no leader qualifies, the leaders' empty wrapper is not
  drawn (`.ch-rsx-sec:empty`). Its 12px margin stacked on the sort's own 12, so
  the team card stood about 30px over the sort where the redline draws 18 (06
  7.5).
- Team card (phone and desk): the total sits on the redline's 34/.9 leading (new
  token `--ch-lead-figure`) and "players" on one tight line, so the word ends on
  the counts line beside it instead of 12px under it (06 7.2).
- Desk head: the line under the title keeps the text measure
  (`--ch-measure-text`). It ran about 150 characters on one line and pushed
  Export and Invite players under it; they sit on the title's row again. Its
  words are unchanged.
- Desk player cards: a card with no place to show labels its figure "Scoring
  avg" on one line. The lone "Avg" caption under "Scoring" read as a wrapped
  label and made that figure a line taller than strokes gained beside it. The
  handicap's figure sits on the same right edge as the two above it.
- Desk panel: Message is secondary. The head's Invite players is the page's one
  primary (CR-07); the phone's pushed profile keeps Message as its primary.
- Player desk cards: the handicap sits at the card's foot, flat under a hairline
  as the coach's figures are (W25), so it lines up across a row whether or not a
  teammate has a class line.

### Why

- The owner graded Roster C+. Each item is a measured drift from the approved
  redline (06 7.2, 7.5) or a rubric line: CR-06 rhythm, CR-07 one primary, CR-14
  line length, alignment across a row.

### Verification

- `screens/roster/__tests__/craft-pass.test.ts`; `__tests__/roster.test.tsx`
  (one primary on the desk); the roster suites, `look-feel-pass-css` (the roster
  longhand count falls 8 to 7). Screenshots: the lead takes before and after on
  the preview; no VERIFY rows are added from this branch.
