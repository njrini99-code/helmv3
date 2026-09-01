# Feature: Shot Tracking

## Status

- active

## Current State

Shot tracking is the round-entry flow where players record hole-by-hole and shot-by-shot data. It captures the raw evidence used by stats, round reviews, CoachHelm, qualifiers, and future strokes-gained work.

The current round flow uses a wizard for setup, hole configuration, shot capture, and submit. Draft save and continue routes support in-progress rounds. Database auto-save and confirmed per-hole checkpoints are the reliable path. The dashboard-level v2 sync engine drains the legacy IndexedDB bridge only for failed final submissions; normal Continue Round auto-saves must not write a second per-shot v1 queue.

As of 2026-08-22, a failed hole or shot child write preserves the parent
`in_progress` round and every previously durable child row. Entering tracking
now creates that parent row first, and completing a hole waits for a confirmed
server checkpoint of its score and shots before advancing. The Continue Round
surface is the sole normal recovery path for any unfinished server round;
device emergency storage is a private fallback, not a routine user banner.
Each newly entered shot is synchronously snapshotted to localStorage and
mirrored to the v2 browser recovery store before the deferred network save.
Active snapshots do not expire by age; they clear only after the matching
server acknowledgement, a successful final submission, or an explicit delete.
The v2 browser-mirror reader retries one WebKit-aborted or inactive readonly
transaction on a fresh connection. If the browser still cannot read its local
mirror, that tab degrades once to the server-backed Continue Round flow without
repeated client errors or deleting any browser recovery data.
If a completed-hole checkpoint cannot be confirmed, the tracker remains on that
hole and exposes one in-context retry action; it does not advance, report the
hole as safely saved, or create a persistent general-purpose unsynced banner.
The partial-save action also normalizes sparse legacy hole arrays at its server
boundary: a cached mobile bundle's `undefined` slot becomes the explicit `null`
used for an uncompleted hole before validation. A periodic re-save of an
already-completed hole is recovery work, not a second player-facing checkpoint
failure; direct completion remains the only path that can present the focused
retry state.
Editing or deleting the final holed shot clears that hole's completed-scorecard
slot before autosave, so the subsequent server snapshot treats it as
in-progress rather than carrying contradictory completed and active versions.

