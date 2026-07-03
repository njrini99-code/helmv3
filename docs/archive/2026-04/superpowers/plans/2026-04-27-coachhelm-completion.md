# CoachHelm Completion Plan — 2026-04-27

> **Mode:** parallel execution by 9 agents with strict file ownership. Single feature branch, no sub-branches.

**Goal:** Close all 33 findings from tonight's review so CoachHelm is fully wired, optimized, and free of phantom tables/dead exports.

**Architecture:** 8 implementer agents own non-overlapping file sets + 1 DB-operator agent runs in parallel triggering crons, probing RLS, and running backfills. No two agents touch the same file. Coordination happens via stable function signatures defined in this plan.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, TypeScript strict, Tailwind, framer-motion.

---

## File ownership (locked — do not cross)

| Agent | Owns (read+write) |
|---|---|
| **A1 — Backend Perf + Cron** | `src/app/golf/actions/coachhelm-analytics.ts`<br>`src/lib/coachhelm/v2/analytics/effectiveness-writer.ts`<br>`src/lib/coachhelm/v2/analytics/prediction-performance-writer.ts`<br>`src/app/api/cron/coachhelm-insight-lifecycle/route.ts` |
| **A2 — Engine Optimization** | `src/lib/coachhelm/v2/orchestrator.ts`<br>`src/lib/coachhelm/v2/mining/shot-pattern-miner.ts`<br>(read-only investigation of post-round-save trigger paths) |
| **A3 — Round Review Pipeline** | `src/hooks/coachhelm/useRoundReviewV2.ts`<br>`src/app/golf/actions/round-review-system.ts` |
| **A4 — My Development Feature** | `src/app/golf/actions/development.ts`<br>`src/app/golf/(dashboard)/dashboard/my-development/page.tsx`<br>`src/app/golf/(dashboard)/dashboard/my-development/LogProgressButton.tsx` |
| **A5 — Promote-to-Focus-Area + Round Review UI** | `src/components/golf/coachhelm/PromoteToFocusAreaButton.tsx` (NEW)<br>`src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx`<br>`src/components/golf/coachhelm/insight-card/InsightCard.tsx` |
| **A6 — Player Dashboard + Analytics Glass** | `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx`<br>`src/components/golf/coachhelm/analytics/AnalyticsSummaryCards.tsx`<br>`src/components/golf/coachhelm/analytics/InsightEffectivenessPanel.tsx`<br>`src/components/golf/coachhelm/analytics/PatternImpactPanel.tsx`<br>`src/components/golf/coachhelm/analytics/PredictionAccuracyPanel.tsx` |
| **A7 — Phantom Tables + Settings + Drills + Intel** | `supabase/migrations/<TIMESTAMP>_drop_phantom_tables.sql` (NEW)<br>`src/app/golf/actions/insights.ts` (team_coachhelm_settings writer)<br>`src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/page.tsx`<br>`src/app/golf/actions/drills.ts`<br>`src/app/golf/actions/intelligence-dashboard.ts`<br>`src/app/golf/actions/pattern-management.ts` |
| **A8 — Type debt + orphan cleanup** | `src/lib/types/database.ts` (regenerate)<br>Top 5 cast-heavy CoachHelm files: surgical removal of `as any`/`as unknown` casts (A8 must NOT touch logic — only cast cleanup) |
| **OP — DB Operator (no code edits)** | DB-only: trigger crons, probe RLS, run backfill script `scripts/backfill-insight-effectiveness.ts` (NEW), root-cause pattern miner stall |

**Inter-agent contract (locked signature)** — A4 publishes; A3, A5 consume:

```typescript
// development.ts — A4 must ship this signature
export async function updateFocusAreaProgress(
  focusAreaId: string,
  newValue: number,
  options?: { note?: string }
): Promise<{ success: boolean; error?: string }>;

export async function createFocusAreaFromReview(args: {
  playerId: string;
  reviewId: string;
  title: string;
  description: string;
  areaType: string;
  targetMetric?: string;
  targetValue?: number;
  reviewContext?: string;
}): Promise<{ success: boolean; focusAreaId?: string; error?: string }>;

export async function createFocusAreaFromInsight(args: {
  playerId: string;
  insightId: string;
  title: string;
  description: string;
  areaType: string;
  targetMetric?: string;
  targetValue?: number;
}): Promise<{ success: boolean; focusAreaId?: string; error?: string }>;

export async function completeFocusArea(focusAreaId: string): Promise<{ success: boolean; error?: string }>;
```

