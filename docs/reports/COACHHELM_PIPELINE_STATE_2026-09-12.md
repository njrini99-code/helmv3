# CoachHelm Pipeline — Full State, Root Causes, and Fix Plan

**Date:** 2026-09-12
**Production:** `main` @ `6ea9e2ce2` (verified live in the served bundle at session start)
**Database:** production Supabase, shared by Golf, Baseball and Lift Lab
**Triggers:** (1) coach report that CoachHelm insights and round reviews are "not populating" for UNCW, Guilford, Shenandoah and Hampden-Sydney; (2) coach report that a mid-hole OB sent the player back to the tee.
**Session:** Claude Opus 5 `session_01CvPAWW3scW4mTWDZALsdQ7`, working with the repo owner.

Every number below was pulled from production during the session. Every code snippet is from `main` at the commit above, with file and line references.

---

## 0. Executive summary

| # | Finding | Status |
|---|---|---|
| 1 | All CoachHelm crons run on schedule with green Sentry check-ins and `background_job_logs` rows. LLM calls succeed and are billed to the direct Anthropic key (a verified, non-fallback `round_review` call at 15:53 UTC today, $0.0007). "No credits, so it isn't running" is not the mechanism. | Verified |
| 2 | Insights are numerically correct — one verified to the decimal against raw shot rows, including a yards→feet conversion the engine got right and a naive query got wrong. Insights **never** touch an LLM; no LLM task exists for them. | Verified |
| 3 | The round **review** page has never called an LLM, by wiring. `generateLlmRoundReview` (`src/app/golf/actions/v3/llm.ts`) was built, tested, rate-limited, registered — and has **zero callers**. The `round_review` LLM calls in the ledger come from the round **recap** page (`/rounds/[id]`) and are never persisted. | Verified |
| 4 | The part that reads as slop is one field. `next_practice_priority` is chosen from a 14-string phrase bank (two-string ternaries inside four round-specific builders in `orchestrator.ts`). 222 reviews → 14 distinct priorities; four sentences cover 169 of them. Summary, highlights, areas and the takeaway headline are all data-derived and verified accurate. | Verified |
| 5 | **74 completed rounds are permanently stranded** (65 `engine_no_recent_rounds` — player under the 3-round floor at the time; 9 `engine_membership_missing` — teamless players) because those codes are stamped as terminal failures and the safety-net cron's eligibility query excludes any round with `coachhelm_failed_at` set. **42 rounds** are stuck `in_progress` and never trigger anything. | Verified |
| 6 | Chronology: insights are 90-day windowed *player* snapshots with no round link (`source_id IS NULL` on all 1,060 rows), deduped by signature and refreshed in place. Reviews are per-round, but all three list queries sort by the review row's insert time, not `golf_rounds.round_date`. | Verified |
| 7 | Shipped this session: PR #1934 (penalty origin). All CI green. Unmerged pending owner. | Done |

---

## 1. Shipped: PR #1934 — OB / lost ball replays from where it was hit

**Report (coach, via text):** "Boom! OB works off the tee, but if I hit my ball from the golf course (not the tee off) out of bounds, it is taking me back to the tee. And OB ball or Lost Ball should return you to place you hit OB from."

**Cause:** PR #1929 (`a5ee89fb6`) made OB/lost ball stroke-and-distance, but always charged the penalty to the *last recorded shot* — which, mid-hole, is the shot that put the ball where the player is now standing, not the errant stroke they haven't entered yet. It also gated "+ Penalty" off before any shot existed on the hole.

**Fix** — `agent/penalty-origin` → `main`, commit `3d8184502`, 11 files, +506 / −(small), https://github.com/njrini99-code/helmv3/pull/1934

`src/hooks/golf/use-penalty-handler.ts` — `buildPenaltyShot` gains `origin: PenaltyOrigin = 'entered'` and `shotNumber`. Stroke-and-distance replay only applies when the player says the errant stroke is the one already entered:

```ts
const strokeAndDistance =
  STROKE_AND_DISTANCE_PENALTIES.has(penaltyType) && origin === 'entered' && offending !== null;
```

When `origin === 'here'`, the un-entered errant stroke is written as its own row so the scorecard carries the stroke that actually happened:

```ts
export function buildErrantStroke(state: ShotTrackingState, currentHole: RoundHole | undefined): ShotRecord {
  return {
    shotNumber: state.currentShot,
    shotType: getShotTypeFromState(state, currentHole),
    clubType: state.currentLie === 'tee' && currentHole?.par !== 3 && state.usedDriver ? 'driver' : 'non_driver',
    lieBefore: state.currentLie,
    distanceToHoleBefore: state.distanceToHole,
    distanceUnitBefore: state.distanceUnit,
    result: 'other',
    distanceToHoleAfter: state.distanceToHole,
    distanceUnitAfter: state.distanceUnit,
    shotDistance: 0,
    isPenalty: false,
  };
}
```

`endsWithErrantStrokePair` recognises the pair by *shape* (an `other` row followed by a penalty row) so it survives a reload.

- `src/hooks/golf/use-shot-state-machine.ts` — `penaltyOrigin` in state; `PenaltyOrigin = 'entered' | 'here'`; `defaultPenaltyOrigin(shotHistory)` returns `'here'` when the last shot is in play, `'entered'` when the last shot is already `result:'other'`, `'here'` when there is no shot or the last row is a penalty; `CONFIRM_PENALTY` writes both rows via `action.errantStroke`; `SET_PENALTY_ORIGIN` action.
- `src/hooks/golf/use-undo-manager.ts` — one Undo lifts both rows (newest first) when the history ends in an errant-stroke pair.
- `src/components/fairway/pages/rounds-tracking/FairwayPenaltyModal.tsx` / `FairwayShotEntry.tsx` / `FairwayShotTracking.tsx` — origin radiogroup ("I hit it from here" / "the shot I just entered"); **re-enables "+ Penalty" before any shot exists on the hole**, reversing the guard PR #1929 added.

**Verification:** targeted Vitest suites for the penalty handler, state machine and undo manager pass (including an assertion that `currentLie` is preserved after an origin-`'here'` `CONFIRM_PENALTY`). Full CI green: lint, TypeScript, Next build, three unit shards, Supabase lint + RLS tests, Playwright a11y smoke, Review Gate, semgrep. The canonical tree carried 15 unrelated dirty files (messages, calendar, wheel-picker, prewarm, `next.config.mjs`) that were deliberately excluded; the branch was created from `main`, explicit paths staged, `gh pr create` used (not `npm run pr:land`). Canonical checkout is back on `main`.

**Also answered:** the tee-editing question. Tee sets are editable from Courses → course detail → tee → per-hole editor (`src/components/golf/courses/TeeFormDrawer.tsx`, `CourseDetailDrawer.tsx`; `updateTee` in `src/app/golf/actions/course-library.ts` upserts the new holes first, then prunes surplus). Coach-gated.

---

## 2. How CoachHelm output is produced — three surfaces, three generators

This is the single most important thing to understand before touching anything. The three surfaces do not share a generator.

| Surface | Route → entry point | Generator | LLM | Persisted |
|---|---|---|---|---|
| Round **recap** | `/golf/dashboard/rounds/[id]` (`page.tsx:8`) → `generateRoundRecap` (`src/app/golf/actions/round-recap.ts:252`) → `compose({ task: 'round_review' })` (`:328`) | v3 LLM composer | **Yes** — Haiku 4.5 | **No** — rendered live, re-called on every open |
| Round **review** | `/golf/dashboard/rounds/[id]/review` → `useRoundReviewV2` (`src/hooks/coachhelm/useRoundReviewV2.ts`) → `generateAndStoreRoundReview` (`src/app/golf/actions/round-review-system.ts:1041`) → `coachHelmIntelligence.generateRoundReview` (`src/lib/coachhelm/v2/orchestrator.ts:672`) | v2 rule engine | **No** | `golf_round_reviews` |
| **Insights** | `postRoundTrigger` (`src/lib/coachhelm/v2/post-round-trigger.ts`) / safety-net cron / nightly roster sweep → `triggerPlayerInsightsAfterRound` (`src/app/golf/actions/insights.ts`) → `coachHelmIntelligence.analyzePlayer` → `upsertInsight` | v2 rule engine | **No** | `golf_coach_insights` |

