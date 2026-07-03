# CoachHelm Engine and Output Accuracy Deep Dive

Date: 2026-06-21  
Repository: `/Users/ricknini/Downloads/helmv3`  
Scope: CoachHelm engines inside GolfHelm, specifically their ability to find root-cause insights, expose weaknesses, and produce useful outputs for coaches and players. This is a feature and correctness audit, not a security audit.

## Executive Verdict

CoachHelm's engine foundation is real: the system has broad scorecard, shot, putt, standing, counterfactual, genome, prediction, chat, and LLM surfaces. The raw data is strong enough to support meaningful root-cause work:

| Input source | Production state |
|---|---:|
| Completed scored rounds | 185 |
| Completed rounds with total score, score-to-par, putts, fairways, GIR, SG total | 185 each |
| Shot rows | 13,928 |
| Shot rows with shot type, club type, lie before, distance before/after | 13,928 each |
| Shot rows with miss direction | 4,271 |
| Putt rows with distance/break | 6,030 |
| Putt rows with slope | 5,976 |

The main issue is not lack of data. It is that CoachHelm often stops at "measured weakness" and only sometimes graduates into "why this is happening, how confident we are, and what action closed the loop." The product is strongest when deterministic V3 generators plus composite rules fire. It is weakest when output accuracy depends on advisory LLM verification, goals/predictions/effectiveness loops, or chat/tool persistence.

## What Is Working

1. **V3 insights are evidence-backed at the measurement level.** All 322 live V3 insights have a metric, sample count, player value, displayed value, confidence, window, comparison, and stroke-impact field. See `golf_coach_insights.evidence`.
2. **Deduplication is working for same-player V3 rows.** No duplicate `(signature, title, player_id)` groups were found among V3 insights.
3. **Ranking has meaningful safeguards.** `src/lib/coachhelm/v3/ranking/score.ts:239-272` clamps confidence, caps stroke impact, applies sample damping, adds goal and coachability boosts, and gives urgent rows a deterministic top band.
4. **BaseGenerator has strong write discipline.** `src/lib/coachhelm/v3/engine/generator-base.ts:376-549` centralizes sample gates, standing injection, counterfactual injection, confidence calculation, priority honesty, stale retraction, and V3 upsert.
5. **Several root-cause helpers are solid.** `src/lib/coachhelm/v3/engine/diagnosis.ts:59-124` handles dominant miss-axis detection without counting neutral misses against a direction, then emits specific coachable diagnosis language.

## Major Accuracy and Wiring Findings

### E01. Root cause is mostly prose, not a structured output contract

**Impact:** CoachHelm can say useful causal things, but downstream coach/player screens cannot reliably audit, filter, compare, or learn from root causes because root-cause fields are not stored structurally.

Production evidence:

- V3 insights: 322.
- `evidence.root_cause`: 0 rows.
- `evidence.drivers`: 0 rows.
- `evidence.confidence_reason`: 0 rows.
- Composite root-cause rows: 26 rows with `evidence.composite_rule_id`.
- Standing/counterfactual rows: 189 rows.

Code evidence:

- `src/lib/coachhelm/v3/engine/generator-base.ts:416-529` stores measurement, standing, confidence, counterfactual, and stroke impact, but has no required `root_cause`, `drivers`, `action`, or `hypothesis_type` contract.
- `src/lib/coachhelm/v3/composite/types.ts:50-66` lets composite rules return arbitrary signals but persists only the generic `InsightEvidence` shape.

Recommendation:

- Add a V3 `diagnosis` object to every insight:
  - `symptom`: what was measured.
  - `root_cause`: direct observation, inferred hypothesis, or unknown.
  - `drivers`: structured driver list with metric/value/sample/source.
  - `recommended_action`: one concrete action.
  - `confidence_reason`: why confidence is high/medium/low.
  - `causality_level`: observed, correlated, inferred, or coach hypothesis.

### E02. Composite insights are useful but over-confident for hypothesis outputs

**Impact:** Composite cards like "Lag putts -> 3-putt cascade" and "Pressure shows up in your short putts" are the best root-cause layer in CoachHelm, but they can present estimates and domain hypotheses as if they were directly observed.

Production evidence:

- 26 live V3 composite insights.
- 0 composite rows have `confidence_factors.factors_measured`.
- Composite confidence averages about 0.77.
- Repeated factor shapes are static, for example `{ sample_adequacy: 0.8, recency: 1, variance: 0.5 }`.

Code evidence:

