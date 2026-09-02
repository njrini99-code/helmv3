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
delete lookup confirms a shot is already absent, Undo and Delete-from-Editor
remove only their stale local reference — that IS the user's intent for those
two, so applying it locally and reconciling is correct; it does not retry the
delete or bypass server ownership checks. The Bridge records that
reconciliation at the `info` tier (`shot_not_found` is in
`ROUTINE_RECONCILIATION_CODES`, `src/lib/admin/observe-action-result.ts`)
rather than treating a successfully recovered state as a warning or an error
sent to Sentry.
An edit or delete read failure is deliberately different: the client keeps its
local shot intact and asks the player to retry. Only the database's explicit
no-visible-row result may trigger stale-reference reconciliation. As of
2026-09-01 that includes the player-profile read inside `deleteShot` and
`updateShot`: a failed `golf_players` lookup returns a retryable sentence, not
"Player profile not found" and never the `shot_not_found` code.

**Edit is the one case `shot_not_found` must NOT mean "remove it" (B1,
2026-09-02).** Shot ids rotate on every full-snapshot save — both round-write
RPCs DELETE-then-INSERT every hole's shots on each call — so a point update
against a shot whose id predates a more recent snapshot save returns
`shot_not_found` even though the shot's DATA is completely real and
unedited-except-for-this-attempted-edit. The client cannot distinguish that
case from an RLS-hidden row or a genuine delete by another session — all
three surface as the identical `shot_not_found`. `use-edit-shot-modal.ts`'s
`handleSaveEditedShot` used to treat any `shot_not_found` on the point-update
attempt as proof of deletion: it dispatched `RECONCILE_MISSING_SHOT`, which
filtered the shot OUT of local history entirely, discarding the edit AND the
shot itself, with no server write at all. The next full-snapshot save (the
very next 15s autosave, or the next hole checkpoint) then persisted that
locally-shortened history to the server, silently erasing a real, previously
saved shot from the round permanently. Fixed: on `shot_not_found`,
`handleSaveEditedShot` now falls through exactly as if the point update had
succeeded — the edit is applied to local history, cascade distance updates to
downstream shots tolerate their own `shot_not_found` the same way, and the
full corrected history reaches the server through the snapshot path
(`onAutoSave`, called unconditionally at the end of the handler) — the same
mechanism New Round already relies on for every shot, since New Round's shots
never carry a server id to begin with. `RECONCILE_MISSING_SHOT` is now
unreachable and has been removed from `use-shot-state-machine.ts` (action
type and reducer case both deleted — a live dispatch site is what made it a
real reconciliation path; keeping the dead code around would have invited
someone to wire it back up as "the fix" for exactly this defect). Delete and
Undo needed NO code change: their existing shot_not_found fallthrough already
applies the deletion the user asked for, locally, and reaches the server
through the same `onAutoSave` snapshot call — this doc's Undo/Delete
description above was already correct for them.
A background autosave (or checkpoint) triggered from inside Edit/Undo/Delete
can itself reject — most commonly because B3's `handleAutoSave` (below) now
awaits its server save and rethrows an unhandled failure so the state
machine's own circuit breaker can retry it. That rejection must not read as a
failed mutation: the edit/delete/undo and its synchronous device snapshot
already succeeded by the time the background save is attempted, so
`use-edit-shot-modal.ts` and `use-undo-manager.ts` each wrap their own
`onAutoSave(...)` call in a swallowing try/catch — a network hiccup on the
follow-up save is the state machine's concern, not grounds to reopen the edit
modal or the undo confirmation with a phantom failure.

As of 2026-09-02, `deleteShot`, `updateShot`, `deleteInProgressRound`,
`getNextQualifierRoundNumber`, and `getPlayerQualifiers` all call
`getUserResilient` (`src/lib/auth/resilient-get-user.ts`) instead of raw
`supabase.auth.getUser()`, matching the transient-vs-real distinction
`savePartialRound`/`submitGolfRoundComprehensive` already carried for
auto-save: a GoTrue rate-limit or brief outage no longer reads as a sign-out
mid-round for these five. A `shot_not_found` reconciliation and the
already-been-completed qualifier refusal are now tiered `warning`, not
`info`, in `src/lib/admin/observe-action-result.ts` — both represent a loss
or a stuck player, not a routine nothing-failed outcome (the OTHER
qualifier-lifecycle messages there — still-open-with-a-cap, already-submitted
— are genuinely routine and stay at `info`).

`savePartialRound`'s no-id branch (no local round id, matched by course +
date + qualifier context) no longer reuses a matched `in_progress` round
unconditionally (2026-09-02, A1). Two legitimate in-progress rounds can share
that context — a player re-playing the same course the same day, or an
unrelated practice round with no qualifier link — and reusing one
unconditionally let a brand-new round's mostly-null holes payload silently
overwrite the OTHER round's already-scored holes via the upsert, with the
orphan trim able to delete them outright. Reuse now happens only when the
matched round is an EMPTY SHELL (no hole with a recorded score, and no
`golf_shots` rows — the genuine lost-id-on-a-fresh-round case) or the caller
passed explicit recovery/reuse intent (`{ allowReuse: true }`, set only by
the restore flows in New Round's recovered-snapshot restore and
FairwayRecoverRound's partial restore — never by `persistRoundStart`, and
never forwarded into the `round_missing` re-create retry inside
`writeRoundRecreatingIfMissing`, whose own intent is always CREATE). When
reuse does happen, the durability guard below is broadened beyond salvaged
holes, and the orphan-hole trim now excludes any hole with a recorded score
regardless of whether this save's payload named it at all.

