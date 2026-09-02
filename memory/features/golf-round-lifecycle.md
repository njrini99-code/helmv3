# Feature: Golf Round Lifecycle

<!-- schema-drift-banner -->
> **⚠️ 1 identifier named below does not exist in the database.**
> Verified 2026-08-19 against production. `golf_round_holes`
>
> It is described here as if live. Do not query, type, or build on it —
> check `src/lib/types/database.ts` (or `memory/glossary.md`'s AUTOGEN blocks)
> before trusting any table name in this file. Tracked in
> `.doc-schema-baseline.json`; `npm run docs:schema-drift` fails on new ones.
> Removing this is a ratchet-down — re-run
> `node scripts/check-doc-schema-drift.mjs --update` after.

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
narrow self-healing exception for a background beacon save's own unreadable
response. A round's start date can no longer be set in the future from
either round-start screen. Full mechanics for both live in
`memory/features/shot-tracking.md`, since the RPCs and client guards they
touch are shared with shot tracking, not lifecycle-specific.

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
  sanctioned exception is a background beacon save's own unreadable response,
  self-healed exactly once. Full mechanics (the write-blocking flag, the
  beacon self-heal window, the Reload UI) live in
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
  - Rendered from the SERVER component, outside `ContinueRoundClient`. That
    component owns live scoring, autosave and recovery; a type picker does not
    belong inside that state machine.
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

## Known Risk Areas

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
- Bad route revalidation after acknowledgement or player feedback.
- Hook-order or hydration issues in round-entry and review screens.
- Schema replay drift in Supabase migrations touching round/shot/review tables.
- Stats cache mismatch after edits or recomputation.
- Lifecycle migrations that introduce a completed-round guard can strand older
  direct writers unless their compatible RPC path and regression tests ship in
  the same release.

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
bar pads `env(safe-area-inset-top)` (inside the measured element — the
published `--scorecard-height` var includes it), and both
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
- `docs/ROUND_REVIEW_ACCURACY_REPORT.md`
- `docs/v3-testing-standards.md`

## iOS shell chrome (updated 2026-08-26)

Round entry and tracking chrome are safe-area-native in the Capacitor shell:
`FairwayScorecardHeader` pads `env(safe-area-inset-top)` (publishing
`--scorecard-height` inclusive of the inset), both `FairwayNewRoundEntry`
step wrappers fold the inset into top padding, and the course-picker close
control sits below the status bar. The shared `Segmented` control renders an
accent-green selected thumb in dark scope. Presentation layer only — no
lifecycle contract change. Ledger: the round-lifecycle file under `memory/ledgers/changes/`
(2026-08-26 entries); evidence: `docs/audits/evidence/ios-premium-2026-08-25/`
(course picker, tee step, setup band, and scorecard header captures).
