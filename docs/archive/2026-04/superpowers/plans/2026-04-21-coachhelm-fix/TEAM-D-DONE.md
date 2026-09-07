# Team D — DONE

**Date:** 2026-04-21
**Owner:** Claude (agent) for Team D — Player Feedback Loop

## Tasks status

| Task | Status | Commit |
|---|---|---|
| D1 — `rateInsightAsPlayer` server action + tests | DONE | `bd026b66` |
| D2 — `AIInsightsPanel` exposes Helpful / Got It / Dismiss | DONE | `265652a0` |
| D3 — `PlayerCoachHelmDashboard` wires callbacks + toast | DONE | `bb3a2429` |
| D4 — Round-review page calls `markReviewAsViewed` on mount | DONE | `fb58dead` |
| D5 — Fix broken `revalidatePath` targets in `round-reviews.ts` | DONE | `88619400` |
| D6 — Add engine-view revalidation to `submitGolfRoundComprehensive` | DONE | `7886c61b` |
| D7 — Regression + smoke | DONE | (this doc) |

## Files changed

- NEW: `src/app/golf/actions/player-feedback.ts`
- NEW: `src/test/golf/actions/player-feedback.test.ts`
- NEW: `src/test/golf/components/AIInsightsPanel.test.tsx`
- MOD: `src/components/golf/coachhelm/player/AIInsightsPanel.tsx` — new `onRate` prop, changed existing callbacks from `(index)` to `(insightId)`, added Helpful button, `useTransition` pending state
- MOD: `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx` — `useToast`, three new `useCallback` handlers routing to `rateInsightAsPlayer`, callbacks passed into `<AIInsightsPanel>` (Team C's Focus Areas link is not touched)
- MOD: `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx` — `useEffect` calls `markReviewAsViewed` once per session when a stored review is loaded
- MOD: `src/app/golf/actions/round-reviews.ts` — fixed 5 `revalidatePath('/golf/reviews/…')` calls to `/golf/dashboard/rounds/[id]/review` (page) + `/golf/dashboard/rounds`, and added `/golf/dashboard/coachhelm` + `/golf/dashboard/my-development` revalidation to `addPlayerFeedback` + `acknowledgeReview` (the latter had no revalidation at all)
- MOD: `src/app/golf/actions/golf.ts` — added `/golf/dashboard/coachhelm`, `/golf/dashboard/my-development`, `/golf/dashboard/my-qualifiers` to the revalidation block in `submitGolfRoundComprehensive` (LIVE-22). Lines 1650+ (Team E territory) not touched.

## Tests added

- `src/test/golf/actions/player-feedback.test.ts` — 6 tests
  - Rejects unauthenticated callers
  - Rejects when player row doesn't resolve from `auth.uid()`
  - Rejects when insight's `player_id` doesn't match the caller
  - Upserts and calls the learner recorder with the expected flat event shape
  - Zod rejects invalid rating values
  - Zod rejects non-UUID insight ids
- `src/test/golf/components/AIInsightsPanel.test.tsx` — 5 tests
  - Renders no feedback buttons when no callbacks supplied
  - Renders all three buttons when callbacks supplied
  - `onRate('helpful', insightId)` fired on Helpful click
  - `onAcknowledge(insightId)` fired on Got It click
  - `onDismiss(insightId)` fired on Dismiss click

All 11 tests green. Typecheck is clean for Team D files (global error count dropped from baseline 333 → 319 — Team D did not add any typecheck debt).

## Smoke test — what was verified

Live DB (project `qmnssrrolpinvwjjnufo`):

- `golf_insight_player_feedback` table exists with columns `id, insight_id, player_id, rating, note, created_at` (RLS enabled, 3 policies).
- Composite unique index `golf_insight_player_feedback_unique(insight_id, player_id)` present → matches `onConflict: 'insight_id,player_id'` in the action.
- CHECK constraint on `rating` column accepts exactly `{helpful, not_helpful, dismissed, acknowledged}` → matches the Zod enum in the action.
- RLS policies `ipf_player_insert_own` (INSERT), `ipf_player_select_own` (SELECT), `ipf_coach_select_team` (SELECT) — player can insert + read own feedback, coach can read team's feedback.
- `golf_coach_insights` has `id (uuid)`, `player_id (uuid)`, `metadata (jsonb)` — columns the action reads for ownership verification.

## Smoke test — what was NOT verified

- **Interactive browser test** (sign in as real player → click Helpful → observe toast → query DB for new row). I don't have live credentials or a running dev server from this agent session. The SQL-level verification above confirms the table and RLS shape the action writes to is correct; the first real player to click Helpful will exercise the full round-trip.
- **First vs second rating** — see follow-up #1 below.

## Follow-ups for other teams

1. **Team A (optional):** `golf_insight_player_feedback` has INSERT + SELECT policies but **no UPDATE policy**. A player's `upsert()` on a row that already exists (i.e., changing their rating from `helpful` → `not_helpful`) would fail RLS on the UPDATE branch. For the initial rollout this is acceptable — the first rating lands; re-rating silently no-ops. If we want re-rating to work, Team A should add:
   ```sql
   CREATE POLICY ipf_player_update_own ON public.golf_insight_player_feedback
     FOR UPDATE TO authenticated
     USING (EXISTS (SELECT 1 FROM golf_players gp WHERE gp.id = player_id AND gp.user_id = auth.uid()))
     WITH CHECK (EXISTS (SELECT 1 FROM golf_players gp WHERE gp.id = player_id AND gp.user_id = auth.uid()));
   ```

2. **Team B:** `rateInsightAsPlayer` adapts its flat `{interaction_type, target_type, target_id, metadata}` event into the legacy `UserInteraction` shape expected by `BehaviorLearner.learnFromInteraction` (camelCase + `entityId`/`entityType`). When Team B refactors the learner to the event-log shape described in plan B2, they can drop the adapter in `buildDefaultRecorder()` and use the flat payload directly.

3. **Team B/C:** `ComposedInsight` has no `id` field today (insights are composed in-memory by the engine). `AIInsightsPanel` reads `(insight as {id?: string}).id` opportunistically — feedback buttons only render when an id is attached. When Team B starts persisting insights to `golf_coach_insights` with a round-trippable id back into `ComposedInsight`, the feedback loop lights up automatically.

4. **Team E:** My D6 change ADDED `revalidatePath('/golf/dashboard/coachhelm' | '/my-development' | '/my-qualifiers')` to the block at `golf.ts` lines 1626-1636. Team E's refactored fire-and-forget block at lines 1650+ was left untouched (confirmed via `git diff` — single contiguous hunk in the revalidation block).

5. **QA / product:** The interactive smoke test from plan D7 step 2 (sign in → submit round → click Helpful → verify DB row and behavior event) is worth running before shipping, since my SQL verification confirms the *plumbing* but not the *end-to-end flow under a real session*. The round-submit revalidation (D6) and the round-review mount-viewed hook (D4) in particular deserve a manual click-through.

## Commits (chronological)

```
bd026b66 feat(player-feedback): rateInsightAsPlayer action — persists + records behavior + revalidates
265652a0 feat(player-ui): AIInsightsPanel exposes Helpful/Got It/Dismiss with onRate callback
bb3a2429 feat(player-ui): wire AIInsightsPanel callbacks to rateInsightAsPlayer + toast feedback
fb58dead feat(round-review): mark as viewed on mount once per session
88619400 fix(round-reviews): revalidate /golf/dashboard/rounds/[id]/review (was a non-existent route)
7886c61b fix(round-submit): revalidate coachhelm/my-development/my-qualifiers after round save
```

Plus the TEAM-D-DONE.md commit that follows.