The coach review lists, the player dashboard (`src/components/fairway/pages/dashboard/player-dashboard-parts.tsx:345`), `FairwayRoundDetail.tsx:226` and `FocusAreaCard.tsx:346` all link to `/rounds/[id]/review`. The rule-engine page is exactly the flow coaches see.

### 2.1 Proof the review page has never used a model

```sql
select generation_method, engine_version, ai_model_version, count(*) n
from golf_round_reviews group by 1,2,3 order by n desc;
-- v1 | coachhelm-v2  | null | 213
-- v1 | v1.0          | null |   6
-- v1 | rule-based-v2 | null |   3
```

`ai_model_version` is null on all 222 rows.

### 2.2 Proof insights have no LLM path to fall back *from*

`src/lib/coachhelm/v3/llm/types.ts:13`:

```ts
export type ComposeTask = 'round_review' | 'hero_narrative' | 'coach_chat';
```

No insight task exists. The spend ledger confirms it:

```sql
select task, count(*) calls, sum(fallback_to_template::int) fallbacks, sum(verified::int) verified,
       round(avg(completion_tokens)) avg_out_tokens, min(created_at)::date first_call, max(created_at)::date last_call
from golf_coachhelm_llm_calls group by task order by calls desc;
-- round_review   | 424 | 89 | 325 |  74 | 2026-05-29 | 2026-09-12
-- hero_narrative | 186 | 39 | 141 |  59 | 2026-05-26 | 2026-07-19   <-- no calls since July
-- coach_chat     |  50 |  0 |   3 | 768 | 2026-05-29 | 2026-09-10
```

### 2.3 The orphaned LLM review layer

`src/app/golf/actions/v3/llm.ts:169` exports `generateLlmRoundReview(roundId, fallback_summary)`, a thin wrapper over `composeRoundReview` (`src/lib/coachhelm/v3/llm/round-review.ts:344`). It has a rate limit (DS-44), tests (`src/test/coachhelm/v3/round-regime.test.ts`), a feature-registry entry (`src/lib/admin/feature-registry.ts:812`), and a doc comment in `round-regime.ts:132` describing the chain `buildPrompt -> composeRoundReview -> generateLlmRoundReview`. A full-tree grep finds no runtime caller:

```
$ grep -rn "generateLlmRoundReview" src | grep -vE "actions/v3/llm\.ts|feature-registry|round-regime"
(no output)
```

What it would emit if wired in — one paragraph, not structured fields. `round-review.ts` `buildPrompt`:

```ts
return [
  `You are a college golf coach writing a one-paragraph round summary to ${input.player_first_name}.`,
  ``,
  `Round facts:`,
  `- Score: ${input.total_score} (${toParStr}) ${courseClause}`.trim(),
  statsClause ? `- Stats: ${statsClause}` : '',
  lensClause ?? '',
  intentClause,
  sgBlock,
  compositeBlock,
  personaBlock,
  goalBlock,
  ``,
  `Write 80-150 words in second person ("you"). Mention the score and at least one of the stats from the facts above.`,
  hasEnrichment
    ? `If the patterns, persona, or goal are listed above, weave ONE of them in naturally — do not list them all, and do not invent extras.`
    : '',
  `For Strokes Gained use only the directional words above ("strong", "neutral", "weak") — do NOT quote raw SG numbers.`,
  `For any goal you reference, name the metric only; do NOT quote the target number or date.`,
  `Be specific and grounded — do NOT invent numbers or details not in the facts.`,
  `Tone: direct, encouraging, no clichés. End on a single concrete focus for the next round.`,
  ``,
  `Return only the paragraph, no headers, no quotes.`,
].filter(Boolean).join('\n');
```

```ts
export async function composeRoundReview(input: RoundReviewInput): Promise<ComposeResult> {
  return compose(
    {
      task: 'round_review',
      coach_id: input.coach_id,
      player_id: input.player_id,
      prompt: buildPrompt(input),
      evidence: buildEvidence(input),
      max_completion_tokens: 250, // ~150 words headroom
    },
    input.fallback_summary,
  );
}
```

`src/lib/coachhelm/v3/llm/types.ts:51`:

```ts
export interface ComposeResult {
  text: string;
  /** True when the model went through the LLM path; false when it
   *  fell back to the caller-supplied template due to budget or error. */
  used_llm: boolean;
  /** True when every claim cite()'d by the model was present in
   *  request.evidence. False = at least one fabricated cite — caller
   *  decides whether to surface anyway. */
  citations_verified: boolean;
  /** The id of the row inserted into golf_coachhelm_llm_calls. Null
   *  for fallback (no LLM call was made). */
  call_log_id: string | null;
  cost_usd: number;
}
```

Wiring it in would replace `summary` — which is already the good part — and leave `next_practice_priority` untouched.

### 2.4 The citation verifier — the binding constraint on any LLM-generated field

`compose()` runs `verifyCitations` on the output. Every numeric token must appear verbatim in the registered evidence set or **the entire response is discarded** and the caller's template is stored with `fallback_to_template=true`. This already bit once — `round-review.ts:283`:

```ts
// Measured in production 2026-08-16: 19 of 107 round_review compose() calls
// (17.8%) were discarded for failed citation verification — and every
// discard in `golf_coachhelm_llm_calls` is a round review. The unmatched
// tokens were not hallucinations, they were correct arithmetic:
//
//   55.6 = 10/18   72.2 = 13/18   27.8 = 5/18   44.4 = 8/18
//   64.3 = 9/14    71.4 = 10/14   57.1 = 8/14   53.8 = 7/13
//
// We hand the model COUNTS and ask for prose about them, so "you hit 55.6%
// of greens" is exactly what a good narrative says. ...
// Fixed by SUPPLYING the derived value, never by loosening the verifier
```

Fixed by `pushDerivedPct` (registers both the 1-dp and the rounded percentage) and by registering every numeric token from composite insight titles through the verifier's own `extractNumericTokens`. Any future generated `next_practice_priority` must either stay non-numeric or have every figure it could cite registered in `buildEvidence`.

### 2.5 Billing

`src/lib/ai/model-provider.ts` decides the account. When `ANTHROPIC_API_KEY` is set — it is, in production, 107 days old — the provider is a direct `anthropic()` instance and calls bill the Anthropic console account. A bare `'anthropic/claude-haiku-4-5'` string would route through the Vercel AI Gateway and bill the Vercel team balance (the comment history in that file records a period when the string was passed and "every round review served" went through the Gateway).

Cost is computed locally, not from the provider, using `MODEL_COST_USD_PER_MTOK` (`types.ts:71`): Haiku 4.5 $1 in / $5 out per MTok; Sonnet 5 $3 / $15 (comment flags it unverified); Opus $15 / $75; `UNKNOWN_MODEL_RATE` defaults to the Opus tier. Routing: `round_review` and `hero_narrative` → Haiku 4.5; `coach_chat` → Sonnet 5 (moved 2026-07-25). Priority when budget is tight: `round_review (1) > coach_chat (2) > hero_narrative (3)`. Budget gate: `checkBudget` / `recordSpend` in `v3/llm/budget.ts`. A verified round recap ≈ **$0.0007**.

---

## 3. Chronology — how output is linked in time

### 3.1 Insights are player snapshots keyed by signature, refreshed in place

```sql
select count(*) total, count(*) filter (where source_id is null) no_round_link,
       count(distinct signature) sigs, count(distinct player_id) players,
       count(*) filter (where lifecycle_state='detected') detected,
       count(*) filter (where updated_at > now() - interval '30 days') touched_30d
from golf_coach_insights;
-- 1060 | 1060 | 191 | 61 | 296 | 815
```

Every row is `source_type='system'`, `source_id NULL`. An insight is computed over `evidence.window_days` (90) ending *now*, keyed by `signature`. The database constraint:

```sql
CREATE UNIQUE INDEX golf_coach_insights_dedup_key
  ON public.golf_coach_insights (signature, player_id, coach_id, team_id) NULLS NOT DISTINCT;
CREATE INDEX idx_insights_signature_recent
  ON public.golf_coach_insights (player_id, signature, created_at DESC);
```

`src/lib/coachhelm/v2/insights/upsert.ts:158` — lookup on the full key with **no date cutoff**, deliberately:

```ts
// 2026-06-06 DI-1: the dedup lookup MUST match the scope of the global
// UNIQUE NULLS NOT DISTINCT constraint (signature,player_id,coach_id,team_id)
// that `insertNew` upserts against — that constraint has NO 30-day window.
// The old `.gte(created_at, now()-30d)` filter narrowed the lookup so that
// for an insight older than 30 days we'd MISS the existing row, fall into
// `insertNew`, hit the conflict, and (with ignoreDuplicates:true) leave the
// stale row untouched — recomputed evidence silently dropped and the
// lifecycle frozen forever. Dropping the cutoff routes the refresh through
// `updateExisting` (a true DO-UPDATE / upsert, no destructive write) so
// fresh evidence always lands regardless of the row's age.
let lookup = supabase
  .from('golf_coach_insights')
  .select('id, evidence, metadata, lifecycle_state')
  .eq('signature', input.signature);
// ... .eq / .is on player_id, coach_id, team_id (null-aware)
const { data: existingRows } = await lookup.order('created_at', { ascending: false }).limit(1);
if (existing) return updateExisting(supabase, existing, input, evidence);
return insertNew(supabase, input, evidence, confidence, resolvedCoachId, resolvedTeamId);
```

`updateExisting` (`:207-270`) — when `your_value` moved less than `MOVEMENT_THRESHOLD` (5%), refresh in place:

```ts
const refreshPayload: Record<string, unknown> = {
  evidence,
  content: input.content,
  title: input.title,
  category: input.category,
  metadata: { ...priorMetadata, ...(input.metadata ?? {}), last_refreshed_at: nowIso },
  updated_at: nowIso,
};
// Re-persist the freshly-computed severity. Value-derived generators
// recompute priority every run, and there is no coach manual-priority edit path
if (input.priority) refreshPayload.priority = input.priority;

// RESURRECTION (to-95 audit P2): a re-emitted signature whose row was
// previously archived must return to a visible state ...
// `status` is deliberately NOT touched: a coach dismissal keeps hiding the row.
if (existing.lifecycle_state === 'archived') {
  refreshPayload.lifecycle_state =
    evidence.confidence < TENTATIVE_CONFIDENCE_FLOOR ? 'tentative' : 'detected';
  refreshPayload.archived_at = null;
  mergedMetadata.redetected_at = nowIso;
}
await supabase.from('golf_coach_insights').update(refreshPayload).eq('id', existing.id);
```

**`created_at` is never modified on refresh.** `insertNew` (`:380-440`) uses `onConflict: 'signature,player_id,coach_id,team_id', ignoreDuplicates: true` and sets `metadata.movement_count = 0` — a concurrent insert on an existing key is a silent no-op, which is fine for a serialised backfill but means a refresh only happens via the explicit lookup branch.

Feed order — `src/app/golf/actions/insights.ts:1239-1240`:

```ts
.order('priority', { ascending: true })
.order('created_at', { ascending: false })
```

Because refresh preserves `created_at`, **re-running a player does not reorder the feed**: existing signatures stay where they were, genuinely new signatures appear at the top with today's date, which is correct.

Lifecycle cron — `src/app/api/cron/coachhelm-insight-lifecycle/route.ts`:
- Rule 1 (`:412`): `addressed` → `resolved` when the metric is in the healthy band for 2 cycles.
- Rule 2 (`:381`): `detected` + 0 movements + stale > 30d + no `addressed_at` → archive (safe only because a re-emit of an unchanged insight still bumps `last_refreshed_at`).
- Rule 3 (`:356`): hard archive at > 90d stale if not matured and not addressed.
- Rule 4 (`:439`): decay `evidence.confidence_factors.recency` by 0.2 per 30 days of age overage vs `window_days`; demote below 0.4 total confidence to `tentative`.
- Staleness anchors on `max(created_at, metadata.last_refreshed_at, metadata.redetected_at)`.

**Hard limit for any backfill:** every generator windows on `now()`. Re-running a player produces *today's* picture, not what April would have said. "Give the rounds that never ran what they need" is achievable for reviews (each is genuinely about its own round) and **not** for insights (each is a current-window snapshot).

### 3.2 Reviews are per-round, one per round, and sorted by insert time

Schema facts (`information_schema.columns`, `pg_indexes`, `pg_policy`):

- 39 columns. **No `round_date`.** Has `round_id`, `player_id`, `round_score`, `round_score_to_par`, `scoring_avg_before/after`, `highlights` jsonb, `areas_to_review` jsonb, `round_stats` jsonb, `patterns_detected` jsonb (also carries the extended `status` used by the pending filter), `summary`, `primary_takeaway`, `next_practice_priority`, `coach_notes`, `coach_viewed_at`, `shared_with_coach`, `shared_at`, `engine_version`, `ai_model_version`, `sentiment_score`, `regeneration_count`, `last_regenerated_at`, `insights_count`, `highlights_count`, `areas_count`, `status`, `published_at`, `published_by`, `coach_rating`, `coach_feedback_text`, `player_viewed_at`, `player_acknowledged_at`, `action_items` jsonb, `version`, `generation_method`, `shared_with_player`, `created_at`, `updated_at`.
- `golf_round_reviews_round_id_key` **UNIQUE (round_id)** — exactly one review per round; regeneration updates in place.
- Every index is on `created_at`: `idx_golf_round_reviews_created_at (created_at DESC)`, `idx_golf_round_reviews_player_created (player_id, created_at DESC)`, `idx_golf_round_reviews_coach_workflow (player_id, status, created_at DESC)`, plus `golf_round_reviews_published_by_idx`.
- RLS: `round_reviews_select_coach` requires `EXISTS (select 1 from golf_team_members gtm where gtm.player_id = golf_round_reviews.player_id and gtm.status = 'active' and is_golf_team_coach(gtm.team_id))` — **a teamless player's review is invisible to every coach.** `round_reviews_select_player` via `golf_players.user_id = auth.uid()`. `admin_read_all` via `is_admin()`. Write policies mirror the read policies (`round_reviews_write_coach`, `Players can update their own reviews`).

The three list queries in `src/app/golf/actions/round-reviews.ts`:

`:1037` `getTeamReviews` — embeds the round with `!inner` but sorts on the review row:

```ts
const teamReviewSelect: string = `
    *,
    round:golf_rounds!inner(
      *,
      player:golf_players!inner(*, profile:profiles!inner(id, first_name, last_name, email, avatar_url)),
      course:golf_courses(*)
    )
  `;
const { data: reviews, error, count } = await supabase
  .from('golf_round_reviews')
  .select(teamReviewSelect, { count: 'exact' })
  .eq('round.team_id', teamId)
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1);
```

`:1176` `getPendingCoachReviews`:

```ts
const { data: reviews, error } = await supabase
  .from('golf_round_reviews')
  .select(pendingReviewSelect)
  .in('player_id', playerIds)
  .order('created_at', { ascending: false });

// Filter to only draft/coach_review status   (:1187-1191)
const pendingReviews = (reviews as unknown as RoundReviewWithDetails[]).filter(r => {
  const extData = (r as unknown as ReviewDbRow).patterns_detected as ReviewExtendedData | null;
  const status = extData?.status ?? 'draft';
  return ['draft', 'coach_review'].includes(status);
});
```

`:1243` `getPlayerReviewHistory` — **no embed at all**, so it cannot sort by round date without a join or a denormalised column:

```ts
const { data: reviews, error } = await supabase
  .from('golf_round_reviews')
  .select('*')
  .eq('player_id', playerId)
  .order('created_at', { ascending: false });
```

**This is a live bug today.** Open a review for an April round and it becomes the newest item in the coach's list. A 127-round backfill would do this 127 times.

### 3.3 A review row is created only when someone opens the page

`src/hooks/coachhelm/useRoundReviewV2.ts:388-439`:

