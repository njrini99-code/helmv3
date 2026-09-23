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
- Not wired in slice 1: `round-review.ts` does not build or pass an
  `evidence_packet`, so this gate stays dormant there. `round-review.ts`
  itself has zero callers in production (`round-regime.ts` documents
  this) and this stays true — no persistence path from
  `composeRoundReview` into `golf_round_reviews` was added; that remains
  a product/cost decision for the owner, not a slice.
- Wired in slice 2 (2026-09-23, Package 8 slice 2): `round-recap.ts`'s
  `generateLLMRecap` was the only live, persisted (`golf_rounds.ai_recap`)
  LLM-text surface among every `compose()`/LLM-text caller surveyed
  (`round-review.ts`, `hero-narrative.ts`, `practice-rx/composer.ts` all
  have zero production callers; the coach-chat stream route has no
  persisted output to gate). `buildRecapEvidencePacket()`
  (`recap-evidence.ts`) builds the packet from the SAME `fir`/`gir`
  `pct()`-rounded values the prompt's `facts` block already shows the
  model — recomputing them independently would risk a rounding-drift
  `wrong_field`/`value_mismatch` false rejection over the same true
  percentage. Every round-level fact (`total_score`, `score_to_par`,
  `total_putts`, `fairways_hit_pct`, `gir_pct`, `front_nine`,
  `back_nine`) is `kind: 'measurement'`; the season aggregates
  (`season_scoring_average`, `season_best_round`, sample_n =
  `stats.rounds_played`) are `kind: 'aggregate'` and are withheld
  entirely for a non-18-hole round, mirroring the prompt's own
  18-hole-only gating for those same figures.
  Gated behind `coachhelm_recap_claim_packet` (`config/feature-flags.yml`,
  type `experiment`, default off everywhere) — off, `generateLLMRecap`
  passes no `evidence_packet` and behavior is byte-for-byte what it was
  before this flag existed; the existing flat numeric scan
  (`buildRecapEvidence`/`citations.ts`) runs either way, unaffected by
  this flag. `round-recap-claim-gate.test.ts` exercises the REAL
  `compose()` → `claim-validator.ts` pipeline (not a mocked `compose()`)
  with the flag forced on, proving a rejected typed claim and a
  malformed claims block each fall back to the deterministic recap and
  that only the deterministic text — never the discarded prose — reaches
  the `save_round_ai_recap` RPC.
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
- Revision-keyed provenance + single-flight (2026-09-23, Package 8 repair
  plan §14.10, migration `20260923080000_recap_provenance_and_single_flight`).
  Two findings from a round-recap cache-provenance review: (1) two
  concurrent `generateRoundRecap()` calls for the same round previously
  both passed the `ai_recap IS NULL` cache check, both billed a full LLM
  call, and whichever `save_round_ai_recap` RPC call committed second
  silently overwrote the first — no error, no coordination; (2) nothing
  recorded which path (LLM vs. deterministic), which
  `golf_coachhelm_llm_calls` row, whether the typed claim packet was
  engaged, or which `golf_player_stats_cache.rounds_played` snapshot
  produced a stored recap, even though `compose()` already returns
  `used_llm`/`call_log_id` and `generateLLMRecap` was discarding all of it
  but the text.
  - Single-flight (cheap half only — the tighter fix, a lock taken BEFORE
    the LLM call, is deferred as an owner product/cost decision):
    `save_round_ai_recap`'s UPDATE now guards `AND ai_recap IS NULL`, so
    a call that loses the race persists nothing instead of overwriting
    the winner. The RPC's `success:true` return is unchanged either way —
    a losing caller's own in-memory `recap` text can still differ from
    what's actually stored in that rare concurrent case.
  - Provenance: a new table,
    <!-- schema-drift-absent: golf_round_recap_provenance -->
    `golf_round_recap_provenance` (round_id PK/FK, not new `golf_rounds`
    columns — keeps this off golf_rounds' RLS/trigger-guarded surface),
    with `source: 'llm' | 'deterministic'`, `call_log_id` (FK into
    `golf_coachhelm_llm_calls`), `claim_packet_engaged`, and
    `stats_rounds_played_at_generation` — the season-stats snapshot the
    prose was generated against, since `golf_player_stats_cache` is a
    live, mutable, separately-recomputed cache even though a completed
    round's own score/shot data is permanent
    (`helm_private.guard_golf_round_lifecycle()` blocks any other
    mutation). This makes staleness queryable ("recap generated over N
    rounds; player now has M > N") without new invalidation machinery;
    whether to act on it is a separate, deferred product decision.
    `round-recap.ts` writes this best-effort through the admin
    (service_role) client after a successful persist — a write failure,
    including this migration not yet being applied in an environment, is
    logged and swallowed, never blocking or throwing the recap itself.
    RLS mirrors `golf_rounds`' own read policies (self player, team
    coach, admin); only the service role writes it (`authenticated` gets
    `SELECT` only, nothing to `anon`/`PUBLIC`).
- **Chat vs. recap use two SEPARATE claim-grounding mechanisms — a known
  open item, not a defect** (audited 2026-09-23): recap/`compose()` gates
  on `claim-validator.ts`'s typed `validateClaims` (player/window/metric/
  value/sample-floor/causal-backing against a structured
  `EvidencePacket`, see above). The coach-chat stream route
  (`src/app/api/coachhelm/v3/chat/stream/route.ts`) gates on a DIFFERENT,
  lighter mechanism instead: `chat/provenance.ts`'s `auditNumericClaims`,
  a numeric-token-vs-tool-evidence scan with no typed claim references or
  per-metric checks. Both correctly BLOCK ungrounded output from being
  persisted as `'complete'` (chat: `onFinish` gates `appendMessage` on the
  audit result and stores `status: 'failed'` instead;
  `chat/restore.ts`'s `REPLAYABLE` set keeps `'data-grounding-flag'` so a
  failed turn stays visibly flagged on reload, not silently normal —
  tested at `src/test/coachhelm/v3/chat-restore.test.ts`, PR #1975).
  Whether chat should eventually adopt the same typed `validateClaims`
  gate as recap (chat's real-time streaming shape vs. a single
  post-generation validation makes this a real design question, not an
  oversight) is open, not decided here.
- **Package 8 addendum checklist item (f), "a concise evidence-backed
  review narrative," remains UNBUILT** (audited 2026-09-23): no caller
  and no persistence path. `round-review.ts`'s `composeRoundReview` has a
  server-action wrapper (`src/app/golf/actions/v3/llm.ts`,
  `generateLlmRoundReview`) whose OWN header comment used to claim "a
  client component on the round-review page" calls it — false;
  `round-regime.ts:132` documents that the action has zero callers
  outside its own file, and `llm.ts`'s header now says so instead. No
  persistence path from `composeRoundReview` into `golf_round_reviews`
  exists either. Building this needs its own spec (an owner decision, not
  a slice) — see the "Not wired in slice 1" bullet above for the same
  finding at the `round-review.ts` level.

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

Out of scope for A6's top-N audit above (need addendum A1–A4 evidence-packet
work first): issue grouping and parent/child claim links. See "Issue grouping
and ranking-input unification" below for the slice that picks this up.

### Issue grouping and ranking-input unification (A6 slice 1, 2026-09-23)

