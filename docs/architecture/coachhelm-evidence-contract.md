# CoachHelm Evidence Contract

Status: **ACTIVE** as of 2026-05-17.
Source: closes audit Findings 1, Q-NEW-1/2/3/5/12, A-NEW-3, S-HIGH-1 from
`.full-review-2026-05-17-golfhelm-audit/05-final-report.md`.

## Promise

Every insight emitted to `golf_coach_insights` carries an `evidence` JSON that
is internally consistent: when `comparison_source = X`, the `comparison_label`
and `comparison_value` originated from a single `BaselineRegistry` entry for X.
The three fields cannot disagree.

## Allowed `comparison_source` values

`InsightComparisonSource` is the discriminated union at
`src/lib/coachhelm/v2/insights/types.ts`. `peer_percentile` was removed in
2026-05-17.

| Source | Meaning | Example |
| --- | --- | --- |
| `your_baseline` | Player's own rolling history | last-N rounds putting make% |
| `team_avg` | Teammates' aggregated stats | team median scrambling rate |
| `d1_avg` / `d2_avg` / `d3_avg` / `naia_avg` / `juco_avg` | College-division benchmarks. As of 2026-09-23 (N16) none has a live producer, and none is backed by a cited, measured division-population figure — see the provenance section below before adding one. | D2-style putting target (approx.) from 5ft |
| `pga_baseline` | PGA Tour reference | PGA avg fairway% |
| `absolute_target` | Fixed reference point | par, uniform-25% distribution |
| `estimated_target` | A derived coaching target, not a measured population average (women's-college anchors in `v3/counterfactual/cohort-baselines.ts`: LPGA/NCAA figures discounted to college). Rendered as "Estimated target". Labels built by `cohortAnchorLabel()` say `target (est.)`. | Women's college sand save target (est.) 38% |

A static test at `src/test/coachhelm/v2/insights/baseline-registry.test.ts`
fails CI if any miner emits a `comparison_source` outside this set.

## Provenance: measured vs. derived (repair plan N16, 2026-09-23)

A `comparison_source` name alone is not a promise the number behind it was
measured. The 2026-05-17 audit that created this contract stopped at
label/source/value *agreement*; a later audit (N16) found the agreed-upon
label could itself overclaim — `baseline-registry.ts`'s `d2_avg.*` entries
were labeled "Division II average" for numbers the file that originated them
(the deleted `putt-analytics.ts`) called "reasonable D2 averages" with no
citation. The label and source agreed with each other; both were wrong about
what the number was.

Every `BaselineEntry` in `baseline-registry.ts`, and every anchor in
`v3/counterfactual/cohort-baselines.ts`, now carries two additional fields
next to the value:

- `provenance: 'measured' | 'derived'` — `'measured'` means a cited,
  verified population statistic (e.g. the men's putt/scrambling/GIR anchors
  in `cohort-baselines.ts`, cross-checked against `golf_pga_standards` on
  2026-06-06). `'derived'` means scaled, discounted, hand-adjusted, or
  otherwise computed from a measured figure rather than itself measured — a
  defensible estimate, never a norm.
- `sourceNote` — a one-line citation, or an honest statement of how the
  value was derived when there is no citation.

Rule: a `'derived'` entry's `label` must read as a target or an estimate
("D2-style putting target (approx.)", "Women's college sand save target
(est.)") and must never contain "average", "avg", "norm", or "measured".
`src/test/coachhelm/v2/insights/baseline-registry.test.ts`'s
`N16: derived entries never carry measured-sounding wording` block and
`src/test/coachhelm/v3/cohort-baselines.test.ts`'s
`typed provenance metadata (repair plan N16)` block enforce this — both fail
CI if a new `'derived'` entry ships with measured-sounding wording, or with
no `provenance`/`sourceNote` at all.

This does not change any benchmark number. `d1_avg`, `d3_avg`, `naia_avg`,
and `juco_avg` currently have zero producers anywhere in the codebase — see
the note in the table above before wiring one up.

## How a generator emits a comparison

Generators do **not** hard-code labels. They look up an entry by `BaselineKey`
(`${source}.${bucket}`) and spread the result:

```ts
import { baselineRegistry } from '@/lib/coachhelm/v2/insights/baseline-registry';
import type { BaselineKey } from '@/lib/coachhelm/v2/insights/types';

const baselineKey: BaselineKey = `d2_avg.putting_make_pct_${agg.label}`;
const baseline = baselineRegistry.get(baselineKey);  // { source, label, value }

const evidence: InsightEvidence = {
  // ...
  comparison_value: baseline.value,
  comparison_label: baseline.label,
  comparison_source: baseline.source,
  // ...
};
```

If a generator needs a comparison that doesn't yet have a registry entry, add
the entry to `baseline-registry.ts` and reference it. Adding a stand-alone
`comparison_label: '…'` string is forbidden.

## `sample_n` floor

- `MIN_SAMPLE_N = 5` is enforced at the typed `upsertInsight` entry point
  (`src/lib/coachhelm/v2/insights/upsert.ts`).
- The legacy `toInsightInput` adapter **returns `null`** when the inbound record
  lacks sufficient `sample_n` rather than clamping it up. Callers
  (`triggerPlayerInsightsAfterRound`, `generateInsightsForTeam`) filter `null`
  results and log skipped records via `logServerError`.
- A pattern with one real observation MUST NOT become an insight claiming
  `sample_n: 5`.

## Cross-coach dedup

`upsertInsight` dedups on `(signature, player_id, coach_id, team_id)` — the
full scope of the `golf_coach_insights_dedup_key` UNIQUE NULLS NOT DISTINCT
constraint, with **no date cutoff** (DI-1, 2026-06-06: the old 30-day window
made rows older than 30 days miss the lookup, hit the conflict, and freeze
forever). Two coaches at different organizations on the same transferred
athlete cannot silently overwrite each other's evidence — they each get a
distinct row.

## Confidence method (`honest_v2`, 2026-09-12)

`calcConfidence` (`src/lib/coachhelm/v2/insights/types.ts`) is recomputed by
`upsertInsight` on every write; generators cannot drift. Three modes, keyed
by `confidence_factors.factors_measured`:

- `undefined` — legacy blend `0.4·sa + 0.3·recency + 0.3·variance`. Written
  by the v2 miners.
- `true` — the same blend with all three factors genuinely measured. Written
  by `generator-base.run()` when the aggregate carries per-round dispersion
  and round dates.
- `false` — **`sa · (1 − (3/7)·(1 − recency))`**: sample adequacy scaled by
  freshness; exactly `sa` when fresh, monotone non-increasing in age. Written
  by `generator-base.run()` for every placeholder-factor row (851 of 883 v3
  rows in production).

The previous honest-mode rule switched formulas at `recency < 1` and was
discontinuous: sample adequacy 0.24 scored 0.24 fresh and 0.56 one day into
decay, so 41 of the 208 tentative rows above the visibility floor in
production had cleared it only by ageing. Every write now stamps
`confidence_factors.method_version` (`CONFIDENCE_METHOD_VERSION`) so a reader
can tell which rule produced the stored number. This is a **support score**,
not a calibrated probability: at recency 1 it is literally
`attempts / target`.

## Lifecycle (Rule 3) — one evaluator

All lifecycle decisions live in
`src/lib/coachhelm/v2/insights/lifecycle-policy.ts`; `upsertInsight` only
persists them.

```text
insert ──(conf ≥ 0.4)──► detected ──(3 movements)──► matured ► addressed
  │                          ▲                                    ► resolved
  └──(conf < 0.4)──► tentative ──(conf ≥ 0.4, team gate open)──┘
                                              ← edge added 2026-09-12 (RC0)
archived ──(re-emitted)──► tentative | detected   (same gate)
```

- **Promotion** (`tentative → detected`) happens on either write branch
  (refresh or movement) when the *freshly recomputed* confidence clears
  `TENTATIVE_CONFIDENCE_FLOOR`. It writes `metadata.promoted_at`,
  `metadata.promotion_reason = 'confidence_floor'` and
  `metadata.first_visible_at`; it never rewrites `created_at` (a recovered
  row keeps its original feed date) and never touches `status` (a coach
  dismissal keeps hiding the row). `first_visible_at` is stamped from
  2026-09-12 onward (insert-as-detected and promotion); rows that were
  already visible carry none until the recovery backfill copies `created_at`
  into it, so any reader must fall back to `created_at` when the key is
  absent. Before this edge existed, a row born on a thin first sample stayed
  invisible forever — production held 326 tentative v3 rows, 167 with real
  sample support.
- **Maturation (`detected → matured`)** requires `MATURATION_CONFIRMATIONS`
  (3) DISTINCT evidence revisions, not raw ≥5% value swings.
  `metadata.movement_count` still counts every ≥5% swing (read only by the
  cron's Rule 2 "never moved" archive check); maturation separately tracks
  `metadata.maturation_keys`, a list of `${sample_n}|${window_end}`
  fingerprints, appended to only when a write both moves ≥5% AND carries an
  evidence revision not already in the list — so a duplicate analysis run
  over the identical underlying rounds (the post-round trigger and the
  nightly safety net both firing on the same data) never counts twice. The
  list resets to `[]` on every `promoted` and `resurrected` transition: a
  movement counted while the row was `tentative` (invisible) or `archived`
  must never carry over and mature the row on its first post-promotion write
  (2026-09-22 — the pre-fix counter could do exactly that).
- **Team gate**:
  `golf_team_coachhelm_settings.preferences.tentative_promotion_enabled` —
  same JSONB blob and opt-OUT convention as the generator toggles; only an
  explicit `false` pauses promotion (used to canary the 2026-09 recovery one
  team at a time by SQL). Fails open with a logged warning.
- **The lifecycle cron never promotes.** Only a write carrying freshly
  recomputed evidence may. The cron's Rule 4 decays `recency` from the
  *liveness anchor* (`max(created_at, metadata.last_refreshed_at,
  metadata.redetected_at)` — the same anchor Rules 2/3 use), not from
  `created_at`: a row the engine refreshed last night carries last night's
  window and is fresh however old the row is. Rule 1 counts a healthy cycle
  once per distinct evidence snapshot
  (`metadata.healthy_cycle_evidence_key`); two scans over the same numbers
  are one observation. Rule 1's healthy band is **direction-aware**
  (2026-09-22): a player at least as good as `comparison_value` per the
  metric's polarity (`isNegativePolarityMetric`,
  `src/components/golf/coachhelm/insight-card/tone-derivation.ts` — the same
  table insight-card tone uses, not a second one) is always healthy
  regardless of gap size; only the adverse direction (still behind) is
  gated by the 20% closeness threshold. A symmetric `|gap| ≤ 20%` used to
  call a player who had overshot the target unresolved for having improved
  too much.
- **Optimistic compare-and-set** (2026-09-22): every lifecycle write —
  `upsertInsight`'s `updateExisting` and the cron's per-row update — guards
  its `UPDATE` with `.eq('lifecycle_state', <value read at SELECT time>)`
  (matching the pattern `generator-base.ts`'s and `synthesis.ts`'s
  stale-scope sweeps already used) and inspects the returned rows. Zero rows
  back means a concurrent write — a coach dismiss/acknowledge/archive/
  resolve, or another concurrent engine write — already moved
  `lifecycle_state` off the observed value; the write is abandoned (logged
  as a warning, never retried, never clobbers) and the row is re-evaluated
  fresh on the next run. This closes the lost-update race the design
  contract's R1 item 6 called out: a decision computed from a stale read
  must never overwrite a concurrent transition.

The `triggerPlayerInsightsAfterRound` flow always passes an explicit `coach_id`
/ `team_id`. Bootstrap paths that don't know the coach yet (cron sweeps over
unowned rounds) fall through to `resolvePlayerOwnership` in `upsert.ts` — see
that function for ownership rules.

## Failure surface

- The orchestrator runs 9 tier-1 generators via `Promise.allSettled`. Every
  rejected result goes through `logServerError` with
  `action='analyzePlayer.tier1Generator'`, `featureArea='coachhelm'`,
  `playerId`, and `extra: { generator, reason }`.
- `analyzePlayer` returns `generatorSummary: { successes, failures }` on the
  `PlayerAnalysis` payload so callers can react to partial failure.
  `src/app/golf/actions/insights.ts` reads `generatorSummary.failures` off
  this in-process return value directly.
- `/api/coachhelm/analyze-player` was deleted (`d282423ed`, "close
  runtime-broken refs" — it was orphaned, calling nothing that still
  existed). There is no HTTP surface returning `generatorSummary` directly;
  do not point new work at the deleted route.
- The post-round trigger path has its own typed contract instead of reading
  `generatorSummary` text: `AnalysisOutcome`
  (`src/lib/coachhelm/v3/engine/analysis-outcome.ts`, #1960/repair Package
  4). `outcomeFromTriggerResult` maps a `partial: true` trigger result to
  `{ kind: 'partial', code: 'engine_partial_failure' }` — one of seven typed
  kinds (`succeeded | partial | waiting_for_data | not_applicable |
  disabled | retryable_failure | permanent_failure`), each with its own
  retry policy and terminal-state mapping, so an expected state (below the
  round floor, no membership, analysis disabled) is parked rather than
  stamped failed like a crash. Audit Q-NEW-6 (platform-level observability
  for partial failure) is closed for this path by `AnalysisOutcome`'s
  `partial` kind; `analyzePlayer`'s direct `generatorSummary` consumer above
  is a separate, still-untyped surface.

## Claim honesty fields (2026-09-12, repair plan Package 2)

Three additive evidence fields let a row say what its numbers are without
renaming a metric id (a rename needs a compatibility map and signature migration
— deferred to addendum A2):

- `evidence.polarity` (`InsightEvidence`): Producer-declared direction of
  `your_value` (`higher_better` / `lower_better`). Set whenever `your_value` is
  not the registry quantity for `evidence.metric`. `tone-derivation.ts` resolves
  polarity as: `polarity` → registry direction (only when `evidence.unit` equals
  the registry unit) → name-pattern fallback on the metric **label** when the
  unit disagreed, else on the id. Rows written before the field existed resolve
  through the unit/label path.
- `DiagnosisDriver.label` (`evidence.diagnosis.drivers[]`): Human label for the
  driver's value; `DiagnosisPanel` prefers it over the registry display label.
  `buildDiagnosis` sets it from `evidence.metric_label`.
- `ComposedInsight.rankScore` (v2 round-review builders, `orchestrator.ts`):
  Diagnostic ranking magnitude for heuristic severities (severe rate × sample
  factor, leave gap / 10, …). Ordering reads `rankScore ?? strokeImpact`;
  nothing renders it as strokes. `strokeImpact` is reserved for stroke
  measurements.

Two generator-level flags on `BaseGenerator` keep a counterfactual or Tour
marker off a row whose player value is measured on a different basis than its
benchmark: `counterfactualComparable` (false → `counterfactual: null`) and
`standingTourComparable` (false → injected standing block carries `pga_omitted:
true`, the same render path the women's gender-anchor omission uses).
`ApproachMissGenerator` sets both false.

## Delivered vs. viewed (N11, 2026-09-23)

`recordExposureForReturned` (`insight-delivery.ts:312-330`) writes a
`golf_insight_exposure` row on every server render that returns an insight to
a surface — post-rank, post-dedupe, post-overlay, pre-return. This proves
the insight reached a CoachHelm screen. It does not prove a coach looked at
it: there is no client-observed "the coach actually saw this" signal today.

The `TrustSignal.shown` field (`event-ledger.ts`) and its DB columns are
unchanged by this note — this is a copy fix only. Everywhere the count
reaches a coach (Fairway effectiveness page, trust chip tooltips,
aria-labels), the label reads "Delivered", never "Shown", with a short hint
that it counts delivery, not a confirmed view
(`src/components/fairway/pages/coachhelm/FairwayEffectiveness.tsx`).

A real "viewed" signal — a client-reported, debounced, in-viewport
confirmation distinct from delivery — is deferred future work (Package
9/11), not something this fix adds. Until it exists, "Delivered" is the
honest ceiling: it is evidence of reach, not of attention.

## Typed claim validator (2026-09-23, Package 8 slice 1)

`src/lib/coachhelm/v3/llm/citations.ts`'s numeric scan checks every number
the model emits against a FLAT evidence value set — it has no concept of
which metric a number was cited for, so a real value cited under the
wrong metric, player, or window passes unnoticed. `claim-validator.ts`
closes that gap for a `compose()` caller that opts in.

- `EvidencePacket` scopes the check to ONE `player_id` and ONE window
  (`window_start`/`window_end`), matching how round_review composes: one
  player, one round. Each `EvidencePacketEntry` carries `metric_id`,
  `value`, `sample_n`, and an optional `causal_support` (reused
  `CausalityLevel` + `DiagnosisDriver[]` from `v2/insights/types.ts`).
- `ClaimReference` is the model's typed assertion: claim id, metric id,
  value, player id, window, and an optional `claim_type: 'causal'` for a
  claim that asserts a cause rather than a fact.
- `validateClaims(claims, packet, prose)` checks each claim in a FIXED
  order — player, then window, then metric existence, then value, then
  the `sample_n` floor (reused `MIN_SAMPLE_N`, see the section above),
  then causal backing — so a claim broken in more than one way always
  reports the first check it fails, not whichever check happened to run
  last. A value that matches a DIFFERENT metric's entry in the same
  packet is `wrong_field`, distinct from `value_mismatch` (matches
  nothing at all). A causal claim needs BOTH a `causality_level` and at
  least one driver on its entry, else `unsupported_cause`.
- Vacuous-pass guard: a numeric token in the prose that no claim
  (accepted or rejected) ever attempted to cite is its own
  `uncited_number` rejection — a response with zero claims cannot
  trivially pass just because nothing was rejected.
- `compose.ts` wires this in as an EXTRA gate, after the existing numeric
  scan, when the caller supplies `evidence_packet` on `ComposeRequest`.
  The model is asked to append a delimited `<<<CLAIMS>>>...<<<END_CLAIMS>>>`
  JSON block; it is parsed with zod `safeParse`, never the AI SDK's own
  structured-output API, and is ALWAYS stripped before either verifier
  runs or before any text reaches a player. A missing or unparsable block
  is `malformed`, not an exception. Both gates share the SAME single
  corrective retry (still budget re-gated); on final failure the call log
  records `citations.reason: 'claim_validation_failed'` (taking priority
  over `'verification_failed'` when the typed gate is the one that
  failed) with a `claim_validation: { malformed, rejected: [{claim_id,
  metric_id, reason}] }` payload — fields only, no prose, mirroring the
  existing `evidence_offered` no-prose contract.
- Not wired in this slice: `round-review.ts` does not build or pass an
  `evidence_packet` yet, so this gate is dormant for every live caller
  today. `round-review.ts` itself has zero callers in production
  (`round-regime.ts` documents this); the wiring candidate is
  `round-recap.ts`'s `generateLLMRecap`, the only live, persisted
  (`golf_rounds.ai_recap`) LLM-text surface among the candidates
  surveyed — a later slice.
- `EvidencePacketEntry.kind: 'measurement' | 'aggregate'` (2026-09-23
  review fix): the `sample_n` floor only applies to `'aggregate'` (a
  value computed over multiple observations — a rate, an average).
  `'measurement'` (a direct single-round fact: this round's own score,
  putts, fairways hit) is exempt — there is no "n" to sample when the
  count IS the fact. Unlabeled entries default to `'aggregate'` so an
  entry a producer forgot to classify still fails safe (floored).
- Delimiter handling is defense-in-depth against the model itself, not
  just malformed JSON (2026-09-23 review fix): more than one
  `<<<CLAIMS>>>`/`<<<END_CLAIMS>>>` pair, or an opener with no matching
  closer, is `malformed` — every delimiter occurrence is stripped
  regardless (global, not "replace the first"), so a duplicated or
  unterminated block can never leave a literal delimiter or raw JSON
  fragment in text a player reads.
- The `uncited_number` guard also exempts (2026-09-23 review fix): a
  number that appears in ANY packet entry's value, even if no claim
  formally cited it, and numbers in narrow structural context — hole
  numbers (`hole 14`), par values (`par 4`), and written dates
  (`September 12`) — so accurate prose doesn't fall back just because
  nothing registered a course-structure number as an "evidence value".
  A bare number with no structural keyword beside it is still
  scrutinised.
- Causal language is checked in the PROSE independent of what a claim
  declares (2026-09-23 review fix): a model can tag its own claim
  `claim_type: 'fact'` (or omit the field) while still writing a causal
  sentence ("because", "due to", "led to", "as a result", "which is
  why", …) — the model's own label is not trusted. Causal prose with no
  ACCEPTED claim actually tagged and backed `'causal'` is its own
  `unsupported_cause` rejection, distinct from (and not duplicating) a
  properly-tagged causal claim that already failed its own backing
  check.
- A successful packet-engaged call now logs `citations.claim_validation:
  { accepted, rejected: 0 }` (2026-09-23 review fix) — previously only a
  discard told you the typed gate had run at all.

## Standing read rules (2026-09-12, repair deferrals)

Two rules every reader of `golf_player_standing` and `golf_coach_insights`
follows; both are pure functions with tests.

- Tour basis (addendum A2, read level; Package 7B, 2026-09-22). `standing/
  tour-basis.ts` names the metric ids whose `player_value` and `pga_value`
  CAN measure different quantities (the three `approach_proximity_*` ids)
  and gates comparability per-row via `isStandingTourComparable(metricId,
  basis)`: comparable only when `basis === 'all_shot'`; `null`/`'on_green'`/
  absent fail closed. `refresh_player_standing_shot_metrics` (migration
  `20260922120000_v3_standing_shot_metrics_all_shot_proximity.sql`) writes
  `basis: 'all_shot'` and computes `player_value` as all-shot proximity
  (misses included, 175+ yd par-5 approaches missing the green excluded as
  likely lay-ups into `layup_excluded_n`), matching `pga_value`'s basis; the
  pre-migration on-green-only figure is preserved in
  `on_green_proximity_feet`. A row this RPC hasn't (re)written keeps
  `basis: null` and stays withheld exactly as before. The three loaders in
  `standing/loader.ts` apply `applyTourBasis` after the gender anchor, so a
  comparable row reaches every surface with the Tour marker intact, and a
  non-comparable row gets `pga_omitted: true` /
  `pga_omitted_reason: 'basis_mismatch'`. `StandingStrip` / `StandingBar`
  render "—" plus a caption from `pgaOmissionNote()` and narrate it in the
  aria label when omitted; `pgaTickPct` draws no tick; `suggestGoalTarget`
  returns the baseline with `no_target_reason`; the suggestion writer's
  `rowSeverity` returns null and `WriterResult.rows_skipped_basis_mismatch`
  counts the rows it refused (also basis-aware now — its `golf_player_
  standing` select carries `basis` and passes it through
  `StandingRowWithDirection.basis`). The women's no-anchor omission carries
  `'no_womens_anchor'` the same way. Two consequences worth knowing: the
  snapshot frozen into `evidence.standing` now also carries `basis` (added
  to the injected object in `generator-base.ts` and to `EvidenceStanding` in
  `v2/insights/standing-injection.ts`) so `EvidencePanel`'s read-time
  `applyTourBasis` re-check reproduces the same comparability the row had at
  generation time; a snapshot frozen before this field existed has no
  `basis` and renders the same (safe) omission it always did. Every card
  that receives a live `PlayerStanding` (goal card, focus-area card, home
  insights drill, standing drills, filmstrip) forwards both omission fields
  to the strip — a consumer that passes `pga_value` alone redraws the
  comparison. `ApproachMissGenerator.standingTourComparable` no longer
  force-overrides the loader's decision (removed the `= false` override);
  it defers to the base class default (`true`, trust `standing.pga_omitted`
  as already basis-aware).
- No backwards target. `suggestGoalTarget` offers the Tour midpoint only
  when the player is behind the anchor (`isWorseThanAnchor`); a player
  already ahead gets `no_target_reason: 'already_ahead'` and sets their own
  number. Production 2026-09-12: 135 of 823 comparable standings are ahead
  (28 of 44 `sg_ott`, 22 of 36 `opening_hole_delta`, 17 of 44 `gir_pct`);
  those previously received a midpoint below their current value.
- Severity ordering (N5). `golf_coach_insights.priority` is TEXT, so a
  database `.order('priority')` is alphabetical (high < low < medium <
  urgent). No reader orders by that column. Feeds rank the full visible set
  with `scoreInsight` (`rankEvidenceInsights`); a "sort by priority" read
  (`searchInsights`) pages the full matching set, sorts it with
  `compareBySeverity` (`v3/ranking/score.ts`: urgent → high → medium → low,
  newest first within a band) and slices afterwards. `getTeamInsightsSummary`
  (`intelligence-dashboard.ts`) walks a SEPARATE full-team fetch in that
  order to compute `topInsight`/`activeInsights`/`urgentInsights` (A6, below)
  — the paginated page it also returns is only the table body.

### Top-N selection audit (addendum A6, 2026-09-23)

Every surface that picks a top-N or top-1 `golf_coach_insights` row must (a)
apply eligibility (`applyInsightVisibility` — v3 engine, visible
`lifecycle_state`, not coach-dismissed; plus the player-feedback overlay on
player-facing surfaces) BEFORE any DB `.limit()`/client `.slice()`, and (b)
rank survivors with the canonical composite (`scoreInsight`, reached via
`rankEvidenceInsights`/`rankEvidenceInsightsScored` in
`app/golf/actions/insight-delivery-ranking.ts`), not an ad-hoc formula.
Truncating before ranking can silently drop a genuinely higher-priority row
that happens to be older than the truncation cutoff — the same class of bug
`getTopInsightForPlayer`'s exhaustive pass already fixed for its own
non-urgent ranking (the "old newest-20/100 created_at pre-trim" note above).

Audited surfaces and outcome:

- **Hub single-pick, urgent-priority fast path** (`getTopInsightForPlayer`,
  `insight-delivery.ts`). Before: `.limit(1)` ordered by `created_at DESC` —
  with 2+ open urgent rows, always returned the NEWEST one, not the best by
  composite (the URGENT_SHORT_CIRCUIT band lifts all urgent rows equally;
  among urgent rows the composite still decides). After: fetches up to 20
  urgent candidates (urgent rows are rare; effectively exhaustive), ranks
  them with the player's real weights/goals through the SAME
  `rankEvidenceInsights` → `collapseParScoring` → `dedupeBySubject`
  pipeline, then applies the feedback overlay.
- **Hub single-pick, non-urgent ranked pass**. Already correct pre-A6 (full
  paginated fetch, canonical rank/collapse/dedupe/overlay). No change.
- **Player feed** (`getInsightsForPlayer`). Already correct (full fetch,
  canonical rank/collapse/dedupe/overlay, THEN slice). No change.
- **Coach feed** (`getInsightsForCoachWithMeta`). Already correct (full
  fetch both branches, canonical rank, THEN slice, honest `total`/`capped`).
  No change.
- **Round-review takeaway** (`getRoundTakeawayInsight`). Before:
  `.order('updated_at' desc).limit(20)` inside the ±24h window BEFORE
  ranking; ranked with neutral `{}`/`[]` weights/goals; no collapse/dedupe;
  no player-feedback overlay (a player-dismissed row in-window could still
  surface). After: paginates the FULL window via `fetchAllRowsResult`; ranks
  with the player's real weights/goals; applies
  `collapseParScoring`/`dedupeBySubject`; applies the player-feedback
  overlay (player-facing surface, same as the Hub).
- **Roster card** (`getTopInsightsForPlayers`). Before: docblock claimed the
  sweep "guarantees the roster card's top insight agrees with the
  per-player feed's head." After: ranking is unchanged (still neutral
  weights/goals — a deliberate batched-sweep tradeoff, one query for the
  whole roster instead of N); the docblock is corrected — agreement is NOT
  guaranteed whenever a player has an active goal or a non-default coach
  weight, matching the coach team-sweep's own documented tradeoff.
- **Team dashboard `topInsight`** (`getTeamInsightsSummary`,
  `intelligence-dashboard.ts`). Before: `topInsight`/`activeInsights`/
  `urgentInsights` derived from the SAME paginated page (newest ≤100 rows
  for the WHOLE team) the table body renders — a player's true worst row,
  or a player with zero rows on that page, could be missed or wrong. After:
  a separate full-team fetch (`fetchAllRowsResult`, no `.range()` cap) feeds
  `topInsight`/counts/trend; the table-body page is unchanged and still
  paginated.
- **Chat tool `getPlayerInsights`** (`v3/chat/read-tools.ts`). Before:
  `.order('created_at' desc).limit(input.limit)` at the DB — an ad-hoc,
  recency-only "ranking"; no eligibility floor matching the feed's mapper.
  After: fetches a generous bounded window (100 rows; a single player's
  eligible set), routes through the SAME canonical pipeline (via the new
  `mapRowToRankable`/`RawInsightRowForRanking` in
  `insight-delivery-ranking.ts`) with the player's real weights/goals, THEN
  slices — coach-facing, so no player-feedback overlay (matches the coach
  feed's documented rule).

Out of scope for A6 (need addendum A1–A4 evidence-packet work first): issue
grouping and parent/child claim links.

Two ranking reads outside `golf_coach_insights` were checked and are
DELIBERATELY not routed through `scoreInsight` — different domains, not an
oversight: the goal-suggestion writer (`v3/goals/suggestion-writer.ts`) ranks
by metric severity against a target, and `getPlayerWeakestAreas`/weekly-digest
pattern rollups aggregate/sample for a different purpose than "pick the single
best insight". `insights.ts`'s `getTopInsightsByStrokeImpact` (legacy V2
`WeightedInsight` shape, ad-hoc `strokeImpactScore` sort) has zero real
callers left in `src/`/`e2e`/`scripts` — a dead-code finding, left in place
(deletion is out of this ticket's scope).

## Metric identity table (A0 deliverable — approach, scrambling, tee, course-hole)

| Measure | `evidence.metric` / key | Unit | Numerator | Denominator | Eligibility | Direction | Comparator | Producer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Green-hit rate per band | `approach_proximity_{50_125ft,125_175ft,175_plus_ft}` (registry id kept; `polarity: higher_better`, `unit: percent`, label "Greens hit from …") | percent | approaches from the band finishing on the green (`result` green/hole/gir) | approaches from the band in the 90-day window | ≥ 5 attempts in band; intent unknown (a par-5 lay-up logged as an approach counts — addendum A2 separates it) | higher_better | `greenHitAnchor(bucket, gender)`: men's approximate Tour band figure (`pga_baseline`), women's derived target (`estimated_target`) | `v3/generators/approach-miss.ts` |
| On-green proximity per band (generator's own headline, `agg.playerValue` / `evidence.detail.proximity_when_hit_feet`) | same registry id; NOT `standing.metric_id` | feet | sum of finish distance for green-finding approaches | green-finding approaches (≥ 3) | as above, on-green finishes only | lower_better | none — `counterfactualComparable = false` (unchanged by Package 7B; this is a different quantity than `pga_value` and stays on-green-only for the insight card headline) | approach-miss aggregate; `v3/generators/approach-miss.ts` |
| Approach-proximity STANDING per band (`golf_player_standing` row) | same registry id; `standing.metric_id`, `standing.player_value` | feet | Package 7B (2026-09-22, migration `20260922120000_*`): ALL-SHOT — sum of finish distance for every eligible approach in the band, misses included | eligible approaches in the band | ≥ 10 attempts AND ≥ 3 distinct rounds (addendum A2 §5.2 floor, replacing the old MIN_GREENS=3); 175+ yd par-5 approaches missing the green excluded as likely lay-ups (`layup_excluded_n`), not counted as misses | lower_better | team tick (same basis either way). Tour marker draws when `basis = 'all_shot'` (`standing/tour-basis.ts` `isStandingTourComparable`); withheld (`pga_omitted: true, pga_omitted_reason: 'basis_mismatch'`) for `basis` null/`'on_green'` — a row not yet refreshed onto the new basis fails closed, same as every row before this migration. `pga_value` is all-shot proximity (unchanged). The pre-migration on-green-only figure is preserved in `on_green_proximity_feet` for `short-approach-proximity-gap.ts` | `refresh_player_standing_shot_metrics`; `standing/refresh.ts` |
| Short-approach on-green leave (composite) | `approach_proximity_50_125ft` on the `short_approach_proximity_gap` composite; `polarity: lower_better`, `unit: feet` | feet | `detail.proximity_when_hit_feet` of the source approach_miss GENERATOR aggregate (not the `golf_player_standing` row — that one moved to all-shot under Package 7B) | green-finding approaches only | fires above `DIAL_IN_TARGET_FT` (22 ft) AND weak scrambling | lower_better | the rule's own threshold as `estimated_target` ("Dial-in target ~22 ft (est., on-green only)") — never a Tour all-shot proximity; unaffected by Package 7B, which is why `on_green_proximity_feet` was added to the standing row instead of changing this generator aggregate | `v3/composite/rules/short-approach-proximity-gap.ts` |
| GIR % | `gir_pct` | percent | holes with `golf_holes.gir = true` | holes played | per hole (regulation status as logged; addendum A1 re-derives it from total strokes incl. penalties) | higher_better | `cohortAnchor('gir_pct', gender)` / DB `pga_value` | stats cache; **a different id from green-hit rate by contract** |
| Miss-axis share | diagnosis driver `approach_miss_{short,long,left,right}_share` | percent | misses on the dominant pole of one axis | misses with a read on that axis (`n` in the observation) | ≥ 5 directional misses and share ≥ 0.55 (`dominantAxis`) | descriptive | none — an observation; the reading's `check` names what is not recorded (intent, club, wind, target) | `v3/engine/diagnosis.ts` `approachAxisReading` |
| Rough/sand recovery leave | `recovery_proximity_rough_sand` (composite; was `short_side_proximity`) | feet | sum of leave (yards ×3 normalised) | short-game shots from rough/sand (≥ 10) | shot record only — short-sidedness is **not** measured (needs pin position + miss side) | lower_better | Tour ~10 ft (approx), `strokes_impact_method: rough_estimate` | `composite/rules/short-side-scrambling-chain.ts` |
| Sand save % | `scrambling_pct_sand` | percent | up-and-downs from sand | sand attempts | 90-day shot window | higher_better | `cohortAnchor`; women's labelled `target (est.)` with `estimated_target` | `v3/generators/scrambling.ts` |
| Tee distance | `TeeStrategyShot.shot_distance` + `distance_method` | yards | — | — | `recorded` = logged travel; `derived_progress` = hole yardage − remaining (progress toward the hole, never carry) | — | driver vs non-driver averages; prose discloses the derived count when > 0 (0 of 7653 in production 2026-09-12) | `engine/shot-source.ts` → `generators/tee-strategy.ts` |
| Specific-hole scoring | `worst_holes[]` keyed by (`course_id`, `hole_number`) | strokes over par per play | sum of score − par | plays of that course-hole (≥ 3) | rounds with a `course_id`; rounds without one are excluded and the round count is stated in `worst_holes_excluded_rounds` (223 of 566 completed rounds on 2026-09-12 — a hole count would read as thousands). A course name is display metadata, never an identity | lower_better | none | `v3/generators/course-mgmt.ts` via `hole-diagnosis.ts` `DiagnosisHole.course_id` |
| Ordinal-hole scoring | `opening_hole_delta` | strokes | hole-1 score − par | rounds | grouped by hole **number** on purpose (an ordinal position, distinct signature and wording) | lower_better | DB `pga_value` | `v3/generators/warmup-hole.ts` |

## Situational fact types (A1 deliverable — pure core, no DB)

`src/lib/coachhelm/v3/context/` (addendum A1) holds the pure, DB-free shot
and hole types the future evidence-packet / distance-profile / par-analysis
work (A2–A4) builds on. Nothing in this package reads a table; a DB-backed
adapter (`load-player-context.ts`, and wiring into `engine/shot-source.ts` /
`engine/generator-base.ts`) is a later slice.

- **`ShotFact`** (`context/types.ts`) — one normalized shot. Distances are
  canonicalized to feet. `null` means no measurement exists (or a value
  was recorded with no usable unit); `0` means a real, recorded
  zero-distance state (e.g. the ball is already at the hole). The two are
  never conflated — see `normalizeShotValue`'s discriminated result below.
  `intent` (`ShotIntent`) is carried through ONLY when the ingest layer
  explicitly tagged it; A1 never infers intent from distance or outcome —
  that inference, done carefully with denominators and eligibility rules,
  is A2's job (`distance-profile.ts`, not yet built). `golf_shots` has no
  column backing `intent` today, so every real fact normalizes to
  `'unknown'` until an annotations table exists to source it from.
  `putt_made` mirrors `golf_shots.putt_made`; a hole terminates on EITHER
  `result === 'hole'` OR `putt_made === true`, matching how
  `round-review-system.ts`/`round-review-content.ts` already read it.
- **`HoleContext`** (`context/types.ts`) — a hole's AUTHORITATIVE totals
  (par, `total_strokes`, `penalty_strokes`, `putts`, `gir`, `yardage`),
  sourced from `golf_holes`, never derived from the shots being validated
  against it. `yardage` is nullable, like `golf_holes.yardage` itself —
  added for #1990 (A3 par-opportunities), which fills it in from this
  loader. `HoleContext.par` (already present) is what
  `metrics/distance-profile.ts` (A2) uses for its 175+ yd par-5 lay-up
  exclusion.
  Mirrors `engine/hole-diagnosis.ts`'s `DiagnosisHole` shape. `total_strokes`
  is non-nullable BY CONTRACT: a `HoleContext` must only ever be constructed
  for a hole with a non-null `golf_holes.score`, mirroring
  `hole-diagnosis.ts`'s `if (score === null) continue` — enforcing that
  exclusion is the adapter's (`load-player-context.ts`, not yet built) job.
  `penalty_strokes` stays nullable: `null` means "not recorded", not zero —
  a deliberate departure from `hole-diagnosis.ts`'s engine-level
  `penalty_strokes ?? 0` default. `buildHoleSequence` skips the
  penalty-count reconciliation entirely when it is `null`, rather than
  comparing against an assumed 0.
  `holeIdentityKey(hole)` returns `` `${course_id}:${hole_number}` `` or
  `null` when `course_id` is missing — a missing `course_id` is never
  treated as equal to another missing `course_id` just because both hole
  numbers match. Two different courses' "hole 7" collide under a bare
  `hole_number` (see the "Specific-hole scoring" row above); this is the
  same identity rule stated as a reusable pure function.
- **`AnalysisScope`** (`context/types.ts`) — `player_id`, an optional
  `[window_start, window_end]`, and a fixed `analysis_cutoff` instant. A1's
  fixtures and types only carry the cutoff value; enforcing it against a
  live source is `load-player-context.ts`'s job (not yet built).
- **`normalizeShotValue`** (`context/normalize-shot.ts`) — converts one raw
  `(value, unit)` pair for `feet | yards | percent | count | strokes`.
  Returns a discriminated union (`{kind:'value', value, unit}` or
  `{kind:'missing', reason}`) rather than a bare `number | null`, so a
  caller must branch on `kind` before touching `value` — the type itself
  makes the classic `if (!value)` bug (folding `0` and `null` together)
  impossible to write by accident. `normalizeShot` applies this
  independently to `distance_to_hole_before` and `distance_to_hole_after`:
  they carry INDEPENDENT unit columns in `golf_shots`
  (`distance_unit_before`/`distance_unit_after`), and assuming they match
  is the exact bug `engine/shot-source.ts`'s `bucketApproachDistance`
  comment documents (a 43-yd/128-ft shot read as a 128-YARD approach).
- **`buildHoleSequence(facts, hole)`** (`context/build-hole-sequence.ts`) —
  validates a hole's shots against its `HoleContext` totals. A matching row
  count is necessary but not sufficient: order (sequential `shot_number`
  from 1, no gaps or duplicates), termination (`result === 'hole'` OR
  `putt_made === true` on, and only on, the last shot), and penalty
  representation (the `is_penalty` row count reconciles with
  `penalty_strokes` when it is recorded, and no `is_penalty` shot may carry
  a green-finding `result`) are each checked independently. Returns
  `{ shots, complete, reasons }` with every violated check listed, not just
  the first — a caller can show exactly what's wrong with an incomplete
  sequence instead of one symptom at a time.

Seven named fixtures in
`src/test/coachhelm/v3/fixtures/situational-intelligence.ts` (A0) exercise
this package: a two-course same-hole-number pair, a par-5 lay-up, a par-3
tee shot that is itself the green attempt, an explicit two-penalty pair, an
incomplete sequence (missing the final holing putt), a mixed-unit approach
(before in yards, after in feet, same row), and a chip-in hole-out from
around the green (`result === 'hole'` with `putt_made` staying `null`
throughout, since it was never a putt). Each carries its own `observed_at`
per shot and one fixed `analysis_cutoff` in its `scope`, so the fixture's
expected result never depends on when a test happens to run.

`AnalysisScope` is carried by every fixture but not yet consumed by any A1
function — the source-scoping and historical-cutoff tests the addendum
lists for A1 are deferred to the loader slice (`load-player-context.ts`),
which is the first place a live source exists to scope or cut off against.

## Player-context loader and shot-source adapter (A1 slice 2)

`context/load-player-context.ts`'s `loadPlayerContext(scope, deps)` is the
first DB-backed A1 function — it is the ONLY place in `context/` that reads
`golf_rounds`/`golf_holes`/`golf_shots`, and it fulfills the two boxes the
section above left deferred:

- **Scoping.** `scope.player_id` is the ONLY scope column filtered on, and
  it is the ONLY authorization check inside this module — `deps.supabase`
  is caller-supplied and may carry no RLS at all (an admin client), so
  whoever calls `loadPlayerContext` is responsible for only ever passing a
  `player_id` that caller is authorized to read. `golf_rounds.team_id` is
  read but never filtered — two players sharing a team must never see each
  other's rounds through this loader (see the "does not use team_id to
  scope" test). `window_start`/`window_end` bound `golf_rounds.round_date`.
  Rounds are further scoped to `status = 'completed'`, matching every
  sibling reader (`shot-source.ts`, `causality/attribute.ts`,
  `chat/read-tools.ts`, `goals/window-metric.ts`) — an in-progress round's
  holes/shots are not settled evidence yet.
- **Cutoff.** `analysis_cutoff` bounds each hole's and shot's own
  `created_at` — the closest available proxy for "observed", since
  `golf_holes`/`golf_shots` carry no separate observation timestamp. A
  `null` created_at (a legacy row predating the column) is treated as
  available, not excluded. A shot excluded by cutoff can turn an
  otherwise-complete hole into a partial sequence; `coverage
  .partialSequenceCount` (via `buildHoleSequence`) is how a caller sees
  that without the shot silently vanishing. A shot's `updated_at` is
  checked separately: one edited strictly AFTER the cutoff is excluded
  with reason `edited_after_cutoff` — its current value isn't what was
  known as of the cutoff, even if the row itself existed earlier.
  `golf_holes` has no `updated_at` column, so this applies to shots only.
  Cutoff and recorded timestamps are compared as instants (`Date.parse`),
  never as raw ISO strings, since two timestamps for the same instant can
  differ in string form (offset, precision).
- **`HoleContext` invariant enforced here.** A hole with a null
  `golf_holes.score` is excluded (`coverage.holesExcludedByReason
  .null_score`), mirroring `hole-diagnosis.ts`'s own exclusion — this is
  where that invariant, stated as a doc comment on `HoleContext
  .total_strokes`, is actually enforced against a live source. A shot
  whose owning hole was excluded for ANY reason (null score, missing par
  or hole number, after cutoff) is excluded too, with reason
  `hole_excluded` in `coverage.shotsExcludedByReason` — a direct shot
  consumer (e.g. `metrics/distance-profile.ts`, which reads `ShotFact[]`
  without ever looking at `HoleContext`) must not keep evidence from a
  hole this loader has already disowned.
- **DB dependency is injected** (`deps.supabase`) rather than constructed
  inside — a test passes a fake client instead of a live database. Every
  Supabase error is thrown (via `fetchAllRows`), never swallowed into an
  empty result. Round-id lists are chunked at 200
  (`src/lib/supabase/chunk-ids.ts`) before each `.in()` filter, and each
  chunk is paginated past the 1,000-row cap (`fetchAllRows`).

`context/adapters/shot-source-adapter.ts`'s `approachShotToShotFact` maps
`engine/shot-source.ts`'s already-shipped `ApproachShot` (what
`approach-miss.ts` already loads and aggregates) onto `ShotFact`, additively
— it changes no generator output. `shot-source-adapter.test.ts` compares
the existing broad approach totals before/after normalization on fixed
fixtures: bucketing on a canonical, unit-normalized distance instead of the
existing raw-value bucketing (`bucketApproachDistance`'s own "unrecognized
unit ⇒ assume yards" fallback) is the only source of disagreement found,
and it only ever REMOVES an unmeasurable-distance shot from `attempts` —
never adds one, and never changes which shots count as green hits (`result`
and `lie_after`, which `reachedGreen` reads, pass through normalization
unchanged). `approach-miss.ts` itself is unmodified except exporting the
already-existing `reachedGreen` so the comparison can reuse it instead of
forking a copy that could drift.

## How to add a new comparison source

1. Append to `InsightComparisonSource` and `COMPARISON_SOURCES` in `types.ts`.
2. Add a registry entry at the right key in `baseline-registry.ts` — unless the
   source's values are owned elsewhere: `estimated_target` has no registry
   entries because its cohort anchors (`greenHitAnchor`, `cohortAnchor`,
   `DIAL_IN_TARGET_FT`) are derived per band/gender in
   `v3/counterfactual/cohort-baselines.ts` and the composite rules, and the
   label is built beside the value (`cohortAnchorLabel`) so the triple still
   cannot disagree.
3. Add a row to the `SOURCE_LABELS` map at
   `src/components/golf/coachhelm/insights/EvidencePanel.tsx` for user-facing
   rendering.
4. Update this doc.

## Files

| File | Role |
|---|---|
| `src/lib/coachhelm/v2/insights/types.ts` | Type definitions, canonical enum, `BaselineKey` |
| `src/lib/coachhelm/v2/insights/baseline-registry.ts` | Single source of truth for `(source, label, value)` |
| `src/lib/coachhelm/v2/insights/upsert.ts` | Dedup; persists lifecycle |
| `src/lib/coachhelm/v2/insights/lifecycle-policy.ts` | Lifecycle evaluator |
| `src/app/api/cron/coachhelm-insight-lifecycle/route.ts` | Nightly Rules 1–4 (resolve / archive / decay / demote); never promotes. `MIN_SAMPLE_N`, coach/team-scoped dedup and the insert / refresh / movement / resurrection / promotion branches live in the two rows above |
| `src/lib/coachhelm/v2/insights/to-insight-input.ts` | Legacy v1 → v2 adapter; returns null on insufficient data |
| `src/lib/coachhelm/v2/orchestrator.ts` | Tier-1 generator dispatch + `generatorSummary` |
| `src/lib/coachhelm/v3/engine/analysis-outcome.ts` | Post-round outcome |
| `src/test/coachhelm/v2/insights/baseline-registry.test.ts` | Static guard catching hard-coded `comparison_source` strings |