A hole whose payload fails validation and is NOT durable on the target round
(2026-09-02, A3) no longer salvages silently to a null score with the save
still reporting success — that was itself a silent-loss defect: the server
never receives the hole while the UI shows it complete, and submit later
fails on it with developer text. `savePartialRound` now returns a structured
`{ error: 'hole_invalid', code: 'hole_invalid', hole, field, message }`
result and performs NO write at all for that snapshot. A salvaged hole that
IS durable on the target round is unchanged — the original erasure guard
still refuses with `retry`. `submitGolfRoundComprehensive`'s own Zod-failure
message is humanized the same way ("Hole 4, shot 1: distance to the hole must
be 1000 yards or less.", `code: 'hole_invalid'`) instead of the raw
"Invalid round data: holes.3.shots.0.distanceToHoleBefore — ..." string.

`result.error` on the `hole_invalid` result is the bare key `'hole_invalid'`,
not a sentence — same shape as `'round_missing'`, `'conflict'`, `'busy'`.
Both "Save & Exit" flows (`new-round-client.tsx`'s and
`continue-round-client.tsx`'s `handleSaveForLater`) branch on
`result.error === 'hole_invalid'` and surface `result.message` instead,
matching the class of defect P1 fixed for `round_missing` — a client that
throws/toasts `result.error` unconditionally renders the literal key.

(This line previously claimed the mid-round autosave paths —
`persistCompletedHole` and the per-shot `handleAutoSave` in both round
screens — "were already safe" and needed no `hole_invalid` handling. That
was checked and reported wrong: `persistCompletedHole`'s finite retry loop
had no branch for `hole_invalid` at all, so it fell to the generic
busy/retry fallback and showed "This hole has not saved yet. Keep this
screen open and try again." — actively misleading, since `hole_invalid`
means the payload itself needs a fix and retrying the identical payload can
never succeed. `handleAutoSave` had the same gap on its own primary-save
error branch and would have thrown into the state-machine's circuit
breaker for a failure retrying can never clear. Both fixed 2026-09-02
(B5): each now branches on `result.error === 'hole_invalid'` BEFORE its
generic fallback, surfaces `describeRoundWriteResult(result)` (below), and
never marks the hole checkpointed — `persistCompletedHole` returns `false`
immediately instead of exhausting its 3-attempt retry loop.)

As of 2026-09-02, `src/lib/golf/round-missing-recovery.ts` exports
`describeRoundWriteResult(result)` — the one helper every round-write call
site should use instead of inventing its own `result.error === 'hole_invalid'`
branch or (worse) showing `result.error` unconditionally. It accepts either
shape the two round-write actions use for this code: `savePartialRound`'s
bare key in `error` with the sentence in a separate `message` field, or
`submitGolfRoundComprehensive`'s own Zod-failure path, which puts the
sentence directly in `error` (only `code` says `'hole_invalid'`). It falls
back to `describeRoundWriteFailure` (the narrower, string-only helper this
extends) for every other signal key. Also new: `ROUND_CONFLICT_MESSAGE`, the
single source both `describeRoundWriteFailure('conflict')` and the
write-blocking UI (below) draw from, so a conflict never reads differently
depending on which code path noticed it. Call sites migrated onto
`describeRoundWriteResult`/`describeRoundWriteFailure` this same date:
`persistCompletedHole` and `handleAutoSave` in both round screens,
`persistRoundStart` (New Round — `busy`/`retry` could reach it verbatim;
`hole_invalid`/`conflict`/`round_missing` cannot, since this call always
sends `holes: []` and no existing round id), `handleSaveForLater` in
Continue Round (replacing its own `result.error === 'hole_invalid'`
special case), both `FairwayRecoverRound.tsx` restore branches (partial and
terminal — `writeRoundRecreatingIfMissing` only humanizes a FAILED
re-create; a first-call `busy`/`retry`/`conflict`/`hole_invalid` passed
through with the bare key intact before this fix), and
`src/lib/offline/sync-engine.ts`'s per-item round-sync failures.
`sync-engine.ts`'s `syncRounds`/`syncV1Rounds` used to build player-facing
error strings as `` `Round ${offlineId}: ${result.error}` `` — an internal,
client-generated IndexedDB key concatenated onto the error, INCLUDING a bare
signal key when that's what came back;
`offline-sync-store.ts` takes `result.errors[0]` verbatim as `syncError`, and
`OfflineIndicator` renders `{syncError}` directly, so a player could see
literally "Round v1-local-id: busy". Fixed: every one of the four push sites
drops the internal id and routes the underlying error through
`describeRoundWriteFailure`.

**Continue Round's mid-hole autosave now awaits its own server save (B3,
2026-09-02).** `handleAutoSave`'s primary save used to fire as
`void executeServerSave(...)` — the promise `handleAutoSave` itself returned
resolved as soon as the synchronous localStorage backup ran, before the
network round-trip even started. `useShotStateMachine`'s auto-save effect
(`await onAutoSaveRef.current?.(...)`) only retries and opens its circuit
breaker on a REJECTED promise, so this always read as success: the chip
showed "Saved" regardless of what the actual save did, and the retry/backoff
path never engaged. Fixed: the old nested `executeServerSave` helper is
inlined directly into `handleAutoSave` and awaited; an unrecognized failure
throws (localStorage already succeeded, so this is safe), letting the state
machine's own retry/circuit breaker track it. Hole checkpoints
(`persistCompletedHole`) are untouched — they already awaited and carry their
own bounded 3-attempt retry loop with hole-specific error UI, deliberately
kept on a separate path from the shot-level circuit breaker.

**Two devices on one round: never adopt a newer server `updated_at` while
this device could still be behind it (B2, 2026-09-02).** Both round-write
RPCs are full-snapshot REPLACE keyed on `expectedUpdatedAt` as an optimistic
lock. `use-round-status-sync.ts`'s background poll and each screen's
`handleRoundSyncConflict` used to silently resync `expectedUpdatedAtRef` to
whatever the server reported — including when that value proved the SERVER
had moved past this device's own last known checkpoint (a poll-detected
staleness, or an explicit `conflict` result from a save). That resync made
the NEXT save from this now-stale device pass the optimistic lock and
overwrite the other device's holes/shots with this device's outdated
in-memory state, with no warning. Fixed in both `continue-round-client.tsx`
and `new-round-client.tsx`: `use-round-status-sync.ts` no longer updates the
ref when its own staleness check is positive — it only invokes the new
`onRoundStale` callback (previously unwired in both screens). Both screens'
`handleRoundSyncConflict` now blocks further writes
(`roundConflictBlockedRef`, mirrored in render state for the banner) instead
of adopting the value: every write entry point (`handleAutoSave`,
`persistCompletedHole`, `handleSaveForLater`, `handleRoundSubmit`) checks the
flag first and refuses to write once set. The blocked-state error banner
(Continue Round already had a general error banner; New Round's tracking
step did not and gained one — see B4 below) additionally renders a Reload
button when blocked, and `handleBeforeUnload` skips its "unsaved changes"
prompt while blocked, since reloading is exactly the action being asked for.