`ranking/situational-ranking.ts`'s `groupIssues(packets: IssueSourcePacket[])
: Issue[]` is the slice deferred by the top-N audit above. A3
(`par-opportunities.ts`), A2's `distance-profile.ts`, A4's
`sequence-attribution.ts`, and A5's `hypothesis-policy.ts` each look at a
round's shots from a different angle and can each surface something about
the SAME underlying shots (a par-5 approach that came up short can be
flagged by a par-opportunity row, a distance-band row, AND a
sequence-attribution finding at once) — `par-opportunities.ts`'s own file
header calls out that reconciling this is deliberately deferred: "Neither
family computes a strokes_impact/counterfactual number — that would double
the impact `par-type.ts`'s existing per-par cards already own... reconciling
impact ownership when that happens[, wiring this into a generator,] is a
later slice." This module is that slice, for the new v3 pure-core families.

- **Packets, not raw family output.** `groupIssues` consumes a flat
  `IssueSourcePacket[]` — each one adapted from its own family into a common
  shape by whatever wires it up (a LATER slice's job, not this one's). The
  one field every adapter must populate honestly is `sourceShotIds`
  (`shotClaimId`-shaped strings, matching A5's own format exactly for a
  fully-known shot so ids from both modules interoperate without
  translation — defined locally in `situational-ranking.ts` since #1993
  had not merged as of this slice). Grouping never infers overlap from
  `metricId`, `dimensions`, or label text — only from this explicit,
  adapter-stated shot set. A `null` hole/shot number is never rendered as
  the literal string `'null'` (two different unknown shots would
  otherwise stringify identically and silently merge) — instead every
  unknown-numbered shot renders to the SAME fixed marker
  (`shot:<round_id>:unknown:unknown`, deterministic and pure, unlike a
  per-call counter, so the issue's own `id` stays reproducible), and
  `groupIssues` never uses that marker as a union-find join key, so two
  packets sharing it still never merge on that basis alone. Each packet's
  own (now globally unique, see below) `claimId` disambiguates its marker
  when an issue's own `sourceShotIds`/`id` are built, so two different
  packets' unknown shots landing in the same issue via some other, real,
  shared id still don't collapse into one entry. A5's own `shotClaimId`
  (#1993) picked up this same fixed-marker fix in its slice 2.
- **Connectivity before eligibility, eligibility before ownership/scoring,
  scoring before any future truncation** (revised 2026-09-23 review fix,
  refining — not reversing — the A6 top-N audit's ordering rule:
  eligibility still gates ownership and scoring exactly as before; only
  WHERE it applies relative to connectivity has moved). `groupIssues` runs
  union-find over EVERY packet with at least one source shot, eligible or
  not, then only AFTER grouping filters each connected group down to its
  eligible members to decide what surfaces. Filtering eligibility first
  would silently split a chain that runs through an ineligible packet as a
  bridge (`A ↔ ineligible ↔ C`, where A and C share no shot directly) into
  two issues instead of one. The ineligible bridge itself never appears in
  a `claims` list, never owns, and never contributes a shot to the
  surfaced issue's own `sourceShotIds` — it only keeps the real claims on
  either side of it correctly grouped. A connected group with no eligible
  member at all surfaces no issue. Any future top-N truncation must still
  happen strictly after ownership/scoring, never before, per the A6 top-N
  audit above.
- **Grouping is transitive shot overlap** (union-find): two packets sharing
  even one shot land in the same issue, and the closure is transitive (A↔B,
  B↔C ⇒ A, B, C together) even when A and C share no shot directly.
- **`groupIssues` rejects a duplicate `claimId`** across the input packets
  outright (throws) rather than silently letting one of the two colliding
  packets vanish from a `claims`/`nonOwningClaimIds` list — `claimId` is
  documented as reused verbatim from the originating family and must be
  globally unique per packet.
- **An accepted issue carries five things**: a **stable issue identity**
  (`id`, content-addressed from the sorted deduplicated union of its own
  ELIGIBLE members' source shots — the same evidence always yields the
  same id regardless of packet input order); **parent/child claim links**
  (`claims` — the issue is the parent, every eligible member packet's
  `claimId`/`origin`/`label` survives unmerged, owner first (when one
  exists) then the rest sorted by `claimId`, so a consumer can always
  drill back down); **non-overlapping impact ownership**
  (`impactOwnership` — **signed strokes-impact convention** (revised
  2026-09-23 review fix): `strokesImpact` is negative for strokes LOST (a
  weakness/opportunity) and positive for strokes GAINED (a strength).
  Only a real NEGATIVE number is eligible to own an issue at all — a
  strength, an exact `0`, or `null` never owns, however large its
  magnitude, because "impact ownership" here specifically means the loss
  this issue represents an opportunity to fix. Among loss candidates,
  `pickOwner` picks the largest magnitude of loss; ties break by a fixed
  origin priority `par > distance > sequence > hypothesis` then by
  `claimId`. A group with no loss at all has `ownerClaimId: null` and
  every member listed as non-owning. Every other member (when an owner
  exists) contributes NO additional impact, which is what keeps three
  perspectives on the same shots from tripling the estimate);
  **opportunity frequency** (`opportunityFrequency` — distinct source-shot
  count and distinct-round count across every ELIGIBLE member, i.e. the
  union); and **effective policy inputs** (`policyInput` —
  `strokesImpact`/`confidence`/`sampleSize` a later `ranking/score.ts`-
  shaped policy would consume, mirroring ONLY the impact owner's own
  numbers, including the owner's OWN sample size — never
  `opportunityFrequency`'s union, so a much larger or smaller non-owning
  claim's sample can never inflate or dilute the sample size backing the
  owner's own number. Every field is `0` when there is no owner —
  "one underlying issue yields one leading priority" holds by
  construction, not convention).
- **Tested against real A2/A3/A4 metric values**, not hand-picked numbers —
  `situational-ranking.test.ts` calls the real `computeParOpportunities`
  (A3), `computeDistanceProfile` (A2, #1989), and `attributeSequence` (A4,
  #1988 — the one family here whose real `SequenceEvent.
  measuredContribution` is an honest non-null, signed strokes-gained-style
  number, unlike A2/A3's rate/count-only rows) on ONE shared par-5
  fixture, and wraps each real result into a packet via a small test-local
  adapter. `sourceShotIds` — the actual join key `groupIssues` reads — is
  still test-supplied for every packet, not derived from any of the three
  real functions' own return values: neither `MetricResult` (A2/A3) nor
  `SequenceAttributionResult` (A4) carries per-shot provenance yet (see
  `metrics/types.ts`'s own doc comment), so an honest adapter must supply
  it from outside the family's own output — this is not a claim about
  what a real production adapter's `sourceShotIds` derivation will look
  like, only that the metric values/statuses driving eligibility and
  ownership are real. The suite also covers the sign convention (a
  strength never owns, a pure-strength/null group has no owner), the
  eligibility-after-grouping bridge case, a null-hole/shot-number
  collision, a duplicate `claimId`, and determinism across many random
  input-order permutations, not just one reversal.
- **Not wired into `ranking/score.ts` or any delivery surface** — building
  the real A2/A3/A4/A5-to-`IssueSourcePacket` adapters and feeding
  `groupIssues`'s output into scoring/delivery is later-slice work, per
  this slice's explicit scope.

### Issue grouping and ranking-input unification (A6 slice 2, 2026-09-23)

Three additions on top of slice 1's `groupIssues`, all still pure core —
still no `ranking/score.ts` policy change, no flag needed, because nothing
wires into a live ranking read yet:

- **Sequence packets now gate `eligible` on the #2020 rollup
  (`computeSequenceAttribution`'s per-`event_kind` `MetricResult.status`),
  never on a single event's own resolution.** Slice 1's test-local
  `sequencePacketFromEvent` let one hole's one `measuredContribution !==
  null` event found/own an issue with zero population behind it —
  contradicting the standing "a single round never clears the floors"
  rule everywhere else in v3. `sequencePacketFromRollupGatedEvent` (test
  helper, mirrors what a real adapter should do) instead requires the
  EVENT KIND's own rollup row to be `status: 'supported'` (i.e. cleared
  `SEQUENCE_MIN_EVENTS`/`SEQUENCE_MIN_ROUNDS`) before the packet is
  eligible. The packet's own `sourceShotIds`/`strokesImpact` still
  describe only the one occurrence being grouped, never the rollup's full
  population — using the rollup as the source of a packet's shots or
  impact would let transitive union-find over-merge every occurrence of a
  kind across a player's whole history into one mega-issue.
- **`Issue.evidenceKey: string | null`** — a new field, separate from
  `id`. `id` is shot-set-addressed and shifts the moment new evidence
  joins or leaves the group; `evidenceKey` is stable across that churn
  (derived from the impact owner's own `IssueSourcePacket.evidenceKey`,
  falling back to `` `${origin}:${label}` `` when the packet omits one) so
  a consumer can recognize "this is still fundamentally the same
  underlying pattern" even after the shot set changes. A group with no
  owner has `evidenceKey: null`, matching the existing `ownerClaimId:
  null` convention.
- **`applyMaterialChangeSuppression(issues, activeInterventions):
  SuppressibleIssue[]`** — pure function, runs strictly after
  ownership/scoring and before any future top-N truncation, per the
  standing ordering rule. Looks up each issue by `evidenceKey` (never
  `id`) against the caller-supplied `ActiveIntervention[]`. No match, or
  `evidenceKey: null` → never suppressed, regardless of magnitude — a
  genuinely different pattern (or an issue with no owner to key off of)
  always surfaces. A match compares `|policyInput.strokesImpact|` against
  the intervention's own baseline magnitude: unchanged or worsened by
  less than `MATERIAL_CHANGE_THRESHOLD` (50%) → suppressed with reason
  `'active_intervention_unchanged'`; at or past the threshold → resurfaces
  (`suppressed: null`). A zero baseline treats any nonzero current
  magnitude as material (avoids a divide-by-zero silently suppressing
  forever). **The function never removes an issue from its returned
  list** — every input issue is present, `suppressed` is either `null` or
  the one named reason, so a caller can never lose an issue's other data
  by filtering it out. The `>=` boundary at exactly 50% was mutation-
  verified: flipping it to `>` fails exactly the boundary test
  (`situational-ranking.test.ts`) and only that test.
- **`issueToRankableInsight(issue): RankableInsight`** — a new pure
  adapter in `situational-ranking.ts` (imports `RankableInsight` as a type
  from `./score`), NOT a change to `scoreInsight`/`rankInsights` or any
  live caller. Maps `policyInput.strokesImpact`/`confidence`/`sampleSize`
  straight through and derives `insight_type` from the impact owner's
  `origin:label` (falling back to the first claim when there is no
  owner). "One underlying issue yields one leading priority" is proved at
  the ranked-output level in `situational-ranking.test.ts`: grouping a
  par/distance/sequence trio describing the same shots into one `Issue`
  and ranking it alongside two standalone issues yields exactly one
  ranked entry for the trio, not three.
- **Units caveat, documented not solved**: `IssueSourcePacket.strokesImpact`
  is documented as per-round, but neither a sequence event's
  `measuredContribution` nor the #2020 rollup's per-event mean is actually
  per-round today. `policyInput`/`issueToRankableInsight` pass this number
  through unchanged; reconciling the unit is out of this slice's scope.
- **Still not wired into `ranking/score.ts`'s live callers or any delivery
  surface** — `issueToRankableInsight` exists so a later slice can call it,
  and `applyMaterialChangeSuppression` exists so a later slice can call it
  with real `ActiveIntervention` data sourced from actual interventions;
  neither is invoked by any production code path yet.

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
`HoleContext` also carries `yardage: number | null` (`golf_holes.yardage`,
sparsely populated) — added for A3's par/length grouping below. `null`
means not recorded, never estimated from a shot's recorded distance.

## Distance profile (A2 deliverable — pure metrics, not yet wired)

`metrics/distance-profile.ts`'s `computeDistanceProfile(facts, scope,
holes)` computes five per-band `MetricResult`s over `ShotFact[]` — pure,
no DB, and NOT wired into `approach-miss.ts` yet (that wiring is the next
slice, behind a flag). It reuses the all-shot proximity semantics Package
7B / addendum A2 already shipped in the migration
`20260922120000_v3_standing_shot_metrics_all_shot_proximity.sql`: the same
three yard bands (`[50,125)`, `[125,175)`, `[175,∞)`, lo inclusive/hi
exclusive), the same on-green predicate (`result` in
`green`/`hole`/`gir`, or `lie_after = 'green'`), the same 175+ yd par-5
lay-up exclusion, and the same MIN_ATTEMPTS=10 / MIN_ROUNDS=3 / MIN_GREENS=3
support floors. `MetricResult`/`MetricStatus` live in `metrics/types.ts` —
shared with A3 (see the "Par/length + par-5 opportunity metrics" section
below) rather than this package exporting its own row shape; this module
originally predated that file with its own `id`/`band`/`playerId`-shaped
row, reconciled onto the shared shape once #1990 landed a shared
`MetricResult`.

- **Metric ids** (a local `DistanceProfileMetricId` union, deliberately NOT
  added to the canonical `MetricId`/`METRIC_IDS` registry in this slice —
  that registry requires a matching SQL seed migration, which is out of
  scope for a pure-metrics-only change):
  `approach_green_hit_rate`, `approach_on_green_proximity_feet`,
  `approach_direction_coverage`, `approach_severe_outcome_rate`,
  `approach_measured_contribution`. Each row's band lives in
  `dimensions.band`.
- **Status policy follows `types.ts`'s "state it, don't hide it" contract.**
  `value` is `null` ONLY when its own `denominator` is 0 (`status:
  'invalid'`) — a real but under-floor denominator (attempts or distinct
  rounds under MIN_ATTEMPTS=10/MIN_ROUNDS=3, or green-finding shots under
  MIN_GREENS=3 for proximity) still computes and reports `value`, with
  `status: 'insufficient'` flagging the low confidence instead of hiding
  the number. This is a real behavior change from this module's
  pre-adoption policy, which nulled `value` outright whenever the floor
  wasn't cleared. `approach_measured_contribution` is the one row whose
  `value` is never null even at `denominator === 0` (`status: 'invalid'`
  there simply means "no evidence," not "value withheld") — it is the
  evidence count the other four rows' `status` is judged against.
- **`MetricResult.failedFloors?: readonly SupportFloorGap[]`** (`{ floor:
  string; current: number; required: number }`, `metrics/types.ts`) names
  the SPECIFIC floor(s) this row's own `status: 'insufficient'` failed —
  `'rounds'` | `'attempts'` | `'greens'` — built from the row's own real
  gating population, never a narrower per-row proxy (#2008 review, MUST
  1: a row once reported a floor its own narrower `eligibleCount` had
  already cleared, hiding the wider floor that actually produced
  `'insufficient'`). Absent entirely unless `status === 'insufficient'`;
  most rows fail exactly one floor, but a row can fail more than one at
  once (e.g. both rounds and attempts, or — for the proximity row —
  rounds, attempts, AND greens together), in which case `failedFloors`
  carries every one that failed, not just the first found.
  `describeSupportGap(row)` (`metrics/support-gap.ts` — split out of this
  module so a client component can import it as a value without pulling
  in `distance-profile.ts`'s own server-only `bucketApproachDistance`
  import chain) renders straight from `failedFloors`, joining multiple
  gaps with `" and "`.
- **Lay-up exclusion needs `par`, which `ShotFact` doesn't carry.**
  `holes: readonly HoleContext[]` is a REQUIRED third argument (not an
  optional side map) — `load-player-context.ts` already returns
  `HoleContext[]` alongside `ShotFact[]`, so a real caller always has one
  to pass. The function builds a `` `${round_id}:${hole_number}` `` → par
  lookup internally. A 175+ yd shot whose hole is NOT resolvable from
  `holes` is excluded from the band with reason `missing_par` — it is
  NEVER silently kept as "probably not a lay-up." Only a CONFIRMED par-5
  miss is excluded as a lay-up, mirroring the migration's own `IS NOT
  DISTINCT FROM 5` rule — now enforced on the exclusion side
  (`missing_par`) rather than the inclusion side. Both counts (always 0
  outside the 175+ band) live in `exclusions` — `{ layup: n }` and/or
  `{ missing_par: n }`, present only when nonzero, mirroring
  `par-opportunities.ts`'s own non-zero-only `exclusions` convention.
- **Direction coverage needed `miss_direction`, which `ShotFact` didn't
  carry until this slice.** Added as a required, raw-passthrough field
  (`types.ts`), threaded through `normalize-shot.ts`,
  `load-player-context.ts`, and `shot-source-adapter.ts` — the same kind of
  additive extension `putt_made` went through in the #1981 review round.
  `approach_direction_coverage` reports what fraction of a band's MISSED
  attempts carry a non-null direction reading; it is a data-quality/support
  metric, not a directional-bias read (that's `diagnosis.ts`'s
  `approachAxisReading`).
- **Recorded travel distance vs. derived progress.** `TeeStrategyShot`
  (`engine/shot-source.ts`) has a real `distance_method: 'recorded' |
  'derived_progress' | null` split — when its own distance is unrecorded it
  falls back to `hole.yardage - distance_to_hole_after`, an ESTIMATE of
  progress toward the hole, and its doc comment bans describing that
  estimate as carry or travel distance. `ShotFact`'s distance fields have
  no such fallback — `normalizeShot` only converts a recorded value's unit,
  never substitutes hole yardage — so every `MetricResult.distanceMethod`
  here is `'recorded'`, never `'derived_progress'`; that second mode cannot
  arise from today's approach-shot data model. `approach_on_green_proximity
  _feet` is the shot's own recorded remaining distance to the hole, a
  straight-line proximity number — prose describing it must say
  "proximity" or "remaining distance," never "carry."

## Par/length + par-5 opportunity metrics (A3 deliverable — pure, not wired)

`src/lib/coachhelm/v3/metrics/par-opportunities.ts` (addendum A3) exports
`computeParOpportunities(facts, holes, scope): MetricResult[]`, a pure
function over the A1 types above. **Not wired into any generator, composite,
or the feed** — this slice only ships the pure core plus its tests; wiring
is a later slice, same as A1 before it.

Before building this, the collision A3 was scoped to reproduce
(`generators/par-type.ts`/`course-mgmt.ts` grouping a specific hole by bare
`hole_number`) was re-checked against current code: `course-mgmt.ts`'s
`worst_holes` ranking already keys on `(course_id, hole_number)` — fixed in
PR #1936, pinned by `src/test/coachhelm/v3/course-mgmt-hole-identity.test.ts` —
and `par-type.ts` never groups by a specific hole at all (it only
decomposes by `par`, across all holes of that par). Neither file needed a
collision fix in this slice; the "Specific-hole scoring" row above already
reflects the fixed state. A3's OWN collision-safe grouping job is in the new
code below.

Two independent metric families, deliberately kept apart:

- **`par_length_scoring`** — identity-agnostic. Average strokes-relative-to-
  par per `par` (3/4/5), always emitting the broad `length_group: 'all'` row
  first. Length bands are CONSTANT, versioned yardage cutoffs
  (`PAR_LENGTH_BANDS`, `dimensions.band_version` = `PAR_LENGTH_BAND_VERSION`,
  currently `'par-length-bands-v1'`) — never derived from a player's own
  data, so the same boundary reads identically under a lifetime, a recent,
  or an as-of-narrowed scope, and can be printed to a coach as a fixed label
  ("380-429 yd"). Cutoffs: par 3 <150 / 150-189 / 190+; par 4 <380 / 380-429
  / 430+; par 5 <500 / 500-539 / 540+ — consistent with the existing
  single-threshold "long hole" labels already in
  `v2/mining/course-management.ts` (par 3 ≥190yd, par 4 ≥400/425yd, par 5
  ≥540yd) rather than an unrelated cut. A `'short'`/`'mid'`/`'long'` row is
  only added once that band alone clears `PAR_LENGTH_MIN_SAMPLE_N` (5); an
  under-supported band is simply absent, folded back into `'all'`. Holes
  without a `course_id` still count here: "unknown identity prevents
  cross-round specific-hole aggregation; it does not prevent par/length
  aggregation" (addendum §4.4).
- **`par5_regulation_opportunity_rate`** / **`par5_green_in_two_rate`** /
  **`par5_putting_conversion_rate`** — specific-hole, one row per
  `holeIdentityKey(hole)`; a hole with no `course_id` is excluded from this
  family entirely (never merged by bare `hole_number` — the same rule as
  `course-mgmt.ts`'s `worst_holes`, proven by a two-course-same-hole-number
  fixture in `src/test/coachhelm/v3/par-opportunities.test.ts`).
  "Opportunity" (reaching the green in `par - 2` recorded strokes or fewer —
  regulation or better), "green in two" (`par - 3` or fewer — a strictly
  narrower eagle look), and "conversion" (finishing birdie-or-better, read
  from `HoleContext.total_strokes`) are three separate rows on purpose, so a
  coach can tell which half of a par-5 weakness is the leak, and
  green-in-two is never folded into either the opportunity or the
  conversion rate. Only computed for a `buildHoleSequence(...).complete ===
  true` play. A play excluded from eligibility carries one of two distinct
  reasons, never conflated: `exclusions.incomplete_sequence` (the recorded
  sequence itself is broken — missing/misordered/unterminated) vs
  `exclusions.out_of_scope` (every fact this play ever had was cut by
  `scope.window_start`/`window_end`/`analysis_cutoff` — a scope decision,
  not a data-quality gap). "Reached the green" mirrors
  `engine/shot-source.ts`'s sand-save `reached` predicate exactly: `result`
  in `'green' | 'hole' | 'gir'` (case-insensitive) OR `lie_after === 'green'`
  — `'hole'` is included on purpose, since a par-5 hole-out from off the
  green (an albatross via a holed 2nd shot, an eagle via a holed 3rd-shot
  chip-in) is the best possible outcome and must count as reaching the green
  at that shot's number, not silently score as a miss. Regulation/green-in-
  two are then read from that shot's raw `shot_number`, which already counts
  every recorded row including penalties in order — a penalty earlier in the
  hole correctly pushes a later green-finding shot's number up with no
  special case needed (fixture: a stroke-and-distance penalty makes a hole's
  green-finding shot its 4th recorded stroke, not its 3rd, so no opportunity
  is created). Neither family reads `ShotFact.intent`: an ambiguous second
  shot on a par 5 stays ambiguous — intent inference is explicitly A2's job,
  not this one's (see `ShotIntent`'s doc comment).

**Scope contract, and why it differs by family**: `computeParOpportunities`
self-scopes `facts` (via an internal `factsInScope`, filtering
`ShotFact.observed_at`) but CANNOT self-scope `holes` — `HoleContext` carries
no date field at all. `par5_regulation_opportunity_rate` and its siblings are
correctly scoped as a result (they only ever look at in-scope facts).
`par_length_scoring` is NOT: the caller MUST pass an already
window/cutoff/completed-status-filtered `holes` array
(`load-player-context.ts`, PR #1986, is the intended enforcer); passing an
unscoped array silently produces
a lifetime aggregate regardless of `scope`. Band BOUNDARIES themselves are
unaffected either way — they are compile-time constants, never derived from
`holes` or `scope`.

`HoleContext.yardage` now has a live producer: `load-player-context.ts`
(#1986, landed) selects `golf_holes.yardage` and passes it through
unchanged. `computeParOpportunities` itself is still not wired into any
generator, composite, or the feed (see above) — that remains a later
slice — but the type and the band logic no longer depend on a future PR
for real data; a real caller of the loader sees the actual recorded
yardage (or `null` when the column itself is unpopulated), not an
always-`null` placeholder.

`MetricResult`/`MetricStatus` live in `src/lib/coachhelm/v3/metrics/types.ts`
— shared across metrics packages (A3 re-exports both from
`par-opportunities.ts` for existing callers/tests). **Every consumer must
gate on `status`, never on `value !== null`.** `value` is populated
whenever a row's own `denominator` is nonzero, regardless of `status` —
including `status: 'insufficient'`, which still carries a computed `value`
so the number isn't hidden, only flagged as low-confidence. `value` is
`null` ONLY when `status: 'invalid'` (`denominator === 0`, no evidence at
all). A consumer that renders or trusts a number by checking `value !==
null` instead of `status` will silently treat an under-floor,
low-confidence row the same as a fully supported one. A narrower version of
the addendum's §4.3 design-contract shape, adapted to the merged A1 types:
no `interval` (no confidence-interval estimation shipped yet) and no
`sourceShotIds` (no consumer reads per-shot provenance yet) — both are
additive if a package needs them. Carries an optional
`distanceMethod?: 'recorded' | 'derived_progress'` for a package whose input
can be either a recorded travel distance or a derived progress-toward-hole
estimate (A2's `distance-profile.ts`, which predates this file with its own
`id`/`band`/`playerId`-shaped `MetricResult` and reconciles onto this shape
separately); A3 never sets it, since none of its inputs are ever derived.
Neither of A3's metric families computes a `strokes_impact`/counterfactual
number, so wiring this in later cannot double-count the impact
`par-type.ts`'s existing per-par cards already own.

## Sequence attribution (A4 deliverable, slice 1 — pure core, no DB)

`attributeSequence(facts, hole, scope)`
(`src/lib/coachhelm/v3/metrics/sequence-attribution.ts`) partitions ONE
hole's A1-validated shots into non-overlapping events and computes a
strokes-gained-style contribution per event, reusing the CANONICAL,
DB-synced baseline — `getExpectedStrokes` in
`src/lib/utils/golf-stats-calculator-shots.ts` (kept in sync with
`public.sg_expected_strokes()`) — rather than inventing a second one.
`src/lib/golf/strokes-gained.ts` has numerically similar tables but is
quarantined dead code (see the warning in
`src/components/golf/coachhelm/round-review/shot-strokes-gained.ts`) and
must never be imported for real computation. On the green,
`distanceFeet` is passed straight through (no feet→yards round trip); an
unmapped lie (`'water'`, `'recovery'`, `'other'`, anything not in the
tee/fairway/rough/sand/green table) resolves via the fairway table,
matching `public.sg_expected_strokes()`'s ELSE branch — it is not a gap.
Not wired into `v2/orchestrator.ts` or any composite yet; that
integration, plus `reasoning/hypothesis-policy.ts` consumption and the
short-side composite-title replacement A4's own checklist names, remain a
later slice — slice 2 is the scope-wide rollup below.

- **Suppression**: when `buildHoleSequence(facts, hole).complete` is
  `false`, the whole hole is suppressed — no events, no total — never a
  complete-hole attribution computed from a sequence A1 itself flagged as
  invalid. `lostStrokesVsPar` (`hole.total_strokes - hole.par`) is still
  returned: it reads only the hole's authoritative totals, independent of
  shot-sequence validity, matching the addendum's own fixture-matrix line
  ("Missing shot with completed scorecard → par total may remain valid;
  full sequence attribution unavailable", §14.1).
- **Event partition**: every shot on a complete hole belongs to EXACTLY one
  `SequenceEvent` — a penalty shot always gets its own singleton (see
  below), the three named §7.3 views each cover 1–2 shots, and everything
  else (a green-in-regulation approach, a lay-up, a later putt, …) falls to
  a residual `'other'` singleton. This total partition is what makes the
  conservation identity below hold structurally, not by coincidence.
- **Conservation**: an event's `measuredContribution` is expected strokes
  at the group's own recorded starting state minus expected strokes at its
  own recorded ending state minus strokes taken (`before - after -
  group.length`) — no lookahead into a neighboring event's shots is needed,
  since every `ShotFact` already carries its own before/after state. Summed
  over a full partition this telescopes to `expectedStrokesAtStart -
  hole.total_strokes` whenever every event resolves one (§7.2's
  requirement; proven by `sequence-attribution.test.ts`'s conservation
  fixture).
- **Penalty events stay explicit**: a penalty shot is checked FIRST, before
  any view match, and always becomes its own singleton event — never
  merged into an adjacent tee/approach/putt group, so its stroke is never
  charged twice by a later consumer that also expects to see it named.
  When a penalty leaves no usable after-distance (a real production
  pattern — `explicitPenaltyPair`'s fixture comment: "the ball is lost in
  the hazard, no usable after-distance"), that event's
  `measuredContribution` is `null` with `baselineGap: 'missing_distance'`,
  and the hole-level `totalMeasuredContribution` becomes `null` rather than
  silently summing only the resolved events — the shortfall is reported as
  `exclusions` (a count by reason) plus the always-available
  `lostStrokesVsPar`, per this slice's instruction for when the baseline
  can't be applied.
- **Three §7.3 views, two of them chained**: `tee_to_next` (a par-4/5 tee
  shot only — a par-3 tee shot is the green attempt itself, see below);
  `approach_to_recovery` (a green-attempt shot that missed, CHAINED with
  every consecutive non-penalty follow-up shot — "repeated failed
  recovery" — until one reaches the green (inclusive) or a penalty
  intervenes (exclusive, stays its own event)); and putting, split into
  `first_putt_to_next_putt` (always the first putt alone, a singleton) and
  `putting_sequence` (every putt after the first, chained as one group —
  covers a clean 2-putt's second putt, or a 3-putt's second AND third
  putt together, instead of dropping the third putt into `'other'`). The
  recovery chain only triggers off an approach or a par-3 tee shot; a
  drive that finishes greenside followed by chip attempts is not covered
  by this view.
- **A green attempt excludes an explicitly tagged lay-up.** A1 never
  INFERS a lay-up from distance/outcome (that inference is A2's job), but
  an EXPLICIT `intent: 'layup'` tag is not an inference — treating a
  deliberate lay-up's fairway finish as a "missed green needing recovery"
  would conflate two different named §7.3 families. `par5Layup`'s tagged
  lay-up resolves to `'other'`, never `'approach_to_recovery'`.
- **A par-3 tee shot is the green attempt**, never `tee_to_next` — decided
  by `hole.par`, never `shot_type` alone (`par3TeeGreenAttempt` proves
  this).
- **`heuristicScore`** is populated ONLY when `measuredContribution` is
  `null`: the group's own ending leave distance in feet, restated as a
  plain fact. This module does not compute the "large leave × coefficient"
  diagnostic score the addendum names as an example (§7.2) — inventing
  that coefficient is left to a later slice (`hypothesis-policy.ts`, A5);
  this module reports only the raw distance so nothing here fabricates an
  unaudited stroke-equivalent number.
- **Continuity is assumed, not validated**: the conservation identity
  above assumes a shot's `lie_after` matches the NEXT shot's own
  `lie_before` (the physical state carries across the gap between two
  recorded rows unchanged). This module does not cross-check that; a
  disagreement between the two rows would pass through silently.
- `attributeSequence` runs per hole. `computeSequenceAttribution` (below)
  rolls its events up into the scope-wide `MetricResult[]`.

### Sequence attribution rollup (A4 deliverable, slice 2 — scope-wide `MetricResult[]`)

`computeSequenceAttribution(facts, holes, scope)` (same file) rolls
`attributeSequence`'s per-hole events up into the shared `MetricResult` in
`src/lib/coachhelm/v3/metrics/types.ts`, mirroring `computeParOpportunities`'s
argument order and its `factsInScope` scoping (`facts` is self-scoped
internally; `holes` is not — `HoleContext` carries no date field, so the
caller must already have window/cutoff/completed-status filtered it, same
as A2/A3). Not wired into `v2/orchestrator.ts`, `hypothesis-policy.ts`
(A5), or any composite/generator yet — this slice is only the rollup
itself, for a caller (e.g. a Round Review mount) to consume directly.

Two kinds of row:

- **`sequence_event_strokes_gained`**, one row per `SequenceEventKind`
  (`dimensions.event_kind`: `tee_to_next`, `approach_to_recovery`,
  `first_putt_to_next_putt`, `putting_sequence`, `penalty`, `other`) — the
  mean `measuredContribution` across every event of that kind whose
  baseline resolved, over every ATTRIBUTED (non-suppressed) hole in
  `holes`. A suppressed hole contributes no events to any row but is still
  counted by the coverage row below. Gated `supported`/`insufficient` on
  `denominator >= SEQUENCE_MIN_EVENTS (10)` AND `distinctRounds >=
  SEQUENCE_MIN_ROUNDS (3)`; `denominator === 0` is `invalid` with a null
  value. An unresolved event (`measuredContribution === null`) never
  enters the denominator — its `baselineGap` reason is counted in
  `exclusions` instead, never silently dropped.

  **Sign convention** — POSITIVE means strokes GAINED versus the canonical
  baseline (performed better than expected). This is the OPPOSITE of
  `ScoringSection.tsx`'s `formatStrokesVsPar`, where positive means MORE
  strokes than par (worse); that formatter must never be reused for this
  metric without flipping its sign first.

- **`sequence_hole_coverage`** — a single row (empty `dimensions`) stating
  how many of `holes` were attributed vs. suppressed, mirroring A2's
  `approach_measured_contribution` convention: a COUNT, never a rate, and
  `value` is always the real attributed-hole count — never null, even when
  `status` is `'invalid'`. Gated on `attributedCount >=
  SEQUENCE_MIN_HOLES (10)` AND `distinctRounds >= SEQUENCE_MIN_ROUNDS
  (3)`. `exclusions` names each `buildHoleSequence` suppression reason by
  how many suppressed holes carried it (one hole can carry more than one
  reason, so a count here can exceed the suppressed-hole count).

Every row's `eligibleCount`/`denominator`/`distinctRounds` are computed
from that row's own real gating population — never a narrower proxy
(#2008 review, MUST 1's lesson: a distance-profile row once reported a
floor its own narrower population had already cleared, hiding the wider
floor that actually produced `'insufficient'`).

## Comparable-opportunities outcome measurement (A9 deliverable)

`src/lib/coachhelm/v3/evaluation/comparable-opportunities.ts` (addendum A9,
repair plan §14.12) exports `computeComparableOpportunities(input):
ComparableOpportunitiesResult`, a pure function over `ShotFact[]`/
`HoleContext[]`. **Still not wired into `causality/attribute.ts` itself or
any UI surface** — same not-wired discipline as A1/A3 above for THAT
module. It IS wired into the `causality-attribute` cron via a separate
DB-adapter (`src/lib/coachhelm/v3/causality/comparable-attribute.ts`, A9
slices 1–2, behind `coachhelm_comparable_opportunity_attribution`, default
off) — see below and `memory/features/coachhelm-ai.md`'s A9 sections for
that wiring. Learning/personalization weights are untouched either way:
every row this adapter writes carries `lift: null` unconditionally.

Where this differs from `causality/attribute.ts`: `attribute.ts` measures a
ROUND-LEVEL average (e.g. `sg_total`) before vs after an insight's
`surfaced_at`, for metrics with no natural per-shot opportunity. This module
is the SHOT-LEVEL counterpart — it compares a rate or mean over MATCHED
opportunities (same distance band, same lie, same shot role) on either side
of an actual recorded intervention instant, so a measured change isn't
confounded by the player simply facing easier or harder shots after the
intervention than before. The two modules are independent; this one does not
read or write `golf_insight_outcome_attribution` or its `method_version`
column (migration 20260922230000).

**Input**: `facts` (`ShotFact[]`), `holes` (`HoleContext[]`, used only to
resolve `round_id` → `course_id` for course-mix disclosure), an
`interventionAt` instant, a frozen `baselineWindow` and a `followUpWindow`
(`{start, end}`), a single `spec` (`MatchingSpec`: an optional distance band and
version id, an optional lie filter, an optional shot-role filter, and a
benchmark version id) applied identically to BOTH sides, an `outcome`
classifier (`'rate'` with an `isSuccess` predicate, or `'mean'` with a
numeric `valueOf`), a `multipleInterventions` flag, and a `metricId` label.

**Single spec, not a baseline/follow-up pair** (PR #1992 review, MUST 1): an
earlier revision took two independent `MatchingSpec`s and rejected the
comparison when their version ids disagreed — that only guarded the version
STRINGS, not the actual band/lie/role definitions, which could still differ
silently. Taking one `spec` for both sides makes "matched on the same
definition" true by construction: there is no `spec_mismatch` rejection to
write, and the addendum's "without silently changing band boundaries or
benchmark versions" acceptance criterion holds structurally rather than by
validation. `distanceBandVersion`/`benchmarkVersion` are still carried onto
each side's `MetricResult.dimensions` as opaque provenance strings.

**Boundary rule**: a shot recorded at EXACTLY `interventionAt` is assigned
to follow-up, never baseline, regardless of what the window bounds say —
the intervention is treated as already in effect at the instant it is
recorded, and a baseline can never include the moment that ends it
(`splitSide`'s doc comment; proven by a dedicated fixture in
`src/test/coachhelm/v3/comparable-opportunities.test.ts`). Unlike
`attribute.ts`, this needs no calendar-day buffer around the boundary:
`splitSide` compares real instants with a strict `<`/`>=` split, which has
no value satisfying both sides at once, whereas `attribute.ts`'s day-
granularity windows could otherwise let the triggering day land in both.

**Support floor**: `MIN_OPPORTUNITY_N` (5) matched opportunities AND
`MIN_DISTINCT_ROUNDS` (2) on a side, mirroring `attribute.ts`'s
`MIN_WINDOW_ROUNDS`. An unsupported side still reports its `value` (never
hidden — the same `MetricResult` "state it, don't hide it" contract as
A2/A3), but its `MetricResult.status` is `'insufficient'`, and the
top-level `status` is `'insufficient_evidence'` whenever EITHER side fails
the floor; `observedChange` is `null` in that case. For a `'mean'` outcome, a
matched shot whose `valueOf` returns `null` is dropped before any of
`eligibleCount`/`observedCount`/`denominator`/`distinctRounds` are computed
(PR #1992 review, MUST 2) — a round whose only matched shot has no usable
value must not itself satisfy `MIN_DISTINCT_ROUNDS`. Each dropped shot is
counted under `exclusions.missing_value` (SHOULD 3), never silently
absorbed.

**Output** (`ComparableOpportunitiesResult`): `baseline` and `followUp`,
each a `MetricResult` (see A3's section above for the shared type);
`observedChange` — `followUp.value - baseline.value`, direction-agnostic,
`null` unless both sides are supported; `methodVersion:
'comparable_opportunities_v1'`; the `multipleInterventions` flag as given;
and `disclosedDifferences` (course mix — course ids matched on
baseline-only/follow-up-only/shared, derived from the exact same
`contributing` shot population each side's `MetricResult` was built from,
never re-derived separately — and `opportunityCountImbalance`, the signed
`followUp.denominator - baseline.denominator`). `status` is one of
`'observed_change'`, `'observed_change_limited'` (both sides supported but
`multipleInterventions` was set — the change is real but cannot be
isolated to this one intervention), or `'insufficient_evidence'`. **No
field is ever named `lift`, `improvement`, or `proven`** — this module
never feeds `nextWeight` or any learning loop, so there is no
direction-corrected signal to compute, only the plain observed change
(module header's NAMING note).

## Controlled hypotheses (A5 deliverable, slices 1-2)

`buildHypotheses(metrics, facts)`
(`src/lib/coachhelm/v3/reasoning/hypothesis-policy.ts`) — PURE CORE, no
DB — proposes a small, NAMED set of candidate explanations for a round's
shot data — never a fabricated cause, never a psychology/fatigue/mechanics
inference (a test
scans every hypothesis this module can produce for banned terms —
`pressure`, `confidence`, `swing`, `mechanics`, and similar).

`metrics` is the real, merged `MetricResult`
(`src/lib/coachhelm/v3/metrics/types.ts`, #1990 — slice 1 read a
structural subset, `MetricResultInput`, before #1990 landed to `main`;
slice 2 swapped to the real type).

### Slice 2: dimensioned metrics, rough_gap's id, shotClaimId marker

`MetricResult.dimensions` means a real call can hand back SEVERAL rows
sharing one `metricId` (a distance band, or a specific par-5 hole) —
`metricClaimId(id, dimensions?)` and `findMetric(metrics, id,
dimensions?)` both take an optional dimensions filter, canonically
serialized (sorted keys, so key order never changes the id).
`prerequisites`/`missingInputs` stay undimensioned (they name a metric
FAMILY, not a specific row); `supportingClaimIds`/`contradictingClaimIds`
are dimensioned when they resolved against an actual row.

- **`rough_gap` reads its own shot's distance band**, not an arbitrary
  first match: `bandOf` (exported from `metrics/distance-profile.ts`)
  buckets the triggering shot the same way the real producer buckets its
  rows, and `findMetric` is called with that band as a filter.
- **`approach_measured_contribution` turned out to be the wrong shape**:
  slice 1 assumed a signed strokes-gained value (negative supports,
  positive contradicts). The real producer (`distance-profile.ts`) is a
  plain eligible-attempt COUNT, `unit: 'count'`, never negative — evidence
  volume, not direction, so it can never corroborate an over/underperformance
  claim. Follow-up: rather than name this real, present count metric as
  `rough_gap`'s corroborator — "missing" when unit-mismatched, "supporting"
  when hypothetically reshaped — `findMetric`/`missingInputs`/
  `prerequisites`/every claim id now key on a DISTINCT id,
  `approach_rough_gap_strokes_contribution` (`ROUGH_GAP_STROKES_METRIC_ID`),
  naming the honestly not-yet-existing strokes-shaped signal this family
  actually needs. No producer emits a row under this id today, so the
  lookup always reports the gap — a `'count'`-unit row under the OLD id is
  simply never found under the new one (pinned by a test using the real
  `approach_measured_contribution` shape, `unit: 'count'`, asserting it
  stays `'candidate'` with the gap reported, never a false contradiction).
  A single metricId cannot honestly mean two different things (a count
  today, a signed value if some future producer reused it) without
  corrupting every OTHER reader of `approach_measured_contribution` — the
  likely future producer (A4's `sequence-attribution.ts`
  `SequenceEvent.measuredContribution`, adapted to a `MetricResult` row) is
  expected to emit under this distinct id, not the old one; that adapter is
  deliberately not built in this slice.
- **`par5_opportunity_loss` now emits one `Hypothesis` PER dimensioned
  opportunity row**, not one aggregate reading an arbitrary first match.
  `par-opportunities.ts` dimensions its two metric ids per SPECIFIC par-5
  hole (`course_hole_key`/`hole_number`), so a round with several par-5s
  yields several rows per metric id; each opportunity row is paired with
  the green-in-two row sharing its SAME dimensions. Zero opportunity rows
  still produce the single aggregate `'no_data'` hypothesis slice 1
  shipped (nothing to enumerate, but the gap is still worth stating).
  Pinned by a test with two dimensioned opportunity rows asserting two
  independent hypotheses come back, each reading only its own hole's
  green-in-two row.
- **`shotClaimId` no longer renders a missing `hole_number`/`shot_number`
  as the literal string `'null'`.** `ranking/situational-ranking.ts`
  (A6, #2003) hit the identical problem first and its own doc comment
  named this exact fix as owed here: any missing field now renders to ONE
  fixed, shared marker (`shot:<round_id>:unknown:unknown`, matching that
  module's `UNKNOWN_SHOT_MARKER`) instead of a per-shot-varying id, so ids
  from both modules interoperate without translation. This is deliberate,
  not merely tolerated — two DIFFERENT unknown-numbered shots in the same
  round are indistinguishable by this id alone; a caller that needs to
  tell them apart (like `situational-ranking.ts`'s union-find) must
  special-case the marker itself, exactly as that module already does.
  Real `golf_shots` rows always have both fields — this only arises for a
  non-DB input (a fixture, a future adapter).

- **Four named families, plus one non-family entry**: `short_bias`,
  `rough_gap`, `recovery`, `par5_opportunity_loss`, and `'insufficient'`
  — an entry that names two competing families instead of picking one when
  the fact that would discriminate them isn't recorded. All five live in
  the exported `HypothesisFamily` union (`Hypothesis['family']`), which
  `NextCheck.distinguishes: HypothesisFamily[]` also uses — a
  `nextCheck` can only ever name a real family, not an arbitrary string.
- **What can and can't come from `facts`**: `ShotFact` (A1) carries neither
  `par` nor a miss-direction field, so `short_bias` (needs a short/long
  miss split) and `par5_opportunity_loss` (needs to know which holes were
  par 5s) can ONLY come from a `metrics` row — never guessed from
  distance or outcome. `rough_gap` and `recovery` DO come from facts: a
  `shot_type: 'approach'` shot with `lie_before === 'rough'`, split on the
  ingest-tagged `intent` (`'go_for_green'` → `rough_gap`, `'recovery'` →
  `recovery`, an explicit `'layup'` → neither, anything else — including
  `'unknown'`, the value nearly every real shot normalizes to today) →
  `'insufficient'` with a `nextCheck` naming both competing families and
  the input (`fact:intent`) that would resolve it. Never inferred from
  distance or outcome, only the explicit tag.
- **States**: `'no_data'` (this hypothesis's entire content is a stated
  gap — no supporting claim, no contradicting claim, only
  `missingInputs`), `'candidate'` (at least one real supporting claim
  exists — a genuine pattern match — but it isn't corroborated by a
  trusted metric, or it was but a contradiction downgraded it back),
  `'supported_association'` (a `status: 'supported'` metric points the
  same direction and nothing contradicts it — an association, never a
  causal claim), `'coach_annotated'` (reachable only once a coach has
  reviewed a hypothesis — `personal-context.ts`; not wired by slice 2
  either, still a later slice; nothing in this module can produce it).
  There is no `'proven'` state anywhere in the
  type. `'no_data'` vs `'candidate'` is a review-driven fix (2026-09-23):
  a consumer must not read "recovery, no producer" and "rough_gap, a real
  pattern match, just uncorroborated" as the same confidence — `recovery`
  (no metric ever cites its own triggering shot as its own support — see
  below) and `short_bias`/`par5_opportunity_loss` with an absent metric all
  resolve to `'no_data'`; `rough_gap` and `'insufficient'` keep a real
  fact-based supporting claim and so floor at `'candidate'`.
- **`description` is a function of `state`, never a fixed per-family
  template** (review-driven fix, 2026-09-23): the same family reads
  differently depending on how much is actually corroborated — hedged,
  uncertain wording for `'no_data'`/`'candidate'` ("may be…", "not yet
  corroborated", "no data available…"), association wording for
  `'supported_association'` ("associated with…"), and no description ever
  uses "proven" or a causal verb (`describeShortBias`,
  `describeRoughGap`, `describeRecovery`, `describePar5OpportunityLoss`
  in `hypothesis-policy.ts`; each state's wording is tested separately).
- **Contradiction always downgrades, never elevates past it**: a
  `contradictingClaimIds` entry caps `state` at `'candidate'` (never
  `'no_data'` — a contradiction is real data) even when the hypothesis's
  own primary metric would otherwise have elevated it. `short_bias` gains
  a documented refute floor alongside its support floor: a supported
  `approach_short_miss_rate` at or above `SHORT_BIAS_SUPPORT_MIN_PERCENT`
  (60) supports it, at or below `SHORT_BIAS_REFUTE_MAX_PERCENT` (40)
  contradicts it, and a value strictly between the two floors does
  neither (stays `'no_data'`).
- **Claim ids always resolve to an input element**: `metricClaimId(id)` →
  `` `metric:${id}` `` (undimensioned — prerequisites/missingInputs),
  `metricClaimId(id, dimensions)` → `` `metric:${id}:<sorted
  key=value,...>` `` (dimensioned — a resolved claim), `shotClaimId(shot)`
  → `` `shot:${round_id}:${hole_number}:${shot_number}` ``, or
  `` `shot:${round_id}:unknown:unknown` `` when either field is null —
  tested by resolving every `supportingClaimIds`/`contradictingClaimIds`
  entry back to an element of the `metrics`/`facts` a call was given.
- **"No hypothesis" is a `Hypothesis` with empty claims and a populated
  `missingInputs`**, not an omitted entry — `buildHypotheses` returns a
  flat `Hypothesis[]` (no separate "withheld" bucket), so a family with an
  absent prerequisite still appears, stating the gap, rather than
  vanishing silently. `short_bias`, `recovery`, and `par5_opportunity_loss`
  have no metric producer today (no A2/A3 slice emits
  `approach_short_miss_rate`/`approach_recovery_outcome_rate`) — every real
  call reports them `'no_data'`, never fabricates a value.

### Slice 3: coach annotation (addendum §8.3)

`mergeCoachAnnotation(hypothesis, { author, date, note })` and
`reopenIfContradicted(annotated, fresh)` let a coach layer a judgment onto
a hypothesis WITHOUT rewriting the evidence — the addendum's own text:
"A coach can annotate a working explanation; retain author, date, and
evidence. On future contradictory evidence, reopen the explanation instead
of silently preserving certainty."

- **Purely additive**: `mergeCoachAnnotation` returns
  `{ ...hypothesis, coachAnnotation: {...} }` — `state`, `description`,
  `prerequisites`, `supportingClaimIds`, `contradictingClaimIds`, and
  `missingInputs` are byte-identical before and after (tested). It snapshots
  `supportingClaimIds`/`contradictingClaimIds` AT THE MOMENT of annotation
  into `coachAnnotation.supportingClaimIdsAtAnnotation`/
  `contradictingClaimIdsAtAnnotation`, kept SEPARATE rather than merged
  into one "known claims" set.
- **Why separate snapshots**: a claim id names a row, not a direction —
  `short_bias` pushes the SAME undimensioned `metricClaimId` onto either
  `supportingClaimIds` or `contradictingClaimIds` depending on which side
  of its threshold the metric lands on. A claim that was supporting at
  annotation time and is contradicting on a later call is the SAME string
  either way, so a union-based "known claims" set would treat it as
  already-known and never reopen. `reopenIfContradicted` checks only
  against the CONTRADICTING snapshot: any claim in a fresh evaluation's
  `contradictingClaimIds` that isn't in that snapshot reopens the
  annotation. Pinned by a regression test that flips `short_bias`'s single
  metric from supporting to contradicting between two `buildHypotheses`
  calls and asserts it reopens.
- **`reopened: true` retains, never discards**: author/date/note and both
  claim-id snapshots stay on the SAME `coachAnnotation` object; only
  `reopened` flips. `state`/`description` always come from the fresh
  evaluation passed in — `reopenIfContradicted` never re-derives or
  downgrades them itself, it only decides whether the annotation still
  applies.
- **`'coach_annotated'` was dropped from `HypothesisState`** (review
  decision): neither `mergeCoachAnnotation` nor `reopenIfContradicted` ever
  sets `Hypothesis.state` to it — the addendum is explicit that annotation
  layers onto the evidence, never replaces it, and there is no `'causal'`
  state for an annotation to upgrade a hypothesis to. A state with no
  producer isn't a state, so it was removed rather than kept as an
  unreachable union member; a "reviewed" read belongs at the call site,
  derived from `coachAnnotation != null`, not as a fourth `state` value.
  Grepped for consumers first (`case 'coach_annotated'` in this module's
  own four `describe*` switches, no external references anywhere in
  `src/`) before removing.
- **`diagnosis.ts` still not wired — a future DB-layer slice, not this
  one**: `engine/diagnosis.ts` is a narrow pure `AxisTally` →
  observation/check/action text helper (`dominantAxis`/
  `approachAxisReading`) with exactly one caller, the DB-backed
  `generators/approach-miss.ts`. It has no awareness of
  `ShotFact`/`MetricResult`/`Hypothesis` at all. Wiring hypothesis ids into
  a reading means wiring them into that DB-backed GENERATOR layer, not
  `diagnosis.ts` itself — a materially larger change, and out of scope for
  this module's pure-core, no-I/O slices.
- **`personal-context.ts` — built, on a code-level mapping table (owner
  decision, 2026-09-23)**: `resolvePersonalContextHints(goals,
  focusAreas)` is pure — already-loaded `Goal[]`/`PlayerFocusArea[]` in,
  `PersonalContextHints` (per-family, presence-only "prioritize this
  family" signal) out. It never receives a `MetricResult` and never
  touches a `Hypothesis`'s `state`/evidence arrays/`description` — a
  test asserts `buildHypotheses`' output and its `metrics` input are
  byte-identical `JSON.stringify` before and after resolving hints.
  "Check-selection" is not a separate field: presence means "prioritize
  resolving this family's `missingInputs`/`nextCheck`," and a caller
  joins its own `buildHypotheses` output against the family key for that
  detail — this module has no visibility into `missingInputs`/`nextCheck`
  itself. `Goal.metric_id` (`MetricId`, `metrics/registry.ts`) and
  `FocusAreaCategory` (`insight-types.ts`) remain a genuinely different
  vocabulary from this module's own metric ids, so the table is a
  same-underlying-thing judgment call per entry, not an identity match —
  checked against every registered `MetricId` and every
  `FocusAreaCategory`, exactly ONE honest entry exists: `scoring_par_5` →
  `par5_opportunity_loss` (same holes; `scoring_par_5` is the coarse
  average, `par5_regulation_opportunity_rate`/`par5_green_in_two_rate` are
  the conversion-rate breakdown of that same outcome).
  `FOCUS_AREA_TO_FAMILY` is empty — `short_game`
  (chipping/pitching/sand, `shot_type: 'around_green'`) is a different
  shot type from `recovery` (an approach-shot decision, `shot_type:
  'approach'`, `intent: 'recovery'`), so the shared word "recovery" is not
  a shared measurement domain; the other five categories and every other
  `MetricId` (`sg_approach` — can't choose between `short_bias`/
  `rough_gap`; `gir_pct` — all par types, not par-5-specific; driving/
  putting/round-level-risk ids — no family touches those domains) have no
  honest correspondence either, each with its reason in the module doc.
  A near-empty table is the honest finding here, not a shortfall — the
  four hypothesis families are narrow, and most of a player's own
  goal-setting vocabulary genuinely falls outside them. No "intervention"
  type/loader exists anywhere in the codebase (`development.ts`, 1968
  lines, zero hits for "intervention") — interventions stay out of scope.
- **Checklist item "paired fixtures with identical endpoints but different
  recorded intent"** was already satisfied by slice 1/2:
  `hypothesis-policy.test.ts`'s `'buildHypotheses — rough-lie approach:
  identical shot, different intent, different hypothesis'` block reuses
  the SAME `roughApproachShot` fixture (identical round/hole/shot/distance/
  lie) across `go_for_green`/`recovery`/`unknown`/`layup` intents and
  asserts each produces a different family — no new fixtures added this
  slice.