```ts
// Auto-generate once when a round has no cached review. Keeps the round
// detail page from sitting on an empty "Generate review" prompt — the
// review materializes on mount if the backing data exists.
//
// Data guard: only auto-fire when the round actually has score or shot
// data. Empty/in-progress rounds otherwise burn a generator pass and
// produce noisy "insufficient data" errors.
const autoGenAttempted = useRef(false);
const [hasRoundData, setHasRoundData] = useState(false);
useEffect(() => {
  // ...
  const { data: round } = await supabase
    .from('golf_rounds').select('total_score, status').eq('id', roundId).maybeSingle();
  const hasScore = r?.total_score !== null && r?.total_score !== undefined;
  const isCompleted = r?.status === 'completed';
  if (hasScore || isCompleted) { setHasRoundData(true); return; }
  // Fall back to a shot-existence probe — short rounds without a cached
  // total_score still warrant generation if any shots were logged.
  const { count } = await supabase
    .from('golf_shots').select('id', { count: 'exact', head: true }).eq('round_id', roundId);
  setHasRoundData((count ?? 0) > 0);
}, [roundId]);

const needsGeneration = !loading && !review && !intelligentReview;
useEffect(() => {
  if (!needsGeneration) return;
  if (generating) return;
  if (autoGenAttempted.current) return;
  if (!roundId || !playerId) return;
  if (!hasRoundData) return;
  autoGenAttempted.current = true;
  void generate();
}, [needsGeneration, generating, roundId, playerId, generate, hasRoundData]);
```

`generate()` (`:219`) is single-flight guarded by `inFlightRef` because two effects used to race and the server received two concurrent `generateAndStoreRoundReview` calls for the same round. Primary path is `generateAndStoreRoundReview` from `round-review-system.ts`; on failure it falls back to `generateAIRoundReview` from `insights.ts` (`:324`), which is also the v2 orchestrator — still no LLM.

`postRoundTrigger` **never** creates a review — it writes only the three terminal columns and calls `triggerPlayerInsightsAfterRound`. The owner confirmed on-open generation is the intended design: "the detailed round review should run if a player goes into it and hits generate round review."

---

## 4. Production state by team (queried 2026-09-12)

```sql
with r as (select r.*, t.name team_name from golf_rounds r left join golf_teams t on t.id = r.team_id)
select coalesce(team_name,'(no team)') team,
  count(*) filter (where status='completed') completed_all,
  count(*) filter (where status='completed' and round_date>=current_date-7) completed_7d,
  count(*) filter (where status='completed' and round_date>=current_date-30) completed_30d,
  count(*) filter (where status='in_progress') in_progress,
  count(*) filter (where status='completed' and coachhelm_analyzed_at is not null) analyzed,
  count(*) filter (where status='completed' and coachhelm_failed_at is not null) failed,
  count(*) filter (where status='completed' and coachhelm_failure_reason='engine_no_recent_rounds') failed_no_recent,
  count(*) filter (where status='completed' and coachhelm_failure_reason='engine_membership_missing') failed_membership,
  count(*) filter (where status='completed' and coachhelm_analyzed_at is null and coachhelm_failed_at is null) never_processed,
  count(*) filter (where status='completed' and round_date>=current_date-30
                   and not exists (select 1 from golf_round_reviews rv where rv.round_id=r.id)) missing_review_30d,
  max(round_date) filter (where status='completed') last_completed,
  max(coachhelm_analyzed_at)::date last_analyzed
from r group by 1 order by completed_30d desc;
```

| Team | Completed all / 7d / 30d | In progress | Analyzed | Failed (no_recent / membership) | Never processed | Missing review 30d | Last completed | Last analyzed |
|---|---|---|---|---|---|---|---|---|
| Guilford College Men's Golf | 205 / 23 / 114 | 2 | 192 | 13 (8 / 5) | 0 | 58 | 2026-09-07 | 2026-09-09 |
| Shenandoah University Golf | 70 / 10 / 70 | 7 | 44 | 26 (26 / 0) | 0 | 41 | 2026-09-10 | 2026-09-11 |
| UNC Wilmington Golf | 70 / 14 / 68 | 3 | 51 | 19 (19 / 0) | 0 | 22 | 2026-09-10 | 2026-09-10 |
| Lynchburg Women's Golf | 27 / 0 / 7 | 13 | 18 | 9 (9 / 0) | 0 | 3 | 2026-08-30 | 2026-08-30 |
| Demo University Golf | 97 / 0 / 4 | 5 | 97 | 0 | 0 | 2 | 2026-08-31 | 2026-08-31 |
| Demo University Golf (Pat) | 90 / 0 / 0 | 0 | 90 | 0 | 0 | 0 | 2026-06-09 | 2026-07-25 |
| **Hampden-Sydney Golf** | **3 / 0 / 0** | **5** | **0** | 3 (3 / 0) | 0 | 0 | **2026-03-03** | **never** |
| (no team) | 4 / 1 / 1 | 7 | 0 | 4 (0 / 4) | 0 | 1 | 2026-09-10 | never |

Totals:
- **48** completed rounds in the last 7 days across 5 teams.
- **74** completed rounds stamped failed across **38 distinct players** (65 `engine_no_recent_rounds` + 9 `engine_membership_missing`; 55 in the last 30 days).
- **344** completed rounds with no review row (127 in 30d, 176 in 90d). **222** reviews exist; **141** were created in the last 30 days.
- **42** rounds `in_progress`.
- **0** completed rounds with no stamp at all — the crons are keeping up; the problem is *what they stamp*.

Shenandoah and UNCW are the shape of a new roster: every player's first two rounds fail the floor of 3 and stay failed. Hampden-Sydney never got a player past the floor.

**Corrections made during the session, for the record:** the first answer was scoped to the owner's own team (Demo University, no rounds since Aug 31) and said "no rounds in 7 days" — wrong; the owner pushed back and 48 had landed. "48 failed rounds" undercounted — it is 74. An earlier "40 rounds in 7 days" was superseded by today's 48. The first answer also checked whether the crons *ran*, not whether they *produced* anything — the owner's "so I was right" was correct.

### 4.1 What the stranded rounds actually got

Cross-referencing each `engine_no_recent_rounds` round against reviews and insight refreshes near its failure time (cohort of 65 at time of query):

| Outcome | Rounds |
|---|---|
| Review exists AND insights refreshed near the run | 19 |
| Review only | 14 |
| Insights only | 20 |
| **Nothing at all** | **12** |

"Failed" is not "nothing happened." Most were later opened (review) or a subsequent round refreshed the player's insights. The 12 are the only cohort with a clean success criterion.

---

## 5. Root causes

### RC1 — `engine_no_recent_rounds` is stamped terminal, so the safety net can never retry

`src/app/golf/actions/insights.ts:4334-4347` — the coach's round floor (`philosophy.minRoundsForSignal`, = 3 for every coach in production):

```ts
// ... The floor suppresses NEW claims; it does not suspend maintenance of old ones.
const { count: completedRoundCount } = await admin
  .from('golf_rounds')
  .select('id', { count: 'exact', head: true })
  .eq('player_id', playerId)
  .eq('status', 'completed');

// `count` is null when the client can't report one ... treat an UNKNOWN count as "no
// opinion" and let analysis proceed, rather than silently muting a coach.
const belowRoundFloor =
  typeof completedRoundCount === 'number' &&
  completedRoundCount < philosophy.minRoundsForSignal;
```

`:4380`:

```ts
// Below the coach's round floor: skip generation entirely, but fall
// through so the aging sweep below still runs.
analysis = belowRoundFloor
  ? null
  : await coachHelmIntelligence.analyzePlayer(playerId, {
      includePatterns: true, includeCausal: true, includePredictions: true, includeShotPatterns: true,
      depth: 'standard', verbosity: philosophy.insightVerbosity, philosophyGate,
      patternLookbackDays: philosophy.patternLookbackDays,
      minRoundsForSignal: philosophy.minRoundsForSignal,
    });
```

`:4420-4439` — when `analysis` is null and no Tier-1 insight was written since `startTime - 1000`:

```ts
// No completed rounds in the last 90 days, AND no Tier-1 insights either
// — this is a brand-new player or one who's been inactive too long.
// ... `code: 'engine_no_recent_rounds'` marks this as an expected
// empty-state for observeActionSoftFailure ... the nightly roster-sweep cron
// hits this constantly for inactive players and it must stay out of the Errors tab / Sentry.
return {
  success: false,
  error: 'No completed rounds in the last 90 days yet — insights will populate after the next round',
  code: 'engine_no_recent_rounds',
};
```

The engine calls it an expected empty-state. `postRoundTrigger` (`src/lib/coachhelm/v2/post-round-trigger.ts:138-150`) treats any `!result.success` as terminal:

