# Feature: Golf Round Lifecycle

## Status

- active

## Current State

The golf round lifecycle covers creating a round, saving drafts, continuing in-progress rounds, submitting final scoring and shot detail, generating reviews or recaps, and feeding CoachHelm intelligence after the round.

This is one of the highest-risk product areas because a broken write path can lose user-entered golf data, corrupt stats, or feed bad evidence into CoachHelm.

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
- Authenticated users must only create or modify rounds they are allowed to own or coach.
- Draft and submit behavior must preserve partial progress and recover from interrupted sessions.
- Round review and CoachHelm triggers must use committed round data, not stale draft state.
- Cache invalidation must include player-facing and coach-facing views that reflect the round.
- Score, hole, shot, lie, and strokes-gained calculations must stay consistent with `docs/v3-research-golf-domain.md`.

## UI Contract

- New round, continue round, review, loading, error, and recovery routes must all be usable on mobile.
- Draft/recovery screens must clearly distinguish recoverable local/session state from submitted server state.
- Submission should make progress and failure states visible enough to prevent duplicate or uncertain submits.
- Empty states should say whether the player has no rounds, no unfinished rounds, or no review yet.

## Known Risk Areas

- Race conditions between save draft, submit, and recovery.
- Bad route revalidation after acknowledgement or player feedback.
- Hook-order or hydration issues in round-entry and review screens.
- Schema replay drift in Supabase migrations touching round/shot/review tables.
- Stats cache mismatch after edits or recomputation.

## Tests To Prefer

- Unit tests for schemas and calculation helpers.
- Action tests for draft, submit, feedback, and revalidation behavior.
- RLS tests for round and shot ownership.
- Playwright smoke for new round, continue round, submit/review, and mobile recovery.

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/context/golfhelm-database.md`
- `docs/features/SHOT_TRACKING_DATA_FLOW.md`
- `docs/features/SHOT_TRACKING_VERIFICATION.md`
- `docs/ROUND_REVIEW_ACCURACY_REPORT.md`
- `docs/v3-testing-standards.md`