## A10 capability gates (addendum A10, 2026-09-23)

Addendum A10 ("Enable sequence/hypothesis capabilities only after their own
gates pass"; "Keep geometry and intervention learning behind separate
gates") requires each new-family coach-visible surface to sit behind its
own dedicated, default-off flag rather than share one. This is the
reference the owner uses for enablement decisions — built by auditing
`config/feature-flags.yml`, the flag registry, and each gating PR's own
diff and flag-off test directly, not by trusting a PR description. As of
this audit every open gating PR listed below is unmerged; none of these
flags are on `main` yet.

Each entry: flag id, default, gated surface, gating PR, flag-off test,
prerequisite migration.

- **Distance (A2)** — `coachhelm_a7_distance_profile_surface`, default
  off (all envs). Gates the Game Fingerprint page's Approach section
  (`buildRollingDistanceProfileScope` + `loadDistanceProfile` +
  `DistanceProfileSection`). Gating PR: #2008 (open). Flag-off test:
  `page.distanceProfileAddendum.test.ts` — "never calls the loader when
  the flag is off — not just discards its result." Prerequisite
  migration: none.

- **Par/par-5 opportunities (A3)** — `coachhelm_a7_scoring_surface`,
  default off (all envs). Gates the Game Fingerprint page's Scoring
  section (`loadParOpportunities` + `buildScoringViewModel` +
  `ScoringSection`). Gating PR: #2010 (open). Flag-off test:
  `page.scoringAddendum.test.ts` — "never calls the loader when the flag
  is off — not just discards its result." Prerequisite migration: none.

- **Sequence attribution + rollup (A4)** — no surface yet on `main`.
  Slice 3b (PR #2036, `agent/coachhelm-a4-round-review-mount`, in
  progress) already carries its own dedicated flag,
  `coachhelm_a4_sequence_attribution_surface`, default off (all envs),
  gating the Round Review page's per-hole rollup section
  (`loadSequenceAttribution` + `computeSequenceAttribution` +
  `SequenceAttributionSection`). Flag-off test:
  `round-review-sequence-attribution.test.ts` — "flag off: returns null
  and makes ZERO DB calls — createClient is never invoked." Prerequisite
  migration: none.

- **Controlled hypotheses (A5)** — no surface exists to gate.
  `hypothesis-policy.ts` is pure core, not wired to `diagnosis.ts`,
  `personal-context.ts`, or any route/component in any open PR (#2024
  slice 2, #2030 slice 3 are both pure-core-only per their own titles).
  Nothing to flag.

- **Issue grouping / ranking (A6)** — no surface exists to gate.
  `situational-ranking.ts` slice 2 (#2026) is pure core, "still not
  wired to a live ranking read, no flag needed" per its own doc entry.
  Nothing to flag.

- **Attribution readout (A9)** — write and read share one flag,
  `coachhelm_comparable_opportunity_attribution`, default off (all
  envs) — one feature at both ends, not the shared-flag anti-pattern
  (see below). Write gates the causality-attribute cron's shot-level
  matched-opportunity path (`comparable-attribute.ts`); gating PRs
  #2007 (slice 1) and #2016 (slice 2, extends metric coverage).
  Flag-off test: `causality-attribute.test.ts` — "flag OFF: a
  shot-level metric is still dropped in the pre-filter exactly as
  before this slice." Read gates the coach-facing attribution readout
  server action + `AttributionReadout` component; gating PR: #2025
  (slice 3). Flag-off test: `insight-attribution.test.ts` — "flag off:
  returns null and makes NO DB call at all — createClient is never
  invoked." Prerequisite migration:
  `20260922230000_v3_attribution_method_version.sql` — the migration
  file is merged to `main` via #1980, but it is NOT yet applied to
  production (owner's apply queue); the A9 flag must stay off in
  production until it is, since the write path's `method_version:
  'comparable_opportunities_v1'` rows depend on that column existing.

- **Practice log (A8)** — `coachhelm_focus_area_practice_log`, default
  off (all envs). One flag gates both the write and read surfaces
  below; correct, because they're one feature (write and read of the
  same new column/table pair added by one migration), not two unrelated
  behaviors sharing a switch. Write: `createFocusArea*`/practice-log
  actions (`golf_focus_area_practice_sessions`,
  `golf_player_focus_areas.criteria`); gating PR #2012. Read:
  `FocusAreaCard` practice-log summary + criteria checklist; gating PRs
  #2017 and #2031 (write-side UI, shares #2017's flag — no new flag
  added). Flag-off test: `focus-area-practice-log.test.ts` — "returns
  Not enabled and never reads/writes a table when the flag is off"
  (covers both the write actions and the read loader tested in
  #2017/#2031). Prerequisite migration:
  `20260923110000_golf_focus_area_practice_log.sql` — not yet applied
  in any environment; the flag must stay off until it is
  (`temporary_migration` type, `expires_at` 2026-12-23 as a review
  date, not an auto-kill).

- **Geometry** (course-shape/dogleg/carry-distance inferences) — no
  flag exists because no CoachHelm family reads course-geometry data
  today (§14.1's own fixture: "Dogleg progress estimate → no
  carry-distance claim"). Nothing to gate yet; see the rule below.

- **Intervention learning / personalization weights** — split
  2026-09-23 into two independently-flippable flags that used to share
  one switch: `coachhelm_learned_personalization` (v3 insight ranking's
  coach-weight multiplier) and `coachhelm_v2_alert_personalization` (v2
  alert-threshold learning), both default off (all envs) and both live
  on `main` today (the split predates a numbered gating PR). v3 read
  gate: `src/lib/coachhelm/v3/ranking/score.ts:389`. v2 read gate:
  `orchestrator.ts:949`'s `personalizationEnabled` check. Flag-parity
  test: `src/lib/flags/__tests__/is-enabled.test.ts`, plus each
  consumer's own flag-off coverage. Prerequisite migration: none.

**Geometry rule.** No CoachHelm family consumes course-geometry data yet —
confirmed by an exhaustive search across CoachHelm code/docs; the only
"geometry" hits are the unrelated Course Factory v2 product area
(`agent/course-factory-*`, `agent/golf-course-geometry`) and one unrelated
prose mention. This becomes a standing rule for future work, not a
retrospective gap to fix: any future CoachHelm use of course-geometry data
(hole shape, dogleg progress, carry distance) gets its own dedicated
default-off flag, separate from A2/A3 and from every other family above —
never folded into an existing distance/scoring flag just because the data
also happens to be geometric.

**Personalization is a write/read split, not two gaps.** The
causality-attribute cron's `updateCoachWeight`
(`src/app/api/cron/v3/causality-attribute/route.ts:354`) persists learned
coach weights in shadow **unconditionally** whenever `improvement_lift` is
non-null — that data condition, not a flag, is the only skip. Only the
**read** side (`loadCoachWeightsForPlayer` in `score.ts`, and
`orchestrator.ts`'s `personalizationEnabled` for the v2 alert path) is
flag-gated. This is by design: shadow data accumulates regardless of
rollout state so there is real evidence to evaluate before either read
flag is ever flipped on.

**A9's write/read pair sharing one flag is correct, not an anti-pattern.**
`coachhelm_comparable_opportunity_attribution` gates both the
causality-attribute cron's shot-level write path and (via #2025) the
coach-facing read — this is one feature at both ends (the read has nothing
to show until the write has run), proven by #2025's own "flag off: returns
null and makes NO DB call at all" test. Contrast with the pre-split
`coachhelm_learned_personalization`/`coachhelm_v2_alert_personalization`
case above, where two genuinely unrelated behaviors shared one switch —
that was the real anti-pattern, and it has already been split.

**Enablement needs a per-event-kind read, not a collapsed summary.** A10
slice 2's real-data shadow run reported aggregate status counts across all
sequence-event kinds combined; that collapsed view is not sufficient for
an enablement decision; because the #2020 rollup computes eligibility
per-kind (`sequence_event_strokes_gained`'s own `status` per `event_kind`),
a kind with too few real events can sit at `'invalid'` while a
high-volume kind is genuinely `'supported'`, and a collapsed summary
hides that split. The next real-data run of `runShadowEvaluation` must add
a per-event-kind status table to its report output (tracked as a harness
follow-up on `agent/a10-shadow-eval-harness`/#2032, once #2024 lands and
is merged in) before any A4/A9 sequence-attribution surface is considered
for enablement on real data.

**Two `method_version` values, two different layers (A9 slice 2)**: this
pure core's own `methodVersion` field is ALWAYS the string
`'comparable_opportunities_v1'`, regardless of `multipleInterventions` —
that field is this module's own versioning axis (what the matching/
aggregation math means), independent of the DB column below, and never
changes based on confounding (module header's NAMING note). The DB-write
adapter (`comparable-attribute.ts`) is a separate layer: it maps a
`status: 'observed_change_limited'` result to a DISTINCT
`golf_insight_outcome_attribution.method_version` value,
`'comparable_opportunities_v1_limited'`
(`COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION`), instead of the clean
`'comparable_opportunities_v1'` — a confounded measurement is still
written, never dropped, but a DB reader can always tell a clean
comparison from a confounded one from that column alone, without
re-deriving `multipleInterventions`. No migration and no CHECK constraint
guards this column (migration 20260922230000 only adds the column
itself) — either string round-trips today. Confounding-intervention
detection itself (`detectConfoundingInterventions`,
`src/lib/coachhelm/v3/causality/confounding-check.ts`) is a query over
`golf_insight_exposure`, not part of this pure core: it sets
`multipleInterventions` to `true` when any OTHER insight's first-ever
exposure to the same player lands inside
`[baselineWindow.start, followUpWindow.end]`, on ANY metric (insight→metric
mapping isn't reliable enough to trust as a filter) — see
`memory/features/coachhelm-ai.md`'s A9 slice 2 entry for the full
what-counts/what-doesn't rule and the deferred focus-area/drill-change
follow-up.

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
