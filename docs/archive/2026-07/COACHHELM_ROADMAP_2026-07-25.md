# CoachHelm Insight Delivery — Roadmap
2026-07-25

> ## ⚠️ CONTROLLER CORRECTION — read before acting on §1 or §2.1
>
> This roadmap was produced by a 14-agent workflow. Its §1 headline and §2.1
> "fix first / HIGH" item **do not survive verification against production**,
> and its stated root cause is not the real one. Corrected 2026-07-25 by
> direct query.
>
> **What §1 claims:** an entire v2 alert vocabulary (`bubble_player`,
> `pattern_detected`, `team_trend`, …) is generated daily and permanently
> hidden because the v2 write path never stamps `engine_version='v3'`, so
> `applyInsightVisibility` rejects it — "101 of 548 rows, ~18%", with rows
> "generated as recently as this morning (03:45 UTC)".
>
> **What the data shows:**
> - There are indeed 101 v2 rows. But **every one of them has `status` of
>   `resolved` or `dismissed`** — 28 resolved/resolved, 27 archived/dismissed,
>   26 archived/resolved, 20 detected/resolved. **Zero are active.**
> - So the count of v2 rows that would become visible if the engine gate were
>   removed is **0**. The gate is redundant for these rows, not causal — they
>   are already excluded by the status gate, which is correct behaviour.
> - "Generated as recently as this morning" is a misreading of `updated_at`
>   (the lifecycle cron touching existing rows) as creation time. The newest
>   v2 row was **created 2026-07-21**, and even it is `status='resolved'`.
>
> **Consequence:** §2.1 proposes repointing a shared v2 upsert path or
> relaxing the visibility filter — a Medium-risk change to a write path with
> multiple callers — for **zero user-visible gain today**. Do not do it as
> written. The underlying code observation is real and worth a cheap guard
> (if a v2 generator ever emits an `active` row it would be invisible), but
> it is not the top priority and it is not what is hurting coaches.
>
> **The actual root cause** is documented in
> `COACHHELM_ROOT_CAUSE_ROUND_ANALYSIS_STALL_2026-07-25.md`, which this
> workflow was launched too early to know about: 200 completed rounds sit
> stranded outside the safety-net cron's 30-day lookback window, so 69% of
> rounds were never analysed, so 96% of visible insights are 31-60 days old.
> Display caps then truncate that stale remainder (player sees 6, coach sees
> 2 of ~10.5 per player).
>
> §2.2 (blank `OutcomeBadge` on every card — `outcome_status` null on all 548
> rows), §2.3 (orphaned insights, though it says 3 players/17 rows where I
> verified 2 players/5 rows among *visible* insights), §2.4 (no RLS backstop
> on visibility state) and §2.5 (Triage Desk's missing evidence guard,
> correctly marked 0 rows affected) were not contradicted by my checks and
> are worth reading. §3 "land the work already done" is the section with the
> best value-to-effort ratio — but re-verify each DEAD verdict first: the
> sweep agents were given a flawed instruction of mine ("a barrel re-export
> is not a consumer"), which produced at least seven false DEAD verdicts
> elsewhere, all of them live via `FairwayPlayerInsight.tsx:61`.

## 1. The answer

No, not reliably — and there is one structural reason, not a grab-bag of bugs. Every live surface (Triage Desk, player Hub, per-player Scouting Report, round-review, roster card, morning-digest email) reads insights through exactly one shared gate, `applyInsightVisibility` (`src/lib/coachhelm/v3/insight-visibility.ts:34,38,77-82`), which only admits rows stamped `engine_version='v3'`. That gate is correctly doing its job on genuinely broken legacy output. The problem is that an entire family of v2 insight generators is still actively firing in production today — `bubble_player`, `pattern_detected`, `streak`, `surge_player`, `plateau`, `tournament_pressure`, `closing_holes`, `par_3_issues`, `recurring_weakness`, `team_trend`, `scoring_decline` — the whole team-management alert vocabulary, with no v3 replacement for any of it. It's wired to production via `triggerPlayerInsightsAfterRound` and the `coachhelm-roster-sweep` cron (`vercel.json:57-58`), writes through `upsertInsight()` (`src/app/golf/actions/insights.ts:1054`, `:4134-4136`), and that path never calls `upsertInsightV3` — so `engine_version` stays at its DB default `'v2'` forever. Rows generated as recently as this morning (`bubble_player`/`pattern_detected` `most_recent_update` = 2026-07-25 03:45 UTC, matching the cron's own schedule) are permanently invisible on every gated surface, including the Alert Center whose own code comment says it exists specifically to exclude "stale v2 phantoms" — collateral damage that also kills these live, correct rows. Two write paths feed one table; one read gate trusts only one of them; nobody repointed the write path when the gate went up. Everything else in this audit — dead components, discarded computations, fields nobody reads — is the same "built correctly, wired to nothing" disease recurring at other layers, but this is the one instance actively costing a coach real information, every day, at scale (101 of 548 rows, ~18%, and 100% of this alert vocabulary specifically).

