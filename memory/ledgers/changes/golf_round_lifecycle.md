# Golf Round Lifecycle change ledger

## 2026-08-26 — a rescued round records as rescued, not failed

- SHA: recorded in the follow-up ledger commit on `feat/bridge-observability`.
- Change: the submit path marked the flight-trace RPC step failed *before*
  `attemptDirectSubmitFallback` ran. `finalize()` forces a trace to `failure`
  whenever any step carries `failure`, so a round the fallback successfully
  saved was still recorded as a failed submit. The outcome is now deferred
  until the fallback resolves: on rescue the RPC step is downgraded to a
  warning, a new `db.direct_submit_fallback` step (requiredness
  `best_effort`, so it never appears in `missing_required_steps` for the
  overwhelming majority of submits) records the recovery, and the trace
  finalizes `success`. Only a fallback that also fails produces `failure`.
- Also: `persistStart` was awaited without a bound. It now races a 1500ms
  timeout and degrades to the inert no-op recorder, closing its Sentry span
  rather than leaking it — the recorder gets switched on mid-incident, which
  is exactly when a hung diagnostic RPC would be least welcome on a save.
- Why: the recovered-from-a-transient-failure case is precisely what the new
  forensics and RCA surfaces exist to explain, and it was the one case the
  trace described wrongly.
- Reachability, stated plainly: `attemptDirectSubmitFallback` is currently a
  stub that always returns failure — neutered after the 2026-08-20
  round-destruction incident and held there by the no-destructive-write rule —
  so the rescued path is not reachable through the public action today. The
  success ordering is therefore proven directly against the real recorder
  rather than through the action, and both currently-reachable branches keep
  regression coverage.

## 2026-08-26 — arm the flight recorder on submit and autosave

- SHA: recorded in the follow-up ledger commit on `feat/bridge-refit`.
- Change: `submitGolfRoundComprehensive` and `savePartialRound` now start a
  Helm flight trace, pass the `_helm_trace` key through `p_round_data` so the
  in-RPC checkpoints arm, record the RPC step, and finalize with the outcome.
  Failures are always traced; successes follow the recorder's own enable and
  sampling gates. The recorder is fail-open by construction — every one of its
  calls swallows internally, so no new failure mode reaches a saving golfer.
  The same catch paths now stamp `helmTraceId` into the Helm Bridge log
  context, which is what joins an `admin_events` row to its step-level trace.
- Also: `golf.ts` branched on an `internal_error` result shape carrying
  `{error_code, step, detail}` that the current RPC bodies never construct.
  The handling was tightened to the shapes the RPC actually emits
  (`success:false` with a message, transport errors, the `busy` single-flight
  marker) with one defensive fallback branch that logs honestly when it fires.
- Why: the recorder, its step map, its service-role RPC facades, and the
  Bridge Trace Explorer were all built and individually tested, but nothing
  ever called `createHelmFlightRecorder` — so the SQL checkpoints never armed
  and the explorer listed nothing on real traffic. A round failure could be
  seen but not located within the transaction.
- Not yet applied: the recorder's own migration (`20260825200811`) and its new
  retention migration (`20260826010000`) are R3, owner-applied, and confirmed
  absent from production. Until they are applied the wiring is inert by
  design, and the explorer says so rather than showing an empty list.

## 2026-08-22 — suppress duplicate recovery after a confirmed scorecard

- SHA: `48b41e1c4d8c86f12f5a2becd11454f5bd3899e2`.
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-confirmed-snapshot-recovery-prompt.md`.
- Change: Continue Round now compares a local emergency snapshot to the
  server scorecard before offering recovery, clears only snapshots covered by
  an acknowledgement, and skips page-hide backup after all holes are durable.
- Why: iOS backgrounding after a confirmed 18-hole scorecard created a newer
  but identical fallback that blocked the submission summary with a false
  "Recover Unsaved Progress?" drawer.

## 2026-08-22 — require server-backed start and completed-hole checkpoints

- SHA: `a68d7c299` (implementation commit; amended after ledger stamping).
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-partial-save-round-deletion.md`.
- Change: the round parent is persisted before tracking starts, completed-hole
  writes are acknowledged before the player advances, and Continue Round is
  the normal unfinished-round recovery surface.
- Why: transient saves, app backgrounding, or browser closure must not make a
  started round disappear from the player’s server-backed round list.

## 2026-08-22 — preserve parent rounds on child-write failure

- SHA: `f06c9bf34b72e9b368d49db79fa9c0c88dc0e659`.
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-partial-save-round-deletion.md`.
- Change: partial-save hole and shot upsert errors retain the `in_progress`
  parent row and prior durable data; a local snapshot from a missing server
  round is discoverable through the player recovery path.
- Why: an active round must remain retryable after a transient save failure,
  including when a user has returned from sign-in without its local round ID.

## 2026-08-22 — active-round stale-shot reconciliation

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-delete-shot-stale-id.md`.
- Change: server-side `deleteShot` now returns the stable `shot_not_found`
  code when the user-scoped lookup finds no row. Undo and Edit Shot use a
  shared local single-flight guard, reconcile that specific stale reference,
  and wait for cascading edit writes before releasing the guard.
