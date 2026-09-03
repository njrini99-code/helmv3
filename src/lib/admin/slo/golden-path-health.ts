import 'server-only';

/**
 * Golden-path health — Bridge Control Plane Phase D.6.
 *
 * Rolls the golden-path registry (`memory/journeys/golden-paths.yml`, via
 * the generated `golden-paths.generated.ts` — see that generator's header
 * for why this reads a compiled constant rather than the YAML) up against
 * the error-budget report (`src/lib/reliability/error-budget.ts`) computed
 * from the SAME feature-tier vocabulary (`feature-registry.ts`).
 *
 * THE NAMESPACE GAP THIS MODULE SURFACES RATHER THAN PAPERS OVER:
 * `memory/registry.yml`'s `features:` keys (what `feature_id` in
 * golden-paths.yml is validated against — see `check-journeys.mjs`) are a
 * DIFFERENT, more coarse-grained taxonomy than `feature-registry.ts`'s
 * `FeatureKey` union (what `error-budget.ts` is keyed on). Some ids happen
 * to coincide (`stats_analytics`, `calendar_events`, `player_hub`); others
 * do not (`golf_round_lifecycle`, `auth_onboarding_join`,
 * `coach_intelligence_triage` are none of them a `FeatureKey`, and none of
 * them appear in `FEATURE_AREA_ALIASES` either). `resolveFeatureKey()` is
 * reused here exactly as the rest of the Bridge uses it — this module does
 * NOT invent new aliases, because a wrong guess would misattribute one
 * feature's error volume to a stage that never produced it. A stage whose
 * `feature_id` does not resolve to a real `FeatureKey` reports `'unknown'`
 * with the reason stated, never a fabricated pass. Closing the gap belongs
 * to whoever owns `FEATURE_AREA_ALIASES` (feature-registry.ts), not this
 * module.
 */

import { FEATURE_KEYS, resolveFeatureKey, type FeatureKey } from '@/lib/admin/feature-registry';
import type { ErrorBudgetReport } from '@/lib/reliability/error-budget';
import { GOLDEN_PATHS, type GeneratedGoldenPath } from './golden-paths.generated';

export type GoldenPathHealthState = 'ok' | 'amber' | 'red' | 'unknown';

export interface StageHealth {
  stageId: string;
  /** The registry.yml-namespace id declared on the journey stage. */
  featureId: string;
  /** The FeatureKey it resolved to, or null when it did not resolve. */
  resolvedFeatureKey: FeatureKey | null;
  state: GoldenPathHealthState;
  reason: string;
}

export interface JourneyHealth {
  journeyId: string;
  name: string;
  role: 'player' | 'coach';
  criticality: 'high' | 'medium' | 'low';
  /** The journey's own registry status — 'collecting' journeys have no live
   *  coverage on at least one stage by the registry's own admission (see
   *  golden-paths.yml's header); rendered distinctly, never blended into
   *  the health state as if it were a live reading. */
  status: 'active' | 'collecting';
  /** Worst of the journey's stages. */
  state: GoldenPathHealthState;
  stages: readonly StageHealth[];
}

export interface GoldenPathHealthReport {
  generatedAt: string;
  journeys: readonly JourneyHealth[];
}

const STATE_RANK: Readonly<Record<GoldenPathHealthState, number>> = { red: 0, amber: 1, unknown: 2, ok: 3 };

function worstOf(states: readonly GoldenPathHealthState[]): GoldenPathHealthState {
  if (states.length === 0) return 'unknown';
  return states.reduce((worst, s) => (STATE_RANK[s] < STATE_RANK[worst] ? s : worst));
}

function resolveStage(stage: GeneratedGoldenPath['stages'][number], budgetByFeature: ReadonlyMap<FeatureKey, ErrorBudgetReport['features'][number]>): StageHealth {
  const resolved = resolveFeatureKey(stage.featureId, undefined);
  const key = resolved && FEATURE_KEYS.has(resolved) ? (resolved as FeatureKey) : null;

  if (!key) {
    return {
      stageId: stage.id,
      featureId: stage.featureId,
      resolvedFeatureKey: null,
      state: 'unknown',
      reason: `feature_id "${stage.featureId}" does not resolve to a tracked FeatureKey — no error-budget signal exists for this stage yet.`,
    };
  }

  const budget = budgetByFeature.get(key);
  if (!budget) {
    return {
      stageId: stage.id,
      featureId: stage.featureId,
      resolvedFeatureKey: key,
      state: 'unknown',
      reason: `no error-budget row for "${key}" this run.`,
    };
  }

  return {
    stageId: stage.id,
    featureId: stage.featureId,
    resolvedFeatureKey: key,
    state: budget.state,
    reason:
      budget.state === 'unknown'
        ? 'error budget has no readable collector windows yet.'
        : `error budget: ${budget.state} (${budget.observedCount}${budget.observedIsFloor ? '+' : ''} observed / ${budget.allowedCount} allowed over ${budget.windowsReadable} window(s))`,
  };
}

/** Pure over an already-computed `ErrorBudgetReport` — no I/O here. */
export function computeGoldenPathHealth(errorBudget: ErrorBudgetReport, now: Date = new Date()): GoldenPathHealthReport {
  const budgetByFeature = new Map(errorBudget.features.map((f) => [f.featureId, f]));

  const journeys: JourneyHealth[] = GOLDEN_PATHS.map((journey) => {
    const stages = journey.stages.map((stage) => resolveStage(stage, budgetByFeature));
    return {
      journeyId: journey.id,
      name: journey.name,
      role: journey.role,
      criticality: journey.criticality,
      status: journey.status,
      state: worstOf(stages.map((s) => s.state)),
      stages,
    };
  });

  // Worst-first, high-criticality first among ties — the same operator-scan
  // priority error-budget.ts and the Reliability tab already use.
  const CRIT_RANK: Record<JourneyHealth['criticality'], number> = { high: 0, medium: 1, low: 2 };
  journeys.sort(
    (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || CRIT_RANK[a.criticality] - CRIT_RANK[b.criticality] || a.journeyId.localeCompare(b.journeyId),
  );

  return { generatedAt: now.toISOString(), journeys };
}
