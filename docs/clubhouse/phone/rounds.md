# Design: Rounds (player, desktop and phone)

Status: approved. The owner's v2 boards are the spec (D-22): `design/handoff/Player - Rounds.html` and `Player - Rounds - Mobile.html` (`rounds-flow.jsx`, `rounds-course.jsx`, `rounds-track.jsx`, `rounds-review.jsx`, `rounds-flow.css`, `rounds-track.css`, `rounds-data.js`). The whole project, its order and its engine seam are in `docs/clubhouse/ROUNDS_PLAN.md`. Gaps are Q-72.

This file covers the library, a round's review and the shot screen (Tracking), built in `src/clubhouse/screens/rounds/` (Tracking in `track/`) and a new round's setup (`setup/`).

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
- Below 860px of page width the card and the season stack. Below 640px the book drops the Out · In · Tot grid and the meters to a date tile, course and tee, and the to-par box. Group headers drop avg and low.
- The tab bar stays. There are no sheets on the library; the discard question is a Modal, which is a bottom sheet on the phone.
- The review's top bar is "Round", with "‹ Rounds" (or "‹ Stats" for a coach). The hero stacks, the score sits beside its to par, and the figures wrap to three columns. The card scrolls sideways inside its own frame, never the page.

## Tracking: board to engine

The board is `rounds-track.jsx` / `rounds-track.css`. The screen is Clubhouse's renderer of the shot screen: every rule and write is `useShotTracking`, the hook the Fairway screen runs (moved there unchanged, reviewed), and the gating is `shot-entry-rules`. Where the board and the hardened engine disagree, the engine wins:

- Penalty works before the first shot (the board disables it). The penalty sheet asks which stroke went for out of bounds and lost ball, as the engine records them.
- Undo asks first (the board undoes at once), and a failed undo says so (the Fairway screen showed nothing).
- Putt tags are the engine's four (Short, Long, Low side, High side; the pairs exclude each other), not the board's eight.
- The hole-out button says "Hole out · 4" and the engine saves the hole before the round moves on; while it saves the review shows "Saving hole 4…", and a failed save shows Try again. The board's "Next hole" is the round screen's job: it moves to the next hole itself once the hole is saved, so the review's button is "Back to hole N" only when the player looked back at a finished hole.
- The hero has no hole handicap (the round's holes don't carry it). The map is a schematic (Q-72c).
- Quick distances: on the green the Fairway entry's (5 to 40 ft, or 1 to 12 m); off it the board's (120 to 180 off the tee, 10 to 80 elsewhere), in meters their nearest round values.
- Meters: the hero, the labels and the quick picks follow the player's unit; what is stored stays yards and feet. The change-a-shot sheet is in stored units, as in the Fairway sheet.

The round's own sheets (Exit, Scorecard, Round complete, Submitting) are `round-sheets.tsx`, driven by props, because the round screen owns the round. The preview plays that part (`PreviewTracking`).

## Tracking on the phone

Board: `Player - Rounds - Mobile.html`, the tracking frames.

- A round is full screen: the tab bar hides (`usePhoneTabsHidden`); Exit and the scorecard (an icon) are in the screen's own top bar.
- The hole strip scrolls sideways at 34px a hole, edge to edge.
- The hole stacks above the entry, with a smaller map and a 76px distance.
- The action bar sits at the bottom of the entry, above the home indicator; quick distances fill the row at 44px.
- Sheets (penalty, change a shot, leave this shot, exit, scorecard, round complete) are bottom sheets that drag to close.
- Not yet: the numeric pad has no Done key on iOS (the Fairway screen adds a bar for it); an iPhone pass.

## Setup: board to source

The board is `rounds-flow.jsx` (Setup, Picker, HoleConfig) and `rounds-course.jsx` (AddCourse). The screen draws; the round screen's ports (`ChSetupPorts` in `setup/shape.ts`) read the course library (`listCourses`, `getRecentlyPlayedCourses`, `getTeamSavedCourses`, `getCourseDetail`, `getTeeWithHoles` in `actions/course-library.ts`) and start the round (the legacy engine's start, when the engine moves; ROUNDS_PLAN step 4).