`progress_notes` jsonb format (locked):
```json
{
  "entries": [{ "at": "ISO ts", "value": 12.3, "note": "string|null" }]
}
```

---

## Findings → assignment matrix

| # | Finding (severity) | Agent |
|---|---|---|
| C1 | Cron not yet ticked → analytics tables empty | OP (trigger) + A1 (verify writer correctness) |
| C2 | Pattern miner stalled since 2026-04-14 | OP (root cause) + A2 (fix call site if needed) |
| C3 | Lifecycle never advances (0/240 with resolved_at) | A1 (review evaluateRow thresholds) + OP (run cron) |
| C4 | LogProgressButton drops note silently | A4 |
| H1 | from_review_id / from_insight_id columns dead | A4 (action) + A5 (CTA) |
| H2 | golf_insight_player_feedback 0 rows in prod | OP (RLS probe) |
| H3 | golf_insight_feedback_scores has no writer | A7 (drop table) |
| H4 | golf_review_insights phantom | A7 (drop table) |
| H5 | golf_team_coachhelm_settings no writer / no UI | A7 |
| H6 | useRoundReviewV2 race condition | A3 |
| H7 | effectiveness writer non-idempotent | A1 (convert to upsert) |
| H8 | lifecycle cron sequential UPDATEs + no pagination | A1 |
| H9 | coachhelm-analytics 7 serial count queries | A1 |
| H10 | shot-pattern-miner select(*) | A2 |
| M1 | Analytics panels not glass-premium | A6 |
| M2 | useRoundReviewV2 zeroed playerAverages | A3 |
| M3 | PlayerCoachHelmDashboard handleRefresh swallows errors | A6 |
| M4 | LogProgressButton uses showToast 2-arg API | A4 |
| M5 | Round review skeleton lies about CoachHelm | A5 |
| M6 | Refresh button rotates entire button | A6 |
| M7 | Duplicate "Stats" CTA labels | A5 |
| M8 | Completed focus-area date hidden mobile | A4 |
| M9 | Analytics card stagger 800ms | A6 |
| M10 | recordDrillAddedToPlan log-only | A7 |
| M11 | outcome_measured_at / outcome_status never written | A1 (writer in evaluateRow) |
| M12 | MobileNavHeader hidden during gen | A5 |
| L1 | 5 orphaned exports (pattern-mgmt, intel-dashboard) | A7 |
| L2 | 80 `as any` casts | A8 |
| L3 | analytics select(*) | A1 |
| L4 | orchestrator fetchPlayerStats called twice | A2 |
| L5 | orchestrator sequential mining steps | A2 |
| L6 | shot-pattern-miner upsert-in-loop | A2 |
| L7 | round-review-system racy upsert | A3 |

Backfills:
- BF1 historical insight_effectiveness — OP via `scripts/backfill-insight-effectiveness.ts`
- BF2 historical prediction_model_performance — naturally fills in 30 days via OP cron tick

---

## Per-agent execution checklists

### A1 — Backend Perf + Cron (4 files)

- [ ] `coachhelm-analytics.ts:670-712` — collapse 7 serial count queries into one `select` with conditional aggregates (or single `Promise.all`). Verify return shape unchanged.
- [ ] `coachhelm-analytics.ts:197, 341, 723` — narrow `select('*')` to actual consumed columns.
- [ ] `effectiveness-writer.ts:193-234` — replace delete-then-insert with `.upsert(rows, { onConflict: 'team_id,insight_type,period_start,period_end' })`. Use the existing unique index.
- [ ] `effectiveness-writer.ts` — add writer that derives `outcome_status` for each insight when validating: read insight + subsequent stats delta → set `outcome_measured_at`, `outcome_status` ('improved'|'unchanged'|'regressed') on the original `golf_coach_insights` row.
- [ ] `prediction-performance-writer.ts` — same `.upsert` conversion.
- [ ] `coachhelm-insight-lifecycle/route.ts:84` — confirm `lifecycle_state IN ('tentative','detected','matured','addressed')` covers all real states. If `golf_coach_insights` query reveals other states, expand the IN list.
- [ ] `route.ts:113-138` — add pagination loop (offset by 2000) until empty.
- [ ] `route.ts:135-138` — group `evaluateRow` results by destination state, do bulk `UPDATE ... WHERE id IN (...) SET ...` per group instead of per-row.
- [ ] After A1 completes, OP triggers cron and verifies row count > 0.

