/**
 * v3 BaseGenerator abstract class — W21.
 *
 * Master plan Part V.4. Every v3 generator inherits from this and
 * implements `aggregate()` + `composeContent()`. The base class
 * orchestrates the full lifecycle and stamps v3 metadata:
 *
 *   1. aggregate() — generator pulls its data, returns an aggregate
 *      object (or null if no data).
 *   2. Min-sample-N gate — if aggregate.sampleN < minSampleN, return
 *      { id: null, gated: false } and don't write.
 *   3. Standing load — load v3 standing snapshot for the metric. Skip
 *      if absent (no PGA baseline = nothing meaningful to compare).
 *   4. composeContent() — generator composes title + content + evidence
 *      using the aggregate + standing.
 *   5. Counterfactual compute — base class injects evidence.counterfactual.
 *   6. Standing injection — base class injects evidence.standing.
 *   7. upsertInsightV3 — writes the row + stamps engine_version='v3'.
 *      Signature gets the `v3:` prefix automatically.
 *
 * Generators don't touch DB writes directly — the base owns that
 * boundary so every v3 insight ships consistently.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { upsertInsightV3, V3_SIGNATURE_PREFIX, GATED_OUT } from '@/lib/coachhelm/v3/insights/upsert-v3';
import { loadStandingForMetric } from '@/lib/coachhelm/v3/standing/loader';
import {
  computeCounterfactual,
  type ComputeCounterfactualInput,
} from '@/lib/coachhelm/v3/counterfactual/compute';
import { loadPlayerScoringBaseline } from '@/lib/coachhelm/v3/counterfactual/baseline-loader';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';
import { logServerError } from '@/lib/server-error-logger';

import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  MetricId,
  RunResult,
} from './types';

export abstract class BaseGenerator<A extends GeneratorAggregate = GeneratorAggregate> {
  // Generator identity — concrete classes override
  abstract readonly name: string;
  abstract readonly metricId: MetricId;
  abstract readonly insightType: string;
  abstract readonly category: InsightCategory;
  abstract readonly minSampleN: number;

  /**
   * Whether `run()` should require a v3 standing row for the metric.
   * - true (default): no standing → skip insight (PGA reference required)
   * - false: emit diagnostic insight without standing/counterfactual.
   *   Used for metrics that are player-vs-self only (e.g. putt miss bias
   *   — no public PGA benchmark exists).
   */
  protected readonly requiresStanding: boolean = true;

  constructor(protected readonly playerId: string) {}

  // Subclass-supplied work
  abstract aggregate(): Promise<A | null>;
  abstract composeContent(agg: A): ComposedContent;

  /**
   * Per-team toggle gate. Default returns `true` — subclasses override
   * to check `golf_team_coachhelm_settings.preferences[someKey]` so
   * teams can opt out of specific generators (e.g. tee-strategy). When
   * this returns false, the generator skips work AND skips writing —
   * but the run is still treated as a success (gated, not failed).
   */
  protected async isEnabled(): Promise<boolean> {
    return true;
  }

  /**
   * Full lifecycle entry point. Cron / orchestrator code calls this.
   */
  async run(): Promise<RunResult> {
    try {
      // Per-team toggle gate runs FIRST — saves the aggregate query
      // when the team has the generator off.
      const enabled = await this.isEnabled();
      if (!enabled) {
        return { id: null, gated: true };
      }

      const agg = await this.aggregate();
      if (!agg) {
        return { id: null, gated: false };
      }
      if (agg.sampleN < this.minSampleN) {
        return { id: null, gated: false };
      }

      const standing = this.requiresStanding
        ? await loadStandingForMetric(this.playerId, this.metricId)
        : null;

      if (this.requiresStanding && !standing) {
        // No standing yet → no PGA reference → skip the insight. The
        // standing cron will catch up; next run picks this up.
        return { id: null, gated: false };
      }

      const composed = this.composeContent(agg);

      // Counterfactual + standing injection — only when we actually have
      // a standing row (requiresStanding=true generators). Diagnostic
      // generators (requiresStanding=false) ship without these.
      let evidence = composed.evidence;
      if (standing) {
        let counterfactual: ReturnType<typeof computeCounterfactual> | null = null;
        const cfg = METRIC_RENDER_CONFIG[this.metricId];
        if (cfg) {
          const baseline = await loadPlayerScoringBaseline(this.playerId);
          const cfInput: ComputeCounterfactualInput = {
            metric_id: this.metricId,
            direction: cfg.direction,
            player_value: agg.playerValue,
            pga_value: standing.pga_value,
            player_30d_scoring_avg: baseline,
          };
          counterfactual = computeCounterfactual(cfInput);
        }

        evidence = {
          ...composed.evidence,
          standing: {
            metric_id: standing.metric_id,
            player_value: standing.player_value,
            team_avg: standing.team_avg,
            team_n: standing.team_n,
            team_pct: standing.team_pct,
            pga_value: standing.pga_value,
            pga_delta: standing.pga_delta,
            computed_at: standing.computed_at,
          },
          counterfactual,
        } as typeof composed.evidence;
      }

      const supabase = createAdminClient();
      const result = await upsertInsightV3(supabase, {
        player_id: this.playerId,
        category: this.category,
        insight_type: this.insightType,
        signature: `${V3_SIGNATURE_PREFIX}${composed.signature}`,
        title: composed.title,
        content: composed.content,
        evidence: evidence as typeof composed.evidence,
      });

      if (result === GATED_OUT) {
        return { id: null, gated: true };
      }
      return { id: result, gated: false };
    } catch (err) {
      await logServerError(
        `${this.name} run() failed for player=${this.playerId}: ${err instanceof Error ? err.message : String(err)}`,
        { action: `v3.generator.${this.name}` },
      );
      return { id: null, gated: false };
    }
  }
}
