# Design: Rounds (player, desktop and phone)

Status: approved. The owner's v2 boards are the spec (D-22): `design/handoff/Player - Rounds.html` and `Player - Rounds - Mobile.html` (`rounds-flow.jsx`, `rounds-course.jsx`, `rounds-track.jsx`, `rounds-review.jsx`, `rounds-flow.css`, `rounds-track.css`, `rounds-data.js`). The whole project, its order and its engine seam are in `docs/clubhouse/ROUNDS_PLAN.md`. Gaps are Q-72.

This file covers the library and a round's review, both built in `src/clubhouse/screens/rounds/`. Setup and Tracking get their sections here as they are built.

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

## Review: board to data

The board's review is the round page, so it lives at `/golf/dashboard/rounds/[id]`, where the legacy round detail page is (Q-72e). The AI deep review at `/rounds/[id]/review` (the filmstrip, sequence attribution, share with coach) belongs to CoachHelm and stays as it is until CoachHelm is rebuilt. The player who played the round opens it from the library. A coach of their team opens it from a player's rounds; the route is rebuilt for both roles.

| Board piece | Read |
| --- | --- |
| Back ("Rounds") | Player: the library. Coach: that player's rounds on Stats (`stats?player=<id>&tab=rounds`, D-53), labelled with the player's name |
| Hero: day, date and type; course; tee swatch, yards, rating and slope; score, to par, "Strokes" | `golf_rounds` (the canonical total), `golf_course_tees.total_yards` by `tee_id`, `course_rating` and `course_slope`. A coach sees the player's name first in the line |
| Front 9, Back 9, Putts (per hole), Fairways, Greens | Each nine from `golf_holes` when every hole in it has a score (else "—"); the rest from the round's totals |
| Scorecard: Score, Putts (three flagged), FIR, GIR; tap a hole | `golf_holes`. A par 3 never counts a fairway |
| The hole's shots: kind and club, from → where it finished, the miss, the putt's read | `golf_shots` for the round, by hole and shot number |
| Scoring distribution | The holes against par |
| Round recap | `golf_rounds.ai_recap`, written when the round was posted (407 rounds have one); hidden when absent |
| Coach notes | **Gap (Q-72f).** The board's card reads coach notes. The only store is the CoachHelm review's annotation (`golf_round_reviews.coach_notes`), and none has ever been written. The card shows instead what the player wrote when posting (`golf_rounds.notes`, on 181 rounds), labelled "Your notes" or "Jonah's notes" |
| Recap Focus and Keep | **Gap (Q-72f).** Their source is the CoachHelm review's takeaway and practice priority. All 295 stored reviews are unpublished drafts, so they are not shown here |

The review's states: the card didn't load (CH-11204), the shots didn't load (CH-11205), the round didn't load (CH-11206), posted as a total (CH-11305), a hole with no shots (CH-11306), and not here (CH-11307, the same page for a missing round and one the viewer may not see). A round still being played goes to be continued, as on the legacy page.

## Phone

`Player - Rounds - Mobile.html`, boards 01 (library) and 02 (none in progress).

- The top bar is the tab root's: "Rounds", left-aligned, with no back link.
- The page keeps its own header ("Your rounds" and New round), as the board draws it.
- Below 640px the card and the season stack. The book drops the Out · In · Tot grid and the meters to a date tile, course and tee, and the to-par box. Group headers drop avg and low.
- The tab bar stays. There are no sheets on the library; the discard question is a Modal, which is a bottom sheet on the phone.
- The review's top bar is "Round", with "‹ Rounds" (or "‹ Stats" for a coach). The hero stacks, the score sits beside its to par, and the figures wrap to three columns. The card scrolls sideways inside its own frame, never the page.