## 2. Fix first

Ordered by user impact — these are cases where a coach or player is currently shown nothing, or shown a blank/broken control, on a live screen.

### 2.1 A whole alert vocabulary is invisible, forever — HIGH
- **Wrong:** `bubble_player`, `pattern_detected`, `streak`, `surge_player`, `plateau`, `tournament_pressure`, `closing_holes`, `par_3_issues`, `recurring_weakness`, `team_trend`, `scoring_decline` insights are generated correctly today (confidence 0.85-0.9, real sample sizes) but never pass the v3 engine filter because their writer never stamps `engine_version='v3'`. No coach ever sees a "player at risk of losing roster spot" or "team-wide pattern" alert. `src/app/golf/actions/insights.ts:1054,4134-4136`; filter at `src/lib/coachhelm/v3/insight-visibility.ts:34`.
- **Fix:** Repoint this write path through `upsertInsightV3` (`src/lib/coachhelm/v3/insights/upsert-v3.ts:52-58`), or relax the visibility filter for this specific generator family until a v3 replacement exists.
- **Size:** Medium — touches the shared v2 upsert path and its callers; needs care not to break the fields the v2 shape still legitimately owns.

### 2.2 The "did this work" badge on every insight card is permanently blank — MEDIUM
- **Wrong:** `OutcomeBadge` renders on every card (`InsightCard.tsx:466,605`) but reads `outcome_status`, which is `null` on 548/548 prod rows today because `metricToRoundField` (`src/lib/coachhelm/v2/analytics/effectiveness-writer.ts:326-354`) only knows v2 metric names — v3 rows use IDs like `sg_ott`, `opening_hole_delta`, `practice_tournament_delta` that never match. Separately, `mapRowToEvidenceInsight` doesn't even copy `outcome_status`/`outcome_measured_at` into the object the UI receives (`insight-delivery.ts:1504-1542`).
- **Fix:** Extend `metricToRoundField` to cover v3 metric IDs, and copy the two fields through in `mapRowToEvidenceInsight`.
- **Size:** Small — two files, both changes required together (fixing one without the other still shows nothing).

### 2.3 A player's first insight can be permanently invisible to every coach — MEDIUM
- **Wrong:** 3 players / 17 rows have `coach_id=NULL AND team_id=NULL` because `resolvePlayerOwnership()` found no active roster row at generation time (`src/lib/coachhelm/v2/insights/upsert.ts:451-468`). Coach access is checked against the player's *live* team membership, not the insight's own columns, so if a player logs a round before being rostered (confirmed: one case, 2 days after signup), the insight is generated, correct, and then dismissible/resolvable by no coach, indefinitely.
- **Fix:** Re-resolve ownership against current membership at read time (not just write time), or have `verifyPlayerAccess`/RLS fall back to a live join instead of the row's stale null columns.
- **Size:** Medium — this is a structural onboarding-order gap, not a one-off data fix; will recur for every future player in the same sequence.