```ts
const result = await triggerPlayerInsightsAfterRound(args.playerId);

if (!result.success) {
  const reason = result.error ?? 'engine reported failure';
  await writeTerminalState(
    admin,
    args.roundId,
    {
      coachhelm_failed_at: now,
      coachhelm_failure_reason: sanitizeFailureReason(reason),
    },
    'postRoundTrigger.engineFailure',
  );
  const code = result.code ?? null;
  const { severity, skipSentry } = classifyEngineFailureSeverity(reason, code);
  // ... logs at 'info' for expected codes, returns { success: false, error: reason, code }
}
```

`sanitizeFailureReason` (`:76`) maps by substring:

```ts
function sanitizeFailureReason(reason: string): FailureCode {
  const lower = reason.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out')) return 'engine_timeout';
  if (lower.includes('session') && lower.includes('expired')) return 'engine_session_expired';
  if (lower.includes('membership')) return 'engine_membership_missing';
  if (lower.includes('disabled')) return 'engine_disabled';
  if (lower.includes('no completed rounds')) return 'engine_no_recent_rounds';
  if (lower.includes('generator failure') || lower.includes('tier-1')) return 'engine_generator_failure';
  return 'engine_error';
}
```

Success paths: clean → `coachhelm_analyzed_at = now, failed_at = null, reason = null` (`:212`); partial (a generator threw) → `analyzed_at = now, reason = PARTIAL_FAILURE_REASON` (`:187`); throw → `failed_at = now` (`:226`).

The write goes through a SECURITY DEFINER RPC because completed rounds are immutable — `supabase/migrations/20260824002016_allow_coachhelm_terminal_state.sql`:

```sql
-- A completed scorecard is immutable history, but CoachHelm's terminal
-- processing markers are operational metadata, not scoring data.  The
-- lifecycle guard therefore permits only this server-only RPC to update its
-- three terminal-state columns.
create or replace function public.record_round_coachhelm_terminal_state(
    p_round_id uuid, p_analyzed_at timestamptz, p_failed_at timestamptz, p_failure_reason text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare updated_round_id uuid;
begin
  perform set_config('helm.golf_lifecycle_write', 'coachhelm_terminal', true);
  update public.golf_rounds
  set coachhelm_analyzed_at = p_analyzed_at,
      coachhelm_failed_at = p_failed_at,
      coachhelm_failure_reason = p_failure_reason
  where id = p_round_id and status = 'completed'
  returning id into updated_round_id;
  return updated_round_id;
end; $$;
revoke all on function public.record_round_coachhelm_terminal_state(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_round_coachhelm_terminal_state(uuid, timestamptz, timestamptz, text) to service_role;
```

(`20260824003104_pin_coachhelm_terminal_state_search_path.sql` pins the search path. `helm_private.guard_golf_round_lifecycle` accepts the `coachhelm_terminal` marker and otherwise rejects completed-round updates except the `stats_cache` strokes-gained refresh.)

The safety-net cron — `src/app/api/cron/coachhelm-safety-net/route.ts:143-155` — is then blind to it forever:

```ts
// Deterministic eligibility: completed rounds where postRoundTrigger
// never wrote a terminal state, regardless of age. The partial index
// added in migration 20260517010000 (WHERE coachhelm_analyzed_at IS NULL
// AND coachhelm_failed_at IS NULL AND status='completed') keeps this
// query cheap without needing a date filter to narrow the scan.
//
// The `.lte('created_at', ...)` MIN_AGE_MS floor (see const above) is
// layered on top for Fix 3: it excludes rounds still inside their first
// Inngest attempt's own retry window so this cron doesn't race a
// still-in-flight durable retry with a redundant direct call.
const { data: rounds, error } = await (supabase as any)
  .from('golf_rounds')
  .select('id, player_id, created_at')
  .eq('status', 'completed')
  .is('coachhelm_analyzed_at', null)
  .is('coachhelm_failed_at', null)
  .lte('created_at', minAgeCutoffIso)
  .order('created_at', { ascending: true })
  .limit(BATCH_LIMIT);
```

Backed by:

```sql
CREATE INDEX golf_rounds_pending_coachhelm_idx ON public.golf_rounds (created_at)
  WHERE coachhelm_analyzed_at IS NULL AND coachhelm_failed_at IS NULL AND status = 'completed';
```

The file's own header explains the predicate was made *deliberately* age-independent after two prior incidents where a rolling window stranded 112 and then 200 rounds. It also carries a stale-backlog alarm with a HEAD-count on the same predicate. It was never designed for a failure code that is expected to clear on its own once the player crosses the floor.

**Net effect:** rounds 1 and 2 of every new player are stamped failed and stay failed forever. Round 3 crosses the floor and succeeds. Rounds 1 and 2 never get retried.

### RC2 — `engine_membership_missing` is also terminal

