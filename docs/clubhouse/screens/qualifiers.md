# Qualifiers checklist

Reference: design/handoff/Qualifiers.html, qualifiers.jsx, qual-core.jsx, qual-data.js, qual.css (desktop); design/handoff/mobile/Qualifiers Mobile.html, qual-mobile.jsx, qual-mobile.css (iPhone, mapped in `docs/clubhouse/phone/qualifiers.md`). Rendered 2026-09-29 at 1280 and 924 (`qualifiers-01..21`) and 390 × 844 (`qualifiers-01..11`); the captures are not committed.
Route: `/golf/dashboard/qualifiers` with `/new`, `/[id]`, `/[id]/edit` (coach; list and detail are also read by players today), and `/golf/dashboard/my-qualifiers` (player). The player view is not drawn (Q-5).
Surface tag: `qualifiers.<list|hero|facts|leaderboard|scorecard|rounds|selections|courses|rules|form|status>`

One tracker row covers both roles. Players already read `/qualifiers` and `/qualifiers/[id]`, like Calendar and Messages. The checklist file comes from the row name, so the slug is `qualifiers`.

Feature doc: `memory/features/qualifiers.md`. Its rules hold in Clubhouse:
- Dates never close entry. Only the coach closes a qualifier.
- Every refusal names the next step.
- The round cap is written together with the qualifier.
- Test qualifiers (`is_test`) are hidden from lists.

### Views in the design

| # | View | Desktop capture | Phone capture |
| --- | --- | --- | --- |
| 1 | List: all, hero with leaders, active and concluded cards | 01 | 01 |
| 2 | List: Active, Concluded | 02, 03 | 02, 03 |
| 3 | List: search matches no concluded one; no match at all (Clear filters) | 04, 05 | not drawn |
| 4 | Detail, live: facts, leaderboard with cut lines, round-by-round, selections, course per round, rules | 06 | 04 |
| 5 | Detail, live: a leaderboard row opened to its scorecards (desktop), player sheet (phone) | 07 | 05, 06, 07 |
| 6 | Detail, closed and reopened (toasts) | 08, 09 | not drawn |
| 7 | Edit qualifier and Open selection workspace (both only toast in the prototype) | 10, 11 | not drawn |
| 8 | Detail, upcoming: awaiting first round, selection not open | 12 | 08 |
| 9 | Detail, completed: squad confirmed with a coach's pick and reasoning | 13 | 09 |
| 10 | Detail, completed without confirmed selections; three-round results | 14, 15 | not drawn |
| 11 | Create: form, name error, one-round acknowledgement, one-round error, no-players error | 16–20 | 10, 11 (no errors drawn) |
| 12 | Created: new qualifier's detail with toast | 21 | not drawn |

There is no player view in either file. Every capture is the coach's view.

### Figures and their data

Types come from `src/lib/types/database.ts` and were checked against the live schema on 2026-09-29 with read-only SQL: columns, constraints, RLS policies and aggregate counts.