### 2.4 No database-level backstop on which insights are showable — MEDIUM (latent)
- **Wrong:** All 5 RLS policies on `golf_coach_insights` gate on ownership only (`coach_id`/`team_id`/`player_id` joins) — none reference `lifecycle_state`, `status`, or `engine_version`. The *only* thing keeping archived/tentative/v2-phantom rows off a coach's screen is `applyInsightVisibility` being called correctly at all ~20 read sites.
- **Fix:** Either enforce state checks in RLS as a second line of defense, or add a lint/test that fails CI if a new query against this table skips `applyInsightVisibility`.
- **Size:** Medium — not an active symptom today (all traced call sites are correct), but one missed call site anywhere is a silent leak with no safety net.

### 2.5 Triage Desk skips a null-evidence guard the other 4 fetchers apply — LOW (latent, 0 rows affected today)
- **Wrong:** `getSignalGroups` (`src/app/golf/actions/signal-groups.ts:130-139`) is missing the `.not('evidence','is',null)` clause present at 4 other fetch sites in `insight-delivery.ts`. Verified live: 0 rows in prod currently match the gap.
- **Fix:** Add the same one-line predicate for consistency, before it becomes a live symptom.
- **Size:** Small.

## 3. Land the work already done

This is the cheapest value in the codebase — fully built, correct, tested features sitting on the shelf because nothing calls them. No new logic to write, just wiring.