Undo and Edit Shot share one local in-flight mutation guard. When an authorized
delete lookup confirms a shot is already absent, the client removes only its
stale local reference; it does not retry the delete or bypass server ownership
checks. The Bridge records that reconciliation at the `info` tier
(`shot_not_found` is in `ROUTINE_RECONCILIATION_CODES`,
`src/lib/admin/observe-action-result.ts`) rather than treating a successfully
recovered state as a warning or an error sent to Sentry.
An edit or delete read failure is deliberately different: the client keeps its
local shot intact and asks the player to retry. Only the database's explicit
no-visible-row result may trigger stale-reference reconciliation. As of
2026-09-01 that includes the player-profile read inside `deleteShot` and
`updateShot`: a failed `golf_players` lookup returns a retryable sentence, not
"Player profile not found" and never the `shot_not_found` code.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/rounds/new/**`
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/**`
- `src/app/golf/(dashboard)/dashboard/rounds/recover/**`

### Components

- `src/components/fairway/pages/rounds-tracking/FairwayShotTracking.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx`
- `src/components/fairway/pages/rounds-tracking/**`
- `src/components/fairway/pages/rounds-recover/**`

### Actions And Services

- `src/app/golf/actions/golf.ts`
- `src/app/golf/actions/round-drafts.ts`
- `src/app/golf/actions/shot-analytics.ts`
- `src/hooks/golf/use-auto-save-round.ts` no longer exists; round persistence is `src/hooks/golf/use-offline-sync.ts`
- `src/lib/offline/sync-engine.ts`
- `src/lib/utils/emergency-save.ts` — synchronous device snapshot, keyed by
  round id (or `new_<playerId>` before one exists)
- `src/lib/golf/round-missing-recovery.ts` — the one re-create decision every
  round write shares
- `src/lib/coachhelm/v2/shot-analysis/**`

## Core Data

- `golf_rounds`
- `golf_holes`
- `golf_shots`
- `golf_courses`
- `golf_course_holes`
- `golf_player_courses`

## Data Flow

```txt
Round setup
  -> course, round type, qualifier selection, saved course
  -> hole configuration
  -> ShotTrackingComprehensive records per-shot and per-hole data
  -> auto-save draft to golf_rounds
  -> submitGolfRoundComprehensive()
  -> WRITE golf_rounds, golf_holes, golf_shots
  -> invalidate stats cache
  -> trigger CoachHelm and round review work
  -> update qualifier entry if qualifier_id exists
```

## Flight Recorder

The highest-risk autosave and submit paths now create a fail-open Helm trace
with an opaque UUID. The trace links Server Action validation/auth/player
resolution, the atomic Supabase RPC, read-only round/hole/shot verification,
qualifier transition, stats invalidation, and CoachHelm post-round work.

The private `helm_debug` schema stores the visual tree through service-role
facades only. The atomic RPCs additionally emit `HELM_TRACE` PostgreSQL log
checkpoints, so Docker's optional `npm run trace:db` collector can preserve the
last database checkpoint after a business transaction rolls back. Production
recording remains opt-in; tracing cannot block a player save or submit.

## Business Rules

- Do not lose user-entered shots. Save/submit/recover paths must be idempotent and interruption-tolerant.
- Do not use DELETE-then-INSERT in any TypeScript-level save, submit, or sync
  write path. The Review Gate blocks it in `save/submit/sync` paths.
- **Sanctioned exception, and the only one:** the two atomic RPCs
  `save_partial_round_atomic` (`supabase/migrations/20260820170000_*`) and
  `submit_round_atomic` (`supabase/migrations/20260821043500_*`) each do
  `DELETE FROM golf_shots / golf_holes WHERE round_id = …` and rebuild from the
  payload. That is a full-snapshot REPLACE inside one Postgres transaction,
  and it is acceptable because of the mitigations that surround it, all of
  which must stay in place: (1) a single transaction — a failed rebuild rolls
  the delete back; (2) a row lock taken first — partial save uses
  `FOR UPDATE NOWAIT`, submit waits up to a `SET LOCAL lock_timeout = '3s'`,
  and either returns `{success:false, error:'busy'}` instead of queueing
  (`55P03`); (3) the `invalid_snapshot` preflight (migration
  `20260825152726`) rejects a payload whose shot groups name a hole absent
  from the hole snapshot BEFORE any delete runs; (4) every caller sends the
  complete round state, never a delta; (5) the TypeScript salvage guard
  (`salvageWouldEraseDurableHole`, `savePartialRound`) refuses with `retry`
  when a hole blanked by validation salvage already has a scored row on the
  server — on both the RPC path and the no-id reuse path. Do not write a
  migration to change the RPC shape without re-deriving all five.
  `submitRoundDirectFallback` in `golf.ts` is dead code kept deliberately
  (see its own comment); it is not a live DELETE-then-INSERT path.
- A failed checkpoint must retain its parent in-progress round and prior saved
  holes/shots. The next checkpoint is an idempotent upsert; cleanup must never
  make Continue Round disappear after a temporary child-write failure.
- Before an atomic snapshot replaces persisted round data, every supplied shot
  group must map to a supplied hole. A mismatched snapshot must return a safe
  failure before durable holes or shots change; it must never be acknowledged
  as saved while silently omitting shots.
- A failed child upsert must not delete its in-progress parent round; failure
  returns a retryable error while durable server and device state remain intact.
- Do not enter tracking until the in-progress parent has been created on the
  server. Each completed hole must be acknowledged by the server before the
  player advances; a save failure keeps the player on that hole and preserves
  the existing Continue Round record. The player must receive a focused retry
  control for that exact checkpoint, rather than a noisy general sync banner.
- A completed hole and an in-progress shot map are mutually exclusive for the
  same hole. An edit/delete that removes the final holed shot clears the
  completed score before the next partial save carries its remaining shots.
- Each new shot must enter the local recovery snapshot synchronously before
  React rendering or the deferred network autosave. The independent v2 browser
  mirror is recovery-only and must never become a second normal sync queue.
- Recovery snapshots are player-bound in both browser stores. Shared devices
  hide another account's cache without deleting it; a pre-owner entry can be
  restored only through an already-authorized Continue Round for its exact
  persisted server round.
- Browser-mirror saves and cleanup are ordered so an old acknowledgement
  cannot erase a later recoverable shot snapshot.
- Do not silently expire unfinished-round recovery data. Partial recovery
  restores progress with `savePartialRound` and returns to Continue Round; only
  a failed final submit of a fully-scored round may submit automatically.
- Shot records must preserve sequence, hole, lie, type, club, distance, result, miss direction, and putting detail where captured.
- Continuing a round must reconstruct shot sequences and current-hole progress from persisted data.
- An emergency local snapshot must be silently cleared when it is equivalent
  to the persisted round (ignoring server-generated shot IDs). A full
  server-checkpointed scorecard remains resumable through Continue Round, not
  through a misleading recovery prompt.
- Qualifier-linked rounds must retain `qualifier_id` through draft, continue, and submit.
- Terminal submit keeps the persisted `round_type`, `qualifier_id`, and
  `qualifier_round_number` authoritative, including for a direct stale RPC.
- Shot data is evidence for stats and CoachHelm; avoid transforming it into lossy summaries too early.

## Save and submit result contract (updated 2026-09-01)

`savePartialRound` and `submitGolfRoundComprehensive` return
`ActionResult`; the failure `error` is either a sentence or one of these bare
signal keys, and every client branches on the keys before it shows anything.

- `busy` — single-flight guard. Partial save: `FOR UPDATE NOWAIT` on the
  `golf_rounds` row; any concurrent writer means this save is SKIPPED, never
  queued. Clients treat it as silent (no breaker increment, no toast) because
  every save carries full state and the next tick re-sends it. Submit: a
  bounded 3s lock wait first, then `busy`, surfaced as "Another save for this
  round is just finishing — try again in a moment" at warning tier, not as an
  error.
- `retry` — a transient the client should not surface as terminal: a failed
  player read, an unsalvageable payload, or the salvage guard refusing a write
  that would erase a durable scored hole. Same silent-skip handling as `busy`.
- `conflict` — optimistic locking: the client sent `expectedUpdatedAt` and the
  row is newer. The client asks the player to reload.
- `round_missing` — the server PROVED there is no row for the id it was given
  (partial save: the RPC's not-found message; submit: that message AND an
  authenticated read showing no completed row, so an already-submitted round
  is acknowledged instead). Retrying the id can never succeed. Every caller
  goes through `writeRoundRecreatingIfMissing`
  (`src/lib/golf/round-missing-recovery.ts`): re-issue the identical full
  snapshot once with NO id — the no-id branch creates the row, and for submit
  creates and completes it in one atomic call — and if that fails too, show a
  sentence, never the key, and leave the device snapshot in place. Continue
  Round re-creates from its checkpoint, its mid-hole auto-save and its queued
  follow-up alike, migrates the device snapshot from the dead id to the new
  one (`migrateEmergencySave`), targets the new id for any save that races
  the route change, and `router.replace`s onto it. New Round drops the dead id
  (`dropStaleRoundId`), re-creates, and migrates the snapshot the same way.
  The recovery screen and the v1 sync drain re-submit a failed terminal
  payload as a NEW round rather than retrying the dead id.
- `invalid_snapshot` (`error_code`, with a sentence in `error`) — the RPC
  preflight found a shot group whose hole is absent from the hole snapshot.
  Nothing was deleted; the client retries with a complete snapshot.
- A LOST RESPONSE on submit is not a failure until proven: a client-side
  abort/timeout with no SQLSTATE (`isIndeterminateWriteFailure`) triggers an
  authenticated read of that exact round (`hasConfirmedRoundSubmission`); a
  `completed` row is acknowledged as success, anything else preserves every
  server and device copy for retry.
- Validation salvage: a hole that fails `partialHoleSchema` is blanked to
  `null` and the save carries on (one bad hole must not discard seventeen good
  ones); the blanked hole numbers are logged. Before the write, the salvage
  guard checks the target round for durable scored rows among those holes and
  answers `retry` if any exist — on the RPC path and on the no-id reuse path.
- Sand/bunker: `lieBefore`/`result` accept `'sand'`, `approachMissLieType`
  accepts `'bunker'`; the server preprocesses either spelling into the field's
  vocabulary so a UI mapping miss cannot fail validation mid-round.
- Qualifier round number at submit: the persisted `golf_rounds` row is the
  authority. A stored `qualifier_id` forces `round_type='qualifier'`; a stored
  `qualifier_round_number` wins, otherwise the supplied one is validated
  (integer ≥ 1, ≤ `golf_qualifiers.num_rounds`); a client still carrying
  qualifier data for a round that is no longer a qualifier round has it
  ignored, with a warning log, rather than being refused.
- `SyncResult.declined` — the v2 sync engine reports `declined:
  'already-running'` with EMPTY `errors` when a run is skipped because one is
  in flight; no surface may render that as a failure.

## UI Contract

- Mobile usability matters more than decorative layout; the flow should keep controls reachable and content earlier on screen.
- Submit and auto-save states must be clear enough that players do not duplicate or abandon rounds unnecessarily.
- Recovery screens must distinguish local/draft recovery from completed server submissions.
- Error states must preserve user confidence that entered shots are not silently discarded.
- Continue Round uses a compact course/progress context header, a neutral
  save-and-exit affordance, Fairway modal recovery, and a single primary action
  in the thumb zone. A checkpoint retry appears only on the affected hole.

## Known Risk Areas

- Draft JSON lives in `golf_rounds.draft_data` (`src/app/golf/actions/round-drafts.ts`
  writes it); `notes` is only a legacy READ fallback for rows written before
  that column existed. (This line said `notes` was the live store until
  2026-09-01.)
- Cross-device/session ordering can still produce stale local shot IDs; the
  client reconciles a server-confirmed absent shot, while authorization and
  in-progress-round validation remain enforced on the server. Both Edit and
  Delete use the stable `shot_not_found` reconciliation signal: the stale
  local row is removed, hole state is recalculated from the remaining shots,
  and the client never recreates a row the server has confirmed is absent.
  Transport and database read failures never use that signal, so temporary
  outages cannot make the client hide valid local progress.
- Continue Round background status polling is separate from the save path.
  A transient polling failure is retried silently; only a sustained outage is
  reported once with its accurate status-sync context, while the committed
  server round remains the source of truth for recovery.
- Normal auto-save deliberately writes NO v1 per-shot offline queue (see
  Current State; `continue-round-client.offline-consolidation.test.ts` pins
  it). The legacy IndexedDB bridge holds only a failed final submission, which
  the dashboard-level v2 sync engine drains. DB auto-save is the path to trust.
- Strokes-gained columns ARE populated from shot data on submit:
  `submit_round_atomic` calls `recalculate_round_strokes_gained` (migration
  `20260821043500`), and `invalidateOnRoundComplete`
  (`src/lib/cache/golf-stats-calculator.ts`) calls it again explicitly.
  (This line said the opposite until 2026-09-01.)
- Putts-per-GIR is not properly implemented.
- Hydration/hook-order problems in interactive round screens can pass build but fail in browser.

## Tests To Prefer

- `e2e/golf-round.spec.ts`
- `src/app/golf/actions/__tests__/golf-schemas.test.ts`
- `src/app/golf/actions/__tests__/golf-save-partial-round*.test.ts`
- `src/app/golf/actions/__tests__/golf-salvage-preserves-durable-holes.test.ts`
- `src/app/golf/actions/__tests__/golf-shot-actions-player-lookup.test.ts`
- `src/app/golf/actions/__tests__/golf-round-submit-*.test.ts`
- `src/lib/golf/__tests__/round-missing-recovery.test.ts`
- `src/lib/utils/emergency-save.test.ts`
- `src/lib/offline/__tests__/sync-engine-*.test.ts`
- `src/app/golf/(dashboard)/dashboard/rounds/**/*.test.ts` (source-contract
  tests for the two round screens)
- `src/test/coachhelm/v2/shot-analysis/**`
- Browser validation on mobile viewports for changed round-entry screens.

## iOS shell presentation (added 2026-08-26)

Shot-entry surfaces render under the round chrome, which now carries the iOS
status-bar inset (see golf-round-lifecycle.md, same-date section). Haptics on
shot entry are unchanged and remain wired at the control primitives
(`Button` → light impact, `Segmented` → selection); the app-shell bottom-nav
tabs additionally fire the selection haptic as of this date (grammar
alignment, FairwayBottomNav).

Addendum (same date, live owner QA): the shared `Segmented` control — used
across round entry (front/back nine, 9/18 holes) — gained a dark-scope
accent-green selected thumb and full-contrast inactive labels
(`src/components/fairway/controls/segmented.tsx`); light mode unchanged.
The push pre-prompt sheet (`PushPermissionSoftAsk.tsx`) moved off retired
`warm-*` text tokens that rendered unreadable in dark scope. The new-round hole editor's par chips fire the selection detent as of the same date (§32 gap closed by live bridge-log QA).

## Related Docs

- `memory/context/golfhelm-features.md`
- `docs/features/SHOT_TRACKING_DATA_FLOW.md`
- `docs/features/SHOT_TRACKING_VERIFICATION.md`
- `docs/ROUND_REVIEW_ACCURACY_REPORT.md`

## iOS shell chrome (updated 2026-08-26)

Shot-entry surfaces render under the safe-area-corrected scorecard header
(see golf-round-lifecycle.md, same date). No shot-tracking contract change.
Evidence: `docs/audits/evidence/ios-premium-2026-08-25/` (active-round
header collision before/after, shot-entry walkthrough captures).