| Figure (view) | Source | Notes |
| --- | --- | --- |
| "N active · N concluded", pill counts (1) | `golf_qualifiers.status`, `team_id`, `is_test = false` | Active is `upcoming` or `in_progress`; concluded is `completed`. `status` is free text with no CHECK constraint. Live data has only those three values (2, 11 and 5 of 18). |
| Status pill Live, Upcoming, Completed (1, 4) | `golf_qualifiers.status` | Live is `in_progress`. |
| Name, description (1, 4) | `golf_qualifiers.name`, `description` | A null description shows no line (6 of 18 live have none). |
| Dates, "2026 · 3 rounds" (1, 4) | `start_date`, `end_date` (date), `num_rounds` (1–50, CHECK) | Dates are calendar metadata only. |
| "N spots", "4 on score · 1 pick", "4+1" (1, 4) | `selection_slots_total`, `selection_slots_coach_pick` (CHECK: picks ≤ total ≤ 12) | Legacy `spots_available` also exists (Q-9). |
| Course (1, 4) | `golf_qualifiers.course_name` | `course_id` is null on all 18 live qualifiers. |
| "Par 72" (4) | none on the qualifier | Q-13. Per round: tee `golf_course_tees.total_par` via `golf_qualifier_round_courses.tee_id`, else a submitted round's `total_score − score_to_par`. |
| Entry deadline (4) | `entry_deadline` (date, nullable, 9 of 18 set) | Shown, never enforced. |
| Entrants (4) | count of `golf_qualifier_entries` | |
| Rounds submitted "13 of 24", "13/24 rounds in" (1, 4) | count of `golf_rounds` with `qualifier_id` and `status = 'completed'`, over entries × `num_rounds` | Live: all 215 completed qualifier rounds have a `qualifier_round_number`, and no slot is duplicated. |
| Leaders and leaderboard: Pos, "T" ties (1, 4) | computed server-side from completed `golf_rounds` | The ranking rule is Q-8. |
| Player name and year (4) | `golf_players.first_name`, `last_name`, `graduation_year` through `classYearLabel` | |
| Avatar (4) | `golf_players.avatar_url`, else monogram | |
| Rounds "2/3" (4) | completed rounds ÷ `num_rounds` | |
| Avg (4) | Σ `total_score` ÷ rounds | Data gap: 19 of 215 completed qualifier rounds are not 18 holes. |
| Total (4) | Σ `golf_rounds.total_score` | Never par × rounds + to-par: 7 live qualifiers mix pars. |
| To par (4) | Σ `golf_rounds.score_to_par` | Red only under par. |
| Status badge Locked, Bubble, Qualified (4) | rank against `selection_slots_total − selection_slots_coach_pick` and `selection_slots_total` | The labels are Q-8. |
| Status badge Selected, Coach's pick; Confirmed list; Pick badge (9) | `golf_qualifier_selections.player_id`, `selection_type` (`top_score`, `coach_pick`) once `selection_state = 'selected'` | Live: 4 qualifiers selected, 6 selection rows, 0 coach picks. |
| Pick reasoning (9) | `golf_qualifier_selections.coach_reasoning` | Coach only (Q-14). |
| Coach's pick "Open" slots (4) | `selection_slots_coach_pick` minus `coach_pick` rows | |
| Top-score line, travel cut (1, 4) | slot counts | |
| "Updates as rounds are signed" (4) | `useQualifierRealtime` (existing channel on `golf_qualifier_entries`, `golf_rounds`, `golf_qualifiers`) | No new subscription. |
| "No rounds submitted" rows (4) | entries with no completed round | Shown after the ranked rows, never ranked. |
| Scorecard: Round N, course · date, 18 holes (5) | `golf_rounds.qualifier_round_number`, `course_name`, `round_date`; `golf_holes.hole_number`, `par`, `score` | Data gap: 14 of 215 rounds have no hole rows, 33 have fewer than 18 scored holes. |
| Round-by-round R1..Rn, Total, To par (4) | `golf_rounds.total_score` by `qualifier_round_number` | Coach only, as today. |
| Course per round: number, course (4) | `golf_qualifier_round_courses.round_number`, `course_name`, `tee_id` | Unique per qualifier and round. Only 7 of 18 live qualifiers have rows. |
| Course per round: date (4) | none | Data gap: the table has no date column (Q-12). |
| Scoring rules "Shown to players" (4) | `golf_qualifiers.rules` | 8 of 18 set; the section is hidden when empty. |
| Closed notice (6) | `status = 'completed'` | The copy is Q-7. |
| Create: players "7 of 7 active players entered", year (11) | `golf_team_members` (`team_id`, `status = 'active'`) → `golf_players` | |
| Create: squad readout (11) | form state | |
| Sidebar "Next event", bell badge | the Clubhouse shell (D-17) | Unchanged. |

### Controls and their server actions