### 3.1 InsightTrustChips — a finished "did this insight work" indicator, rendered nowhere
`src/components/fairway/pages/coachhelm/InsightTrustChips.tsx` (L129-206) is complete and correct. Its data source, `getInsightTrustSignals` (`src/app/golf/actions/coachhelm-analytics.ts:1352`, wrapping `getInsightEffectivenessSignals` at `event-ledger.ts:276`), is already proven end-to-end in production — it's called today from `FairwayEffectiveness.tsx:1426`, a component that is *itself* dead (zero live renderers). So the working data pipe currently feeds a dead screen instead of the live one.
- **Where to wire it:** `FairwayPlayerInsight.tsx:866,871` — the confirmed live coach render site. Add a `trustSignal` prop to `InsightCard`, batch-fetch via the existing `'use server'` boundary (`insight-delivery.ts`, not `event-ledger.ts` directly — that module has no directive and uses an admin client, so it can't be called from the `'use client'` `FairwayPlayerInsight.tsx`).
- **Size:** Small–Medium (3-4 files: `InsightCard.tsx`, `insight-delivery.ts`, `FairwayPlayerInsight.tsx`, repeat for `HubInsightSignalCard.tsx`/`FingerprintHero.tsx` if desired).

### 3.2 coach-behavior.ts — a full learned-preferences engine, connected to nothing
`src/lib/coachhelm/v2/feedback/coach-behavior.ts` (281 lines: `derivePreferences`, `prioritizeForCoach`, `recordAction`, `queryActions`) is fully built, unit-tested, and exported. `golf_coach_behavior_log`, its backing table, has **zero rows ever written in production** — the strongest possible confirmation nothing calls it. This is also the real fix for the already-known "BehaviorLearner result fetched and discarded in the orchestrator" defect — but note it's a *different, cleaner* system than the old `BehaviorLearner` class (see §5, that one is blocked).
- **Where to wire it:** Call `recordAction()` from the existing click handlers that already call `recordInsightAction` (`InsightCard.tsx`, `HubInsightSignalCard.tsx`). In `orchestrator.ts`'s `generateAlerts()`, replace the currently-discarded `behaviorLearner.getLearnedPreferences()` call with `queryActions → derivePreferences → prioritizeForCoach` to reorder alerts before final sort.
- **Size:** Small — bounded, mirrors an existing load-then-use pattern already in the same function, no migration needed (table is empty).

## 4. Make it smarter

Ordered by value per unit of work. Dependencies called out explicitly.

1. **Fix the 3 hardcoded `sample_n` literals in composite rules** (`short-approach-proximity-gap.ts:77`, `bunker-miss-side-amplifier.ts:117`, `long-approach-3putt-cascade.ts:85`) — copy the real pattern already used correctly by `lag-distance-3putt.ts:78-89`. Small, single-file-each, no new design. `short-approach-proximity-gap` is live today; `bunker-miss-side-amplifier` won't have a visible effect until a separate, unlisted putt-bias generator gap is fixed (its own file header already documents this as dormant).
2. **Make composite insights show the "why" panel** — none of the 10 composite rules set `evidence.diagnosis`, so `DiagnosisPanel` never renders for them. One-file fix: have `synthesis.ts`'s `normalizeCompositeEvidence` call the existing `buildDiagnosis()` helper (`generator-base.ts:267-292`), exactly as single-metric rules already do. Small, high leverage (fixes all 10 rule types at once).
3. **Make WhyPopover honor `confidence_factors.factors_measured`** — the flag is already correctly computed and written (`generator-base.ts:505-514`), just never read in `WhyPopover.tsx`'s `formatFactors` (`:226-236`). ~10-line fix, one file.
4. **Fix proactive notifications — both channels almost never fire.** Push only sends on `lifecycle_state` transition to `matured`/`resolved` (prod: 17 matured, 0 addressed, ever). The morning digest's top slot requires the same states and skips the whole email if empty. Both fixable by reusing patterns already proven elsewhere in the same files (an existing `'detected'`-state fetch is already used for the digest's "watch" slot). Small.
5. **Replace the morning digest's hand-rolled ranking with the canonical `rankEvidenceInsights`.** The digest's own query doesn't even fetch `priority`, so its urgent-short-circuit logic can't work regardless of ranking method. Requires widening the `select()`, not just swapping a function call. Medium.
6. **Feed the self-improving feedback loop real data.** `orchestrator.ts:586,589` passes a hardcoded `[]` and `feedbackAdjustment: 0` where real `golf_insight_action`/`golf_insight_outcome` data should go. Small code change — but live data is currently 3 rows total, all `create_focus`, so this fixes the pipe with no water in it yet; value grows as usage grows.
7. **Wire `CrossLearner.transferLearning` for cold-start players.** Fully built and unused (`cross-learner.ts:262-359`); gate a call on a player's rounds-in-window falling under the existing 8-round floor genome dimensions already use. Closes a real "player has no history yet" gap. Small–Medium.
8. **Raise the player CoachHelm 6-insight hard cap.** `coachhelm/page.tsx:214` requests `limit: 6`; `InsightsDrill.tsx` already just renders whatever array it's handed, no pagination infra needed for a first pass — raise the limit. Small, quick UX win.
9. **Stop reusing one confidence-calibration bucket across unrelated reasoning types.** Same disease as the two already-fixed calibrator bugs, one layer down: `orchestrator.ts` bootstraps a single calibrator keyed to `'score_to_par'` and reuses it for `pattern_detected`/`performance_change`/shot-pattern reasoning too. Medium — and be aware going in: 3 of the 4 buckets will be *permanently* empty after the fix, because `performance-predictor.ts` (the only writer of `golf_predictions`) only ever writes `metric: 'score_to_par'` — there's no validation pipeline that could ever populate the others. The fix converts silent mislabeling into honest raw-confidence passthrough for those types; it does not make them genuinely calibrated.
10. **Give the player genome a downstream effect on goal/practice-rx selection.** Currently zero connection between `golf_player_genome` and either system. `recent_weakness` on `PracticeRxInput` is defined but never populated by either live caller today, so wiring genome in here fills a gap, doesn't replace anything. Medium-Large — needs a new dimension-to-metric crosswalk table that doesn't exist yet.
11. **Make the "what's new" feed discoverable outside command-palette search.** Don't just re-add it to the nav rail — a named test (`nav-registry.test.ts:369-378`) explicitly asserts it was deliberately pulled from the rail. Confirm why before building; a badge/bell on the CoachHelm home is the safer smallest version that avoids re-litigating that decision. Small, but investigate first.

## 5. Not worth doing

