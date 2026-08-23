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
If a completed-hole checkpoint cannot be confirmed, the tracker remains on that
hole and exposes one in-context retry action; it does not advance, report the
hole as safely saved, or create a persistent general-purpose unsynced banner.
Editing or deleting the final holed shot clears that hole's completed-scorecard
slot before autosave, so the subsequent server snapshot treats it as
in-progress rather than carrying contradictory completed and active versions.

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

## Business Rules

- Do not lose user-entered shots. Save/submit/recover paths must be idempotent and interruption-tolerant.
- Do not use DELETE-then-INSERT for save or submit paths.
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
- Offline shot sync is disabled because of `ShotRecord` to `OfflineShot` type mismatch; DB auto-save is the path to trust.
- Strokes-gained columns exist but are not populated from shot data.
- Putts-per-GIR is not properly implemented.
- Hydration/hook-order problems in interactive round screens can pass build but fail in browser.

## Tests To Prefer

- `e2e/golf-round.spec.ts`
- `src/app/golf/actions/__tests__/golf-schemas.test.ts`
- `src/test/coachhelm/v2/shot-analysis/**`
- Browser validation on mobile viewports for changed round-entry screens.

## Related Docs

- `memory/context/golfhelm-features.md`
- `docs/features/SHOT_TRACKING_DATA_FLOW.md`
- `docs/features/SHOT_TRACKING_VERIFICATION.md`
- `docs/ROUND_REVIEW_ACCURACY_REPORT.md`
