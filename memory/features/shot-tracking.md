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
checks. The Bridge records that reconciliation as a handled warning rather than
an error sent to Sentry.
An edit or delete read failure is deliberately different: the client keeps its
local shot intact and asks the player to retry. Only the database's explicit
no-visible-row result may trigger stale-reference reconciliation.

Undo and Edit Shot share one local in-flight mutation guard. When an authorized
delete lookup confirms a shot is already absent, the client removes only its
stale local reference; it does not retry the delete or bypass server ownership
checks. The Bridge records that reconciliation as a handled warning rather than
an error sent to Sentry.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/rounds/new/**`
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/**`
- `src/app/golf/(dashboard)/dashboard/rounds/recover/**`

### Components

- `src/components/golf/ShotTrackingComprehensive.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx`
- `src/components/golf/rounds/**`
- `src/components/fairway/pages/rounds-tracking/**`
- `src/components/fairway/pages/rounds-recover/**`

### Actions And Services

- `src/app/golf/actions/golf.ts`
- `src/app/golf/actions/round-drafts.ts`
- `src/app/golf/actions/shot-analytics.ts`
- `src/hooks/golf/use-auto-save-round.ts`
- `src/lib/offline/sync-engine.ts`
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
- Do not use DELETE-then-INSERT for save or submit paths.
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

## UI Contract

- Mobile usability matters more than decorative layout; the flow should keep controls reachable and content earlier on screen.
- Submit and auto-save states must be clear enough that players do not duplicate or abandon rounds unnecessarily.
- Recovery screens must distinguish local/draft recovery from completed server submissions.
- Error states must preserve user confidence that entered shots are not silently discarded.
- Continue Round uses a compact course/progress context header, a neutral
  save-and-exit affordance, Fairway modal recovery, and a single primary action
  in the thumb zone. A checkpoint retry appears only on the affected hole.

## Known Risk Areas

- Draft JSON currently lives in `golf_rounds.notes`, which can collide with user notes.
- Cross-device/session ordering can still produce stale local shot IDs; the
  client reconciles a server-confirmed absent shot, while authorization and
  in-progress-round validation remain enforced on the server.
  in-progress-round validation remain enforced on the server. Both Edit and
  Delete use the stable `shot_not_found` reconciliation signal: the stale
  local row is removed, hole state is recalculated from the remaining shots,
  and the client never recreates a row the server has confirmed is absent.
  Transport and database read failures never use that signal, so temporary
  outages cannot make the client hide valid local progress.
- Offline shot sync is disabled because of `ShotRecord` to `OfflineShot` type mismatch; DB auto-save is the path to trust.
- Strokes-gained columns exist but are not populated from shot data.
- Putts-per-GIR is not properly implemented.
- Hydration/hook-order problems in interactive round screens can pass build but fail in browser.

## Tests To Prefer

- `e2e/golf-round.spec.ts`
- `src/app/golf/actions/__tests__/golf-schemas.test.ts`
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
`warm-*` text tokens that rendered unreadable in dark scope.

## Related Docs

- `memory/context/golfhelm-features.md`
- `docs/features/SHOT_TRACKING_DATA_FLOW.md`
- `docs/features/SHOT_TRACKING_VERIFICATION.md`
- `docs/ROUND_REVIEW_ACCURACY_REPORT.md`
