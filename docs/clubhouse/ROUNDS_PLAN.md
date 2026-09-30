# Rounds (P011): the plan

Rounds is the player's third phone tab and the front door for every round the
product counts. It is four surfaces over one engine. This plan fixes the order,
the seam and the gaps before any code moves. Owner questions are Q-72 in
`PROGRESS.md`.

Boards: `Player - Rounds.html` and `Player - Rounds - Mobile.html`
(`rounds-flow.jsx`, `rounds-course.jsx`, `rounds-track.jsx`,
`rounds-review.jsx`, `rounds-flow.css`, `rounds-track.css`, `rounds-data.js`).

## Surfaces

| # | Surface | Route | Board | Reads | Writes |
| --- | --- | --- | --- | --- | --- |
| 1 | Library | `/golf/dashboard/rounds` | `Library` | `golf_rounds` (the player's, completed and countable), the one `in_progress` round | none (Continue and Discard go through the engine) |
| 2 | Review | `/golf/dashboard/rounds/[id]/review` (and `[id]`) | `RoundReview` | the round, `golf_holes`, `golf_shots`, `ai_recap`, the takeaway insight, coach notes | a coach's note (existing action); mark as viewed |
| 3 | Setup | `/golf/dashboard/rounds/new` | `Setup`, `Picker`, `HoleConfig`, `AddCourse` | course library, team courses, recent courses, tees, tee holes, the active qualifier | a course contributed from the round (`contributeCourseFromRound`) |
| 4 | Tracking | `/golf/dashboard/rounds/new` (tracking phase), `continue/[id]` | `RoundTracking`, `Summary`, `Submitting` | the draft | every shot, checkpoint, submit, discard: the engine |

## Order

1. **Library**, built.
2. **Review**, built at `/rounds/[id]` (Q-72e).
3. **Setup and Tracking, as the Clubhouse renderer** (Tracking built 2026-09-30 in `screens/rounds/track/`, over `useShotTracking` and `shot-entry-rules`; preview `/clubhouse-preview/track`; Setup built the same day in `screens/rounds/setup/` against `ChSetupPorts`, preview `/clubhouse-preview/setup`), built against a neutral contract with fixtures and a preview, like Library and Review. `/rounds/new` and `/continue` stay un-rebuilt while they are built, so no half-built state is reachable and New round and Continue stay hidden.
4. **Engine extraction last, one engine per commit**, as pure moves that return exactly the contract (below). The legacy Fairway entry stays the production path until the flag flips.

Each surface gets the usual contract: catalog codes on page 11 (`CH-11…`),
covering empty states, didn't-load states, error toasts and messages (D-69), a
manifest (`P011-rounds.json`), a checklist, and a phone spec
(`phone/rounds.md`).

## The engine seam

Round entry is two engines and one tracking screen, all Fairway-rendered today:

- `rounds/new/new-round-client.tsx` (3,272 lines): setup, the course and tee pickers, the hole card, tracking, save for later, discard, the summary and submit. Lines 180–2786 are session logic (49 `useState`, 23 `useEffect`, 20 `useCallback`: the offline store, sync engine, drafts, conflict blocking, the pagehide beacon, checkpoints, qualifier-closed handling). Lines 2787–3273 render it through Fairway (`FairwayNewRoundEntry`, `FairwayCoursePicker`, `FairwayShotTracking`, `ModalShell`, `FwButton`, the save, summary and submit overlays). Only 39 names cross from the logic into the tracking render.
- `rounds/continue/[id]/continue-round-client.tsx` (1,940 lines): the same for a round already started.
- `components/fairway/pages/rounds-tracking/FairwayShotTracking.tsx` and its parts (3,536 lines): the shot screen. Its header says it copies `components/golf/ShotTrackingComprehensive.tsx`'s logic verbatim; only the JSX differs. The logic itself is already shared hooks: `useShotStateMachine`, `usePenaltyHandler`, `useEditShotModal`, `useUndoManager`, `calculateHoleStats`, `round-entry-validation`, `distance-units`. Clubhouse may use those (shared, non-UI).

**The tracking contract** is the shot screen's props, which both engines pass: `holes`, `currentHoleIndex`, `onHoleComplete(holeIndex, stats) → Promise<boolean>` (true only once the hole is durably checkpointed), `onHoleStatsUpdate`, `onSaveShot`, `onExit`, `onNavigateToHole`, `initialShots`, `initialShotNumber`, `onAutoSave(shots, holeIndex)`, `autoSaveInterval`, `autoSaveDisabled`. The Clubhouse shot screen implements it, so it can sit behind either engine unchanged.

**Avoid a third copy.** The Clubhouse shot screen would be the third copy of the handlers in `ShotTrackingComprehensive` (`handleNextShot`, `completeHole`, `isReadyForNextShot`, the double-tap guard, the distance-unit boundary). Before it is built, those handlers move into one shared hook (`useShotTracking`) that the Fairway screen then calls too: a pure move with its own tests, done like the engine moves.

**The engine moves** (step 4) go into `src/lib/golf/round-session/`, outside `src/clubhouse`, importing nothing from Fairway:

- The body's side effects become injected ports: `showToast` (the legacy sonner call sites), `hideMobileNav` and `showMobileNav` (the legacy mobile-nav context), and `haptic`. `router` and `searchParams` stay, since they are Next, not Fairway.
- Source-text tests follow the logic by path only, every assertion word for word:
  - the eight `new-round-client.*.test.ts` files that `readFileSync` the client;
  - `src/lib/golf/__tests__/round-start-guard-signal.test.ts` and `new-round-setup-restore-signal.test.ts`;
  - whatever the `continue-round-client.*.test.ts` files read.
- Proof for each move:
  - the 40-file, 207-test baseline for rounds (`rounds/`, `rounds-tracking/`, `rounds-new/`) before and after, plus the tests above;
  - `typecheck:fast`, and `npm run build`;
  - a fresh-context `code-reviewer` on the move diff;
  - the move commit touches no Clubhouse file.

## Board to source

| Board element | Source | Status |
| --- | --- | --- |
| Library header, "Fall 2026 · N counted rounds" | `isCountableRound`, season from Aug 1 (D-26) | build |
| In-progress card (course, tees, type, holes, strip, "+1 through 3", Continue at hole N) | the `in_progress` round, `current_hole`, `draft_data`, `golf_holes` | build |
| "No round in progress", ghost strip, last round line | latest completed round | build ("Show example" is a board device; dropped) |
| Season scoring: avg, to par, Best, Putts, GIR | countable rounds (`withCanonicalRoundTotal`) | build |
| Ribbon (every round vs par, dashed avg, qualifier tone) | same | build; red only for under par (D-42) |
| Search by course, By month or By course | client-side | build |
| Scorecard rows: Out, In, Tot, Fairways, Greens, Putts meters, to par | `front_nine`, `back_nine`, `total_fairways_hit`/`total_fairways`, `total_gir`/`total_gir_possible`, `total_putts` | build |
| Course photos (library cards, tee hero, review hero, setup card) | none: 0 of the courses have `image_url`, and "There is no photography" (handoff README) | **gap (Q-72a)**: a typographic band with the tee swatch |
| Tee swatch colour | `tees_played` / `golf_course_tees.tee_color` | build |
| Picker: Recently played, Team courses, Course library, search | the course library actions the legacy picker uses | build |
| Tee cards: yards, rating, slope, Out · In, per-hole bars | `golf_course_tees`, `golf_course_tee_holes` | build |
| Add a course (4 steps) | the legacy course-add path | build over the existing action; "Add a course photo" dropped (Q-72a) |
| Setup: type (Practice, Tournament, Qualifier), date, 9 or 18, front or back | engine setup state (live types: practice, tournament, qualifier) | build |
| Active qualifier · Play | open qualifier the player can still enter | build; closed means closed (D-31) |
| "50+ stats tracked" note | the claim is unverified | **gap (Q-72b)**: say what is tracked, without a number |
| Hole hero: Par, yards, Hcp | `golf_course_tee_holes.handicap_index` (1,269 rows filled) | build; show Hcp only when set |
| Hole map (drawn fairway, shot dots) | shots only (no hole geometry exists) | build as a schematic, labelled as one (Q-72c) |
| Shot entry: club, result, miss, the 3×3 approach miss, putt break, slope, tags, distance, quick picks | engine shot shape (`golf_shots` columns) | build |
| Penalty sheet (OB, water, unplayable, lost; which shot) | engine penalty path | build |
| Edit shot, Delete shot | engine edit path | build |
| Exit: Save for later, Keep playing, Discard round | engine save and discard (discard-race hardened) | build; Discard is warning haptic plus confirm |
| Scorecard sheet, Round complete summary, Submit | engine submit | build |
| Submitting steps ("Saving 71 shots", "Updating your stats", "Writing the round recap") | real shot count; the steps describe the one submit call | build honestly: no fake step timing (Q-72d) |
| "Coach Reyes can see it now" | the team's coach (the Home fix: `created_by` is a coach id) | build |
| Review: hero, Front, Back, Putts, Fairways, Greens | round and holes | build |
| Review scorecard (Score, Putts, FIR, GIR by hole; tap a hole) | `golf_holes` | build |
| Hole shots list | `golf_shots` | build |
| Scoring distribution | holes | build |
| Round recap, Focus, Keep | `ai_recap` (407 rounds), `getRoundTakeawayInsight` | build; hidden when absent, never invented |
| Coach notes | the existing `CoachNotesSection` source | build; a coach can write one |

## Coach side

Coaches reach a player's round from Stats (D-53), Home's latest round and
Qualifiers. Review is the same page for both roles, with notes the coach can
write. The coach's phone tabs stay as built (Home, CoachHelm, Calendar, Stats);
a coach Rounds library is not in these boards.

## Not in this plan

These stay as they are:

- offline recovery UI (`rounds/recover`), which keeps the legacy page until a
  board exists;
- the CoachHelm filmstrip on the review, which belongs to CoachHelm;
- any schema change.
