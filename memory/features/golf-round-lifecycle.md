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
- The durable parent is also the authority for immutable start-time identity
  such as qualifier link and qualifier round number. Final submission may use
  recovery data for scorecard content, but must not let stale client metadata
  detach or retarget the started round.
- Authenticated users must only create or modify rounds they are allowed to own or coach.
- Draft and submit behavior must preserve partial progress and recover from interrupted sessions.
- Browser recovery state is a durable fallback, not a time-limited cache.
  Normal active snapshots must survive extended interruptions and be cleared
  only after confirmed server progress, completion, or explicit deletion.
- Local recovery UI may appear only when its scorecard or shot data differs
  from the server's persisted progress; a newer timestamp alone is not proof
  of unsaved work.
- Round review and CoachHelm triggers must use committed round data, not stale draft state.
- Cache invalidation must include player-facing and coach-facing views that reflect the round.
- Score, hole, shot, lie, and strokes-gained calculations must stay consistent with `docs/v3-research-golf-domain.md`.

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
  authorized server lookup confirms a shot is already absent, the client
  reconciles only its stale local reference instead of replaying a destructive
  delete or leaving the active round blocked.
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
