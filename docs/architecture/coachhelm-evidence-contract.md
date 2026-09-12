# CoachHelm Evidence Contract

Status: **ACTIVE** as of 2026-05-17.
Source: closes audit Findings 1, Q-NEW-1/2/3/5/12, A-NEW-3, S-HIGH-1 from `.full-review-2026-05-17-golfhelm-audit/05-final-report.md`.

## Promise

Every insight emitted to `golf_coach_insights` carries an `evidence` JSON that is internally consistent: when `comparison_source = X`, the `comparison_label` and `comparison_value` originated from a single `BaselineRegistry` entry for X. The three fields cannot disagree.

## Allowed `comparison_source` values

`InsightComparisonSource` is the discriminated union at `src/lib/coachhelm/v2/insights/types.ts`. `peer_percentile` was removed in 2026-05-17.

| Source | Meaning | Example |
|---|---|---|
| `your_baseline` | Player's own rolling history | last-N rounds putting make% |
| `team_avg` | Teammates' aggregated stats | team median scrambling rate |
| `d1_avg` / `d2_avg` / `d3_avg` / `naia_avg` / `juco_avg` | College-division benchmarks | D2 avg putting make% from 5ft |
| `pga_baseline` | PGA Tour reference | PGA avg fairway% |
| `absolute_target` | Fixed reference point | par, uniform-25% distribution |

A static test at `src/test/coachhelm/v2/insights/baseline-registry.test.ts` fails CI if any miner emits a `comparison_source` outside this set.

## How a generator emits a comparison

Generators do **not** hard-code labels. They look up an entry by `BaselineKey` (`${source}.${bucket}`) and spread the result:

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

If a generator needs a comparison that doesn't yet have a registry entry, add the entry to `baseline-registry.ts` and reference it. Adding a stand-alone `comparison_label: '…'` string is forbidden.

## `sample_n` floor

- `MIN_SAMPLE_N = 5` is enforced at the typed `upsertInsight` entry point (`src/lib/coachhelm/v2/insights/upsert.ts`).
- The legacy `toInsightInput` adapter **returns `null`** when the inbound record lacks sufficient `sample_n` rather than clamping it up. Callers (`triggerPlayerInsightsAfterRound`, `generateInsightsForTeam`) filter `null` results and log skipped records via `logServerError`.
- A pattern with one real observation MUST NOT become an insight claiming `sample_n: 5`.

## Cross-coach dedup

`upsertInsight` dedups on `(signature, player_id, coach_id, team_id)` — the full scope of the `golf_coach_insights_dedup_key` UNIQUE NULLS NOT DISTINCT constraint, with **no date cutoff** (DI-1, 2026-06-06: the old 30-day window made rows older than 30 days miss the lookup, hit the conflict, and freeze forever). Two coaches at different organizations on the same transferred athlete cannot silently overwrite each other's evidence — they each get a distinct row.

## Confidence method (`honest_v2`, 2026-09-12)

`calcConfidence` (`src/lib/coachhelm/v2/insights/types.ts`) is recomputed by `upsertInsight` on every write; generators cannot drift. Three modes, keyed by `confidence_factors.factors_measured`:

| `factors_measured` | Rule | Who writes it |
|---|---|---|
| `undefined` | legacy blend `0.4·sa + 0.3·recency + 0.3·variance` | v2 miners |
| `true` | same blend, all three genuinely measured | `generator-base.run()` when the aggregate carries per-round dispersion + round dates |
| `false` | **`sa · (1 − (3/7)·(1 − recency))`** — sample adequacy scaled by freshness; exactly `sa` when fresh, monotone non-increasing in age | `generator-base.run()` for every placeholder-factor row (851 of 883 v3 rows in production) |

The previous honest-mode rule switched formulas at `recency < 1` and was discontinuous: sample adequacy 0.24 scored 0.24 fresh and 0.56 one day into decay, so 41 of the 208 tentative rows above the visibility floor in production had cleared it only by ageing. Every write now stamps `confidence_factors.method_version` (`CONFIDENCE_METHOD_VERSION`) so a reader can tell which rule produced the stored number. This is a **support score**, not a calibrated probability: at recency 1 it is literally `attempts / target`.

## Lifecycle (Rule 3) — one evaluator

All lifecycle decisions live in `src/lib/coachhelm/v2/insights/lifecycle-policy.ts`; `upsertInsight` only persists them.

