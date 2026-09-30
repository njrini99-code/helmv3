# Design: Rounds (player, desktop and phone)

Status: approved. The owner's v2 boards are the spec (D-22): `design/handoff/Player - Rounds.html` and `Player - Rounds - Mobile.html` (`rounds-flow.jsx`, `rounds-course.jsx`, `rounds-track.jsx`, `rounds-review.jsx`, `rounds-flow.css`, `rounds-track.css`, `rounds-data.js`). The whole project, its order and its engine seam are in `docs/clubhouse/ROUNDS_PLAN.md`. Gaps are Q-72.

This file covers the library, which is built as `src/clubhouse/screens/rounds/`. Review, Setup and Tracking get their sections here as they are built.

The route is `/golf/dashboard/rounds`, for players. It is the player's third phone tab (D-66). Coaches have no Rounds library in v2; `/golf/dashboard/rounds` keeps the Fairway page for them.

## Library: board to data

| Board piece | Read | Write |
| --- | --- | --- |
| "Fall 2026 · 8 counted rounds" | Countable 18-hole rounds since August 1: "Since August 1 · 8 counted rounds" (the season rule on Home and Stats) | none |
| New round | none | Round entry, once rebuilt; until then the button isn't drawn |
| In-progress card: course, tees, type, holes, the hole strip, "+1 through 3", Continue at hole 4 | The newest `golf_rounds` with `status = 'in_progress'`; per-hole scores from `golf_holes` (the source continue-round reads, not `draft_data`) | Continue, once rebuilt. Discard: `deleteInProgressRound`, then `clearEmergencySave`, as the legacy library does |
| "Started 9:12 today" | The round's date: "Today" or "Oct 2". The start time isn't shown: a round is set up for a day, and `created_at` can be days before play | none |
| "No round in progress" card | The newest posted round: "Last round Sep 26 · Finley GC" | Start a round, once entry is rebuilt |
| Season scoring: avg, to par, Best, Putts, GIR | Countable 18-hole rounds since August 1, with the canonical total (`withCanonicalRoundTotal`) | none |
| The ribbon | The same rounds, the last 20, oldest to newest, against the dashed average | none |
| Search, By month and By course | Client-side over the loaded list | none |
| A round: date, course, tee swatch, type, Out · In · Tot, Fairways, Greens and Putts meters, to par | `front_nine`, `back_nine`, `total_fairways_hit` of `total_fairways`, `total_gir` of `total_gir_possible`, `total_putts`, `score_to_par` | Opens its review, once rebuilt |

## Beyond the board

- **More than one unfinished round.** The live data has them: 51 rounds are in progress across players. The newest fills the card. The rest are listed under it ("2 more unfinished rounds"), each with Continue (or Submit) and Discard, so an abandoned round can be cleared.
- **Ready to submit.** A round whose every hole already has a score says "Ready to submit" and "Submit round". This is legacy R8. It never says so when a completed round already holds that course and day.
- **Not counted.** A round that isn't countable (`isCountableRound`) still lists, with a "Not counted" pill. It sets no season figure.
- **9-hole rounds** list with their hole count in place of Out and In. They set no season figure (full 18 only, as on Home and Stats).

## Gaps (Q-72), none built as a mock

- **Course photos.** None of the courses has `image_url`, and the handoff says there is no photography. The library's photo tile is a green date tile.
- **The tee swatch** shows the tee's own colour when its name spells one out ("Men's Blue" is blue). "Championship" and "Qualifying Tees" draw no swatch. A red tee's swatch is the tee's colour, not a status colour.
- **"Show example"** on the idle card is a board device and is left out.

## States

Loading: a route skeleton (CH-11401). The list didn't load: CH-11201, in place of the season card, never "no rounds". The in-progress check failed: CH-11202, in place of the card. A section that crashes is contained (CH-11203). Nothing yet: the first-run page (CH-11301). No countable round this season: CH-11302. No search match: CH-11303. Nothing in progress: CH-11304. Discard asks first (CH-11501) and says when it fails (CH-11001). Full list: `docs/clubhouse/catalog/rounds.md`.

## Phone

`Player - Rounds - Mobile.html`, boards 01 (library) and 02 (none in progress).

- The top bar is the tab root's: "Rounds", left-aligned, with no back link.
- The page keeps its own header ("Your rounds" and New round), as the board draws it.
- Below 640px the card and the season stack. The book drops the Out · In · Tot grid and the meters to a date tile, course and tee, and the to-par box. Group headers drop avg and low.
- The tab bar stays. There are no sheets on the library; the discard question is a Modal, which is a bottom sheet on the phone.