- Course and tees: the picker's three groups are the library's recent, team and all courses; a tee shows length, par, rating and slope, and a draft tee shows but can't be played. The board's per-hole length bars need every tee's holes up front; the card draws one bar for the tee's length against the course's longest instead.
- No course photos (Q-72a): the course card is a typographic green band; Add a course has no photo step.
- Add a course is the round's own course (Q-72h): the library's add is coach-only, so a player's typed course goes with the round, and "Save this course for next time" (on by default; the legacy screen's opt-in, off by default) saves it and offers it to the library. One tee, not the board's several.
- The spine is Course, Scorecard, Track (the board's Setup, Holes, Track, Done): setup ends when tracking opens.
- The note is a plain list of what is tracked, not "50+ stats" (Q-72b).
- Pars are 3 to 6 and yardages 1 to 999, the legacy editor's rules; the date can't be after today (the team's today, from the server).
- The qualifier: the first open qualifier is offered above Round details (Play sets the type, the course and the tees, and says which round it counts as); a qualifier with no round open shows why and can't be chosen.

## Setup on the phone

- One column; the band shrinks; the scorecard is one column of holes with 36px par buttons and 40px yardage boxes.
- The dock (summary and Start round) sits above the home indicator.
- The picker and Add a course are bottom sheets that drag to close.

## Recovery: the device's rounds

`/golf/dashboard/rounds/recover` (swap audit F-02), built in
`src/clubhouse/screens/rounds/recover/`. There is no owner board: it is
Fairway's recovery flow (`FairwayRecoverRound`) drawn with the library's
pieces, so the grammar is the library's. It is where the engines send a submit
that could not reach the server (`?from=submit`), and it reads only the
device: the recovery journal and the failed-submit queue in IndexedDB, the old
`golf_offline_db`, and the emergency save in localStorage.

| Piece | Read | Write |
| --- | --- | --- |
| A card per round: course, status, "Practice · Oct 14 · 9 of 18 holes · 36 strokes", "Saved 5 min ago" | The player's own copies only, deduplicated by server round id (else by course, day, type and what was played); a copy with no scored hole and no shot is not offered | none |
| Status: "Only on this device", "Saved on this device", "Waiting to sync", "Didn't sync" (with the engine's reason) | The queue's own status: pending or failed. A copy in no queue has nothing to retry | none |
| Restore round, or Submit round for a finished round whose submit failed | The newest copy | `savePartialRound` (the round opens to continue) or `submitGolfRoundComprehensive` (its review opens), through `writeRoundRecreatingIfMissing`; the device copies are cleared only after the server confirms, and only up to what it confirmed |
| Retry sync (queue rounds only) | The queue | `getSyncEngine().retryFailed()`, then the device is read again |
| Discard, after a question | none | `deleteInProgressRound` when the server holds the round (the Library's discard), then every device copy, and the mark the round screens and the queue's drain honour |

- The top bar is a pushed screen's: "Recover", with "‹ Rounds". The page keeps
  its own header. On the desktop the way back is a button in the header (and
  the empty page's own action).
- Below 820px the page is one column with the Library's padding, the actions
  are 44px, Restore takes the card's width and Retry sync and Discard share
  the row under it.
- The discard question is a Modal, a bottom sheet on the phone. It says what
  goes, and that a round already submitted is not touched.
- A queued round with no round id (a finished round that never reached the
  server) does not own the emergency save under the null key: that key is the
  current new-round draft, so Discard and Restore leave it alone.
- States: loading CH-11408 (the route) and CH-11409 (reading the device), the
  device can't be read CH-11212, nothing to recover CH-11314, opened from a
  failed submit CH-11911. Restore, Retry sync and Discard fail with CH-11017,
  CH-11018 and CH-11019, and Discard asks first (CH-11520). Full list:
  `docs/clubhouse/catalog/rounds.md`.
- A round restored from here opens the shot screen with the device copy
  offered back (CH-11512), as Fairway's does.
- Not built: a link from the Library. A player reaches this screen from a
  failed submit, or by its address, as on Fairway.