### A2 — Engine Optimization (2 files + investigation)

- [ ] Investigate why pattern miner has not produced new rows since 2026-04-14. Trace `orchestrator.ts → ShotPatternMiner.analyzeShotPatterns()` invocation: who calls `orchestrator.analyzePlayer()`? Check round-save action, cron, edge function. Report root cause to user (file:line).
- [ ] `orchestrator.ts:214-263` — wrap independent mining steps in `Promise.all`: `PatternMiner.minePatterns`, `ShotPatternMiner.analyzeShotPatterns`, `analyzeLieSpecificMissPatterns`, `ShotStateIntelligence.analyze`, `CausalEngine.discoverCausalRelationships`, `PerformancePredictor.predictPerformance` all take only `playerId`.
- [ ] `orchestrator.ts:1560` — cache `fetchPlayerStats` result on the orchestrator instance; remove second call.
- [ ] `shot-pattern-miner.ts:155-160` — replace `select('*')` with explicit projection (`id,round_id,hole_number,shot_number,shot_type,club_type,lie_before,distance_to_hole_before,distance_unit_before,distance_to_hole_after,distance_unit_after,miss_direction,shot_distance,result`).
- [ ] `shot-pattern-miner.ts:716-770` — replace per-row upsert in loop with single batch `.upsert(rows, { onConflict: 'id' })`.
- [ ] If pattern miner stall is a missing call site, fix it (one line) — otherwise leave for OP/user.

### A3 — Round Review Pipeline (2 files)

- [ ] `useRoundReviewV2.ts:189-194` + `:428-436` — eliminate the 3-second timeout + auto-retry race. Replace with: single `inFlightRef` guard; if `generate()` is already pending, return its promise; otherwise create one and store in ref.
- [ ] `useRoundReviewV2.ts:285-312` — remove the zeroed `playerAverages` fallback. Either return `null`/`undefined` for `playerAverages` (consumers must handle), or always populate from real `getStatAverages` call before returning. Change the type so consumers can't accidentally render zeros.
- [ ] `round-review-system.ts:1389-1393` — replace select-then-update/insert with single `.upsert(payload, { onConflict: 'round_id', ignoreDuplicates: false })`. Confirm `golf_round_reviews_round_id_unique` index exists (it does — from index audit).
- [ ] Run `npm run typecheck` after edits.

### A4 — My Development Feature (3 files)