**B9, folded into the same fix: a background beacon save must not trip B2's
block on a single device.** `beaconPartialSave` (sendBeacon/keepalive fetch,
fired from `pagehide`/`visibilitychange`-hidden) has NO readable response —
the browser guarantees delivery, not a callback — so its own successful write
advances the server's `updated_at` with no way for the client to learn the
new value. Without a carve-out, the very next poll or save after ANY
backgrounding event with unsaved changes would see that self-caused mismatch
as proof of a genuine multi-device conflict and permanently block writing —
on a single device, every time the phone locks mid-round. Fixed:
`pendingBeaconRef` marks the window from a queued beacon send until the next
status check resolves it; `handleRoundSyncConflict` (which `onRoundStale`
also routes through) treats exactly the first apparent conflict inside that
window as self-caused — it adopts the value (or, lacking one, re-checks
staleness once) and clears the flag, instead of blocking. A genuine
multi-device conflict outside that narrow window still blocks normally.
Separately, `savePartialRound`'s no-id create/reuse success path
(`golf.ts`) used to hard-code `updatedAt: undefined` even though both its
INSERT and UPDATE queries already `.select()` the full row — a caller-visible
gap that widened this same false-conflict window for the very first save
after a round starts or is reused. Fixed to return the row's real
`updated_at` via an outer-scoped `roundUpdatedAtForResponse` (the `round`
variable holding it is scoped to the no-id branch's own block and does not
survive to the shared success-return code further down — an earlier attempt
at this exact fix that returned `round?.updated_at` directly threw
`ReferenceError: round is not defined` at runtime for every brand-new round,
caught by the TDD test for this fix before it shipped).

