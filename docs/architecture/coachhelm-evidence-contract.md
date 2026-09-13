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
| `d1_avg` / `d2_avg` / `d3_avg` / `naia_avg` / `juco_avg` | College-division benchmarks | D2 avg putting make% from 5ft |
| `pga_baseline` | PGA Tour reference | PGA avg fairway% |
| `absolute_target` | Fixed reference point | par, uniform-25% distribution |
| `estimated_target` | A derived coaching target, not a measured population average (women's-college anchors in `v3/counterfactual/cohort-baselines.ts`: LPGA/NCAA figures discounted to college). Rendered as "Estimated target". Labels built by `cohortAnchorLabel()` say `target (est.)`. | Women's college sand save target (est.) 38% |

A static test at `src/test/coachhelm/v2/insights/baseline-registry.test.ts`
fails CI if any miner emits a `comparison_source` outside this set.

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
- **No promotion to `matured`**: `movement_count` counts ≥5% value swings,
  not confirmations.
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
  are one observation.

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
- `/api/coachhelm/analyze-player` currently returns 200 with `success: false` on
  engine-level failure. A follow-up will flip to 5xx when
  `generatorSummary.failures.length > 0` so platform-level observability sees
  real signal (audit Q-NEW-6, partially addressed).

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

## Metric identity table (A0 deliverable — approach, scrambling, tee, course-hole)

| Measure | `evidence.metric` / key | Unit | Numerator | Denominator | Eligibility | Direction | Comparator | Producer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Green-hit rate per band | `approach_proximity_{50_125ft,125_175ft,175_plus_ft}` (registry id kept; `polarity: higher_better`, `unit: percent`, label "Greens hit from …") | percent | approaches from the band finishing on the green (`result` green/hole/gir) | approaches from the band in the 90-day window | ≥ 5 attempts in band; intent unknown (a par-5 lay-up logged as an approach counts — addendum A2 separates it) | higher_better | `greenHitAnchor(bucket, gender)`: men's approximate Tour band figure (`pga_baseline`), women's derived target (`estimated_target`) | `v3/generators/approach-miss.ts` |
| On-green proximity per band | same registry id; `standing.metric_id`, `agg.playerValue`, `evidence.detail.proximity_when_hit_feet` | feet | sum of finish distance for green-finding approaches | green-finding approaches (≥ 3) | as above, on-green finishes only | lower_better | team tick only (same basis). Tour marker omitted (`pga_omitted`) and no counterfactual: `pga_value` is all-shot proximity, misses included | approach-miss standing block; `standing/refresh.ts` |
| Short-approach on-green leave (composite) | `approach_proximity_50_125ft` on the `short_approach_proximity_gap` composite; `polarity: lower_better`, `unit: feet` | feet | `detail.proximity_when_hit_feet` of the source approach_miss row | green-finding approaches only | fires above `DIAL_IN_TARGET_FT` (22 ft) AND weak scrambling | lower_better | the rule's own threshold as `estimated_target` ("Dial-in target ~22 ft (est., on-green only)") — never a Tour all-shot proximity, same basis rule as the approach_miss row | `v3/composite/rules/short-approach-proximity-gap.ts` |
| GIR % | `gir_pct` | percent | holes with `golf_holes.gir = true` | holes played | per hole (regulation status as logged; addendum A1 re-derives it from total strokes incl. penalties) | higher_better | `cohortAnchor('gir_pct', gender)` / DB `pga_value` | stats cache; **a different id from green-hit rate by contract** |
| Miss-axis share | diagnosis driver `approach_miss_{short,long,left,right}_share` | percent | misses on the dominant pole of one axis | misses with a read on that axis (`n` in the observation) | ≥ 5 directional misses and share ≥ 0.55 (`dominantAxis`) | descriptive | none — an observation; the reading's `check` names what is not recorded (intent, club, wind, target) | `v3/engine/diagnosis.ts` `approachAxisReading` |
| Rough/sand recovery leave | `recovery_proximity_rough_sand` (composite; was `short_side_proximity`) | feet | sum of leave (yards ×3 normalised) | short-game shots from rough/sand (≥ 10) | shot record only — short-sidedness is **not** measured (needs pin position + miss side) | lower_better | Tour ~10 ft (approx), `strokes_impact_method: rough_estimate` | `composite/rules/short-side-scrambling-chain.ts` |
| Sand save % | `scrambling_pct_sand` | percent | up-and-downs from sand | sand attempts | 90-day shot window | higher_better | `cohortAnchor`; women's labelled `target (est.)` with `estimated_target` | `v3/generators/scrambling.ts` |
| Tee distance | `TeeStrategyShot.shot_distance` + `distance_method` | yards | — | — | `recorded` = logged travel; `derived_progress` = hole yardage − remaining (progress toward the hole, never carry) | — | driver vs non-driver averages; prose discloses the derived count when > 0 (0 of 7653 in production 2026-09-12) | `engine/shot-source.ts` → `generators/tee-strategy.ts` |
| Specific-hole scoring | `worst_holes[]` keyed by (`course_id`, `hole_number`) | strokes over par per play | sum of score − par | plays of that course-hole (≥ 3) | rounds with a `course_id`; rounds without one are excluded and the round count is stated in `worst_holes_excluded_rounds` (223 of 566 completed rounds on 2026-09-12 — a hole count would read as thousands). A course name is display metadata, never an identity | lower_better | none | `v3/generators/course-mgmt.ts` via `hole-diagnosis.ts` `DiagnosisHole.course_id` |
| Ordinal-hole scoring | `opening_hole_delta` | strokes | hole-1 score − par | rounds | grouped by hole **number** on purpose (an ordinal position, distinct signature and wording) | lower_better | DB `pga_value` | `v3/generators/warmup-hole.ts` |

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
| `src/test/coachhelm/v2/insights/baseline-registry.test.ts` | Static guard catching hard-coded `comparison_source` strings |
