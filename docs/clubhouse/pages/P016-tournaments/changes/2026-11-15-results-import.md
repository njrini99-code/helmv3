# 2026-11-15 — import a tournament's results, or type the cards in

## 2026-11-15 — Import results and the whole-round hole grid (launch readiness F-01)

```text
Design package: none (launch readiness findings, 15 Nov 2026, §4 F-01); no owner board, built on the desk's own parts
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f01)
Contract IDs:   CH-16080, CH-16081, CH-16180 to CH-16183, CH-16380, CH-16381, CH-16480, CH-16580, CH-16581, CH-16880, CH-16980
Actions:        ACT-P016-IMPORT-RESULTS (importTournamentResults, new)
Data impact:    writes golf_rounds, golf_holes, golf_tournament_player_rounds, golf_tournament_field_teams and golf_tournament_field_scores through RLS; nothing deleted; no migration
Held items:     none
```

### Changed

- The event desk offers **Import results** (desktop head, and the phone's empty
  scores state). The coach drops or picks a file, or pastes a copied table:
  - **Reads** `.xlsx` (every sheet: Golf Genius and GolfStat exports, Excel,
    Numbers), CSV, TSV, semicolon files, Excel's Unicode text, HTML tables (what
    many `.xls` downloads and copied web leaderboards are) and pasted text.
    Old binary `.xls`, PDFs and images are refused with words the coach can act
    on (CH-16180). The file is read in the browser; nothing leaves it until Save.
  - **Finds the columns** by what the headings say, whatever the template:
    hole by hole (one row per player per round, a round column, a "Round 2"
    line above a block or the sheet's name), round-score leaderboards and team
    leaderboards. WD, DQ, NC and DNF mark a round's status.
  - **The check step** says what a save would do before it does it: rounds to
    save, already in, differ, teams. Each of our players is matched to the
    roster (a Select to fix a match), each round shows new, same, fills in or
    differs. Where the file and a card differ (CH-16980) the coach chooses
    "Keep the card" or "Use the file"; the card is the default when only the
    holes differ. Where the file holds several teams, the coach picks theirs;
    any other team can be left out. **Columns** opens an editor with a peek at
    the sheet when a column was read wrong, and "No scores found" (CH-16181)
    when nothing could be.
  - **Save** writes our players' rounds where hole scoring puts them (one score
    store, owner answer B): the player's in-progress round linked to the
    tournament round, with its holes. A submitted round is never changed
    (D-82): using the file enters its official score as the event's score
    instead. Other teams go onto the field with their round scores, and places
    when the file is a finished result. Saving the same file twice writes the
    same rows.
- The Holes tab offers **Enter holes** (desktop): the whole round in one grid,
  every player down the side and the holes across, as a coach types a stack of
  paper cards in after the round (CH-16880). A digit from 2 to 9 moves on; a 1
  waits for 10 to 15. Arrows and Enter move between cells. Out, In, Total and
  to-par update as the coach types. A submitted round is shown and locked; an
  entered total says it will be replaced by the holes. Cells that can't be saved
  are listed (CH-16182). It saves through the same action as the import.
- Leaving either with choices made asks first (CH-16580, CH-16581).
- From the first screenshot pass: our own team's round in the file counts only
  our lineup that day (an individual's low round never counts, as on the desk);
  the field list has column heads (R1, R2, Total, Place); the source line says
  what was read ("Hole by hole · 61 players · 12 teams"); a bad cell in the grid
  drops out of the sums instead of blanking them, and Save says "Fix 1 hole to
  save"; a phone says "Choose the results file", having nothing to drag.

### Why

- Coaches get results as Golf Genius exports or as paper cards. Without an
  import, every round of every player had to be typed hole by hole on the live
  page, one player at a time; most coaches would not.

### Verification

- Unit: `import/__tests__/` (sheets, results, plan, grid), 42 tests;
  `src/app/golf/actions/__tests__/tournaments-import.test.ts`.
- Component: `src/clubhouse/__tests__/tournaments-import.test.tsx`, 17 tests,
  one per catalog code, plus the desk wiring (desktop head, Holes tab, phone
  empty state, no button on an official result).
- Screenshots: see VERIFY.md.