**New Round's recovery dialog, Discard, and tracking-step errors (B4,
2026-09-02).** The emergency-save recovery prompt (`recoveryDialog`) used to
render only inside the tracking-step's JSX, which is reached only AFTER
`step` moves to `'tracking'` — meaning it could never appear while the player
was still on the setup screen, before `persistRoundStart` has created any
server round. A recovery snapshot detected on mount was therefore only
offered once the player had already started a brand-new round from scratch,
at which point "recover the old one?" no longer made sense as a prompt.
Fixed: the dialog (and its `handleDiscardRecovery`/`handleRestoreRecovery`
handlers) are now hoisted above the setup/holes early return and rendered in
both branches from the same `recoveryDialog` JSX value, so it can appear
before a round exists. Separately, `handleDiscardRecovery` called
`clearEmergencySave(null, playerId)` unconditionally — the `_new_<playerId>`
key — but `loadLatestEmergencySave` can return a snapshot keyed by a REAL
round id (a round that received a server id after its first successful
auto-save, per that function's own docstring); Discard then cleared the
wrong key, leaving the real snapshot behind to resurface as "recoverable"
again later. Fixed to clear `newRoundRecoveryData?.roundId ?? null` — the
snapshot's own key. Separately again: every `setError` call during the
tracking step (a failed checkpoint, a failed autosave, a failed restore) had
no visible surface at all outside an active submit attempt — the
`SubmitOverlay`'s own `error` prop only renders while `step === 'submitting'`.
New Round's tracking step gained a visible, dismissible error banner
(matching Continue Round's, which already had one), including the B2 Reload
control when a conflict-block error is active.

**Client-side bounds now match (or, where none exists, impose) the server's
own limits (B5, 2026-09-02), and a 0-yard/0-foot distance is a blocker, not a
dead tap (B8, same date).** `comprehensiveShotSchema` (golf.ts) caps
`distanceToHoleBefore` at 1000 yards; the value a player enters as "distance
remaining"/"leave distance"/"proximity to hole" on one shot becomes the NEXT
shot's `distanceToHoleBefore`. Neither `FairwayShotEntry`'s `nextShotBlocker`
(the message) nor `FairwayShotTracking`'s `isReadyForNextShot` (the actual
disabled state — the two must mirror each other VERBATIM per
`nextShotBlocker`'s own doc comment, since `nextShotBlocker` short-circuits
to `null` whenever `ready` is true) enforced that ceiling, so a typo like
"1500" instead of "150" reached the server and failed only there, as
`hole_invalid`. Both now reject a resolved distance over 1000 yards (or, for
a green/putting proximity, over 150 ft — the pre-existing cap) with an inline
message. Separately, "0" is a valid, finite, non-negative number, so it
passed both checks even before this fix — but a shot that did not hole out
cannot have landed AT the hole; `handleNextShot` discovered the same
rounds-to-0 value on its OWN and bailed with `if (distanceAfter === 0) { ...;
return; }` and no player-facing feedback at all — a dead tap on an
apparently-enabled button. Both `nextShotBlocker` and `isReadyForNextShot`
now also reject a resolved distance of 0 or less, in both the green-proximity
and general-yards branches, with "Select Hole if you holed out, or enter the
actual distance remaining." Separately, `FairwayHoleConfig`'s hole-yardage
editor had a `yardage > 0` check but no upper bound at all (the server schema
has none either) and a stale, disconnected HTML `min="50" max="700"` on the
input that the JS validation never enforced; both now agree on `1`–`999`.

**A stale completed-hole checkpoint cannot set status for a hole the player
already navigated away from (B8, 2026-09-02).** `handleNextShot`'s
`completeHole(...)` call (and `handleRetryHoleCheckpoint`'s) is awaited, and
the hole-nav pills allow navigating to a different hole while it is still in
flight. The per-hole reset effect (`useEffect` keyed on `currentHoleIndex`)
already sets `holeCheckpointStatus` to `'idle'` for whichever hole is now
showing; the STALE checkpoint's eventual resolution — success or failure —
used to overwrite that unconditionally, so a slow save for hole N that failed
AFTER the player moved to hole N+1 could paint a "this hole didn't save,
retry?" banner on hole N+1, which never attempted a save at all. Fixed: a new
`currentHoleIndexRef` tracks the LIVE hole index (the closures inside
`handleNextShot`/`handleRetryHoleCheckpoint` only ever see the value captured
at call time), and both the success and failure status updates in both
functions now apply only when `currentHoleIndexRef.current` still matches
the hole index the checkpoint started on.

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
  round write shares; also carries `RoundWriteHooks.firstCallOptions`
  (2026-09-02), which forwards `savePartialRound`'s `{ allowReuse }` to the
  caller's own first write ONLY, never to the round_missing recreate retry
- `src/lib/golf/qualifier-round-number.ts` — the one "what qualifier round
  number is this?" derivation `getNextQualifierRoundNumber` and
  `savePartialRound`'s no-id branch both share (2026-09-02, A2)
- `src/lib/golf/holes-played-assert.ts` — pure TS-layer assertion that
  `holes_played` is present and matches the submitted hole count, ahead of
  `submit_round_atomic`'s own accepts-any-count-when-omitted fallback
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

**The recorder is constructed before Zod, auth, and the player lookup on every
wired action** (`savePartialRound`'s existing-round AND no-id/new-round
branches, `submitGolfRoundComprehensive`, `deleteShot`, `updateShot`), not
after — a stage cannot report its own timing to a recorder that does not exist
yet. Every started step reaches a terminal transition (complete/warn/fail) on
every exit path, backed by a per-action idempotent `endTrace` guard plus a
`finally`-block safety net, so a branch that returns early can never leave a
step stuck `started` or a trace permanently `pending` in
`helm_debug.trace_runs`. `verify.round`/`verify.holes`/`verify.shots` (and
`verify.recovery_state`) are `best_effort`, not `required` — they still run,
still get `start()`+`complete()` so their real duration is visible, but a
short or failed read no longer counts against a trace's required-step
coverage. The no-id/new-round autosave branch — a sequence of separate round
trips, not one atomic RPC — additionally reports `db.create_or_update_draft`
(the round row), `db.shot_details` (the holes/shots/putt-detail/approach-detail
upserts), and `db.orphan_trim`, none of which had a call site before. One
known gap: because construction now precedes the player lookup,
`trace_runs.player_id`/`team_id` are null for every trace (the persisted
columns are extracted once, from construction-time metadata) — per-step
metadata on `server.auth`/`server.player` still carries `user_id`/`player_id`
for correlation. `post.stats`, `post.qualifier_transition`, and
`post.coachhelm` are started before `after()` (or, for qualifier transition,
before its own synchronous block) and completed/failed inside it; because the
trace is already finalized by then, their real start/finish timestamps land
after the trace's own reported total-duration window by design — the
alternative, deferring `finalize()` into the background tail, would leave the
player-facing trace open long after the response has already been sent.

Every call site above fires the recorder with `void flightRecorder.x(...)` —
deliberately unawaited, so a trace write can never block the player's save.
The write itself (`persistStart`/`persistStep`/`persistFinalize` in
`helm-flight-recorder.ts`, routed through the module's internal `failOpen`)
is now registered with `vercelWaitUntil`
(`src/lib/observability/vercel-wait-until.ts`) before it is awaited, so the
Vercel runtime holds the function open until that write settles instead of
freezing mid-flight the instant the response returns. Before this, an
in-flight persistence RPC frozen by the platform and resumed on a later,
unrelated invocation surfaced as an unhandled "fetch failed" that Sentry's
Supabase auto-instrumentation on the admin client
(`src/lib/supabase/admin.ts`) reported once, while `failOpen`'s own catch —
which never got the chance to run before the freeze — reported the same
underlying failure again whenever it eventually resumed. Keeping the write
inside the same invocation it started in means `failOpen`'s catch always
runs, so a failure now reaches Sentry through exactly one handled path. The
write stays fail-open and non-blocking to the player's write throughout;
`vercelWaitUntil` is additive (a no-op outside Vercel, by its own contract)
and never changes what the caller awaits.

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
  (`holesAtRiskOfErasure`, `savePartialRound` — the durable-hole part of what
  used to be named `salvageWouldEraseDurableHole`, which is now that
  function's RPC-path-only, salvaged-holes-only call shape) refuses with
  `retry` when a hole blanked by validation salvage already has a scored row
  on the server — on both the RPC path and the no-id reuse path (the reuse
  path additionally checks EVERY null-score hole in the payload, not only
  salvaged ones — see A1 below). Do not write a migration to change the RPC
  shape without re-deriving all five.
  `submitRoundDirectFallback` in `golf.ts` is dead code kept deliberately
  (see its own comment); it is not a live DELETE-then-INSERT path.
- **No-id reuse is gated, not automatic (A1, 2026-09-02).** The no-id branch's
  course/date/qualifier match is a heuristic, not a unique key, so it may
  reuse the round it finds ONLY when that round is an empty shell (no scored
  hole, no `golf_shots` row) or the caller passed `{ allowReuse: true }`
  (New Round's restore, FairwayRecoverRound's partial restore — never
  `persistRoundStart`, and never the `round_missing` recreate retry). A
  reused round's holes upsert is checked against EVERY null-score hole in the
  payload for durable erasure, not only salvaged ones, and the orphan-hole
  trim excludes any hole with a recorded score outright — see
  `isEmptyShellRound` and `holesAtRiskOfErasure` in `golf.ts`.
- **A non-durable salvaged hole is a hard stop, not a silent drop (A3,
  2026-09-02).** `checkNonDurableSalvageBeforeWrite` runs before ANY write —
  the parent round row included — using whichever round (if any) the save is
  about to touch (`null` for a fresh insert, which trivially has no durable
  data for any hole). If none of the salvaged holes are durable there, the
  action returns `{ error: 'hole_invalid', code: 'hole_invalid', hole, field,
  message }` and writes nothing. If even one salvaged hole IS durable there,
  this defers to the existing `holesAtRiskOfErasure` guard unchanged
  ("keep true salvage as is").
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
- **A stale shot id is never proof a shot is gone (B1, 2026-09-02).** Shot ids
  rotate on every full-snapshot save (both round-write RPCs
  DELETE-then-INSERT a hole's shots on every call). `shot_not_found` from a
  point update means the id-keyed path cannot find it — not that the shot is
  gone. Only Undo/Delete-from-Editor, where removal IS the intent, may
  reconcile it away; Edit must apply the correction locally and persist
  through the full-snapshot path regardless of the point-update's outcome.
- **A stale device must never overwrite newer server holes (B2, 2026-09-02).**
  Neither a background status poll nor an explicit save `conflict` may adopt
  the server's `updated_at` into the optimistic-lock ref while it proves this
  device is behind — doing so lets the next save from this device pass the
  lock and silently replace another device's newer holes/shots. The one
  sanctioned exception is a background beacon save's own unreadable
  response (B9): self-heal exactly once inside that window, never for a
  conflict outside it.
- **A `hole_invalid` result must never be retried with the identical
  payload (B5, 2026-09-02).** It means the payload itself needs a fix, not
  that the server had trouble — every write entry point (checkpoint,
  autosave, save-and-exit, submit) must surface the specific hole/field
  sentence immediately and never mark that hole checkpointed, rather than
  spending a retry budget or opening a circuit breaker on a failure retrying
  can never clear.

## Save and submit result contract (updated 2026-09-02)

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
  row is newer. As of 2026-09-02 (B2) the client does more than ask the
  player to reload: it BLOCKS every further write on that screen
  (`roundConflictBlockedRef` in both round screens) until a reload actually
  happens, rather than merely showing a message while quietly remaining
  writable — the old behavior additionally re-synced the optimistic-lock ref
  to the server's value on every conflict, which let the NEXT save from the
  same stale device pass the lock and overwrite the other device's holes.
  The one exception (B9) is a background-beacon-caused false conflict, which
  self-heals once instead of blocking — see Current State.
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
  ones) ONLY when that hole is already durable on the target round; the
  blanked hole numbers are logged either way. Before the write, the guard
  checks the target round for durable scored rows among those holes and
  answers `retry` if any exist — on the RPC path and on the no-id reuse path
  (which also checks every null-score hole in the payload, not only salvaged
  ones — see A1 in Business Rules).
- `hole_invalid` (`error_code`, hole/field/message on the result) — 2026-09-02,
  A3: a salvaged hole that has NO durable row on the target round. Nothing was
  written, not even the parent round row; the failure names the exact hole,
  field, and a human sentence (e.g. "Hole 4, shot 1: distance to the hole must
  be 1000 yards or less."). `submitGolfRoundComprehensive`'s own Zod-failure
  message is humanized the same way and carries the same `code` when the
  failing field is inside a hole. As of 2026-09-02 (B5) every client write
  entry point — not just the two "Save & Exit" flows P1/the earlier follow-up
  fixed — branches on it: `persistCompletedHole` in both round screens
  surfaces the specific sentence and returns `false` immediately (no 3-attempt
  retry loop, since retrying an invalid payload can never succeed), and
  `handleAutoSave`'s primary save shows it without throwing into the
  auto-save circuit breaker. Use `describeRoundWriteResult(result)`
  (`round-missing-recovery.ts`) at any call site that has the full result
  object — it prefers `message` when `error` is the bare key
  (`savePartialRound`'s shape) and uses `error` directly when it is already
  the sentence (`submitGolfRoundComprehensive`'s shape).
- Sand/bunker: `lieBefore`/`result` accept `'sand'`, `approachMissLieType`
  accepts `'bunker'`; the server preprocesses either spelling into the field's
  vocabulary so a UI mapping miss cannot fail validation mid-round.
- Qualifier round number at submit: the persisted `golf_rounds` row is the
  authority. A stored `qualifier_id` forces `round_type='qualifier'`; a stored
  `qualifier_round_number` wins, otherwise the supplied one is validated
  (integer ≥ 1, ≤ `golf_qualifiers.num_rounds`); a client still carrying
  qualifier data for a round that is no longer a qualifier round has it
  ignored, with a warning log, rather than being refused.
- Qualifier round number derivation (2026-09-02, A2): when the client sends
  no number at all, `savePartialRound`'s no-id branch and
  `getNextQualifierRoundNumber` both call the same
  `resolveQualifierRoundNumber` (`src/lib/golf/qualifier-round-number.ts`),
  which checks for the player's own in-progress round on that qualifier FIRST
  and returns it for reuse — never re-deriving a number that round already
  holds. The unique index on `golf_rounds` over `(qualifier_id, player_id,
  qualifier_round_number)` (migration `20260823000000`) is NOT scoped to
  `status = 'in_progress'`, so a number an in-progress round holds is exactly
  as taken as one a completed round holds; deriving only from completed
  rounds (the pre-2026-09-02 behavior) could re-mint the same number and
  23505 on the INSERT, repeatably, every retry. Absent an active round, the
  derivation is first-unused-configured-number (not `max(completed) + 1`),
  capped at `num_rounds`; no free slot is a clear error, not a numberless
  insert.
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
- Both round screens' tracking step render a visible, dismissible error
  banner (`role="alert"`) for any `setError` call — New Round's did not have
  one until 2026-09-02 (B4); its `SubmitOverlay`'s own `error` prop only
  renders while actively submitting, which left every checkpoint/autosave/
  restore failure during live tracking with no player-facing surface at all.
  A conflict-block error (B2) additionally shows a Reload control.
- The emergency-save recovery prompt must be offered on whichever step the
  player is actually on when a recoverable snapshot is found, including the
  setup step before any server round exists (B4) — not only after tracking
  has already begun on a brand-new round.
- The scorecard header's phone Prev/Next controls MOVE to a hole under the
  same rule as the hole pills — earlier holes always, a later hole only once
  it has a score — and are disabled with the reason ("Finish this hole to move
  on") otherwise; they used to only scroll the pill strip, so an enabled
  "Next →" did nothing visible (mobile audit 2026-09-02, UI-10). The autosave
  chip always says "Save failed" in words, compact or not (UI-11). The
  round-detail pulse chart scales to its column (viewBox + width 100%) instead
  of clipping at a fixed 520px (UI-1).

## Known Risk Areas

- Draft JSON lives in `golf_rounds.draft_data` (`src/app/golf/actions/round-drafts.ts`
  writes it); `notes` is only a legacy READ fallback for rows written before
  that column existed. (This line said `notes` was the live store until
  2026-09-01.)
- Shot ids rotate on every full-snapshot save (both round-write RPCs
  DELETE-then-INSERT a hole's shots on every call), so cross-device/session
  ordering routinely produces a locally-stale shot id — not just a rare
  race. As of 2026-09-02 (B1) `shot_not_found` means three different things
  the client cannot distinguish from each other — a rotated id, an
  RLS-hidden row, or a genuine delete elsewhere — and Undo/Delete-from-Editor
  and Edit now handle it DIFFERENTLY, deliberately: Undo/Delete's intent IS
  removal, so reconciling to "shot gone" locally is correct and unchanged —
  the stale local row is removed, hole state is recalculated from the
  remaining shots, and it reaches the server through the same snapshot
  autosave. Edit's intent is a CORRECTION, not a removal — `shot_not_found`
  on its point update no longer removes the shot; the edit is applied to
  local history exactly as if the update had succeeded, and the corrected
  full history reaches the server through the same snapshot path. Neither
  path ever recreates a row the server has confirmed is absent, and
  transport/database read failures never trigger either path, so temporary
  outages cannot make the client hide or lose valid local progress.
- Continue Round and New Round background status polling (`use-round-status-sync.ts`)
  is separate from the save path for TRANSPORT failures: a transient polling
  failure is retried silently, and only a sustained outage is reported once
  with its accurate status-sync context. As of 2026-09-02 (B2) it is
  deliberately NOT separate from the save path for a STALENESS result: the
  poll no longer silently adopts a newer server `updated_at` when it proves
  this device is behind, and instead routes through the same
  `handleRoundSyncConflict` decision (self-heal-once for a pending
  background-beacon window, else block further writes) that an explicit save
  `conflict` uses — the committed server round is the source of truth, but a
  stale device is never allowed to overwrite it via either path.
- Normal auto-save deliberately writes NO v1 per-shot offline queue (see
  Current State; `continue-round-client.offline-consolidation.test.ts` pins
  it). The legacy IndexedDB bridge holds only a failed final submission, which
  the dashboard-level v2 sync engine drains. DB auto-save is the path to trust.
- Strokes-gained columns ARE populated from shot data on submit:
  `submit_round_atomic` calls `recalculate_round_strokes_gained` (migration
  `20260821043500`), and `invalidateOnRoundComplete`
  (`src/lib/cache/golf-stats-calculator.ts`) calls it again explicitly.
  (This line said the opposite until 2026-09-01.)
- Discard vs. a save already in flight (2026-09-02, C1): both round screens
  set `roundDiscardedRef` synchronously in `handleDeleteRound` BEFORE
  `deleteInProgressRound` runs (cleared if the delete fails), and every
  `round_missing` branch that would drop the stale id or re-create checks it
  first — New Round's `persistCompletedHole` loop, `handleAutoSave` primary
  and queued follow-up, `handleSaveForLater`; Continue Round's shared
  `recreateMissingRound` and `handleSaveForLater`. A save whose answer lands
  after the delete can no longer resurrect a discarded round.
- Qualifier closed between scoring and submit (2026-09-02, C3):
  `submit_round_atomic`'s refusal for a closed qualifier contains "already
  been completed" — about the QUALIFIER; the round stays `in_progress` — and
  used to match `isCompletedRoundError`, redirecting to a detail page that
  bounced straight back to Continue Round. `isQualifierClosedError`
  (`src/lib/golf/round-missing-recovery.ts`) is excluded first in both
  screens and `FairwayRecoverRound`; the submit overlay then shows a terminal
  message, hides "Retry submit", and offers "Save as practice round"
  (`updateRoundType`) through `FairwayRoundSubmitOverlay`'s
  `secondaryActionLabel`/`onSecondaryAction` pair.
- Silent localStorage backup failure (2026-09-02, C5): `emergencySave`
  dispatches `EMERGENCY_SAVE_DEGRADED_EVENT` (`src/lib/utils/emergency-save.ts`)
  at most once per browser session when its synchronous write fails even
  after compaction; both round screens listen and show one warning toast. The
  IndexedDB mirror (`queueRecoverySnapshot`) was and is unaffected.
- Left for follow-up (2026-09-02, explicitly not silently skipped): C2 — the
  v1 offline drain (`syncV1Rounds` in `src/lib/offline/sync-engine.ts`) still
  auto-submits a stored terminal submission unattended, with no staleness
  compare against the server round's current holes; C4 — recovery-snapshot
  equivalence normalisation: its red-first spec is committed as a
  `describe.skip` block in `src/lib/utils/emergency-save.test.ts`, the
  `isEmergencySaveEquivalentToProgress` change itself is not written; B7 remainder —
  no correction path for a round already created with a future date;
  migration D — the submit trigger fan-out (one submit fires a round update
  and a player-stats recompute per hole-row write, not once per round) was
  not attempted, and this branch carries no migrations.
- Putts-per-GIR is not properly implemented.
- Hydration/hook-order problems in interactive round screens can pass build but fail in browser.

## Tests To Prefer

- `e2e/golf-round.spec.ts`
- `src/app/golf/actions/__tests__/golf-schemas.test.ts`
- `src/app/golf/actions/__tests__/golf-save-partial-round*.test.ts`
- `src/app/golf/actions/__tests__/golf-salvage-preserves-durable-holes.test.ts`
- `src/app/golf/actions/__tests__/golf-partial-round-reuse-safety.test.ts` (A1)
- `src/app/golf/actions/__tests__/golf-qualifier-round-reuse.test.ts` (A2)
- `src/app/golf/actions/__tests__/golf-hole-invalid.test.ts` (A3)
- `src/app/golf/actions/__tests__/golf-actions-resilient-auth.test.ts` (A5)
- `src/app/golf/actions/__tests__/golf-shot-actions-player-lookup.test.ts`
- `src/app/golf/actions/__tests__/golf-round-submit-*.test.ts`
- `src/lib/golf/__tests__/round-missing-recovery.test.ts`
- `src/lib/golf/__tests__/qualifier-round-number.test.ts` (A2)
- `src/lib/golf/__tests__/holes-played-assert.test.ts` (A4)
- `src/lib/admin/__tests__/observe-action-result.test.ts` (A6)
- `src/lib/utils/emergency-save.test.ts` (C5 degraded-event cases)
- the `*.discard-race`, `*.qualifier-closed` and `*.emergency-save-degraded`
  tests beside both round clients under
  `src/app/golf/(dashboard)/dashboard/rounds/` (C1/C3/C5)
- `src/lib/offline/__tests__/sync-engine-*.test.ts` (includes
  `sync-engine-error-surfacing.test.ts`, B6 — no internal id or bare signal
  key reaches `OfflineIndicator`)
- `src/lib/golf/__tests__/round-missing-recovery.test.ts` (also covers
  `describeRoundWriteResult` and `ROUND_CONFLICT_MESSAGE`, B6)
- `src/hooks/golf/__tests__/shot-mutation-recovery.test.tsx` (B1 — Edit keeps
  the shot with the edit applied on `shot_not_found`; Undo/Delete still
  reconcile by removal; both tolerate a background autosave rejection
  without surfacing it as a failed mutation)
- `src/hooks/golf/__tests__/use-round-status-sync.test.tsx` (B2 — the poll
  never adopts a newer server `updated_at` while it proves this device is
  behind)
- `src/app/golf/(dashboard)/dashboard/rounds/**/*.test.ts` (source-contract
  tests for both round screens — includes
  `continue-round-client.autosave-await.test.ts` (B3),
  `continue-round-client.conflict-block.test.ts` (B2/B9),
  `continue-round-client.hole-invalid-checkpoint.test.ts` and
  `new-round-client.hardening.test.ts` (B2/B4/B5/B6/B7/B9 for New Round))
- `src/components/fairway/pages/rounds-tracking/__tests__/FairwayShotEntry.distance-bound.test.tsx`
  (B5/B8 — distance-remaining bounds and the 0-distance blocker)
- `src/components/fairway/pages/rounds-tracking/__tests__/FairwayShotTracking.ready-state-parity.test.ts`
  (B5/B8 — `isReadyForNextShot` mirrors `nextShotBlocker`'s bounds VERBATIM)
- `src/components/fairway/pages/rounds-tracking/__tests__/FairwayShotTracking.stale-checkpoint.test.ts`
  (B8 — a stale checkpoint resolution cannot set status for a hole the
  player has navigated away from)
- `src/components/fairway/pages/rounds-new/__tests__/FairwayHoleConfig.bounds.test.tsx` (B5)
- `src/components/fairway/pages/rounds-recover/FairwayRecoverRound.raw-key.test.ts` (B6)
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

Keyboard (2026-09-02): the "distance to hole" box was still covered on iOS —
the keyboardWillShow scroll-into-view had nowhere to scroll for a field in the
bottom ~45% of a page that ends where it ends. `<body>` now pads by
`--keyboard-height` while `body.keyboard-open` (globals.css), which is the
scroll range that scroll needed. See ios-native-shell.md.

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
