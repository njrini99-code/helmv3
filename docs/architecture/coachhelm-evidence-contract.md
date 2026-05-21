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

`upsertInsight` dedups on `(signature, player_id, coach_id, team_id, created_at >= cutoff)`. Two coaches at different organizations on the same transferred athlete cannot silently overwrite each other's evidence — they each get a distinct row.

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
| `src/lib/coachhelm/v2/insights/upsert.ts` | `MIN_SAMPLE_N` enforcement, coach/team-scoped dedup |
| `src/lib/coachhelm/v2/insights/to-insight-input.ts` | Legacy v1 → v2 adapter; returns null on insufficient data |
| `src/lib/coachhelm/v2/orchestrator.ts` | Tier-1 generator dispatch + `generatorSummary` |
| `src/test/coachhelm/v2/insights/baseline-registry.test.ts` | Static guard catching hard-coded `comparison_source` strings |