- Why: concurrent Undo/Edit actions could apply multiple local-history
  removals, while an already-completed delete surfaced as a misleading
  production server error to the golfer.

## 2026-08-25 — durable checkpoint, recovery, and lifecycle repair

- Release candidate: round-lifecycle reliability promotion (final promoted SHA
  is recorded in `memory/ledgers/deployments.md`).
- Change: completed-hole checkpoints retain valid emergency saves without a
  time expiry; recovery is scoped to the active player and no longer prompts
  for data already durable on the server. Qualifier setup/manual closure and
  saved-round identity rules now fail with actionable messages instead of
  mutating or stranding a player's existing round.
- Database: restores the protected round save/submit lifecycle contract,
  replaces the invalid generic active-round DELETE trigger with typed trigger
  functions, and permits only a coach/player-authorized editorial recap write
  on completed rounds.
- Why: a stale migration could break roster/qualifier administration, while
  older recovery and recap paths could surface misleading errors despite the
  player's shots being intact.

## 2026-08-25 — atomic snapshot hole-group integrity

- Status: uncommitted local reliability repair; not deployed.
- Change: `save_partial_round_atomic` and `submit_round_atomic` now reject a
  snapshot before any replacement work when a shot group names a hole that is
  absent from `p_holes`. Their former unmatched-hole fallback now raises rather
  than silently continuing, preserving transaction safety if a future path
  bypasses the preflight.
- Why: both RPCs previously returned `success: true` while dropping unmatched
  shot groups; submit could mark that incomplete graph as completed.

## 2026-08-25 — preserve all failed submit/checkpoint paths

- Status: uncommitted local reliability repair; not deployed.
- Change: removes the live direct delete/reinsert submit fallback and retains
  the protected RPC as the sole completion writer. A client-side abort is
  read-back reconciled only; every other failure returns the durable
  server/device recovery path. The auto-save fallback no longer deletes an
  in-progress parent round if an upsert of a hole or shot fails.
- Why: a branch divergence reintroduced a legacy fallback that could delete a
  round graph after an RPC error, while checkpoint cleanup could erase an
  existing Continue Round record after a transient child-write failure.
## 2026-08-22 — keep Continue Round on the durable checkpoint path

- SHA: `4276cec7e2556aa4b1dffc92851ba780d2a67b1a`.
- Change: New Round and Continue Round advance only after a completed-hole
  save succeeds. A retry preserves the original forward/return intent, and a
  later shot edit or delete removes its now-invalid completed score before
  any partial save. The Continue Round surface now uses the compact Fairway
  course/progress header and a neutral save-and-exit control.
- Why: active rounds need a single comprehensible persistence path and must
  never serialize both the old completed version and reopened progress of the
  same hole.

## 2026-08-23 — owner-bind and order device recovery snapshots

- SHA: pending commit on PR #1604; not deployed.
- Change: localStorage and IndexedDB snapshots now carry the authenticated
  golf-player identity, shared-device scans hide but do not delete another
  player's data, and browser-mirror saves/clears run in causal order.
  Pre-owner snapshots remain recoverable only for the exact server round after
  Continue Round has verified that player's ownership.
- Why: a delayed browser-database clear could erase a newer snapshot, while an
  unowned shared-device cache could be shown or accidentally re-homed by a
  recovery fallback.

## 2026-08-23 — protect completed round writes at the database boundary

- SHA: pending PR #1609 merge.
- Change: completed rounds and their child records reject direct writes. The
  atomic round RPCs set a transaction-local marker while running as their
  postgres owner; ordinary application roles cannot use that marker to bypass
  the guard.
- Why: a stale client, direct API write, or later feature must not overwrite
  completed score history or re-target a saved qualifier round.

## 2026-08-25 — recap persist crosses helm_private as a definer boundary

- SHA: pending commit (migration 20260825233000).
- Change: `public.save_round_ai_recap` is now SECURITY DEFINER with a pinned
  search_path; EXECUTE stays revoked from PUBLIC/anon and granted to
  authenticated + service_role. `helm_private` remains fully locked — no
  schema grants were added.
- Why: the invoker wrapper resolved `helm_private.save_round_ai_recap` with
  the caller's privileges, and 20260825052141's schema lockdown made that
  impossible for every authenticated user — all production recap persists
  failed 42501 (Sentry JAVASCRIPT-NEXTJS-PT, 9 users). See incident
  INC-2026-08-25-recap-persist-schema-permission in this feature's
  incidents directory.

## 2026-08-25 — privilege-contract suite, anon-grant normalization, rollback captures