```
insert ──(conf ≥ 0.4)──► detected ──(3 movements)──► matured ► addressed ► resolved
  │                          ▲
  └──(conf < 0.4)──► tentative ──(conf ≥ 0.4, team gate open)──┘   ← added 2026-09-12 (RC0)
archived ──(re-emitted)──► tentative | detected   (same gate)
```

- **Promotion** (`tentative → detected`) happens on either write branch (refresh or movement) when the *freshly recomputed* confidence clears `TENTATIVE_CONFIDENCE_FLOOR`. It writes `metadata.promoted_at`, `metadata.promotion_reason = 'confidence_floor'` and `metadata.first_visible_at`; it never rewrites `created_at` (a recovered row keeps its original feed date) and never touches `status` (a coach dismissal keeps hiding the row). `first_visible_at` is stamped from 2026-09-12 onward (insert-as-detected and promotion); rows that were already visible carry none until the recovery backfill copies `created_at` into it, so any reader must fall back to `created_at` when the key is absent. Before this edge existed, a row born on a thin first sample stayed invisible forever — production held 326 tentative v3 rows, 167 with real sample support.
- **No promotion to `matured`**: `movement_count` counts ≥5% value swings, not confirmations.
- **Team gate**: `golf_team_coachhelm_settings.preferences.tentative_promotion_enabled` — same JSONB blob and opt-OUT convention as the generator toggles; only an explicit `false` pauses promotion (used to canary the 2026-09 recovery one team at a time by SQL). Fails open with a logged warning.
- **The lifecycle cron never promotes.** Only a write carrying freshly recomputed evidence may. The cron's Rule 4 decays `recency` from the *liveness anchor* (`max(created_at, metadata.last_refreshed_at, metadata.redetected_at)` — the same anchor Rules 2/3 use), not from `created_at`: a row the engine refreshed last night carries last night's window and is fresh however old the row is. Rule 1 counts a healthy cycle once per distinct evidence snapshot (`metadata.healthy_cycle_evidence_key`); two scans over the same numbers are one observation.

The `triggerPlayerInsightsAfterRound` flow always passes an explicit `coach_id` / `team_id`. Bootstrap paths that don't know the coach yet (cron sweeps over unowned rounds) fall through to `resolvePlayerOwnership` in `upsert.ts` — see that function for ownership rules.

## Failure surface

- The orchestrator runs 9 tier-1 generators via `Promise.allSettled`. Every rejected result goes through `logServerError` with `action='analyzePlayer.tier1Generator'`, `featureArea='coachhelm'`, `playerId`, and `extra: { generator, reason }`.
- `analyzePlayer` returns `generatorSummary: { successes, failures }` on the `PlayerAnalysis` payload so callers can react to partial failure.
- `/api/coachhelm/analyze-player` currently returns 200 with `success: false` on engine-level failure. A follow-up will flip to 5xx when `generatorSummary.failures.length > 0` so platform-level observability sees real signal (audit Q-NEW-6, partially addressed).

## How to add a new comparison source

1. Append to `InsightComparisonSource` and `COMPARISON_SOURCES` in `types.ts`.
2. Add a registry entry at the right key in `baseline-registry.ts`.
3. Add a row to the `SOURCE_LABELS` map at `src/components/golf/coachhelm/insights/EvidencePanel.tsx` for user-facing rendering.
4. Update this doc.

## Files

| File | Role |
|---|---|
| `src/lib/coachhelm/v2/insights/types.ts` | Type definitions, canonical enum, `BaselineKey` |
| `src/lib/coachhelm/v2/insights/baseline-registry.ts` | Single source of truth for `(source, label, value)` |
| `src/lib/coachhelm/v2/insights/upsert.ts` | `MIN_SAMPLE_N` enforcement, coach/team-scoped dedup, persists lifecycle decisions |
| `src/lib/coachhelm/v2/insights/lifecycle-policy.ts` | Pure lifecycle evaluator (insert / refresh / movement / resurrection / promotion) |
| `src/app/api/cron/coachhelm-insight-lifecycle/route.ts` | Nightly Rules 1–4 (resolve / archive / decay / demote); never promotes |
| `src/lib/coachhelm/v2/insights/to-insight-input.ts` | Legacy v1 → v2 adapter; returns null on insufficient data |
| `src/lib/coachhelm/v2/orchestrator.ts` | Tier-1 generator dispatch + `generatorSummary` |
| `src/test/coachhelm/v2/insights/baseline-registry.test.ts` | Static guard catching hard-coded `comparison_source` strings |
