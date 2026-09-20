# Feature: Golf Round Lifecycle

<!-- schema-drift-banner -->
> **⚠️ 1 identifier named below does not exist in the database.**
> Verified 2026-08-19 against production. `golf_round_holes`
>
> It is described here as if live. Do not query, type, or build on it —
> check `src/lib/types/database.ts` (or `memory/glossary.md`'s AUTOGEN blocks)
> before trusting any table name in this file. Declared absent
> below so `npm run docs:schema-drift` exempts them structurally
> instead of carrying them in the numeric baseline. Removing this
> reference entirely is a ratchet-down — re-run
> `node scripts/check-doc-schema-drift.mjs --update` after.

<!-- schema-drift-absent: golf_round_holes -->

## Status

- active

## Current State

The golf round lifecycle covers creating a round, saving drafts, continuing in-progress rounds, submitting final scoring and shot detail, generating reviews or recaps, and feeding CoachHelm intelligence after the round.

This is one of the highest-risk product areas because a broken write path can lose user-entered golf data, corrupt stats, or feed bad evidence into CoachHelm.

As of 2026-08-22, partial-save child failures preserve the in-progress parent
round for retry. A player cannot enter tracking until that parent is committed,
and each completed hole waits for its server checkpoint before the player
advances. Every unfinished committed round appears through Continue Round;
local emergency storage is fallback-only and is not a routine library surface.
An emergency snapshot that contains the same persisted progress as the server
is cleared without a recovery prompt. Once all holes have been server
checkpointed, app backgrounding does not create a redundant final-scorecard
snapshot while the player is deciding whether to submit.

Every newly-entered shot also creates a synchronous browser recovery snapshot
and a best-effort v2 IndexedDB mirror before the normal network autosave. Those
unfinished snapshots do not expire by time: they are removed only after the
server confirms that same or newer progress, final submission succeeds, or the
player explicitly deletes the round. A partial recovery saves an in-progress
round and opens Continue Round; it never marks an unfinished round complete.
When a completed-hole checkpoint fails, the player stays on that hole with a
single retry action while the device backup remains intact. Reopening a hole by
editing or deleting its final holed shot clears its completed-scorecard entry
before the next partial save, so a server snapshot never contains both a
completed score and active shots for that hole.
The partial-save server boundary materializes sparse legacy hole entries as
explicit uncompleted values before validation, so a cached client cannot reject
a checkpoint merely because it predates the current payload shape. Background
re-saves do not duplicate a direct checkpoint's player-facing failure state.
If a terminal atomic submit commits after its HTTP response is lost (including
Safari/WKWebView's opaque `Load failed` transport rejection), the action
confirms the authenticated player's completed round before returning success;
an unconfirmed outcome preserves the in-progress round and recovery backup for
an explicit retry rather than guessing or rebuilding it.

As of 2026-09-02, a device that falls behind the server on a round it is
tracking (a second device/session/tab wrote to it) can no longer silently
resync its optimistic-lock token and overwrite the newer server state — both
round screens now block further writes until the player reloads, with one
narrow self-healing exception for this device's own unreadable write (a
background beacon, or — since 2026-09-15 — a foreground save the browser
killed on phone lock). A round's start date can no longer be set in the future from
either round-start screen. Full mechanics for both live in
`memory/features/shot-tracking.md`, since the RPCs and client guards they
touch are shared with shot tracking, not lifecycle-specific.

As of 2026-09-03, the four flight-recorder-instrumented server-action
workflows (`golf.round.submit`/`.autosave`, `golf.shot.delete`/
`.add_or_edit` — see `src/lib/observability/golf-round-flight-workflow.ts`
for the full step vocabulary) also emit a Sentry `helm.workflow.*` metric
and one structured log line per invocation, from a single hook in
`createHelmFlightRecorder`'s `finalize()`
(`src/lib/observability/helm-flight-recorder.ts`) rather than from each
call site in `golf.ts` — see `memory/features/observability-sentry.md`'s
Consumers section for what it emits and why. This is IN ADDITION TO, not a
replacement for, the pre-existing `trace_runs`/`helm_debug` persistence
those same recorder calls already write (opt-in in production; see that
file's own header for the retention/volume reasoning) — the Sentry signal
fires regardless of whether that DB persistence is enabled, so it is the
thing to check first when debugging a production round-save incident, not
`trace_runs`. `deleteInProgressRoundImpl` ("recover" — discarding an
in-progress round) is not flight-recorder-instrumented and gets its own,
separate `recordWorkflow` calls directly in `golf.ts`.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/rounds/page.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/new/**`
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/**`
- `src/app/golf/(dashboard)/dashboard/rounds/[id]/**`
- `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/**`
- `src/app/golf/(dashboard)/dashboard/rounds/recover/**`

### Actions

- `src/app/golf/actions/golf.ts`
- `src/app/golf/actions/round-drafts.ts`
- `src/app/golf/actions/round-recap.ts`
- `src/app/golf/actions/round-review-system.ts`
- `src/app/golf/actions/round-reviews.ts`
- `src/app/golf/actions/shot-analytics.ts`
- `src/app/golf/actions/player-feedback.ts`

### Related Engine Code

- `src/lib/coachhelm/v2/post-round-trigger.ts`
- `src/lib/coachhelm/v2/shot-analysis/**`
- `src/lib/coachhelm/v3/llm/round-review.ts`
- `src/lib/observability/helm-flight-recorder.ts`,
  `src/lib/observability/golf-round-flight-workflow.ts` — the
  `trace_runs`/`helm_debug` diagnostic trace AND (as of 2026-09-03) the
  Sentry `helm.workflow.*` metric + structured log for `golf.round.submit`/
  `.autosave`/`golf.shot.delete`/`.add_or_edit`. See the "Current State"
  note above.

## Core Data

- `golf_rounds`
- `golf_round_holes`
- `golf_shots`
- `golf_courses`
- `golf_holes`
- `golf_round_reviews`
- `golf_player_stats_cache`
- CoachHelm insight/evidence tables when post-round intelligence runs.

Use `memory/context/golfhelm-database.md` for exact columns.

## Business Rules

- Do not use DELETE-then-INSERT for save, submit, or sync paths. Use idempotent upserts or a safe stage-and-swap pattern.
- Child-write failures must preserve the `in_progress` parent round and prior
  durable children so interruption recovery can retry without data loss.
- A player may begin tracking only after an `in_progress` parent exists in the
  database. Completing a hole is a durable database checkpoint; it may not be
  treated as a fire-and-forget background write.
- A failed completed-hole checkpoint must be retryable from the affected hole
  without advancing the player. Retrying retains the original navigation
  intent; it must not be misclassified as a later score edit.
- A completed-scorecard slot and an in-progress shot collection for the same
  hole must never be persisted together. Removing a final hole-out clears the
  former before the remaining shots are saved as in-progress progress.
- The durable parent is also the authority for start-time identity such as
  round type, qualifier link, and qualifier round number. Final submission may
  use recovery data for scorecard content, but must not let stale client
  metadata change persisted identity. That identity is immutable **to the
  round-tracking path** — it is not immutable outright; see the
  reclassification rules below, which are the one sanctioned way it changes. A legacy missing qualifier
  round number may be filled only after the database verifies the same entrant,
  an open qualifier, and an unused valid number. Continue Round obtains those
  choices from the authenticated server and asks the player to select one at
  final submit; it never invents a qualifier result from a browser backup.
- Authenticated users must only create or modify rounds they are allowed to own or coach.
- Round-start validation must accept whatever the course library stores for
  the course's city and state. The library's `golf_courses.state` is free text
  (Canadian courses carry "Ontario", not "ON") and the tee picker copies it into
  the round verbatim, so both round schemas allow `courseState` up to 100
  characters — the same cap as `courseCity`; the `golf_rounds.course_state`
  column is `text`. A fresh round's first save carries no holes, so a
  validation failure on any top-level field is unsalvageable and reaches the
  player as a bare `retry` ("start round does nothing"). See
  `memory/incidents/golf_round_lifecycle/INC-2026-09-16-course-state-two-letter-rejection.md`.
- Direct database writes cannot create, mutate, or delete a completed round
  or its child shots. Only the postgres-owned SECURITY DEFINER round RPCs may
  carry the transaction-local lifecycle marker needed for their atomic write.
- CoachHelm completion bookkeeping uses a separate service-only RPC that can
  change exactly `coachhelm_analyzed_at`, `coachhelm_failed_at`, and
  `coachhelm_failure_reason` on an already completed round; it cannot alter
  the recorded round, its identity, or its children.
- Draft and submit behavior must preserve partial progress and recover from interrupted sessions.
- The protected atomic submit RPC is the only live completion writer. On every
  RPC failure, application code must preserve the server/device backups and
  either reconcile a committed result or return the player to retry/recovery;
  it must never delete and rebuild a saved round graph.
- Atomic save and submit snapshots must reject any shot group whose hole is not
  present in the supplied hole snapshot before replacing durable data. A
  rejected snapshot leaves the existing round in progress and recoverable.
- Valid local emergency saves remain recoverable until an explicit discard or
  confirmed completion; recovery data must not expire merely because time has
  passed.
- A client-side abort after terminal submit is an unknown transport outcome,
  not proof of a database rollback. The action may report success only after
  an authenticated read confirms that exact round is completed; otherwise it
  must preserve all recovery data and return a retryable result.
- Browser recovery state is a durable fallback, not a time-limited cache.
  Normal active snapshots must survive extended interruptions and be cleared
  only after confirmed server progress, completion, or explicit deletion.
- Recovery snapshots are owner-bound to the authenticated golf-player record
  in localStorage and IndexedDB. A shared browser must neither surface another
  player's shots nor delete that player's valid backup while filtering.
  Pre-owner snapshots remain recoverable only on an already-authorized
  Continue Round route for their exact persisted server round.
- Browser-mirror save and clear operations are causally ordered. A confirmed
  older save may clear only that version; a later shot snapshot remains
  recoverable even if browser-database work finishes later.
- Local recovery UI may appear only when its scorecard or shot data differs
  from the server's persisted progress; a newer timestamp alone is not proof
  of unsaved work.
- Round review and CoachHelm triggers must use committed round data, not stale draft state.
- Cache invalidation must include player-facing and coach-facing views that reflect the round.
- Score, hole, shot, lie, and strokes-gained calculations must stay consistent with `docs/v3-research-golf-domain.md`.
- Completed score history is immutable. Any post-submit derived write must use
  its explicit protected database capability: strokes gained through
  `recalculate_round_strokes_gained`, CoachHelm markers through
  `record_round_coachhelm_terminal_state`, and recap text through
  `save_round_ai_recap`. App code must never update a completed
  `golf_rounds` row directly.
- A lost local round id must not silently merge into an unrelated round, nor
  silently drop invalid data while reporting success. `savePartialRound`'s
  no-id branch (2026-09-02) reuses a course/date-matched `in_progress` round
  only when it is an empty shell or the caller passed explicit recovery/reuse
  intent, and never salvages a hole that has no durable server row without
  telling the caller exactly which hole/field is wrong (`hole_invalid`). Full
  mechanics live in `memory/features/shot-tracking.md`'s save/submit result
  contract, since the RPCs and TypeScript guards this touches are shared with
  shot tracking, not lifecycle-specific.
- A qualifier round number derived server-side (the client sent none) must
  never re-mint a number the player's own in-progress round already holds —
  the unique index on `golf_rounds` over `(qualifier_id, player_id,
  qualifier_round_number)` (migration `20260823000000`) covers `in_progress`
  rows, not only `completed` ones. `getNextQualifierRoundNumber` and
  `savePartialRound`'s derivation share one implementation
  (`src/lib/golf/qualifier-round-number.ts`) for exactly this reason.
- A device that has fallen behind the server on a round it is tracking must
  never write to it again until reloaded (2026-09-02, B2/B9). Neither
  Continue Round's nor New Round's background status poll or explicit save
  `conflict` handling may adopt the server's `updated_at` into the
  optimistic-lock token while proving this device is behind — both
  `savePartialRound` and `submit_round_atomic` are full-snapshot REPLACE, so
  a stale device that resyncs its lock token can overwrite a genuinely newer
  server round with its own outdated in-memory holes/shots. The one
  sanctioned exception is this device's own unreadable write — a background
  beacon, or a foreground save the browser killed on phone lock (2026-09-15)
  — self-healed exactly once per lock token. Full mechanics (the
  write-blocking flag, the unreadable-write self-heal window, the Reload UI)
  live in
  `memory/features/shot-tracking.md`'s Current State — this is the same
  optimistic-lock/RPC surface the lost-round-id bullet above shares, not a
  lifecycle-specific mechanism.
- A round's date must not be settable in the future from either round-start
  screen (2026-09-02, B7): the date input caps at the local "today" and
  `validateBeforeStart` (the one gate both New Round entry points share)
  refuses a future date before `persistRoundStart` ever creates the row —
  previously only the terminal submit path enforced this, by which point an
  entire round could already have been tracked under the wrong day. Not yet
  addressed: an in-progress round already created with a future date before
  this fix has no in-app way to correct its date; only the block on new
  future-dated rounds shipped this date, tracked as an explicit gap here
  rather than silently declared solved.

### Penalty strokes (2026-09-09)

A penalty is its own `golf_shots` row (`is_penalty`, `shot_type: 'penalty'`),
written by `usePenaltyHandler` → `buildPenaltyShot` AFTER the player records
the errant shot; the scorecard counts rows, so score = shots + penalty rows.
The row's `lieBefore` / `distanceToHoleAfter` mean "where the ball is played
from next" — that is what `CONFIRM_PENALTY`, undo, and the continue-round
reload (`lieFromShotResult`) restore position from.

- **Water / unplayable**: play on from the drop — the row keeps the current
  position (two rows, correct).
- **OB / lost ball**: stroke AND distance — the row carries the errant shot's
  `lieBefore` / `distanceToHoleBefore`, so the next stroke is entered from
  there (`getShotTypeFromState` types anything played from `tee` as a tee
  shot, not only shot 1). Before this the row copied the provisional's landing
  spot and the replayed stroke was never entered: 24 of 37 OB tee shots and
  24 of 29 lost balls in the 90 days to 2026-09-09 scored one stroke short.
- **Which stroke went (2026-09-10, `penaltyOrigin`)**: players use BOTH
  flows — enter the drive as "other" then tap Penalty (the entered shot went
  OB), or stand in the fairway with the last entered shot safely at 115 yds,
  hit the next one OB and tap Penalty without entering it. The 09-09 rule
  always replayed from the last ENTERED shot's start, which sent the second
  player back to the tee (owner's test round d69bd372, hole 1). Now
  `SHOW_PENALTY_MODAL` defaults `penaltyOrigin` via `defaultPenaltyOrigin`:
  last shot in play (fairway/rough/sand/green) → `'here'`; last shot entered
  as "other" → `'entered'`; no shot or a penalty row last → `'here'`. The
  modal shows the choice for OB/lost ("My next shot from here" · "Shot N that
  I entered") so the player can flip it. `'here'` writes TWO rows via
  `CONFIRM_PENALTY { payload, errantStroke }`: `buildErrantStroke` (the
  un-entered stroke from the current spot, result `other`, ball back at the
  same spot) then the penalty row, and the player replays from here.
  Water/unplayable ignore origin. "+ Penalty" is therefore enabled again
  before any shot exists — the un-entered stroke is recorded rather than the
  penalty being refused (the 78-of-311 stroke-short case). One Undo lifts
  BOTH rows: `useUndoManager` checks `endsWithErrantStrokePair` (a 0-yard
  "other" stroke ending where it began, followed by an OB/lost penalty that
  replays from that spot — recognised by shape so it survives a reload) and
  deletes penalty-then-errant; a player-entered "other" shot carries real
  distance, so only its penalty is lifted.
- **Stats attribution** (`getPenaltyCategory`, `golf-stats-calculator-shots.ts`)
  charges the −1.0 SG to the shot that EARNED the penalty — the nearest
  preceding non-penalty shot on the hole, else the nearest following one —
  never to the row's own (drop) position. That had put 130 tee-shot penalties
  against Approach and 16 approach penalties against Around Green. Pure
  calculator change: history corrects itself without a data migration.
- Player-facing summary that went to the coach who reported it: scores were
  right for water, one short for OB/lost; the SG split was wrong for all four.

### Reclassification — changing what a round counts toward

- **Re-typing a round is not editing it.** Changing `round_type` /
  `qualifier_id` / `qualifier_round_number` changes what a round COUNTS
  TOWARD; it does not touch a single stroke. The lifecycle guard's blanket
  refusal has twice been over-broad for this reason — once for completed
  rounds (fixed 2026-08-24 after four Guilford players were stranded) and once
  for unfinished ones (`20260830120000`, APPLIED to production 2026-08-31,
  recorded in `supabase_migrations.schema_migrations` alongside
  `20260827060000`, which had also never been applied). Immutability of SCORES
  is the invariant; immutability of CLASSIFICATION never was.
- **`public.reclassify_golf_round` is the only sanctioned write path**, and it
  is a public API: SECURITY DEFINER, granted to `authenticated`, callable
  directly with any arguments by any signed-in user. Every rule that keeps a
  qualifier coherent therefore lives IN the function — qualifier exists, is
  open, the player is entered, and the round-number slot is free. The
  TypeScript action keeps its own copies so a refusal can be a sentence rather
  than a SQLSTATE, but the action is not the enforcement and must never be
  treated as it. (Until `20260830120000` those four checks existed only in the
  action, so a direct RPC call bypassed all of them.)
- **A round counts in a qualifier because of `qualifier_id`, not
  `round_type`.** They are separate columns and both must agree. Setting only
  the type produces a round that calls itself a qualifier, passes every type
  check, renders correctly — and never appears in the standings. Converting
  away from a qualifier clears the linkage rather than orphaning it.
- **Entry in the qualifier is the tenancy boundary**, not the round's
  `team_id`. Rows in `golf_qualifier_entries` are coach-managed (all three
  write policies are `is_golf_team_coach`), so a player cannot forge their way
  into another program's qualifier. A `team_id` comparison is defence in depth
  only, and must tolerate a NULL `team_id` — production carries rounds without
  one, and refusing those would be a regression rather than a fix.
- **A qualifier round number is a slot, and a slot can be occupied.** Any
  surface offering a round number must offer only the numbers actually free
  for that player in that qualifier, and must say so when none are. Offering
  every number and defaulting to 1 is what the 2026-08-30 "players still
  cannot edit round type after the round" report turned out to be: a player
  fixing a mis-tapped round has usually already recorded the qualifier's
  earlier rounds, so 1 is precisely the slot that is not free, and every save
  failed on the clash check with nothing on screen naming an available number.
  A control that can only offer a losing move reads as a broken feature, not
  as a validation.
- **A coach entering a player IS part of changing the round type.** The
  qualifier picker used to be built only from `golf_qualifier_entries`, so a
  player with no entry row saw an EMPTY dropdown — and converting a practice
  round into a qualifier round is precisely the case where no entry exists
  yet. Measured 2026-08-31 on one production team, two players held six
  practice rounds between them and zero entries, so the one operation their
  coach was asking for was unreachable from the UI. A coach is now offered
  every open qualifier of their team, and `updateRoundType` creates the entry
  as part of the save (idempotent — `UNIQUE (qualifier_id, player_id)`).
  A PLAYER is still offered only qualifiers they are already in, because RLS
  INSERT on entries is coach-only and offering more would move the same dead
  end one step later into a silent zero-row write.
- **Scope the qualifier picker by the ROUND's team, never the viewer's.** They
  are different questions and they diverge in production: the round detail page
  grants coach access when the round's PLAYER is a member of the coach's
  cookie-resolved team, while `reclassify_golf_round` gates the qualifier
  against `golf_rounds.team_id`. Measured 2026-08-31: 12 rounds carry a
  `team_id` that is not a membership of their own player, and 8 carry none at
  all. Offering the viewer's team's qualifiers therefore lets a coach pick one
  the write then refuses — after the player has been entered into it. Ask the
  question the enforcement asks.
- **Enter the player LAST, and take it back if the write is refused.** The
  entry is created only after the qualifier, team, round-number and slot-clash
  checks have all passed, immediately before the RPC, and is deleted again if
  the RPC still refuses on a race. An entry with no round is not harmless: it
  puts the player on the coach's leaderboard at zero, produced by a save that
  reported failure.
- **A CONCLUDED qualifier is still a valid target.** Owner instruction
  2026-08-31: there is no time limit on correcting what a round counts toward.
  A round recorded as practice by mistake was always meant to count in that
  qualifier, and the competition ending does not make the mistake less wrong.
  `20260831180000` removes the refusal from `reclassify_golf_round`; every
  other rule it enforces is retained verbatim.
  - This **moves a published result** — `get_qualifier_leaderboard` recomputes
    live from `golf_rounds` — so the picker labels such a qualifier
    `(completed)`, warns before saving, and says so again in the confirmation.
    Visible, not silent, rather than forbidden.
  - It could not have been a database-only change. The refusal lived in THREE
    places: the page filtered completed qualifiers out of the picker, the
    action refused before ever calling the RPC, and the RPC refused again.
    Removing only the database check would have changed nothing a coach could
    see. When a rule appears enforceable in the database, check the layers
    above it before calling the fix a data fix.
  - **Submitting and STARTING a round in a completed qualifier are open too**,
    on the same instruction and in the same change. Opening only submission
    would have been half a fix: a round must be started before it can be
    submitted, so `getNextQualifierRoundNumber`'s closed-qualifier refusal
    would simply have become the new dead end one step earlier. Both guards
    are gone; `qualifier_closed` now has no producer, which makes the
    allowlist entry unused rather than wrong.
  - **What still protects the standings**, and is deliberately untouched: the
    player must be ENTERED, the round number must be within `num_rounds`, and
    the slot must be free. Those are the real constraints. The status check
    only ever protected the clock.
- **The empty state must name a dead end the READER can act on.** The previous
  copy told whoever was looking that "a coach needs to add them to a qualifier
  first" — while the coach was the one reading it. That is a loop, not an
  explanation, and it is what the 2026-08-31 report described.
- **The live round's type is changed by the PLAYER, on the scoring screen.**
  Owner decision 2026-08-31, after measuring: NO coach surface anywhere lists
  or links an in-progress round — all four coach-facing reads in
  `dashboard-data.ts` filter `.eq('status','completed')`, and every
  `in_progress` read in `golf.ts` is player-scoped. Letting a coach open one
  was therefore reachable only by typing a URL, and widened what a coach can
  touch for no gain; it was reverted the same day. The editor now renders on
  `/golf/dashboard/rounds/continue/[id]`, which already scopes its round to
  `player.id`, so it is always the player's own.
  - Constructed by the server component and passed into `ContinueRoundClient`
    as a presentation slot in its inset-aware resume header. The editor still
    owns its independent state; scoring, autosave and recovery do not own it.
  - Player rules apply: only qualifiers the player is already ENTERED in,
    because RLS makes entry creation coach-only.
- **A round re-typed mid-play must still submit.** Saving calls
  `router.refresh()`, which re-runs the page and rebuilds `setupData` — so the
  qualifier identity the submit path reads is the one just written. But a
  client that loaded EARLIER still carries the old value, and the submit path
  used to answer that with *"not a qualifier round. Ask a coach to update its
  type"* — for a change the player had just made themselves, on a round they
  could then no longer submit. The stale value is now DROPPED, not used to
  refuse: a client still cannot reclassify through submit, which was the
  protection that branch existed for.
- **An unfinished round has to be reachable to be re-typed.** The round detail
  page redirected every `in_progress` round to the scoring screen before
  access was even resolved, so the round-type editor did not exist for live
  rounds on any surface. With the guard also refusing them, the operation was
  blocked at both ends at once and fixing only the guard would have changed
  nothing visible. A player still goes to scoring — they want to resume — but
  a coach gets the detail page.
- **Submission completes a re-typed round as if it had started that way.** The
  submit path treats the PERSISTED round as authoritative for its qualifier
  identity (`effectiveRoundType`/`effectiveQualifierId` are overwritten from
  the stored row), so a round moved into a qualifier while in progress
  validates, claims its slot, and refreshes the standings on completion. No
  extra step is needed at completion time.
- **Moving a round between qualifiers leaves stored totals stale unless they
  are refreshed.** `get_qualifier_leaderboard` recomputes live from
  `golf_rounds`, so a coach's leaderboard is always right; but
  `golf_qualifier_entries` ALSO carries `score` / `total_score` /
  `total_to_par` / `rounds_completed`, and `getPlayerQualifiers` renders the
  player's own card from those. Submitting was the only thing that refreshed
  them, which was sufficient only while a round's qualifier identity was fixed
  at creation. `updateRoundType` now refreshes both sides of a move via
  `updateQualifierEntryStats` (`src/lib/golf/qualifier-standings.ts`, shared
  with the submit path). Do NOT reach for `public.update_qualifier_leaderboard`
  for this: it computes the same thing but is not SECURITY DEFINER, so it
  writes under the caller's RLS and a player-session call silently matches no
  row — and measured 2026-08-31 nothing in the repo or the database called it,
  no trigger being wired to it.

## UI Contract

- New round, continue round, review, loading, error, and recovery routes must all be usable on mobile.
- Draft/recovery screens must clearly distinguish recoverable local/session state from submitted server state.
- Submission should make progress and failure states visible enough to prevent duplicate or uncertain submits.
- Empty states should say whether the player has no rounds, no unfinished rounds, or no review yet.
- Continue Round uses the shared Fairway mobile header, scorecard controls,
  buttons, and recovery modal. Its save-and-exit action is secondary; the live
  shot/complete control is the only primary action in the thumb zone.
- The confirmed-course scorecard editor (`FairwayHoleConfig`) follows the
  9/18 and Front/Back controls that sit above it on the same screen: a change
  to the seeded baseline re-seeds the editable holes (compared by content, so
  the player's own par/yardage edits survive ordinary re-renders), and Start
  round saves exactly the holes on screen. Before 2026-09-01 the editor seeded
  once on mount, so "9 holes · Front 9" tapped after the course was confirmed
  still started an 18-hole round (Shenandoah field report).
- A tee picked from the course library survives a document reload before the
  round exists on the server. `handleTeePick` writes the `TeeRoundDefaults` to
  `src/lib/golf/new-round-pick-cache.ts` (localStorage, per player, 12 h TTL);
  on mount, the auto-open effect restores it through the same handler instead
  of reopening the picker, and the record is dropped once `persistRoundStart`
  succeeds or the player clears the cloud pick. Before 2026-09-17 a reload at
  the setup stage (WKWebView content-process kill, stale-asset recovery)
  remounted an empty form and auto-opened the picker — "it loaded, then reset
  to the course screen" with no message (UNCW, Oviinbyrd GC). Rounds with
  shots are still owned by the emergency-save / recovery path, not this cache.
- A round-start failure is shown beside the control that started the round.
  On the confirmed-course path that control is `FairwayHoleConfig`'s own
  "Start round" dock, so the parent's error travels down as `submitError`
  (rendered directly above the dock, scrolled into view) and `submitting`
  disables/relabels the dock while `persistRoundStart` runs. Before
  2026-09-17 the notice rendered above the 18-hole scorecard — off-screen on
  a phone — so any start failure read as "it tries to load, then resets, no
  error" (UNCW, Oviinbyrd GC). Every start failure is also reported through
  `logError` (`component: NewRoundClient`, `action: round start`, `reason`
  offline / server_rejected / transport, with `navigatorOnLine` and the
  health-probe state) so a start that never reaches the server is visible in
  `error_logs`. The offline gate refuses only when `navigator.onLine` is false
  AND the last `/api/health` probe failed (`connectionStatus.isConnected`;
  `isOnline` merely mirrors `navigator.onLine`) — WKWebView's
  `navigator.onLine` alone is not trusted.
- A route's `loading.tsx` reserves the page's paint at t=0 — for a
  `'use client'` page holding its own `loading` state that is that
  component's loading branch, not its settled layout. A route whose
  `page.tsx` is a pure `permanentRedirect` shim renders `bg-canvas` only:
  no geometry, and no real `<h1>` for a screen that never mounts.
  Reference implementation: `dashboard/alerts/loading.tsx`.

## Known Risk Areas

- **Golf player round and shot history is an owner-level absolute
  constraint: never deletable outside the two protected write paths**
  (`submit_round_atomic`/`save_partial_round_atomic`, both `SECURITY
  DEFINER` and self-checking `player_id`; or the player-scoped JS
  fallback authorized by the player's own delete policies). A confirmed
  2026-08-19 defect let any `assistant_coach` (not just the head coach)
  delete a team's entire round/shot history through three role-blind
  DELETE policies — closed by
  `memory/incidents/golf_round_lifecycle/INC-2026-08-19-assistant-coach-cascade-delete-round-history.md`.
  Any new DELETE/ALL policy on `golf_rounds`/`golf_shots`/`golf_holes`/
  `golf_round_reviews` must use `is_golf_team_head_coach()`, never the
  existence-only `is_golf_team_coach()` — see
  `memory/context/engineering-methodology.md`'s Row-Level Security
  section for the verification technique. A decrease in `golf_rounds`,
  `golf_shots`, `golf_holes`, `golf_players` or `golf_round_reviews` row
  counts is this class of incident recurring, not a discrepancy.
- Race conditions between save draft, submit, and recovery.
- Undo, edit, and delete actions share a local single-flight guard. If the
  authorized server lookup confirms a shot is already absent, Undo and Delete
  (where removal IS the intent) reconcile only their stale local reference
  instead of replaying a destructive delete or leaving the active round
  blocked. Edit (2026-09-02, B1) is deliberately different: the same
  server-confirmed-absent signal on an EDIT means the point-update path
  cannot find the shot by its (rotated) id, not that the shot itself is gone —
  the edit is applied to local history and persisted through a full-snapshot
  save instead of being reconciled away. See `memory/features/shot-tracking.md`.
- Background round-status polling is advisory for TRANSPORT failures — it
  never decides whether a player can save, continue, or recover a committed
  round on a transient outage, retrying without a player-facing alarm and
  reporting only a sustained failure once. As of 2026-09-02 (B2) it is NOT
  merely advisory for a STALENESS result: it can now block further writes on
  the active round (see the multi-device business rule above), the same way
  an explicit save `conflict` does — a stale device must never overwrite
  newer server holes, whether the staleness was noticed by a poll or a save.
- Discarding a round races any save already in flight for the same id
  (2026-09-02, C1): a `round_missing` answer that landed after the delete
  used to re-create the round. Both round screens now refuse to drop the id
  or re-create once `handleDeleteRound` has marked the round discarded. See
  `memory/features/shot-tracking.md`.
- A qualifier the coach closes between scoring and submit (2026-09-02, C3)
  leaves the round `in_progress` — `submit_round_atomic` refuses before any
  write — so the round screens no longer read that refusal as "round already
  completed"; they offer reclassify-to-practice (`updateRoundType`, whose
  RPC has accepted an `in_progress` round since migration `20260830120000`)
  as the way out instead of a retry that cannot succeed.
- Open from the same pass, none started: C2 (the v1 offline drain's
  unattended auto-submit, and a staleness compare before recovery
  re-submits), C4 (recovery-snapshot equivalence normalisation — its spec is
  committed and skipped, the fix is unwritten), the B7 correction path
  above, and the submit trigger fan-out (migration D).
- Bad route revalidation after acknowledgement or player feedback.
- Hook-order or hydration issues in round-entry and review screens.
- Schema replay drift in Supabase migrations touching round/shot/review tables.
- Stats cache mismatch after edits or recomputation.
- Lifecycle migrations that introduce a completed-round guard can strand older
  direct writers unless their compatible RPC path and regression tests ship in
  the same release.
- The post-round AI recap (`round-recap.ts`) must be handed the player's own
  first name (`golf_players.first_name`, cleaned by `promptSafeName`, falling
  back to "the player") both as a fact and in the third-person rule. Until
  2026-09-02 the prompt named nobody and offered "Nick" as an example, and the
  model copied the example into a Shenandoah player's stored recap.

## Tests To Prefer

- Unit tests for schemas and calculation helpers.
- Action tests for draft, submit, feedback, and revalidation behavior.
- RLS tests for round and shot ownership.
- Regression coverage for every explicit completed-round write capability and
  a migration replay/RLS suite for its grants and security boundary.
- Playwright smoke for new round, continue round, submit/review, and mobile recovery.

## iOS shell presentation (added 2026-08-26)

The round chrome owns the iOS status-bar zone: the Capacitor WKWebView is
edge-to-edge (`contentInset: 'never'`), so `FairwayScorecardHeader`'s sticky
bar owns `env(safe-area-inset-top)` as padding for New Round or a sticky
offset below Continue Round's inset-aware context (the published
`--scorecard-height` includes the inset in both modes), and both
`FairwayNewRoundEntry` step wrappers plus `FairwayCoursePicker`'s floating
Close fold the inset into their top offsets. Off-iOS these resolve to the
prior paddings (env() = 0). No lifecycle, autosave, or navigation semantics
changed. Context: docs/audits/IOS_PREMIUM_NATIVE_AUDIT_2026-08-25.md
(F-SAFEAREA-02/03/04); change ledger entry of the same date.

Addendum (same date, live owner QA): the shared `Segmented` control — used
across round entry (front/back nine, 9/18 holes) — gained a dark-scope
accent-green selected thumb and full-contrast inactive labels
(`src/components/fairway/controls/segmented.tsx`); light mode unchanged.
The push pre-prompt sheet (`PushPermissionSoftAsk.tsx`) moved off retired
`warm-*` text tokens that rendered unreadable in dark scope. The new-round hole editor's par chips fire the selection detent as of the same date (§32 gap closed by live bridge-log QA).

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/context/golfhelm-database.md`
- `docs/features/SHOT_TRACKING_DATA_FLOW.md`
- `docs/features/SHOT_TRACKING_VERIFICATION.md`
- `https://github.com/njrini99-code/helmv3/blob/docs-attic-2026-09/docs/archive/2026-07/ROUND_REVIEW_ACCURACY_REPORT.md`
- `docs/v3-testing-standards.md`

## iOS shell chrome (updated 2026-08-26)

Round entry and tracking chrome are safe-area-native in the Capacitor shell:
`FairwayScorecardHeader` accounts for `env(safe-area-inset-top)` through
padding or its resumed-round sticky offset (publishing `--scorecard-height`
inclusive of the inset), both `FairwayNewRoundEntry`
step wrappers fold the inset into top padding, and the course-picker close
control sits below the status bar. The shared `Segmented` control renders an
accent-green selected thumb in dark scope. Presentation layer only — no
lifecycle contract change. Ledger: the round-lifecycle file under `memory/ledgers/changes/`
(2026-08-26 entries); evidence: `docs/audits/evidence/ios-premium-2026-08-25/`
(course picker, tee step, setup band, and scorecard header captures).

### Course picker viewport repair (2026-09-08)

The course/tee picker now applies top and bottom safe-area insets to its single
vertical scroll owner, not only the floating Close button. Its full-screen
surface hides the partial-sheet handle and reduces its available height with
the keyboard inset. Choosing a course scrolls the tee stage to the top; stage
transitions overlap briefly instead of waiting through an empty frame. Tee
cards do not introduce a second vertical scroller. Course, tee and round data
operations are unchanged.

Long course names wrap within the reserved close-button lane; both back and
close controls have 44px touch targets. Safe-area regression coverage is in
`e2e/golf-critical-paths.spec.ts` and only inspects the picker without starting
a round.

New-round completion shows a fixed, non-blocking loading status while its summary/submit chunks
load. The summary remains mounted after its first finish attempt so closing can complete the shared
sheet exit. Round-detail distribution segments keep their final layout widths and reveal with
transforms.

### Continue Round header ownership (2026-09-08)

The resume context and round-type editor share one header below the status-bar
inset. The scorecard uses that inset as its sticky top offset, without adding
a second blank padding band. Its published offset includes the inset for
offline banners and desktop context. New Round still owns its inset inside
the scorecard. The tracking wrapper clips horizontal overflow without becoming
a vertical scroll container, and Continue Round avoids an ancestor transform
that would trap fixed status-bar chrome. Scores and save behavior are unchanged.
The completed-round Submit banner lives inside this same measured scorecard
chrome so it remains reachable while scrolling. A ResizeObserver updates the
published offset when the banner or save status changes height. The route
loading placeholder reserves the same inset, context, and editor order.

## Course geometry fixture proof (2026-09-12)

Stages 0–2 of `docs/plans/2026-09-12-golfhelm-course-geometry.md` add an
optional, local-only shared SVG scene under `src/lib/golf/course-geometry/`
and `src/components/golf/course-geometry/`. The Cacapon fixture is a partial
source-reviewed draft, with no production binding. Both review and entry
compositions consume the same physical package and evidence representation.
The harness reuses `FairwayShotEntry`; existing production consumers and
all score, save, edit, undo, statistics and putting behavior remain unchanged.

Explicit before/after unit tags are preserved independently. The adapter
retains all eight approach directions, original Other results and penalty
transition state. Legacy `shotDistance` is derived evidence only. Ordinary
events have unresolved endpoints. A separately marked analytic presentation
fixture supplies test coordinates to demonstrate marker containment and
label placement; it is not a reconstruction algorithm or a player location.
Source acceptance and Stage 3–5 storage, access, wiring and reconstruction
gates remain in the existing plan.

## Local course-geometry UI proof (September 12, 2026)

The shared course SVG now has optional integration seams in the actual
Fairway tracking and Round Review components. Course data is read-only display
context; scene construction catches geometry failures without joining save or
checkpoint success. The local browser harness mounts the real dashboard shell
and components with inert external adapters and fixture ledgers. It cannot
access production data. Geometry binding, publication and historical version
resolution remain unimplemented; no migration or lifecycle writer changes
are included. See the existing course-geometry plan, Sections 18–19, for source
provenance, real-component screenshots and device-verification limitations.

### Shared terrain renderer feasibility (September 13, 2026)

Both optional geometry props now accept the same `terrainByHole` sidecar.
`buildHoleScene` attaches it only when the physical-hole key and package hash
match. `CourseHoleScene` uses its existing SVG backend inline and a WebGL
backend in expanded terrain views; shared metric projection/material functions
also produce static SVG exports. The runtime remains Next.js/Capacitor.
Source ingestion, Python triangulation and source fixtures stay outside player
routes. This is a one-hole source candidate, with no production resolver,
publication, account/location collection or lifecycle writer change.

### Meridian visual system (September 16, 2026)

The expanded WebGL terrain view now renders Terrain and Side through a real
perspective camera (Top stays orthographic) and draws its ground from a
`MeridianVisualArtifact` (`src/lib/golf/course-geometry/visual-artifact.ts`):
per-vertex albedo, turf/mowing weights, route-local coordinates and boundary
distance compiled from the hash-locked package + terrain + frozen style
(`visual-style.ts`). The artifact carries `basis: 'visual_only'`, is refused
when its package/terrain/style hashes disagree with the scene
(`MERIDIAN_ARTIFACT_MISMATCH`), and never feeds picking, framing, shot
reconstruction or persisted state. Trees stay inside reviewed woods masks
and come in seven seeded silhouette families with trunks in the near band
and a low-poly forest-mass layer for the interior (V4). Water is a class of the
same ground material with a shoreline-distance tone (never depth), perspective
presets add capped distance haze and a sky dome, and crowns cast an analytic
contact shade (V5). Status and evidence
per plan section:
`docs/plans/2026-09-16-meridian-visual-master-plan-status.md`; art direction:
`docs/design/meridian-visual-language.md`. No lifecycle writer, resolver or
production binding changed.

Overnight September 16–17: the lit ground now shades every fragment from
the terrain's metric grid (a half-float DEM slope texture,
`buildDemSlopeTexture`) instead of interpolated vertex normals, so a steep
bank on a coarse context triangle reads as a bank; the compiler
(`course-terrain-v4`) therefore stops emitting the per-vertex
`sourceNormals` array (37 % of each hole's gzip), with
`sourceVertexNormals(mesh)` deriving the same normals from the grid for
every remaining consumer and legacy packages read unchanged. Cut/fill is
`context-contact-v3` (feathered end caps, blended junctions), context
ribbons drape on the displayed ground, and the sky dome grades below the
horizon. All display-only; no canonical geometry, picking, framing or
persisted state changed.

Later the same night (compiler `meridian-visual-compiler-8`, style hash
changes only): small convex building footprints carry a hipped roof
archetype (`contextObjects.roof`, `userData.roofs.basis =
visual_archetype_by_footprint`, never a source claim); the DEM slope texture
carries a third channel with each grid node's relative sky occlusion and the
lit ground takes up to 35 % of the indirect light away in swales and hollows
(`MERIDIAN_STYLE.landform`, `material.userData.shading.landform`); and the
played green is a mown field with its own faint 2.4 m diagonal bands
(`mowing.green`) that fade out at hole-view distance. Canaries `v15-roofs`,
`v16-landform` and `v17-green-mowing` (96 captures each, 0 errors, all within
budget) are recorded in the outside-world tracker; the 40° sun test (master
§47) was run and 45° kept. The same horizon march then gained a fourth
channel, relative sky exposure, and the rough hierarchy takes a DEM
shelter/exposure tint (`MERIDIAN_STYLE.terrainTone`, fidelity §35 "visible
terrain response": hollows richer, knolls and embankments warmer, albedo
only, `material.userData.shading.terrainTone`, canary `v18-terrain-tone`).

September 18 (headless device-class soak, `output/lab-build/device-soak.mjs`):
the expanded terrain view leaked one WebGL context, ~6.5 MB of JS heap and
~900 DOM nodes per hole change because three r186 leaves every disposed
`WebGLRenderer` subscribed to its module-level DFG lookup texture
(mrdoob/three.js#34519, fixed upstream for r187). `three-renderer.ts`
`dispose()` now releases that texture from the renderer it tears down
(`releaseSharedDfgLut`; unit-guarded in `three-renderer-discipline.test.ts`),
and the 18-hole Chromium soak is flat (heap 89 → 97 MB, nodes ~800,
listeners 452, was 90 → 202 MB / 1 043 → 17 090 / 458 → 1 275). Display
runtime only; no lifecycle writer, resolver or production binding changed.

September 19 (hole-open time): the wait behind *Expand course view* is the
main-thread landscape build, and it was geometry sieves — the DEM horizon
march, ring distance and point-in-ring tests run per candidate against
every ring. The march now reads typed heights with per-direction offset
tables, `inRing`/`boundaryDistance` route long rings through the exact edge
index in `ring-index.ts` (now canonical), and the vegetation and compiler
loops test ring boxes first. Nothing visible moved: all 18 artifact hashes,
a digest of every built geometry array and 96 canary captures are
unchanged. Headed 18-hole soaks: build median 507 → 242 ms (Chrome) and
735 → 264 ms (WebKit) on the Mac; device numbers remain the owner's run.

### Four-course local source trial (September 13, 2026)

The fixture harness now includes Winchester alongside Cacapon; both reuse the
same entry/review scene and optional terrain sidecar. Bryan Park and The Cardinal
are explicitly unassigned green studies in the internal source-review harness.
A nullable route is accepted only for a labelled, partial `source_candidate`
with a green; it cannot be relabelled as a reviewed package. These studies have
no played-hole binding, tee or daily pin claim and expose no Whole hole control.
They do not participate in saves or statistics. The existing geometry plan
Section 21 records the non-demo cohort, imagery provenance and remaining gaps.

### Manual evidence and camera refinement (September 13, 2026)

The local shared scene uses `manual-bounds-v1`: one bounded unknown-target
sequence, all eight directions and original independent unit tags. Partial
reviewed sources can show possible regions, while source candidates remain
context only. A complete reviewed fixture can show an estimated point and a
validated coherent connection. Neither is a measured shot path; derived
`shotDistance` remains excluded as independent evidence. Overlapping mapped
hazards constrain the full region cell, not just its centre. Penalty transitions,
undo/edit/delete, saves, scores and statistics retain existing behavior.

The expanded camera has a fixed world focus/lens through orbit, midpoint-anchored
pinch, 0.5–4× explicit zoom and button alternatives. Trees, shadows, surfaces and
shot anchors use the same projection. Inline geometry remains scroll-friendly
and typing never rebuilds the camera or records a pending map marker. Review
selection brings one selected detail into view; hover does not scroll the page.
See the existing geometry plan Section 22 for verification and source limits.

### Premium landscape adapter (September 13, 2026)

The expanded course view loads a Three.js backend behind the existing shared
scene; inline maps and exports retain the SVG adapter. A normal-flow nonmodal
inspector reserves actual camera space on phone/desktop. Mutable camera frames
and projected annotations share one imperative update. Canonical course meters,
manual evidence, scorecard/units, penalties and local save identities do not
change. An Estimated pin is a retained manual hypothesis or nominal interior
green reference, never a measured daily pin or new solver evidence. The revised
putting diagram replaces cup-reference jargon with an illustrated ball-to-hole
line using the same feet scale as its remaining-distance ring. See Sections
22.5 and 23 of the existing geometry plan for source and release boundaries.

### Planned green observations

The actual-green redesign plan (Section 25 of the existing course-geometry plan)
requires a durable client shot key plus origin/finish role before adding stored
ball observations. Current snapshot saves can replace database shot rows, so
row IDs or shot numbers alone must not own future observations. Pin changes must
share one round/hole revision and invalidate only derived hypotheses. This is a
planning requirement; current renderer work adds no persistence or RLS changes.

### One-Tap live round placement (September 16, 2026)

`FairwayShotTracking` accepts `liveRound?: OneTapLiveRound | null`
(`src/lib/golf/one-tap/live-round-placement.ts`). When present, and only for
holes the geometry package maps, it renders `OneTapLiveHole`
(`src/components/golf/one-tap/OneTapLiveHole.tsx`) in place of the shot-entry
screen; every other round — every other course, and Peek'n Peak Upper with the
flag off or no approved package — renders the tracker exactly as before
(`__tests__/FairwayShotTracking.one-tap-placement.test.tsx`).

- Eligibility is resolved client-side by `useOneTapLiveRound` in
  `new-round-client.tsx` / `continue-round-client.tsx` from a server-evaluated
  `peek_n_peak_one_tap_v1` (both pages pass `oneTapFlagEnabled`), the round's
  course (`productCourseIdForRound`: bound DB row or the course name; the
  Lower course never matches), an owner-approved package
  (`loadApprovedCoursePackage`; nothing is fetched while
  `approvedGeometryHashes` is empty, which is the shipped state) and a device
  location that is not denied.
- Since 2026-09-19 (Factory v2 PR A) the policy is generic: the course a
  round is on resolves through `COURSE_GEOMETRY_REGISTRY`
  (`src/lib/golf/course-geometry/course-registry.ts`, contract in
  `course-policy.ts`) — bound `golf_courses` id first, then the layout's name
  patterns, else null and no geometry request. The registry holds one entry,
  `PEEK_N_PEAK_UPPER_POLICY` (`layoutId` `peek-n-peak-upper`, site
  `osm-way-136097904`, tier C2 with the pilot source-candidate exception);
  `src/lib/golf/one-tap/peek-n-peak-policy.ts` is a compatibility shim over
  it. Each entry names its own flags; the round pages still evaluate the
  Upper's two flags into the booleans above until a second layout ships.
  Facility / layout / scorecard manifests live under
  `course-geometry/catalog/` (schemas: `course-geometry/catalog.ts`;
  `catalogProblems` checks them against the registry in
  `__tests__/catalog.test.ts`).
- The ledger seam is `toRoundShots` (`src/lib/golf/one-tap/to-round-shots.ts`):
  a hole's finalized marks become ordinary `ShotRecord`s (`source:
  'one_tap_location'`, per-shot provenance, `clubSource: 'unknown'`, penalties
  as separate `isPenalty` records) and `HoleStats` via `calculateHoleStats`
  only when the hole is COMPLETE with a clean integrity report. A flagged
  close shows *Finish by hand*; *Use standard tracking* dispatches
  `RESET_FOR_HOLE_CHANGE` with the adapted shots so the hole continues in the
  standard flow. Persistence still goes through the host's `onSaveShot` /
  `onHoleComplete` / `onHoleStatsUpdate`; no new tables, actions or RLS.
- Offline (task 15): `useOneTapLiveRound` preflights the course into the
  device cache (`src/lib/golf/one-tap/course-assets.ts`, Cache API name
  `golfhelm-course-geometry-v1`: manifest network-first, hashed package and
  per-hole terrain cache-first) before resolving, so a round that started with
  signal keeps its course through a loss; marks stay in device storage and
  sync once when the signal returns. With no signal and an empty cache the
  round stays on standard tracking.
- Competition Mode (task 16): the round's type decides the One-Tap policy —
  tournament and qualifier rounds are locked to distance and direction only
  (`src/lib/golf/one-tap/competition-policy.ts`, `playModeForRound`); a
  practice round may opt in from the ••• sheet, which carries the Local Rule
  caveat. Elevation to the green (practice only) is the only advice V1 shows.

### Course-framed tracking and review for Peek'n Peak Upper (September 17, 2026)

Plan §unlock 3 (`docs/plans/2026-09-16-peek-n-peak-enhancements-and-round-review.md`
P6) is wired for one course. `useCourseGeometry`
(`src/components/golf/course-geometry/use-course-geometry.ts`) resolves the
tracker's `geometry` (`TrackingGeometry`: package, hole keys, terrain,
context layer) for a round whose course is Peek'n Peak Upper by
`productCourseIdForRound` — the same identity the One-Tap gate uses; a
bound `golf_courses` id or a name that reads as Peek'n Peak *Upper*, never
the Lower course, never a nearest-green match — and `undefined` for every
other round, with no request made. The package comes through the One-Tap
asset cache (`loadCoursePackage`, network-first manifest, cache-first
assets); terrain follows the hole on screen and the next one
(`terrain-residency.ts`, at most three meshes resident), and the review page
loads the open hole only. No feature flag gates the drawing: the course
identity is the gate, `buildTrackingHoleScene` returns null on any failure,
and the 3D canvas falls back to the outline on its own, so shot entry never
waits on geometry. No new tables or bindings; the general binding model in
the plan's P6 remains for a launch beyond one course.

- Entry: `new-round-client.tsx` / `continue-round-client.tsx` pass
  `geometry` to `FairwayShotTracking` (`FairwayHoleHero` → `HoleSceneFrame`,
  compact SVG card, 3D and tap-to-measure on expand). While Meridian Live is
  loading or up the hook is idle and `trackingGeometryFromLiveRound` reuses
  the live round's assets, so nothing loads twice; a pause keeps what is
  loaded (only a course change resets the hook), so the hero never drops to
  the plain card while Live comes up or hands back (probe: 0 legacy-card
  frames over both transitions on preview). On a fresh open the plain card
  shows until the package is parsed — measured 0.4 s cold / 0.24 s warm on
  preview from WebKit (`output/lab-build/measure-first-frame.mjs`), longer
  on a phone's first download of the 1.4 MB package + context — and the
  new-round setup step prefetches the package so hole 1 opens course-framed.
- Review: `rounds/[id]/review/page.tsx` → `FilmstripReview.geometry` →
  `ReviewHero.geometry` (bounded filmstrip scenes, course-framed hole detail,
  shot selector). `ReviewHero.onOpenHoleChange` reports the open hole so the
  page fetches that hole's terrain on demand.
- Every other course is unchanged: the compact putting header and the hidden
  shot pills apply only while a hole scene is drawn
  (`FairwayShotTracking` `courseFramed`), and the selection following the
  latest recorded shot is the state machine's `autoSelectLatest` option,
  on only with geometry and off by default (`use-shot-state-machine.ts`,
  main's null-until-tapped behaviour). Pinned by
  `__tests__/FairwayShotTracking.course-framed.test.tsx`,
  `use-course-geometry.test.tsx`, `ReviewHero.layout.test.tsx` and the
  reducer tests.
- Meridian Live itself stays behind `peek_n_peak_one_tap_v1` (the round's
  own *Turn on* row) and the outbox behind `peek_n_peak_one_tap_sync_v1`,
  which needs `20260916_peek_n_peak_one_tap.sql` applied first.

## Geometry and scorecard authority (September 20, 2026)

A geometry package is never a scoring authority. Live and review headers use
the round's hole number, par and yardage. New/continue clients pass the selected
tee and saved hole setup explicitly to the live adapter; geometry hole lookup
uses a version-keyed policy crosswalk rather than a package ordinal join.
A known database course ID cannot fall through to a matching course name.

Both autosave (including no-ID recovery reuse) and comprehensive submit read
the owned round's saved `course_id` and `tee_id` before updating it. An omitted
or different tee in a stale client does not detach/rebind an existing round.
Emergency/pagehide payloads carry these IDs too. Continue Round uses saved
`golf_holes.yardage`, then saved draft configuration, then unknown (0); it no
longer reads mutable course-library hole yardages to reconstruct the round.
Player edits still travel through the existing round ledger and validation.

Course asset loading leases an exact manifest per round. The browser keeps a
small version binding beside its observation storage, independently of Cache
API eviction; a missing old asset is fetched by its original versioned URL.
Revocation returns unavailable instead of rebinding to a new version. Active
leases prevent pruning; confirmed completion releases cached-byte leases but
retains the historical binding, while confirmed deletion removes both. This is
a device binding, not yet a server-synchronized admission/frame-version ledger.

Implementation and remaining rollout gates:
`docs/plans/2026-09-20-course-factory-authority-implementation.md`.