| Control | Server action or route | Notes |
| --- | --- | --- |
| Create qualifier (list) | route `/qualifiers/new` | Coach only. |
| Filter pills, search | client over the loaded list | Search covers name, description and course. |
| Hero, card | route `/qualifiers/[id]` | |
| Create qualifier (form submit, phone "Create") | `createGolfQualifier` | Fields: `name`, `description`, `courseName`, `startDate`, `endDate`, `entryDeadline`, `rules`, `numRounds`, `playerIds`, `selectionSlotsTotal`, `selectionSlotsCoachPick`, `roundCourses`. The cap is written with the qualifier, entered players get email and push, and the result carries `qualifierId`. |
| One-round acknowledgement | client gate before `createGolfQualifier` | The feature doc requires it. |
| Cancel | route back | |
| Edit qualifier | route `/qualifiers/[id]/edit`: `updateGolfQualifierDetails`, then `setQualifierRoundCourses` | Not drawn (Q-11). A failed second write says the details were saved. |
| Close qualifier | `updateQualifierStatus(id, 'completed')` | Coach of the team; the update is verified to hit one row. |
| Reopen qualifier | `updateQualifierStatus(id, 'in_progress')` | |
| Open selection workspace, Manage selections | today the Fairway route `/coachhelm/qualifying/[id]`, backed by `advanceSelectionState`, `setQualifierCoachPick` (reasoning required), `removeQualifierCoachPick`, `confirmQualifierSelection` | Not drawn and not rebuilt (Q-10). Picks are allowed only in `closed` or `selected`. |
| Leaderboard row (open scorecards), phone row (player sheet), round chips | client over data read on the server | |
| Message (phone sheet) | route `/golf/dashboard/messages` through `rebuiltHref` | As Roster does. |
| Stats (phone sheet) | route `/golf/dashboard/stats?player=<id>` | |
| Player: enter a qualifier round | route `/golf/dashboard/rounds/new?qualifier=<id>` | Not drawn and not rebuilt (Q-6). |

Missing actions:
- Nothing changes squad size or coach picks after creation.
- Nothing adds or removes an entrant after creation. RLS already lets a coach do both, so this needs actions, not a migration (Q-11).
- No migration is written in this run. Every schema candidate depends on an open question: a per-round date (Q-12), and started rounds after a close (Q-7).

### Role permissions (live RLS, 2026-09-29)

- `golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_round_courses`:
  - Read: team coaches (`is_golf_team_coach`) and active team players (`is_golf_team_player`, membership `status = 'active'`).
  - Insert, update, delete: coaches only.
  - `golf_qualifiers` also has an admin read.
- `golf_qualifier_selections`:
  - Coaches of the team can do everything (`is_team_coach`).
  - Active team players can read only once `selection_state = 'selected'`, and that read includes `coach_reasoning`.
- `golf_rounds`, `golf_holes`: read by the player who owns the round, and by team coaches and active team players when the round has a `team_id` (all 219 live qualifier rounds do). So RLS lets a player read teammates' scorecards. Today's UI shows players only the leaderboard, with no round-by-round and no selections (Q-14).
- Server actions check the coach before writing:
  - `updateQualifierStatus` compares the coach's organisation with the qualifier team's.
  - The selection actions use `verifyTeamAccess`.
  - `createGolfQualifier` resolves the coach's active team.
- Rounds:
  - `submit_round_atomic` refuses any round linked to a completed qualifier, including a started one (Q-7).
  - Players enter only the qualifiers they are entered in, and within `num_rounds`.

## spec
- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a data gap in PROGRESS.md
- [x] Every control is mapped to an existing server action, or to a migration that has to be written (never applied by an agent)
- [x] Differences between the README and the screenshots are resolved as decisions in PROGRESS.md (D-30 to D-33; Q-16, the phone tab, is D-34)

