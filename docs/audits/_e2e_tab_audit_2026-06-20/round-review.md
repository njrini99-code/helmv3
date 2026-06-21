## Round Review [player]

End-to-end audit of the player-facing Round Review surface. Two routes were traced:
- `/golf/dashboard/rounds/[id]` — the round-detail page (server) that hosts the editorial recap + `RoundReviewViewer`.
- `/golf/dashboard/rounds/[id]/review` — the dedicated client review page (the spec's #23 surface).

Role context: `player` (spec marks #23 as "Both" — both code paths authorize player-self AND coach-on-team; both were traced).

---

### How it is actually wired (end-to-end)

**Parent detail page** `src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx`
1. `getGolfSessionProfile()` (line 86) → redirect `/golf/login` if no session.
2. Fetches the round via `await createClient()` server client + `golf_rounds.select('*, player:golf_players(...)')` (line 93). `notFound()` on miss; redirects to `/continue/[id]` if `status==='in_progress'` (line 107).
3. **Role-gate** (lines 117-135): `isCoach` = coach's resolved team (`resolveCoachTeamIdWithCookie`) has the round's player in `golf_team_members`; `isOwnRound` = `player.id === round.player_id`. If neither → redirect `/golf/dashboard`. Sound.
4. AI recap: `generateRoundRecap(id)` from `actions/round-recap.ts` (lazy LLM via `compose()` v3 + deterministic fallback, persisted to `golf_rounds.ai_recap`). Failure-silent (line 177-184).
5. Renders `RoundReviewViewer roundId isCoach` (line 332), which uses `useRoundReviewV2` to read/generate the review (rule-based content from `round_stats` + V2 overlay).
6. Redesign fork (line 191, flag `NEXT_PUBLIC_REDESIGN`): re-skins the SAME data via `FairwayRoundDetail`, additionally reading `golf_holes` and `golf_round_reviews.round_stats` (read-only). Default OFF.

**Dedicated review page** `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx` (client)
1. `supabase.auth.getUser()` (line 238) then parallel `golf_players` + `golf_coaches` lookup. Authorizes player-self OR coach over ANY staffed team via `golf_team_members.in(team_id, candidateTeamIds)` (lines 276-306). Mirrors the server action `verifyReviewAccess('player_or_coach')`. Sound, multi-team safe.
2. Round fetch: `golf_rounds.select('*, holes:golf_holes(*)')` (line 263).
3. Stored review: `getRoundReview(roundId)` → reads `golf_round_reviews` (server action, `verifyReviewAccess`). Averages: `getStatAverages(round.player_id)`.
4. Auto-generate once if no stored review: `generateAndStoreRoundReview(roundId, round.player_id)` (lines 440-445) — builds `RoundReviewContent` from `golf_shots` + `golf_holes` + last-20-rounds averages, runs optional CoachHelm V2 merge, and **upserts** `golf_round_reviews` keyed by `round_id` (`onConflict: 'round_id'`, line 1540) — no destructive delete. revalidates the three round paths.
5. Insight delivery: `getRoundTakeawayInsight` + `getInsightsForPlayer` (from `golf_coach_insights`).
6. `markReviewAsViewed(storedReview.id)` (idempotent on `patterns_detected.player_viewed_at`).
7. Share: `shareRoundReviewWithCoach(reviewId)` (player-only, optimistic UI reconciled).
8. Renders: `RoundReviewLlmCard`, `RoundReviewDisplay` (the full data-dense rule-based review), `RoundStatsComparison`, redesign-only `StandingBar` SG band, `RoundTakeaway`/`V2ReviewSummary`, `HoleByHoleShotPaths` (SVG shot-path reconstruction from `golf_shots`), and a `PromoteToFocusAreaButton`.

**Tables touched** (all correctly sport-prefixed): `golf_rounds`, `golf_holes`, `golf_shots`, `golf_round_reviews`, `golf_team_members`, `golf_players`, `golf_coaches`, `golf_player_stats_cache`, `golf_coach_insights`, `golf_team_coach_staff`. Columns verified against `golfhelm-database.md` `golf_round_reviews` (note: the engine stores `RoundReviewContent` in the `round_stats` jsonb column, read back via `isValidReviewContent`).

**Mutations**: all server actions auth-check first and revalidate. The upsert path uses `onConflict:'round_id'` (no delete-then-insert). The `authenticated` UPDATE grant exists (migration `20260602190000_grant_update_round_reviews_authenticated.sql`, table-wide), so the memory'd "permission denied" upsert bug is RESOLVED.

---

### Expected vs Actual (spec #23)

- Spec: "Auto-generates on first view; V1 rule-based fallback + V2 full pipeline; compare to player/team averages; share with coach." Actual matches: auto-generation, rule-based + optional V2 merge, share, and player-average comparison all present and wired.
- **Divergence (team averages):** the spec data-flow lists `getStatAverages(playerId) → player avg + team avg for comparison`, and `RoundStatsComparison` accepts `teamAvg`. In code the page calls `getStatAverages(round.player_id)` with **no `teamId`**, and the action only computes `teamAvg` when `teamId` is supplied. So `teamAvg` is always null on this surface — the team-comparison column never renders real data. Incomplete wiring.
- Mapbox: `CLAUDE.md` states Mapbox is "used for course maps in Round Review (#23)". The actual hole-by-hole visual is a hand-rolled SVG (`HoleShotPath` via `HoleByHoleShotPaths`); the Mapbox `CourseMap` component is not imported anywhere in the round-review flow. Doc drift, not a code bug.
- SG correctness: real Broadie SG appears only in the redesign-gated `StandingBar` band (season-level `sg_ott`/`sg_approach`/`sg_putting` from `metric-config.ts`, all `higher_better` strokes) — correctly labeled and using season values, not single-round values. The "Improvement Priorities" card is rule-based potential-savings (NOT Broadie SG) and is labeled as such — no mislabel. The standalone `StrokesGainedSection.tsx` (off-tee/approach/around-green/putting Broadie bars) is orphaned — imported by nothing.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| MEDIUM | broken-wiring | review/page.tsx:346 | `getStatAverages(round.player_id)` is called with no `teamId`; the action's `teamAvg` branch (round-review-system.ts:1655) only runs when `teamId` is passed, so `teamAvg` is always null. `RoundStatsComparison teamAvg` (page:744) never gets data. | Players never see the team-average comparison the spec promises and the component renders for. The "vs team" comparison is silently dead. | Resolve the player's active team (e.g. via `golf_team_members`) and pass it: `getStatAverages(round.player_id, teamId)`, or remove the `teamAvg` prop wiring if intentionally deferred. |
| MEDIUM | rls | supabase/migrations/20260527000000_prod_public_baseline.sql:21910 | `GRANT ALL ON TABLE public.golf_round_reviews TO anon;` with no later REVOKE (unlike `golf_coach_insights`, relocked in 20260528011000). | Over-broad grant to the `anon` role on a private table. RLS policies are all `authenticated`-scoped so anon rows are still blocked at the row layer (RLS is the backstop), but this violates defense-in-depth and is exactly the over-broad-anon-grant class the project rules flag. | `REVOKE ALL ON TABLE public.golf_round_reviews FROM anon;` in a new migration; verify ACL via `pg_class.relacl`. |
| LOW | dead-control | src/components/golf/coachhelm/round-review/StrokesGainedSection.tsx:16 | `StrokesGainedSection` (Broadie off-tee/approach/around-green/putting SG bars) is imported by nothing in the codebase — orphaned component. | No user impact (never renders), but the true per-shot SG breakdown the spec/CLAUDE.md imply is never shown to players; only season-level SG (redesign StandingBar) is surfaced. | Either wire `StrokesGainedSection` into the review (feeding it real `golf_player_stats_cache` SG components) or delete it to avoid implying SG-per-round is shown. |
| INFO | wrong-data | CLAUDE.md (Product integrations → Mapbox) | Doc claims Mapbox is "used for course maps in Round Review (#23)"; the round-review hole visual is SVG (`HoleShotPath`), and `CourseMap` (Mapbox) is unused in this flow. | Misleading docs for future maintainers expecting a Mapbox layer here. | Update CLAUDE.md / `golfhelm-features.md` #23 to reflect the SVG shot-path visual; Mapbox is used in Travel (#10), not Round Review. |
| INFO | revalidation | round-review-system.ts:1548-1550 | `generateAndStoreRoundReview` is invoked client-side (auto-gen) and its `revalidatePath` calls do not refresh the client `RoundReviewPage` state directly — the page instead sets `storedReview` from the returned object (page:421). | None — the page correctly hydrates from the action return value, so revalidate-vs-client-state is a non-issue here; noted for completeness. | No action. |

---

### States / controls / cross-links checks

- **Loading**: dedicated review page has a full skeleton (review/page.tsx:508-589) with shimmer + "Analyzing your round…" copy; `RoundReviewViewer` and `HoleByHoleShotPaths` both have skeletons. Good (not bare spinners).
- **Empty**: `EmptyState` "Round not found" with Back-to-Rounds CTA (page:613-628); `HoleByHoleShotPaths` shows an honest "No shot-level data was logged" message (line 102-107). Good.
- **Error**: dedicated page renders a red error with "Try Again" → re-runs `generateReview` (page:593-608). `RoundReviewViewer` has its own error card. Good.
- **Interactive controls**: Refresh button → `generateReview()` (wired); Share → `shareRoundReviewWithCoach` (wired, optimistic reconcile); `PromoteToFocusAreaButton` (wired to development action); bottom "Round Detail"/"All Stats" links resolve to real routes (`/rounds/[id]`, `/dashboard/stats`); breadcrumbs all resolve. No dead controls found.
- **Pagination**: `HoleByHoleShotPaths` (line 46) and the engine shot fetch (round-review-system.ts:1440) read `golf_shots` for ONE round without `.range()` — a single round is ~70-110 shots, far under the 1000-row PostgREST cap, so no truncation risk here. (Noted, not a finding.)
- **Mobile/offline**: bottom action bar is fixed/mobile-aware with `--golf-mobile-bottom-nav-offset`; min-44px touch targets on Refresh. No unload-save concern on this read surface.
- **CORRECTNESS**: 9-hole rounds are 18-normalized before grading/putt comparison (round-review-system.ts:834-835, page:642-645) — avoids the "16 putts vs 32-avg" bug; null-honest averages (no fabricated benchmarks); momentum/scoring-distribution buckets are mutually exclusive and finite-guarded. Math is sound.

**Verdict**: core flow is correctly wired with sound role-gating, auth, non-destructive upserts, and honest stats. The two MEDIUM items (dead team-average wiring; over-broad anon grant) and the orphaned SG component are the only real issues; the rest is doc drift.