- [ ] `development.ts` — extend `updateFocusAreaProgress(id, value, options?: {note?: string})`. When note provided, append to `progress_notes.entries` array (use `jsonb_set` or read-modify-write).
- [ ] `development.ts` — add `createFocusAreaFromReview` and `createFocusAreaFromInsight` per locked signature above. Each writes `from_review_id` or `from_insight_id` and sets `coach_curated=false` (column missing — verify schema; if not present, just don't set).
- [ ] `development.ts` — add `completeFocusArea(id)` that sets `status='completed', completed_at=now()`. Don't reuse the orphaned `resolveFocusAreaAndInsight`.
- [ ] `LogProgressButton.tsx` — replace `showToast(msg, type)` with `addToast({ type, title })` for all 4 toast call sites.
- [ ] `LogProgressButton.tsx` — pass `note` (when non-empty) to the action via the new `options.note` parameter. Remove the "not yet saved server-side" hint copy.
- [ ] `my-development/page.tsx:330` — remove `hidden sm:block` from completion-date span so mobile shows it.
- [ ] `my-development/page.tsx` — add "Mark complete" button on each active focus area card → calls `completeFocusArea`. Place next to "Log progress".
- [ ] Run `npm run typecheck`.

### A5 — Promote-to-Focus-Area + Round Review UI (3 files, 1 NEW)

- [ ] CREATE `src/components/golf/coachhelm/PromoteToFocusAreaButton.tsx`. Props: `{ source: 'review' | 'insight', sourceId: string, playerId: string, suggestedTitle: string, suggestedDescription: string, suggestedAreaType: string }`. Calls `createFocusAreaFromReview` or `createFocusAreaFromInsight`. Bottom-sheet UI with editable title/description before confirming. Shows toast on success.
- [ ] `rounds/[id]/review/page.tsx` — add `<PromoteToFocusAreaButton source="review" ... />` near the "Areas to Improve" section.
- [ ] `review/page.tsx` — render `MobileNavHeader` outside the loading early-return so Refresh stays visible during generation; spinner inside icon only.
- [ ] `review/page.tsx:366-370` — read `isV2Enabled` from server-passed prop, not async hook, so loading copy is correct from frame 0.
- [ ] `review/page.tsx:539, 545` — rename CTAs from "View Full Stats" / "View Stats" → "Round Detail" / "All Stats".
- [ ] `review/page.tsx:447-452` — drop `hidden sm:flex` on CoachHelm AI badge so mobile users see it.
- [ ] `insight-card/InsightCard.tsx` — add `<PromoteToFocusAreaButton source="insight" ... />` to the insight card's footer actions area (next to existing actions).
- [ ] Run `npm run typecheck`.

### A6 — Player Dashboard + Analytics Glass (5 files)

- [ ] `PlayerCoachHelmDashboard.tsx:185-189` — replace `catch {}` in `handleRefresh` with `catch (e) { addToast({ type: 'error', title: 'Refresh failed', description: 'Try again in a moment' }); }`.
- [ ] `PlayerCoachHelmDashboard.tsx:317-319` — change `refreshing && 'animate-spin pointer-events-none'` so only the inner `<IconRefresh>` spins. Match `stats-client.tsx:1059-1062` pattern.
- [ ] `AnalyticsSummaryCards.tsx:87-99` — change `delay: index * 0.1` → `delay: index * 0.04`. Tighten cumulative animation to ~200ms.
- [ ] `AnalyticsSummaryCards.tsx`, `InsightEffectivenessPanel.tsx`, `PatternImpactPanel.tsx`, `PredictionAccuracyPanel.tsx` — replace `bg-white rounded-xl border border-warm-100` (and similar) with `bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass`. Apply consistently to all panel containers AND inner stat tiles.
- [ ] Run `npm run typecheck`.

### A7 — Phantom Tables + Settings + Drills + Intel (6 files, 1 NEW migration)

- [ ] CREATE `supabase/migrations/<TS>_drop_phantom_tables.sql` — `DROP TABLE IF EXISTS golf_review_insights CASCADE; DROP TABLE IF EXISTS golf_insight_feedback_scores CASCADE;`. Apply via `mcp__claude_ai_Supabase__apply_migration` to project `qmnssrrolpinvwjjnufo` after user confirmation. *If user prefers to keep them, A7 instead writes the missing INSERT writers — default to drop unless user objects.*
- [ ] `insights.ts` — add `getOrCreateTeamCoachHelmSettings(teamId)` that returns the row, inserting a default `{ enabled: true, gate_strict: false }` if missing. Add `updateTeamCoachHelmSettings(teamId, partial)`.
- [ ] `coaching-intelligence/page.tsx` — add a "Team CoachHelm Settings" section with a toggle for "Enabled" and any other column that exists on `golf_team_coachhelm_settings`. Wire to the new actions. Add `revalidatePath` on save.
- [ ] `drills.ts:158-181` — `recordDrillAddedToPlan` — INSERT into `golf_insight_drill_attachments` (or appropriate table — verify which table tracks plan adoption; if no table, add `attached_at IS NOT NULL` column or write to `golf_drill_engagement_events` if present). Whatever the right table is, replace the log-only with a real DB write. Keep auth check.
- [ ] `intelligence-dashboard.ts:509-535` `generateTeamCorrelations` — choice: (a) compute real Pearson correlations from `golf_player_stats_cache` across team members for fairways/greens/putting/scoring, OR (b) return `[]` and have the consumer hide the tab when empty. **Default to (b)** — flag for follow-up if (a) is preferred.
- [ ] `pattern-management.ts` — DELETE these orphaned exports (no callers per audit): `getPlayerPatternsExtended`, `updatePatternNotes`, `createFocusAreaFromPattern`. Remove imports of deleted functions if any.
- [ ] `intelligence-dashboard.ts` — DELETE `generateTeamCorrelations` if going with option (b); replace consumers with `[]` literal.
- [ ] `pattern-management.ts` / `development.ts` — DELETE `resolveFocusAreaAndInsight` (orphan).
- [ ] Run `npm run typecheck`.

### A8 — Type debt cleanup (cast removal only)

- [ ] Run `npx supabase gen types typescript --project-id qmnssrrolpinvwjjnufo > src/lib/types/database.ts`. Diff vs prior — add re-exports if any new tables created tonight.
- [ ] Top 5 cast-heavy files — surgical replacement of `as any`/`as unknown` with proper types from regenerated `database.ts`. **A8 must not touch business logic** — only types. Files (10/10/8/7/6 casts):
  - `src/app/golf/actions/round-review-system.ts`
  - `src/lib/coachhelm/v2/nlg/insight-composer.ts`
  - `src/lib/coachhelm/v2/learning/cross-learner.ts`
  - `src/lib/coachhelm/v2/orchestrator.ts`
  - `src/lib/coachhelm/v2/gate.ts`
- [ ] **Coordination**: A8 starts AFTER A1, A2, A3 commit (since they own some of these files). A8 receives a "go" message from main thread once those agents are ✅.
- [ ] Run `npm run typecheck` after each file.

### OP — DB Operator (no code edits)

- [ ] Probe `golf_insight_player_feedback` RLS: try inserting a test row as a real player session via Supabase. If blocked by RLS, identify failing policy and report file:line of the migration.
- [ ] Trigger lifecycle/analytics cron once A1 commits: `curl -H "Authorization: Bearer $CRON_SECRET" https://<prod>/api/cron/coachhelm-insight-lifecycle`. Verify `golf_insight_effectiveness` and `golf_prediction_model_performance` get rows.
- [ ] Verify `golf_coach_insights` lifecycle now has rows with `resolved_at`, `acknowledged_at`, `outcome_status`. Report counts.
- [ ] Investigate pattern miner stall: query `golf_rounds` `created_at >= '2026-04-14'` to see if rounds have happened. If yes, miner call site is broken (handoff to A2).
- [ ] CREATE `scripts/backfill-insight-effectiveness.ts` that loops `rollupInsightEffectivenessForRange(supabase, day, day+1)` for each day in `[earliestInsight.created_at, yesterday]`. Run it after A1 commits.
- [ ] Final DB sanity: re-run the row-count queries from `_DB_SANITY.md` and produce a delta report.

---

## Run order (waves)

**Wave 1 (parallel, all spawn at once):** A1, A2, A3, A4, A5, A6, A7, OP
- A5 may need A4's signature — A4 is instructed to ship the signature first; A5 can stub-call it without blocking.
- OP runs DB ops + investigations that don't depend on code commits.

**Wave 2 (after Wave 1 commits):** A8
- A8 depends on Wave 1 agents committing their files first (since A8 touches some of the same files for cast cleanup).
- OP also runs cron trigger + backfill in Wave 2 after A1 commits.

**Wave 3 (integration check):**
- Main thread runs `npm run typecheck && npm run lint && npm run build`.
- OP re-runs DB sanity.

---

## Verification gates

Each agent reports back:
1. Files changed (with line ranges).
2. Tests run / typecheck pass.
3. Any ownership boundaries violated (must be zero).
4. Any unblocked findings deferred (with reason).

Main thread aggregates, runs typecheck across the whole tree, then OP re-verifies DB.
