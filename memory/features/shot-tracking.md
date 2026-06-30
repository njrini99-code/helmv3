# Feature: Shot Tracking

## Status

- active

## Current State

Shot tracking is the round-entry flow where players record hole-by-hole and shot-by-shot data. It captures the raw evidence used by stats, round reviews, CoachHelm, qualifiers, and future strokes-gained work.

The current round flow uses a wizard for setup, hole configuration, shot capture, and submit. Draft save and continue routes support in-progress rounds. Offline shot sync exists as an architectural idea, but DB auto-save is the reliable path right now.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/rounds/create/**`
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/**`
- `src/app/golf/(dashboard)/dashboard/rounds/recover-draft-draft/**`

### Components

- `src/components/golf/ShotTrackingComprehensive.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/create/new-round-client.tsx`
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx`
- `src/components/golf/rounds/**`

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
- Shot records must preserve sequence, hole, lie, type, club, distance, result, miss direction, and putting detail where captured.
- Continuing a round must reconstruct shot sequences and current-hole progress from persisted data.
- Qualifier-linked rounds must retain `qualifier_id` through draft, continue, and submit.
- Shot data is evidence for stats and CoachHelm; avoid transforming it into lossy summaries too early.

## UI Contract

- Mobile usability matters more than decorative layout; the flow should keep controls reachable and content earlier on screen.
- Submit and auto-save states must be clear enough that players do not duplicate or abandon rounds unnecessarily.
- Recovery screens must distinguish local/draft recovery from completed server submissions.
- Error states must preserve user confidence that entered shots are not silently discarded.

## Known Risk Areas

- Draft JSON currently lives in `golf_rounds.notes`, which can collide with user notes.
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