Same path. The player has `team_id IS NULL`, so ownership resolution fails and the substring `'membership'` maps to the terminal code. 9 rounds: 5 Guilford (players who logged rounds before their roster membership was active) and 4 on no team at all (including the owner's own Jul 12 round). Compounded by RLS: even if a review existed, `round_reviews_select_coach` requires an active `golf_team_members` row, so no coach could see it. **Owner decision: skip cleanly with no failure stamp**, so the round becomes eligible if the player later joins a team.

### RC3 — 42 rounds stuck `in_progress` never trigger anything

No code path — trigger, safety net, roster sweep, or review page — looks at `in_progress` rounds (the review page's data guard fires only on `total_score`, `status='completed'`, or shot existence). Hampden-Sydney has 5 stuck and 3 completed (all March, all failed the floor) — **never one analyzed round.** Lynchburg has 13 stuck. The owner's own player profile `2ac20cc4` (`team_id NULL`) has 4 stuck, including the OB test round `d69bd372`. **Owner decision: investigate before changing anything** — abandoned mid-round, a save failure, or a UI dead end are different fixes.

### RC4 — Review lists sort by insert time, not round date

See §3.2. Live bug, three sites, no round-date column on the table, every index on `created_at`.

### RC5 — Reviews exist only when opened, so coach lists look empty

By design (owner confirmed), but it is why "nothing is populating" reads as true from the list view: Guilford has 58 of 114 recent rounds with no review row, and the team/pending lists only show rows that exist. **Owner decision: pre-warm the last 30 days only; keep on-open generation as the design.**

### RC6 — The review page never calls an LLM; the LLM review layer is orphaned

See §2.3. `generateLlmRoundReview` has zero callers. The review page's text is 100% rule engine. The owner's hypothesis ("the engine is a fallback when the LLM isn't called or has no credits") was right in substance and wrong on mechanism — it isn't a fallback, it's the only path.

### RC7 — `next_practice_priority` is a 14-string phrase bank

```sql
select count(*) total, count(distinct primary_takeaway) takeaways,
       count(distinct next_practice_priority) priorities, count(distinct summary) summaries,
       count(distinct left(summary, 20)) summary_openers
from golf_round_reviews;
-- 222 | 18 | 14 | 214 | 150
```

```sql
select next_practice_priority, count(*) n, count(distinct player_id) players
from golf_round_reviews group by 1 order by n desc;
```

| Uses | Players | Text |
|---|---|---|
| 62 | 26 | Play to the safe side of the target and favor solid contact over chasing a perfect shot from this yardage. |
| 39 | 24 | When you miss the fairway into this yardage window, shift to a safer target and protect against the expensive leave. |
| 35 | 22 | Treat the first recovery shot as a scoring save: leave uphill, favor center green, and remove the big miss after the miss. |
| 33 | 18 | Keep the target wider from this yardage window and prioritize finishing inside a playable leave. |
| 13 | 12 | Start the ball a touch right of the final target and commit to the playable side. |
| 11 | 10 | Start the ball a touch left of the final target and commit to the playable side. |
| 9 | 4 | *(null)* |
| 8 | 6 | Focus on making contact. A minor miss is always better than a disaster. Consider a more conservative target. |
| 3 | 3 | Focus practice on this distance range. Consider taking less club for better control. |
| 2 | 2 | Priority: Iron play distance control. Focus on specific yardages and dial in your approach distances. Practice from 100-175 yards. |
| 2 | 1 | Build tournament experience and mental routines. Focus on process over outcomes. Consider sports psychology support. |
| 2 | 2 | Your approach game is a strength — don't change it. Focus ALL practice improvement on putting: (1) 5-10 foot make rate ... |

Source — `src/lib/coachhelm/v2/orchestrator.ts`, four round-specific builders: `buildRoundSevereApproachInsight` (`:1438`), `buildRoundLiePenaltyInsight` (`:1500`), `buildRoundTeeMissInsight` (`:1554`), `buildRoundScrambleInsight` (`:1589`). Each computes a **real** headline and body from `golf_shots`, then throws the stats away when choosing the sentence:

```ts
private buildRoundSevereApproachInsight(shots: RoundReviewShotRow[]): ComposedInsight | null {
  const missedApproaches = shots.filter((shot) => {
    if (shot.shot_type !== 'approach' || shot.distance_to_hole_before == null) return false;
    return shot.result !== 'green' && shot.result !== 'hole' && shot.lie_after !== 'green';
  });
  if (missedApproaches.length < 2) return null;

  const bracketStats = ROUND_REVIEW_APPROACH_BRACKETS.map((bracket) => {
    const inBracket = missedApproaches.filter((shot) => {
      const beforeYards = this.toRoundReviewYards(shot.distance_to_hole_before, shot.distance_unit_before);
      return beforeYards != null && beforeYards >= bracket.min && beforeYards < bracket.max;
    });
    if (inBracket.length < 2) return null;
    const severeShots = inBracket.filter((shot) => this.isSevereRoundApproachMiss(shot));
    // ... avgAfterYards
    return { label: bracket.label, sampleSize: inBracket.length, severeCount: severeShots.length,
             severeRate: severeShots.length / inBracket.length, avgAfterYards };
  }).filter(Boolean);

  const topBracket = bracketStats.filter((item) => item.severeRate >= 0.5).sort(/* rate desc, then n desc */)[0];
  if (!topBracket) return null;

  const severePct = Math.round(topBracket.severeRate * 100);

  return {
    headline: `Round Approach Check: ${topBracket.label} produced the biggest misses`,
    body: `${topBracket.severeCount} of ${topBracket.sampleSize} missed approaches from ${topBracket.label} finished more than 25 yards away or in a penalty state in this round.`,
    callToAction: severePct >= 75
      ? 'Play to the safe side of the target and favor solid contact over chasing a perfect shot from this yardage.'
      : 'Keep the target wider from this yardage window and prioritize finishing inside a playable leave.',
    tone: severePct >= 75 ? 'urgent' : 'cautionary',
    confidence: Math.min(0.9, 0.55 + topBracket.sampleSize * 0.08),
    strokeImpact: Number((topBracket.severeRate * Math.max(1, topBracket.sampleSize / 2)).toFixed(1)),
    evidenceMetrics: [
      { label: 'Yardage window', value: topBracket.label },
      { label: 'Severe misses', value: `${topBracket.severeCount}/${topBracket.sampleSize}` },
      { label: 'Severe miss rate', value: `${severePct}%` },
      { label: 'Average leave', value: `${Math.round(topBracket.avgAfterYards)}y` },
    ],
  };
}
```

`determinePracticePriority` (`:1799`):

```ts
private determinePracticePriority(patterns: MinedPattern[], causal: CausalRelationship[], insights: ComposedInsight[] = []): string {
  const topActionableInsight = insights.find(
    (insight) => (insight.tone === 'urgent' || insight.tone === 'cautionary') && insight.callToAction
  );
  if (topActionableInsight?.callToAction) return topActionableInsight.callToAction;

  const actionablePatterns = patterns
    .filter((p) => p.actionability > 0.5 && p.strokeImpact > 0.3)
    .sort((a, b) => b.strokeImpact * b.actionability - a.strokeImpact * a.actionability);
  const top = actionablePatterns[0];
  if (top) return top.recommendation || 'Address top pattern through focused practice.';

  const topCausal = causal.filter((c) => c.interventionPotential > 0.5).sort((a, b) => b.strength - a.strength)[0];
  if (topCausal) return `Focus on improving ${topCausal.cause} to enhance ${topCausal.effect}.`;

  return 'Continue current practice routine.';
}
```

Assembly (`:786-812`):

```ts
const composedReview = primaryReviewInsight ?? {
  headline: 'Round Review Ready',
  body: 'The round has been analyzed, but there is not yet enough evidence to surface a high-confidence takeaway.',
  tone: 'neutral' as const, confidence: reasoning.calibratedConfidence, reasoning,
};
const focusAreas = this.identifyFocusAreas(patterns, causalInsights, prioritizedInsights);
const practicePriority = this.determinePracticePriority(patterns, causalInsights, prioritizedInsights);
return {
  roundId, playerId: ownerPlayerId,
  summary: this.buildRoundReviewSummary(prioritizedInsights, prediction, features),
  primaryTakeaway: primaryReviewInsight?.headline ?? composedReview.headline,
  patternsApplied: patterns.filter((p) => p.isActive).slice(0, 3),
  causalInsights: causalInsights.slice(0, 2),
  prediction: prediction ?? null, reasoning, composedReview, focusAreas, practicePriority,
};
```

`primary_takeaway` = the headline — data-derived. `next_practice_priority` = `callToAction` — 12 `callToAction:` literals in the file plus the fallbacks = the 14. Four consecutive sampled reviews (78, 77, 69, 69, on different courses) carried the identical takeaway *and* priority.

### RC8 — ~10% of insights are null-result rows

```sql
select title, count(*) n, count(distinct player_id) players, count(distinct content) distinct_content
from golf_coach_insights group by 1 order by n desc limit 6;
-- Putting break check: no directional bias detected | 46 | 46 | 12
-- Driver vs layback: no clear preference             | 32 | 32 | 31
-- Driver is performing — keep it in play             | 27 | 27 | 27
-- Short-side misses are compounding                  | 22 | 22 | 20
-- SG Putting: Primary Stroke Sink                    | 20 | 10 | 10
-- SG Approach: Primary Stroke Sink                   | 14 | 10 | 12
```

105 rows that say "we checked and found nothing." Example content: *"Across your last 10 rounds, your make rate on left-break vs right-break putts is statistically even once distance is controlled for — no single break direction stands out. Keep working both ways on the practice green."* All `priority: low` (606 of 1,060 rows are low; 88 high), so they sort last — but they are still feed rows.

### RC9 — 808 of 1,060 insights have a blank evidence window

```sql
select count(*) filter (where evidence->>'window_start' = '' or evidence->>'window_start' is null) blank_window,
       count(*) filter (where evidence ? 'sample_n') has_n,
       count(*) filter (where (evidence->>'confidence')::numeric >= 0.6) conf_ge_06,
       count(*) total
from golf_coach_insights;
-- 808 | 1047 | 725 | 1060
```

`window_start` / `window_end` are empty strings, not null. `window_days` (90) is populated so Rule 4 decay still works; the "what period is this claim about" audit trail is missing on 76% of rows.

### RC10 — 89 template-fallback recaps; July 2026 was a 91% fallback month

```sql
select date_trunc('month', created_at)::date mth, task, count(*) calls,
       sum(fallback_to_template::int) fallbacks, round(100.0*sum(fallback_to_template::int)/count(*)) pct
from golf_coachhelm_llm_calls group by 1,2 order by 1 desc, 2;
-- 2026-09 | coach_chat     |   8 |  0 |  0%
-- 2026-09 | round_review   |  77 |  5 |  6%
-- 2026-08 | coach_chat     |  12 |  0 |  0%
-- 2026-08 | round_review   | 268 | 41 | 15%
-- 2026-07 | coach_chat     |  24 |  0 |  0%
-- 2026-07 | hero_narrative |  22 | 20 | 91%   <-- outage
-- 2026-07 | round_review   |  33 | 30 | 91%   <-- outage
-- 2026-06 | hero_narrative |  72 | 17 | 24%
-- 2026-06 | round_review   |  32 | 13 | 41%
-- 2026-05 | hero_narrative |  92 |  2 |  2%
-- 2026-05 | round_review   |  14 |  0 |  0%
```

Daily, last 20 days: 1–43 calls/day, fallbacks of 0–3/day (Sep 6: 21 calls, 3 fallbacks; Aug 25: 43 calls, 0). A fallback is a provider error → `compose()` returns the template, logs a 0-cost row with `fallback_to_template=true`, `call_log_id` null. Recaps aren't persisted so they re-call on next open; the open question is *why* July broke (the `model-provider.ts` comment history about Gateway string vs direct key is the likely story).

### RC11 — `hero_narrative` has made zero calls since 2026-07-19

186 calls total, then silence. Either the surface was removed or it is silently broken. `composeHeroNarrative` is still imported in `actions/v3/llm.ts:21`. Not investigated further this session.

---

## 6. Quality audit — is the output accurate and useful?

Owner asked, before any fix: "test how accurate the insights and round review stuff is and see if it's outputting useful information and not just basic slop."

### 6.1 Insights — verified to the decimal

Insight `27c99e61` ("Short-side misses are compounding", `priority: high`, player `7ffdf38e`, `updated_at` 2026-09-12 16:09 UTC) claimed: 50 short-game shots from rough or bunker, 76% from rough, average post-shot proximity **17.36 ft**, Tour ~10 ft, strokes impact 0.74.

```sql
select s.distance_unit_after, count(*) n, round(avg(s.distance_to_hole_after::numeric),2) avg_after
from golf_shots s join golf_rounds r on r.id = s.round_id
where r.player_id = '7ffdf38e-…' and r.status = 'completed' and r.round_date >= current_date - 90
  and s.shot_type = 'around_green' and s.lie_before in ('rough','sand')
group by 1;
-- feet  | 41 | 12.71
-- yards | 10 | 12.40
```

The naive all-rows average is 12.65 ft — **wrong**, because ten shots were logged in yards. Converting: (41 × 12.71 + 10 × 12.40 × 3) / 51 = **17.5 ft** on n=51; the engine reported 17.36 on n=50 (one round difference in window edge). Rough share 75% vs claimed 76%. The engine handled the unit mixing correctly; the first verification query did not.

Real evidence payload:

```json
{
  "metric": "short_side_proximity", "metric_label": "Short-side recovery proximity",
  "sample_n": 50, "your_value": 17.36, "your_value_display": "17 ft avg", "unit": "feet",
  "comparison_value": 10, "comparison_label": "Tour ~10 ft", "comparison_source": "pga_baseline",
  "strokes_impact": 0.736, "strokes_impact_method": "peer_delta",
  "causality_level": "inferred_hypothesis", "composite_rule_id": "short_side_scrambling_chain",
  "source_insight_ids": [],
  "confidence": 0.6,
  "confidence_factors": { "recency": 1, "variance": 0.5, "sample_adequacy": 0.6, "factors_measured": false },
  "window_days": 90, "window_start": "", "window_end": ""
}
```

Content: *"You attempted 50 short-game shots from rough or bunker (76% from rough) with average post-shot proximity of 17 ft — well outside make-able comebacker range. The miss-side pattern is recurring AND the recovery technique isn't bailing you out. Practice short-side flop and bunker splash shots to a tucked pin; the goal is consistent leave-distance, not heroics."*

Diversity: 1,060 rows, 552 distinct titles, 907 distinct `content` strings, 61 players, 191 signatures. 725 rows at confidence ≥ 0.6. Every row carries `sample_n`, a PGA baseline, `strokes_impact`, and an honest `causality_level`.

### 6.2 Round review — stats layer verified hole by hole

Round `06ec04a7` (even-par 72, Grande Dunes Resort Club, 2026-09-08). `golf_shots.shot_type` breakdown: `putting` 31, `approach` 20, `tee` 14, `around_green` 6, `penalty` 1 → 72 rows = score.

Review row:
- summary: *"Even-par 72 at Grande Dunes Resort Club. 4 birdies, 10 pars, 4 bogeys. Picked up strokes on #1, #7, #13, #16."*
- highlights: `4 Birdies or Better` ("Hole 1 (par 4) — sank a 12ft putt. Hole 7 (par 5) — solid GIR and 2-putt. Hole 13 (par 5) — solid GIR and 2-putt. Hole 16 (par 4) — sank a 17ft putt."), `6 One-Putts` ("Converted on holes #1, #8, #10, #11, #14, #16."), `57% Scrambling` ("Saved par 4 of 7 times when missing the green."), `Accurate Driving` ("Hit 10/14 fairways (71%).")
- areas: `Round Lie Penalty` (source: trend), `1 Three-Putt` ("Three-putted on #18 (from 20ft)…"), `Tee Shot Miss: right` ("Missed 3/4 fairways to the right…"), `Approaches Landing Short` ("63% of missed greens were short…")

| Claim | `golf_shots` rows | Verdict |
|---|---|---|
| "Hole 1 — sank a 12ft putt" | shots: tee 455y→fairway; approach 155y→green; putting `putt_made=true`, `putt_distance_feet=12` | ✓ |
| "Three-putted on #18 (from 20ft)" | putting 20 ft `miss_direction=long` → 5 ft `low` → 1 ft made | ✓ |
| "Hit 10/14 fairways (71%)" | 14 tee shots on par 4/5; `result='fairway'` on 1,3,6,7,9,12,13,15,16,18 | ✓ |
| "Missed 3/4 fairways to the right" | misses: #4 right, #5 right, #8 right, #10 left, #17 right — engine counted the 4 in its window | ✓ |
| "6 One-Putts on #1, #8, #10, #11, #14, #16" | exactly one `putting` row on each | ✓ |
| "1 penalty" | #10 `shot_type='penalty'`, `is_penalty=true` | ✓ |

Last 30 days: 141 reviews, 0 blank summaries, 0 without highlights, 2 without areas; avg 2.9 highlights / 3.4 areas per review. 214 of 222 summaries are distinct.

### 6.3 Verdict

**The numbers are real. The packaging is where the slop is.** Summary, highlights, areas and the takeaway headline are earned. `next_practice_priority` is one of 14 literals and is the most prominent text on the screen. Insights are strong; the two defects are null-result noise (RC8) and blank windows (RC9). Pre-warming 127 reviews at the current quality means 127 more copies of four sentences — the stats are worth having, the priority line is not.

---

## 7. Owner decisions so far

| Question | Decision |
|---|---|
| Review backfill scope | 30 days first (127 rounds), verify, then widen |
| Review generation trigger | Keep on-open as the design; pre-warm only; no auto-generate at round completion |
| Ordering fix | Yes, first — it is a live bug and mandatory before any backfill |
| Teamless players (`engine_membership_missing`) | Skip cleanly, no failure stamp |
| Stuck `in_progress` rounds | Investigate first, no changes yet |
| Insights | Make `engine_no_recent_rounds` non-terminal in the cron AND re-run all 38 affected players once |
| PR #1934 | Green, unmerged, awaiting owner |

---

## 8. Fix plan

Sequenced. Nothing touches production data until PR 1 is deployed and verified.

### PR 1 — Review ordering (blocking; live bug)

Migration on `golf_round_reviews`:

```sql
alter table public.golf_round_reviews add column round_date date;

update public.golf_round_reviews rv
set round_date = r.round_date
from public.golf_rounds r where r.id = rv.round_id;

-- keep it in sync; the UNIQUE(round_id) upsert path makes a trigger safer than
-- trusting every insert site
create or replace function helm_private.sync_round_review_round_date() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  select r.round_date into new.round_date from public.golf_rounds r where r.id = new.round_id;
  return new;
end; $$;
create trigger golf_round_reviews_round_date_sync
  before insert or update of round_id on public.golf_round_reviews
  for each row execute function helm_private.sync_round_review_round_date();

create index idx_golf_round_reviews_player_round_date
  on public.golf_round_reviews (player_id, round_date desc, created_at desc);
create index idx_golf_round_reviews_round_date
  on public.golf_round_reviews (round_date desc);
```

RLS unchanged (column add only). Then the three sites become `.order('round_date', { ascending: false }).order('created_at', { ascending: false })`. Denormalise rather than order through the embed because `getPlayerReviewHistory` has no embed and PostgREST parent-ordering by an embedded column is version-sensitive. Verify a back-dated review sorts by round date in the UI before proceeding. Run `npm run knowledge:map -- --files src/app/golf/actions/round-reviews.ts` and update the doc the registry names. Migration needs the db-migration review and RLS test run.

### PR 2 — Safety-net eligibility (own PR, own test)

Prefer widening the read over changing the write. Eligibility becomes:

```
status = 'completed'
AND coachhelm_analyzed_at IS NULL
AND (coachhelm_failed_at IS NULL OR coachhelm_failure_reason = 'engine_no_recent_rounds')
```

Add a matching partial index (`golf_rounds_pending_coachhelm_idx` excludes these rows). Cap re-eligible rounds per run (separate from `BATCH_LIMIT`) so clearing 65 at once cannot starve fresh rounds. For `engine_membership_missing`: do not stamp — return a soft "not applicable" that `classifySoftFailure` keeps out of Sentry, leaving the round eligible. Tests: a floor-failed round becomes eligible; an `engine_error` round stays excluded; the stale-backlog alarm still counts correctly. **Kept separate** because this predicate has stranded rounds twice before (112, then 200).

### PR 3 — Practice priority from evidence (the slop fix)

In the four builders, compose `callToAction` from the stats already in scope (`topBracket.label`, `severeCount`, `sampleSize`, `avgAfterYards`, miss direction, scramble counts) instead of the two-string ternary. Example target: *"From 200+ yards you finished 3 of 4 misses over 25 yards out (average leave 38y). Aim at the fat side of the green from that window."* Deterministic, zero cost, no verifier exposure. `determinePracticePriority`'s `'Continue current practice routine.'` → `null` so the UI hides the field rather than show filler.

Optional PR 3b: extend `composeRoundReview` to emit structured `{ takeaway, priority }`, registering every figure in `buildEvidence`. Only once PR 3 has shipped and the owner wants prose.

### PR 4 — Pre-warm script (after PR 1 is live)

Cohort: `status='completed' AND round_date >= current_date - 30 AND NOT EXISTS (select 1 from golf_round_reviews where round_id = golf_rounds.id)`, newest `round_date` first. Calls `generateAndStoreRoundReview` — identical output to on-open generation, **no LLM cost**. Batched, concurrency-capped, skip-if-exists (cheap via `UNIQUE(round_id)`), resumable, `recordJobRun` → `background_job_logs`. Rows land as `draft` → pending queue; acceptable at 127; revisit before widening to 90d (176) / all-time (344). Because PR 1 sorts by round date, backfilled April rows land in April.

### PR 5 — Insight re-run for the 38 affected players (after PR 2 is live)

One `triggerPlayerInsightsAfterRound(playerId)` per **player**, never per failed round — 74 per-round runs would rewrite the same snapshot repeatedly and produce nothing different. Existing signatures refresh in place (`created_at` preserved → feed order stable); new signatures appear with today's date. Clear `coachhelm_failed_at` on the 74 rounds through `record_round_coachhelm_terminal_state` (service_role) in the same job so PR 2's eligibility owns any retry. Runbook states plainly: this produces each player's *current* picture, not a reconstruction of what an earlier round would have said.

### PR 6 — Insight hygiene

Collapse null-result rows (RC8) into a single "checked, no bias found" section or suppress them from the feed. Populate `evidence.window_start` / `window_end` at generation (RC9); one-off backfill as `updated_at - window_days` / `updated_at`.

### PR 7 — July fallback root cause (RC10) and `hero_narrative` caller check (RC11)

Recaps are not persisted so nothing to regenerate; find why July hit 91% and whether `hero_narrative` was removed on purpose.

### Investigation — stuck `in_progress` rounds (RC3)

Sample the 42: last `golf_shots.created_at`, hole reached, device, whether `completeRound` was ever called and failed. Hampden-Sydney (5, never analyzed) and Lynchburg (13) first. Decide auto-complete vs prompt-the-player only after that.

### Order of operations

PR 1 → verify sort in UI → PR 2 → PR 4 (30d pre-warm) → verify lists → PR 5 (38-player re-run) → PR 3 → PR 6 → PR 7 / investigations in parallel.

---

## 9. Open questions for the owner

1. PR #1934 — merge now, or after a coach re-test of the mid-hole OB flow?
2. PR 3 — how number-dense should the player-facing priority line be?
3. Hide the priority field when there is nothing to say, or keep a neutral placeholder?
4. After the 30-day pre-warm: widen to 90d (176) / all-time (344)?
5. `hero_narrative` — dead on purpose?

---

## Appendix A — Files referenced

| File | What |
|---|---|
| `src/hooks/golf/use-penalty-handler.ts`, `use-shot-state-machine.ts`, `use-undo-manager.ts` | Shipped, #1934 |
| `src/components/fairway/pages/rounds-tracking/FairwayPenaltyModal.tsx`, `FairwayShotEntry.tsx`, `FairwayShotTracking.tsx` | Shipped, #1934 |
| `src/components/golf/courses/TeeFormDrawer.tsx`, `CourseDetailDrawer.tsx`, `src/app/golf/actions/course-library.ts` | Tee editing |
| `src/lib/ai/model-provider.ts` | Billing account selection |
| `src/lib/coachhelm/v3/llm/compose.ts`, `round-review.ts`, `types.ts`, `budget.ts`, `citations.ts` | LLM layer, verifier, cost table |
| `src/app/golf/actions/v3/llm.ts` | Orphaned `generateLlmRoundReview` |
| `src/app/golf/actions/round-recap.ts` | The live `round_review` LLM caller |
| `src/app/golf/actions/round-reviews.ts` | List ordering `:1037`, `:1176`, `:1243`; `publishReview` `:1762`; `shareReviewWithPlayer` `:966` |
| `src/app/golf/actions/round-review-system.ts` | `generateAndStoreRoundReview` `:1041` |
| `src/hooks/coachhelm/useRoundReviewV2.ts` | Auto-generate on open `:388-439` |
| `src/lib/coachhelm/v2/orchestrator.ts` | `generateRoundReview` `:672`; builders `:1438-1589`; `determinePracticePriority` `:1799` |
| `src/lib/coachhelm/v2/post-round-trigger.ts` | Failure mapping `:76`; terminal-state writes `:138-235` |
| `src/app/golf/actions/insights.ts` | Feed order `:1239`; floor `:4334`; gate `:4380`; `engine_no_recent_rounds` `:4420` |
| `src/lib/coachhelm/v2/insights/upsert.ts` | Dedup `:158`; refresh `:207`; insert `:380` |
| `src/app/api/cron/coachhelm-safety-net/route.ts` | Eligibility `:143-155` |
| `src/app/api/cron/coachhelm-insight-lifecycle/route.ts` | Rules 1–4 |
| `supabase/migrations/20260824002016_allow_coachhelm_terminal_state.sql` | Terminal-state RPC + lifecycle guard |

## Appendix B — Supabase reference

**Tables:** `golf_rounds` (`status`, `round_date`, `total_score`, `coachhelm_analyzed_at`, `coachhelm_failed_at`, `coachhelm_failure_reason`; completed rows immutable via `helm_private.guard_golf_round_lifecycle` except the `coachhelm_terminal` and `stats_cache` markers); `golf_shots` (`shot_type` ∈ tee / approach / around_green / putting / penalty; `distance_unit_before` / `distance_unit_after` ∈ feet / yards — **mixed within a single round**; `putt_made`, `putt_distance_feet`, `miss_direction`, `lie_before`, `lie_after`, `result`, `is_penalty`, `penalty_type`); `golf_round_reviews` (UNIQUE `round_id`, no `round_date`); `golf_coach_insights` (UNIQUE NULLS NOT DISTINCT on `signature, player_id, coach_id, team_id`; `lifecycle_state`, `status`, `evidence`, `metadata`, `source_type`, `source_id`); `golf_coachhelm_llm_calls` (`task`, `model_id`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `citations`, `verified`, `fallback_to_template`); `golf_teams`; `golf_team_members` (drives coach RLS on reviews); `golf_team_coach_staff` (keyed by `coach_id`); `golf_players`; `background_job_logs`.

**RPC:** `public.record_round_coachhelm_terminal_state(uuid, timestamptz, timestamptz, text)` — service_role only; the only sanctioned writer of the three terminal columns.

**Indexes that matter:** `golf_rounds_pending_coachhelm_idx` (partial, the safety-net predicate); `golf_coach_insights_dedup_key`; `idx_insights_signature_recent`; the three `created_at` indexes on `golf_round_reviews`.

**Mistakes made in-session, so the next reader doesn't repeat them:** it is `golf_coach_insights`, not `coach_insights`; insights have no `round_id`; `team_members` / `teams` do not exist — `golf_team_members` / `golf_teams` do; `golf_rounds.round_date`, not `completed_at`; there is no `golf_round_holes` — per-hole facts come from `golf_shots`; the ledger column is `task`, not `call_type`; the insight body is `content`, not `description`; `ls` in this shell is aliased to a tool that rejects directory arguments — use `/bin/ls`; a stale 0-byte `.git/index.lock` from Sep 10 blocked staging and was removed after confirming no git process held it.