- **Wire `BehaviorLearner.getLearnedPreferences()` (the old class, `learning/behavior-learner.ts`) into alert suppression.** Blocked: the writer-key bug means `byInsightType` collapses into one degenerate `'unknown'` bucket for all real interaction volume today (DB-verified: 10 `action` rows, 0 carry an `insight_type` key). Building this now would ship a permanently undifferentiated signal — exactly the disease this remediation targets. Use §3.2's `coach-behavior.ts` instead; it's a separate, already-correct system that sidesteps the bug entirely.
- **Implement `BehaviorLearner.getPersonalizedThreshold`.** Same root blocker as above, plus even unblocked, `golf_learned_behavior` has 24 rows total in prod — too thin to move a per-type threshold meaningfully for a long time.
- **"Fixing" or reviving confirmed-dead components** — `FairwayEffectiveness`, `FairwayPlayerCoachHelm`, `FairwayMyDevelopment`, `InsightListView`, `InsightsFeed`, `DrillAttachment`, `HeroInsightCard`'s stagger wrapper, `FingerprintHero`'s `SectionBand`. All confirmed zero live renderers, all fully superseded by working replacements. Leave them alone; the risk is a future dev "fixing" the wrong copy — worth a one-time delete pass, not roadmap time. Note for whoever does that pass: there are two separately-live components both named `InsightCard` (`golf/coachhelm/insight-card/InsightCard.tsx` and `fairway/cards-insight/InsightCard.tsx`) — don't conflate them when checking what's dead.
- **`getPlayerCoachHelmDashboard`'s computed-but-unread `data.insights`.** Zero user impact — the real cards come from a separate, correctly-wired path. This is wasted server compute on every page load, not a product gap. Worth a cleanup delete, not a feature fix.
- **Re-adding "what's new" as a literal nav rail item** (as opposed to the badge/bell variant in §4.11). Contradicts an existing, intentional test assertion. Don't build this version until someone confirms the removal was a mistake, not a decision.

## 6. Summary table

| Item | Type | Size | Depends on |
|---|---|---|---|
| v2 alert-generator family invisible (never stamped v3) | defect | Medium | — |
| OutcomeBadge always blank on v3 rows | defect | Small | — |
| Cold-onboarding insights invisible (null coach/team) | defect | Medium | — |
| RLS has no state-based backstop (app-only gating) | defect | Medium | — |
| Triage Desk missing evidence-null guard | defect | Small | — (0 rows affected today) |
| Wire InsightTrustChips into live insight cards | already-built | Small–Medium | — |
| Wire coach-behavior.ts into handlers + alert suppression | already-built | Small | — |
| Fix hardcoded sample_n (3 composite rules) | defect | Small | bunker-miss variant needs separate putt-bias fix to matter |
| Composite insights skip diagnosis pipeline | enhancement | Small | — |
| WhyPopover ignores factors_measured | enhancement | Small | — |
| Proactive push/digest almost never fire | enhancement | Small | — |
| Morning digest hand-rolled ranking, missing priority | enhancement | Medium | — |
| Self-improving feedback loop fed no real data | enhancement | Small | live data volume is ~0 today |
| CrossLearner cold-start transfer unwired | enhancement | Small–Medium | — |
| Player CoachHelm hard 6-insight cap | enhancement | Small | — |
| Confidence calibration reused across types | enhancement | Medium | same disease as fixed defects #1/#2 |
| Genome has no effect on goals/practice-rx | enhancement | Medium–Large | — |
| What's-new discoverability (badge/bell) | enhancement | Small | confirm nav-removal rationale first |
| BehaviorLearner.getLearnedPreferences wiring (old class) | not worth doing | — | blocked by writer-key bug (finding #6) |
| BehaviorLearner.getPersonalizedThreshold | not worth doing | — | blocked by writer-key bug (finding #6) |
| Dead-component revival (FairwayEffectiveness et al.) | not worth doing | — | — |
| getPlayerCoachHelmDashboard dead `data.insights` | not worth doing | — | cleanup only |
| What's-new literal rail re-add | not worth doing | — | contradicts nav-registry.test.ts:369-378 |