## desktop
- [x] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth): 38 states at each width, side by side with the prototype captures; the differences left are decisions, logged in PROGRESS.md
- [x] Only Clubhouse tokens and classes are used, and `clubhouse:check` is clean
- [x] Numbers are tabular, with a true minus, `E` for even and `—` for no data
- [x] Red appears only for under par and the pin flag; gains are green and losses amber
- [x] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [x] Controls that point at an unbuilt screen are hidden via `rebuiltHref`, never dead (Enter round and the selection workspace aren't rendered; every link stays inside the rebuilt Qualifiers routes)
- [x] A narrow canvas (container below 860px) reflows without horizontal page scroll (checked at 924px on every captured state: no page, canvas or panel overflow)

## wired
- [x] Everything is read server-side in one pass, so final data is on first paint (no client fetch waterfall; the course picker looks courses up on demand, and a live qualifier refreshes on new rounds)
- [x] Reads go through the RLS-scoped client, with no service role for a user's own data (the setup actions too)
- [x] Every Supabase call reads `error`; lists over 1,000 rows paginate, and `.in()` is chunked
- [x] Null, zero and "early read" render differently, and windows and samples are stated (`—`, `E`, `0/3`, "No rounds yet"; the average says it counts 18-hole rounds)
- [x] Dates and times are resolved in the team's timezone on the server, with no hydration mismatch (qualifier dates are calendar dates, formatted the same on server and client; no times are shown)
- [x] Unit tests cover the loader's derivations

## states
- [x] Loading: a route skeleton shaped like the page, so nothing shifts when data lands
- [x] Empty (first run): says what will appear here and the one next step
- [x] Empty (filtered or no results): distinct from first run, and offers to clear filters
- [x] Partial failure: each section has its own failure flag and shows an inline notice with Try again; the rest of the page still works (the form's round courses, CH-09217, has no Try again on purpose: a refresh mid-edit would drop the coach's changes)
- [x] Crash containment: every section is wrapped in a `SectionBoundary` with a surface tag
- [x] Route error: the Clubhouse error view (it inherits the `logError`, chunk and stale-action recovery)
- [x] Not found and no access: plain words and a way back
- [x] Offline or slow network: the action says so instead of spinning forever
- [x] User errors: every mutation goes through `useAction`, with a specific failure message, Retry, an error haptic and a Sentry event
- [x] Forms: inline field messages, focus moves to the first invalid field, and double submit is prevented
- [x] Destructive actions: a confirm step or Undo
- [x] Optimistic updates roll back on failure and tell the coach (none: every write waits for the server; a partial edit save says what saved, CH-09902)

## error-tracking
- [x] Server read failures are logged with `chLogServer('<screen>', '<read>')`
- [x] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=<screen>.<section>`
- [x] Key intents leave a `chTrail` breadcrumb (open, filter, submit)
- [x] No `catch` swallows an error without reporting or handling it on screen
- [x] Handled failures are low severity and crashes are high, so alerts stay meaningful
- [x] Every failure path was forced once locally and seen in the console or Sentry (each numbered failure in qualifiers.test; close, save and course lookup in the preview console, with outbound reports blocked)

## phone-spec
- [x] `docs/clubhouse/phone/<slug>.md` names the owner's mobile design in `design/handoff/mobile/` (or is a draft the owner approved), and maps each screen to components
- [x] It says `Status: approved` (the design is the owner's, D-22; Q-5, Q-15, Q-16 and Q-20 answered by D-30, D-33 and D-34)

## phone
- [ ] Built at 390px and 430px, respecting the safe areas
- [ ] Touch targets are at least 44px, and hover-only affordances have a tap equivalent
- [ ] Sheets are used instead of popovers, and they drag to dismiss
- [ ] The bottom tab bar and toasts don't overlap content
- [ ] Checked on a real iPhone through `npm run ios:dev` (docs/clubhouse/MOBILE.md): keyboard, swipe-back with a sheet open, haptics felt

## motion
<!-- Rewritten for v2 motion (D-64) and v2 haptics (D-70) on 2026-09-29; earlier evidence was against the old timings, so every box starts again. -->
- [ ] Transitions use only the v2 tokens (press 110, quick 180, base 260, release 280, reveal 520ms) and the v2 curves (D-64)
- [ ] Press: every tappable shrinks about 6px and springs back (`useChPress`), and nothing scales twice
- [ ] First paint: sections rise in once (`.ch-reveal`); no count-ups and no other stagger; a refresh never replays it
- [ ] Skeletons wait 150ms, fade in, and share one shimmer sweep
- [ ] Reduced motion and Animations off remove the rise, the press and the shimmer (`useChReducedMotion`)
- [ ] Haptics follow v2 (D-70): selection for tabs, segmented controls, switches and choices; light for primary buttons; success for Post, Save, Send, Share, Assign and Got it; warning for Remove, Delete, Discard and Dismiss; medium only for a sheet settling or a shot logged; error when an import or sync fails; every other tap silent

## accessibility
- [x] Full keyboard path, with visible focus and no traps; Esc closes overlays
- [x] Landmarks, headings in order, table roles, and labels on icon buttons
- [x] N/A: no charts (scorecards are tables)
- [x] Status changes are announced (aria-live) and errors use role=alert
- [x] Text contrast meets WCAG AA on every surface

## performance
- [x] No request waterfall on the server, with independent reads in parallel
- [x] Client JS is limited to the interactive islands, and animation code is loaded lazily (the list, detail and form are client components, interactive throughout; Qualifiers loads no animation or chart library)
- [x] No layout shift after first paint (CLS 0.0001 or less on seven preview states)

## verified
- [x] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log
- [ ] Browser pass on desktop and phone with a real coach account, logged in PROGRESS.md
- [ ] Owner review of the built screen