- `src/lib/coachhelm/v3/composite/synthesis.ts:252-284` bypasses `BaseGenerator.computeMeasuredFactors`.
- `src/lib/coachhelm/v3/composite/rules/lag-distance-3putt.ts:74-80` computes expected 3-putt rate from two source make-rate cards. That is a reasonable estimate, but not direct observation of first-putt leave distance plus comeback conversion.
- `src/lib/coachhelm/v3/composite/rules/lag-distance-3putt.ts:118-125` writes blank windows and static confidence factors.
- `src/lib/coachhelm/v3/composite/rules/pressure-decel-chain.ts:73-119` makes a domain inference from pressure gap plus short-putt weakness, again with static confidence factors.

Recommendation:

- Route composite rows through the same confidence-honesty path as `BaseGenerator`.
- Store `causality_level='inferred_hypothesis'` for estimated chains.
- Store source insight ids plus source evidence summaries in a visible "Why CoachHelm thinks this" panel.
- Never label estimated rates as direct measured rates unless the shot sequence actually measured the chain.

### E03. Only 2 of 322 V3 rows have genuinely measured recency/variance

**Impact:** Confidence is not fake in Tier-1 rows because most rows flag `factors_measured:false`, but the system is still underusing its own data. Confidence often means sample adequacy more than stability, recency, or dispersion.

Production evidence:

| Insight type | Rows | measured true | measured false | no measured flag |
|---|---:|---:|---:|---:|
| putt_distance | 70 | 0 | 70 | 0 |
| approach_miss | 62 | 0 | 59 | 3 |
| par_scoring | 45 | 0 | 45 | 0 |
| course_management | 30 | 0 | 30 | 0 |
| putt_bias | 29 | 0 | 29 | 0 |
| composite | 26 | 0 | 0 | 26 |
| tee_strategy | 16 | 0 | 16 | 0 |
| scrambling | 15 | 0 | 15 | 0 |
| warmup_hole | 15 | 0 | 15 | 0 |
| pressure_gap | 14 | 2 | 0 | 12 |

Code evidence:

- `src/lib/coachhelm/v2/insights/types.ts:195-212` correctly drops placeholder recency/variance when `factors_measured=false`.
- `src/lib/coachhelm/v3/engine/generator-base.ts:429-435` stamps `factors_measured:false` unless an aggregate exposes dispersion and round dates.
- Only `src/lib/coachhelm/v3/generators/pressure-gap.ts:172-209` exposes enough dispersion to support measured factors.

Recommendation:

- Make every generator return `round_dates` and per-round values where available.
- Backfill measured confidence for high-surface engines first: putt distance, approach miss, tee strategy, scrambling.
- Add a confidence explanation to UI so coaches know whether confidence comes from deep sample, recent stability, or just enough observations.

### E04. LLM citation verification is advisory, not enforceable

**Impact:** CoachHelm detects unsupported numeric claims but still returns the unverified text to player surfaces. This weakens output accuracy for both player round reviews and hero narratives.

Production evidence:

- Non-fallback unverified LLM outputs:
  - coach_chat: 6.
  - hero_narrative: 6.
  - round_review: 10.
- Examples of unmatched numeric tokens include `47%`, `30`, `57`, `2026`, `50`, `29`, `62`.

Code evidence:

- `src/lib/coachhelm/v3/llm/citations.ts:31-52` returns `verified=false` and unmatched tokens.
- `src/lib/coachhelm/v3/llm/compose.ts:146-179` logs `verified`, but still returns `text` even when verification fails.
- `src/app/golf/actions/v3/llm.ts:125-130` returns that text to clients.
- `src/components/golf/coachhelm/v3/RoundReviewLlmCard.tsx:61-64` displays returned text if present and only uses `used_llm` for the badge.
- `src/components/golf/coachhelm/v3/HeroNarrativeCard.tsx:65-68` does the same.

Recommendation:

- If `verification.verified=false`, return the deterministic fallback or retry once with unmatched-token feedback.
- Show `used_llm=false` when verification fails.
- Add tests asserting unverified LLM output cannot replace fallback text.

### E05. Coach chat has orphaned turns and no persisted tool evidence

**Impact:** Coach chat is supposed to answer coach questions using tools, but production history shows several user prompts without assistant responses and no tool ledger rows. Coaches can experience dead turns, and the system cannot audit whether answers were grounded in tools.

Production evidence:

- Chat messages: 11 user, 6 assistant, 0 tool.
- Two June 16 conversations contain one user message and no assistant response.
- All six chat LLM calls are logged with `verified=false`, `citations=null`, `fallback_to_template=false`.

Code evidence:

- `src/app/api/coachhelm/v3/chat/send/route.ts:86-91` appends the user message before budget and agent execution.
- `src/app/api/coachhelm/v3/chat/send/route.ts:93-113` can return 429 after the user message is already persisted.
- `src/app/api/coachhelm/v3/chat/send/route.ts:125-132` can fail after user persistence.
- `src/app/api/coachhelm/v3/chat/send/route.ts:155-163` only writes a tool ledger if `result.toolCalls` is present; production has none.
- `src/app/api/coachhelm/v3/chat/send/route.ts:176-188` logs chat calls as unverified with no citation data by design.

Recommendation:

- Move budget gate before user-message append, or append an assistant error/status message for every failed turn.
- Persist a `turn_status` field or synthetic assistant error so history is never one-sided.
- Add chat grounding verification: at minimum, require tool calls for data questions and persist which tool outputs supported the final answer.

### E06. Goal and ranking wiring can make outputs look personalized before the loop exists

**Impact:** Ranking includes goal boost and coach weights, but production goals and weights are too thin to make this personalization trustworthy.

Production evidence from the earlier feature audit:

- 9 active goals.
- 0 evaluated goals.
- 9 empty snapshot arrays.
- 4 goals with null current value.
- 4 learned coach weights, below the ranker's `MIN_CALIBRATED_SAMPLES=10`, so they do not affect ranking.

Code evidence:

- `src/lib/coachhelm/v3/ranking/score.ts:172-191` boosts insights that match active goals.
- `src/lib/coachhelm/v3/ranking/score.ts:293-327` ignores learned coach weights until `sample_n >= 10`.

Recommendation:

- Do not represent ranking as highly personalized until goals are snapshotted/evaluated and coach weights clear calibration.
- Show "goal-aligned" separately from "proven effective for this player/coach."

### E07. Same-day predictions still poison output accuracy panels

**Impact:** Prediction output is not credible as a model-quality signal because most predictions cannot validate.

Production evidence from the prior audit:

- 783 predictions.
- 779 same-day due.
- 623 same-day unvalidated.
- 616 overdue unvalidated.

Code evidence:

- `src/lib/coachhelm/v2/prediction/performance-predictor.ts:133-150` defaults target date to now.
- `src/lib/coachhelm/v2/learning/outcome-validator.ts:154-169` validates through due date parsed at UTC midnight, often before the prediction was created.

Recommendation:

- Treat existing prediction accuracy as invalid until same-day due rows are repaired or excluded.
- Validate against the first eligible completed round after creation.

## Coach Output Assessment

Coach outputs are best when they display:

- the highest-ranked V3 insights;
- urgent composite hypotheses;
- player standing against team/college/Tour;
- recent rounds;
- direct measurements like putt bands, miss bias, pressure gaps, and scrambling.

Coach outputs are weakest when they imply:

- CoachHelm knows the root cause, when it only inferred it from correlated symptoms;
- a chat answer was tool-grounded, when no tool ledger was persisted;
- predictions/effectiveness are learned and calibrated, when validation and attribution loops are thin;
- goals are part of a closed loop, when they are mostly unevaluated active rows.

## Player Output Assessment

Player outputs are best when:

- deterministic insight cards show measured values, comparisons, sample counts, and one action;
- round reviews use the deterministic fallback summary;
- hero cards reflect the top insight without adding new unsupported numbers.

Player outputs are weakest when:

- unverified LLM text replaces fallback text;
- confidence is shown without explaining whether recency/variance were measured;
- composite cards sound definitive even when they are estimates;
- dismissed feedback does not remove canonical-visible insights, from the earlier feature audit.

## Priority Fix Sequence

1. **Make output verification enforceable.** On unverified LLM output, fallback or retry; do not render unsupported numeric claims.
2. **Create a structured diagnosis contract.** Persist root cause, drivers, action, causality level, and confidence reason for every V3 insight.
3. **Fix composite confidence and hypothesis labeling.** Run composite confidence through the same honesty path and label estimates as estimates.
4. **Repair chat turn persistence.** No orphaned user messages; no data-answer without tool evidence.
5. **Expand measured confidence.** Add dispersion/date signals to the high-volume generators.
6. **Repair prediction and goal loops.** Until then, keep prediction accuracy, goal progress, and effectiveness-learning UI modest and clearly caveated.

## Bottom Line

CoachHelm is already good at finding measurable weaknesses. It is not yet consistently good at proving root cause, explaining confidence, and closing the loop from recommendation to outcome. The highest-leverage improvement is not another generator. It is a stricter output contract: every insight should say what was measured, why CoachHelm thinks it happened, whether that "why" is observed or inferred, what the player/coach should do, and what future data will prove the recommendation worked.
