## Progress
- Read `src/app/golf/actions/player-feedback.ts` end-to-end (225 lines).
- Located feedback table schema + RLS in `supabase/migrations/20260421100000_canonical_coachhelm_schema.sql` and `20260421100001_canonical_coachhelm_rls.sql` and `20260421130000_insight_player_feedback_update_policy.sql`.
- Read call site in `PlayerCoachHelmDashboard.tsx` (`handleInsightAction` → `rateInsightAsPlayer`).
- Read button wiring in `src/components/golf/coachhelm/insight-card/InsightCard.tsx` (`InsightActions` subcomponent, lines 505-641).
- Searched for `dismissInsightAsPlayer` / `update.*dismissed` callable by players — none exists.
- Reviewed `bulkDismissInsights` (insight-management.ts:241) — coach-only.
- Verified `golf_coach_insights` RLS in `034_all_rls_policies.sql:1595` — coach_id-only SELECT.

## Verdict

(a) **Action body would correctly insert if invoked: CONFIRMED.**
`player-feedback.ts:158-178` builds `feedbackPayload {insight_id, player_id, rating, note}`, calls `.upsert(..., { onConflict: 'insight_id,player_id' })` against `golf_insight_player_feedback`. Table + unique constraint match the upsert. Auth-derived `player_id` (line 113-117) is correct. Test suite at `src/test/golf/actions/player-feedback.test.ts:120` exercises the success path.

(b) **RLS allows the insert: CONFIRMED.**
`20260421100001_canonical_coachhelm_rls.sql:120-125` defines `ipf_player_insert_own` with `WITH CHECK (EXISTS … gp.id = player_id AND gp.user_id = auth.uid())`. Update path covered by `20260421130000_insight_player_feedback_update_policy.sql:5-14`.

(c) **Click reaches the action: CONFIRMED.**
`InsightCard.tsx:536-572` renders three buttons (`rate-helpful`, `acknowledged`, `dismissed`) wired via `onClick={(e) => { e.stopPropagation(); fire(action, startTransition); }}` → `void Promise.resolve(onAction(action, insight.id))` (line 524). `PlayerCoachHelmDashboard.tsx:233` awaits `rateInsightAsPlayer({ insightId, rating })`.

(d) **Errors are surfaced: CONFIRMED.**
`PlayerCoachHelmDashboard.tsx:236-242` catches and toasts; `player-feedback.ts:120-128, 142-150, 181-189` log via `logServerError` and re-throw.

## Most likely root cause
**Hypothesis FALSIFIED.** The action, RLS, click chain, and error surfacing are all correctly wired. The 0-row result is NOT explained by a code/RLS bug in `rateInsightAsPlayer`. The two compatible explanations remaining are: (1) no player has actually clicked any feedback button in production (real-world usage hypothesis — needs traffic/auth-log evidence), or (2) a downstream issue not in `rateInsightAsPlayer` (e.g., players never reach the dashboard, dashboard shows EmptyState in prod, or the tab containing the actions is the non-default `analytics` section).

For `golf_coach_insights.dismissed = 0`: **CONFIRMED separate bug.** There is NO `dismissInsightAsPlayer` action and `rateInsightAsPlayer` does NOT update `golf_coach_insights.dismissed` even when `rating='dismissed'` (`player-feedback.ts:158-178` only writes feedback rows). `bulkDismissInsights` (`insight-management.ts:241-300`) is coach-only (`coach_id` filter at line 281). So the dismissed=0 stat is expected: players' "Dismiss" clicks were never designed to flip `golf_coach_insights.dismissed`.

## Suggested fix
Two-part:
1. Add a `dismissInsightAsPlayer` action OR extend `rateInsightAsPlayer` to also `UPDATE golf_coach_insights SET dismissed=true, dismissed_at=now() WHERE id=insightId AND player_id=<derived>` when `rating='dismissed'`. Target: `src/app/golf/actions/player-feedback.ts` after line 190 (before recorder fan-out). Requires a new RLS UPDATE policy on `golf_coach_insights` for player-self.
2. To diagnose the 0-row feedback mystery: add an `analytics.track('insight_feedback_clicked', ...)` call in `PlayerCoachHelmDashboard.tsx:201-245` BEFORE the await, so we can distinguish "no clicks" from "clicks that failed silently." If no events arrive, the bug is upstream (visibility, default tab, or empty insight feed for actual users).