- SHA: pending commit on fix/save-round-ai-recap-definer-facade.
- Change: added the lifecycle privilege-contract suite in `supabase/tests/rls/`
  (25 catalog-level assertions: helm_private schema closure; definer mode,
  owner, pinned search_path and role grants for the recap pair, heartbeat,
  submit_round_atomic and save_partial_round_atomic; the lifecycle guard
  stays private; two surface-wide zero tripwires). Added migration
  `20260825235900_revoke_anon_from_secdef_admin_helpers.sql` aligning
  `log_crm_stage_transition()` / `unresolve_admin_event(uuid[])` to
  production's no-anon contract. Added `supabase/rollbacks/` with the
  verbatim pre-fix production definition of `public.save_round_ai_recap`.
- Why: the 20260825233000 outage proved behavioral tests alone cannot be
  trusted for grant contracts here — local Postgres permitted an
  invoker-wrapper path production denied (open investigation P1-10).
  Contracts are now asserted against the catalog, the chain is aligned to
  the production privilege contract rather than the reverse, and a
  production rollback never requires git archaeology. Contract source: the
  live production catalog, read 2026-08-25.

## 2026-08-26 — iOS safe-area fixes on round entry + tracking chrome

- What: `FairwayScorecardHeader` sticky bar now pads `env(safe-area-inset-top)`
  (the Prev/Exit/Next row rendered under the clock/Dynamic Island in the
  Capacitor shell); `FairwayNewRoundEntry` both step wrappers fold the inset
  into their top padding; `FairwayCoursePicker`'s floating Close moved below
  the status-bar zone. Presentation-only — no autosave/navigation/score logic
  touched; the `--scorecard-height` publish keeps padding inside the measured
  element so ShotPills sticky offsets stay correct.
- Why: iOS premium audit 2026-08-25 (docs/audits/IOS_PREMIUM_NATIVE_AUDIT_2026-08-25.md,
  F-SAFEAREA-02/03/04) — the WKWebView is edge-to-edge (`contentInset:
  'never'`), so shell-less round pages owned the status-bar zone and collided
  with system UI on the flagship screen. Neutral off-iOS by construction
  (env() = 0 → prior paddings). SHA: on feat/ios-premium-native-update.

## 2026-08-26 (later, live owner QA) — dark-scope Segmented + push pre-prompt tokens

- What: `segmented.tsx` selected thumb goes accent-600 in dark with
  full-contrast labels (owner directive during coach QA); `PushPermissionSoftAsk.tsx`
  headings off retired warm-* tokens (unreadable in dark scope). Presentation
  only; light mode and all control semantics unchanged. Gates: eslint 0,
  typecheck 0, controls suite 34/34.
- Also same date: `FairwayHoleConfig` par chips now fire `fwHaptic('selection')`
  (grammar §32 gap found by live bridge-log QA — chip toggled silently);
  yardage typing stays silent. eslint 0 / typecheck 0.

## 2026-08-26 (morning addendum) — dark-mode chrome refinements touching round surfaces

- What: `Segmented` (shared control used by round entry's Front9/Back9 and
  9/18-hole selectors) gains a dark-scope accent-green selected thumb and
  full-contrast inactive labels; light mode unchanged. Launch splash gains a
  dark variant and both grounds are now token-exact to `--fw-color-canvas`,
  so entering a round from a cold launch no longer flashes off-brand cream.
- Why: owner directives during live morning QA ("highlighted should turn
  green — no contrast"; "that cream isn't the right cream"). Presentation
  only; no round state machine, autosave, or scoring logic touched.

## 2026-08-26 — round summary: Submit Round pinned, always visible

- SHA: f4216fef8.
- Change: FairwayRoundSummarySheet split into a scrollable stats/scorecard
  region and a pinned ModalShell.Footer action dock (Go Back / Submit
  Round) with home-indicator safe-area padding. Previously the whole panel
  scrolled as one and the flow's primary CTA was simply the last thing in
  the scroll — off-screen on shorter devices or larger text.
- Why: sweep finding (wf_07e7042d-6fa, rounds area) — no scroll affordance
  signalled a CTA below the fold.

## 2026-09-04 — the Pulse chart showed 40% of a round and looked complete

- SHA: PR #1828 (branch `agent/mobile-p0-stability`).
- Change: `FairwayRoundDetail`'s `PulseTrace` drops the inline
  `style={{ width }}` that beat its own `w-full max-w-[520px]` classes in the
  cascade, and stretches its viewBox with `preserveAspectRatio="none"` plus
  `vector-effect="non-scaling-stroke"`. The end-dot is a round-capped
  zero-length stroke rather than a `<circle>`, which is immune to the aspect
  distortion. The now-dead `overflow-x-auto` wrapper is removed. The course
  picker header reserves the floating Close control's lane.
- Why: the chart was pinned to a literal 520px on EVERY viewport, not just
  mobile — `w-full` never applied anywhere. In a ~208px phone column it clipped
  to the leftmost ~40% of the round inside a silent scroll container, and
  because that slice forms a plausible V shape it read as a complete trend. A
  coach drew conclusions from 40% of a round believing they had seen all of it.
  This is a correctness defect, not a cosmetic one.
