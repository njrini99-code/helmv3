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
import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';
import type { CounterfactualProjection } from '@/lib/coachhelm/v3/counterfactual/types';
import { isFloorExemptMetric } from '@/lib/coachhelm/v3/ranking/score';
import { METRIC_RENDER_CONFIG } from '@/lib/coachhelm/v3/standing/metric-config';
import { calcConfidence, type InsightConfidenceFactors } from '@/lib/coachhelm/v2/insights/types';
import { logServerError } from '@/lib/server-error-logger';

import type {
  ComposedContent,
  GeneratorAggregate,
  InsightCategory,
  InsightPriority,
  MetricId,
  RunResult,
} from './types';

/** Severity ordering for the upgrade-only leverage-priority floor below. */
const PRIORITY_RANK: Record<InsightPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

/**
 * Backfill `strokes_impact` from the counterfactual's real per-round stroke
 * value. Generators hard-code `strokes_impact: 0`; the genuine number lives in
 * `counterfactual.strokes_saved_per_round`. Flat surfaces (Hub signal card,
 * coach feed, round takeaway, morning digest, EvidencePanel) rank/render off
 * `strokes_impact`, so without this they read 0. Suppressed / absent /
 * non-positive → keep the generator's composed value (ranks low — correct).
 * Pure + exported for direct unit testing.
 *
 * @param metric Optional canonical metric id. When it is floor-exempt
 *   (`scoring_par_*` / `opening_hole_delta` per `isFloorExemptMetric`) the
 *   backfill is skipped and the generator's composed (descriptive) value is
 *   returned unchanged — these metrics must never acquire CF-derived per-round
 *   leverage they don't independently own, or they crowd the actionable feed.
 */
export function backfilledStrokesImpact(
  composedImpact: number,
  counterfactual: CounterfactualProjection | null,
  metric?: string,
): number {
  // Descriptive / warmup metrics (scoring_par_*, opening_hole_delta) are
  // intentionally zero-impact — never overwrite their seed from the CF, or they
  // acquire a per-round leverage they don't independently own and crowd the feed.
  if (isFloorExemptMetric(metric)) {
    return composedImpact;
  }
  if (
    counterfactual &&
    counterfactual.suppressed !== true &&
    Number.isFinite(counterfactual.strokes_saved_per_round) &&
    counterfactual.strokes_saved_per_round > 0
  ) {
    return counterfactual.strokes_saved_per_round;
  }
  return composedImpact;
}

/**
 * SV-1: optional per-round dispersion an aggregate may expose so the base can
 * compute a GENUINE recency/variance instead of the placeholder 1.0/0.5. Both
 * are duck-typed (the base `GeneratorAggregate` doesn't require them) — a
 * generator opts in by returning either field; absent → honest sample-adequacy
 * (calcConfidence drops the placeholders). Nothing is fabricated here.
 */
export interface DispersionSignals {
  /** Per-round stddev of the metric in the SAME unit as `playerValue`. */
  stddev?: number;
  /** A scale for the stddev → variance-confidence map (default 20). A spread
   *  ≥ scale reads as "high variance" (0); 0 spread reads as "tight" (1). */
  stddev_scale?: number;
  /** ISO round dates contributing to the aggregate (any order). */
  round_dates?: string[];
}

/**
 * Compute genuinely-measured recency + variance from per-round dispersion an
 * aggregate exposes (SV-1). Returns `null` unless BOTH a real per-round stddev
 * AND ≥1 parseable round date are present — only then can the full
 * `factors_measured: true` blend be claimed without fabricating either term.
 * When null, the caller keeps the generator's placeholder factors flagged
 * unmeasured, and calcConfidence surfaces honest sample-adequacy (no fabricated
 * +0.45 floor). Pure + exported.
 *
 * - variance: `clamp01(1 - stddev / scale)` — mirrors the v2 approach-analytics
 *   convention (smaller spread → higher confidence).
 * - recency: fraction of contributing rounds inside the freshness half-window
 *   (`windowDays / 2`), the same "fully-recent if all within window/2" contract
 *   the InsightConfidenceFactors.recency doc describes.
 */
export function computeMeasuredFactors(
  signals: DispersionSignals | undefined,
  windowDays: number,
  now: number = Date.now(),
): { recency: number; variance: number; factors_measured: true } | null {
  if (!signals) return null;
  if (!Number.isFinite(signals.stddev)) return null;
  const dates = (signals.round_dates ?? []).filter((d) => Number.isFinite(Date.parse(d)));
  if (dates.length === 0) return null;

  const clamp01 = (n: number): number =>
    !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n;

  // Variance: smaller spread → higher confidence (default 20-unit scale).
  const scale = signals.stddev_scale && signals.stddev_scale > 0 ? signals.stddev_scale : 20;
  const variance = clamp01(1 - (signals.stddev as number) / scale);

  // Recency: share of rounds within the freshness half-window.
  const halfWindowMs = (Math.max(1, windowDays) / 2) * 86400_000;
  const fresh = dates.filter((d) => now - Date.parse(d) <= halfWindowMs).length;
  const recency = clamp01(fresh / dates.length);

  return { recency, variance, factors_measured: true };
}

/**
 * Upgrade-only priority floor from counterfactual leverage: ≥1.0 strokes/rd →
 * high, ≥0.5 → medium. Keeps a high-leverage but "descriptive" (priority:'low')
 * insight from being buried below the Alert Center's ['urgent','high'] filter
 * and the practice-plan top-3. Never downgrades. Pure + exported for testing.
 *
 * @param metric Optional canonical metric id. When it is floor-exempt
 *   (`scoring_par_*` / `opening_hole_delta` per `isFloorExemptMetric`) the CF
 *   leverage is ignored and the generator's `current` priority is returned
 *   unchanged — a descriptive standing row must not be floated into the Alert
 *   Center off CF leverage it doesn't independently own.
 * @param confidence Optional insight confidence score (0–1). When below 0.5 the
 *   'high' floor is suppressed — a thin-sample leak (DC-CONF-2, e.g. Grace
 *   par_4 @ n=8, confidence=0.27) must not auto-promote to the Alert Center.
 *   Below that threshold the insight can still reach 'medium' but never 'high'.
 *   A null/omitted confidence preserves the prior unconditional behavior (back-compat).
 */
export function leveragePriorityFloor(
  current: InsightPriority | undefined,
  counterfactual: CounterfactualProjection | null,
  metric?: string,
  confidence?: number,
): InsightPriority | undefined {
  // Exempt metrics keep their generator priority (par-scoring stays 'low'
  // descriptive; warmup-hole keeps its own at/under-tax escalation) — the CF
  // leverage must not float a descriptive row into the Alert Center.
  if (isFloorExemptMetric(metric)) return current;
  if (!counterfactual || counterfactual.suppressed === true) return current;
  const s = counterfactual.strokes_saved_per_round;
  if (!Number.isFinite(s)) return current;
  // DC-CONF-2: the 'high' floor requires a minimum confidence — a thin-sample
  // leak (Grace par_4 @ 0.27, n=8) must not auto-promote to the Alert Center.
  // Below that confidence it can still reach 'medium' but never 'high'. A null
  // confidence keeps the prior unconditional behavior (back-compat).
  const confOk = confidence == null || confidence >= MIN_CONF_FOR_HIGH;
  const floor: InsightPriority | null =
    s >= 1.0 && confOk ? 'high' : s >= 0.5 ? 'medium' : null;
  if (floor && PRIORITY_RANK[floor] > PRIORITY_RANK[current ?? 'low']) return floor;
  return current;
}

/** DC-CONF-2 threshold: 'high'/'urgent' requires at least this confidence. */
export const MIN_CONF_FOR_HIGH = 0.5;

/**
 * Matured rows in a generator's scope are archived only after going
 * un-refreshed this many days (regrade LIFE-P2): matured carries movement
 * history, so retraction waits for this many consecutive non-emitting daily
 * runs instead of firing immediately like tentative/detected.
 */
export const MATURED_RETRACT_AFTER_DAYS = 7;

/**
 * Write-side priority honesty (DC-CONF-2 closure, regrade VAL-P1): the floor
 * above only ever UPGRADES, so a generator that COMPOSES 'high'/'urgent'
 * directly (course_management's anchoredPriority) bypassed the confidence
 * gate entirely — 7 live sub-0.5-confidence 'high' rows auto-surfaced in the
 * Alert Center. Every written priority must clear the same gate regardless of
 * which path produced it: below MIN_CONF_FOR_HIGH a row can be at most
 * 'medium'. Pure + exported for tests.
 */
export function enforcePriorityConfidenceGate(
  priority: InsightPriority | undefined,
  confidence: number,
): InsightPriority | undefined {
  if (!priority) return priority;
  if ((priority === 'high' || priority === 'urgent') && confidence < MIN_CONF_FOR_HIGH) {
    return 'medium';
  }
  return priority;
}

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
   * Signature scope this generator instance OWNS, without the `v3:` prefix
   * (to-95 audit P2 stale-row sweep). When non-null, a successful run
   * retracts (archives) still-active rows in this scope that the run did
   * not (re-)emit — closing the "player dequalified but the old row lives
   * forever" gap the age-based lifecycle cron cannot close (it never
   * archives matured rows, and detected rows survive 30d).
   *
   * MUST be deterministic from constructor state alone (never from the
   * aggregate) so it is computable on the didn't-qualify exits. Scopes of
   * sibling instances must not prefix-overlap (e.g. `putt_distance:3_5ft`
   * vs `putt_distance:5_10ft`). Default null = no retraction (opt-in).
   */
  protected signatureScope(): string | null {
    return null;
  }

  /**
   * Archive still-active, coach-untouched rows in this generator's scope,
   * except `keepSignature` (the row the run just wrote). Only `tentative`/
   * `detected` lifecycle states are touched — matured/addressed/resolved
   * carry movement history or coach action and are left to the lifecycle
   * cron / the coach. Soft-archive only (lifecycle_state + archived_at);
   * never a DELETE. Failure is logged and swallowed — a sweep failure must
   * not fail the generator run that produced a fresh insight.
   *
   * NOTE on LIKE: signatures are fixed lowercase snake-case vocabularies,
   * so the unescaped `_` wildcard cannot collide across scopes in practice
   * (no two scopes differ only at an underscore position).
   */
  private async retractStaleInScope(keepSignature: string | null): Promise<number> {
    const scope = this.signatureScope();
    if (!scope) return 0;
    try {
      const supabase = createAdminClient();
      const nowIso = new Date().toISOString();
      // Matured rows carry movement history, so they get a CONSERVATIVE bound
      // rather than immediate retraction (regrade LIFE-P2: 3 dequalified
      // matured warmup rows were stuck visible forever): archive only after
      // the row has gone un-refreshed for MATURED_RETRACT_AFTER_DAYS — every
      // re-emit bumps updated_at via updateExisting, so "stale matured" means
      // that many consecutive daily runs stopped emitting it.
      const maturedStaleBeforeIso = new Date(
        Date.now() - MATURED_RETRACT_AFTER_DAYS * 86400_000,
      ).toISOString();

      // SELECT-then-per-row-UPDATE (not a single bulk UPDATE) so each archive
      // can merge provenance into metadata (regrade LIFE-P3: sweep archives
      // were indistinguishable from coach/cron archives) and carry an
      // optimistic lifecycle guard against a concurrent run touching the row.
      let sel = supabase
        .from('golf_coach_insights')
        .select('id, metadata, lifecycle_state, updated_at')
        .eq('player_id', this.playerId)
        .like('signature', `${V3_SIGNATURE_PREFIX}${scope}%`)
        .in('lifecycle_state', ['tentative', 'detected', 'matured'])
        .eq('status', 'active')
        .is('acknowledged_at', null)
        .is('addressed_at', null);
      if (keepSignature) {
        sel = sel.neq('signature', keepSignature);
      }
      const { data: rows, error: selErr } = await sel;
      if (selErr) {
        await logServerError(
          `${this.name} stale-scope retraction select failed for player=${this.playerId} scope=${scope}: ${selErr.message}`,
          { action: `v3.generator.${this.name}.retract` },
        );
        return 0;
      }

      const targets = (rows ?? []).filter(
        (r) =>
          r.lifecycle_state !== 'matured' ||
          (typeof r.updated_at === 'string' && r.updated_at < maturedStaleBeforeIso),
      );

      let archived = 0;
      for (const r of targets) {
        const metadata = {
          ...((r.metadata as Record<string, unknown> | null) ?? {}),
          archived_by: 'generator-scope-sweep',
          archive_reason: `scope:${scope}`,
          retracted_at: nowIso,
        };
        const { error } = await supabase
          .from('golf_coach_insights')
          .update({
            lifecycle_state: 'archived',
            archived_at: nowIso,
            updated_at: nowIso,
            metadata,
          })
          .eq('id', r.id)
          // Optimistic guard: if a concurrent run already moved this row
          // (re-emit refresh, coach action), skip rather than clobber.
          .eq('lifecycle_state', r.lifecycle_state);
        if (error) {
          await logServerError(
            `${this.name} stale-scope retraction update failed for insight=${r.id}: ${error.message}`,
            { action: `v3.generator.${this.name}.retract` },
          );
          continue;
        }
        archived += 1;
      }
      return archived;
    } catch (err) {
      await logServerError(
        `${this.name} stale-scope retraction threw for player=${this.playerId}: ${err instanceof Error ? err.message : String(err)}`,
        { action: `v3.generator.${this.name}.retract` },
      );
      return 0;
    }
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
        // Team explicitly disabled this generator — its existing rows must
        // not keep rendering an insight type the team opted out of (regrade
        // NEW-P3). Sweep the full scope; resurrection restores them the
        // moment the toggle comes back on and the generator re-emits.
        const retracted = await this.retractStaleInScope(null);
        return { id: null, gated: true, retracted };
      }

      const agg = await this.aggregate();
      if (!agg) {
        // True dequalification — no data in the window. Retract any rows
        // this scope still has active so they don't outlive their evidence.
        const retracted = await this.retractStaleInScope(null);
        return { id: null, gated: false, retracted };
      }
      if (agg.sampleN < this.minSampleN) {
        // Fell below the sample gate (audit P2's named case) — retract.
        const retracted = await this.retractStaleInScope(null);
        return { id: null, gated: false, retracted };
      }

      const standing = this.requiresStanding
        ? await loadStandingForMetric(this.playerId, this.metricId)
        : null;

      if (this.requiresStanding && !standing) {
        // No standing yet → no PGA reference → skip the insight. The
        // standing cron will catch up; next run picks this up.
        // Deliberately NO retraction here — this is infrastructure lag,
        // not dequalification; archiving would flap rows and reset their
        // lifecycle history every time the standing cron falls behind.
        return { id: null, gated: false };
      }

      const composed = this.composeContent(agg);

      // Centralize the canonical confidence calc (design contract Rule 1).
      // Generators stamp `confidence: 0` + `confidence_factors`; compute the
      // real confidence here so EVERY v3 row ships a usable value. The flat
      // read-path ranker is `|strokes_impact| × confidence`, so a hard-coded 0
      // confidence would zero out the score regardless of strokes_impact.
      //
      // SV-1: recency/variance are placeholders unless the aggregate exposes
      // per-round dispersion. When it does, replace them with genuinely-measured
      // factors (factors_measured=true → blended). When it doesn't, flag them
      // unmeasured (factors_measured=false) so calcConfidence surfaces honest
      // sample-adequacy instead of the fabricated +0.45 floor. Nothing invented.
      const measured = computeMeasuredFactors(
        agg as DispersionSignals,
        composed.evidence.window_days,
      );
      const confidenceFactors: InsightConfidenceFactors = measured
        ? { ...composed.evidence.confidence_factors, ...measured }
        : { ...composed.evidence.confidence_factors, factors_measured: false };
      let evidence = {
        ...composed.evidence,
        confidence_factors: confidenceFactors,
        confidence: calcConfidence({ confidence_factors: confidenceFactors }),
      };

      // A generator may pin priority:'low' for a descriptive standing row, but
      // a real counterfactual leak must be eligible for the Alert Center
      // (['urgent','high']) + the practice-plan top-3. We floor priority from
      // the counterfactual magnitude below — upgrade-only, never a downgrade.
      let effectivePriority: InsightPriority | undefined = composed.priority;

      // Counterfactual + standing injection — only when we actually have
      // a standing row (requiresStanding=true generators). Diagnostic
      // generators (requiresStanding=false) ship without these.
      if (standing) {
        let counterfactual: ReturnType<typeof computeCounterfactual> | null = null;
        const cfg = METRIC_RENDER_CONFIG[this.metricId];
        if (cfg) {
          const baseline = await loadPlayerScoringBaseline(this.playerId);
          const cohort = await loadPlayerCohort(this.playerId);
          // Player's OWN per-round attempt rate when the aggregate exposes one
          // (Scrambling/ApproachMiss set attempts_per_round; ParType sets
          // holes_per_round). Null → computeCounterfactual uses the legacy path.
          const attemptsPerRound =
            (agg as { attempts_per_round?: number }).attempts_per_round ??
            (agg as { holes_per_round?: number }).holes_per_round ??
            null;
          const cfInput: ComputeCounterfactualInput = {
            metric_id: this.metricId,
            direction: cfg.direction,
            player_value: agg.playerValue,
            pga_value: standing.pga_value,
            // College/division cohort target (Tour stays the ceiling fallback).
            // Null until the cohort RPC populates level_avg → unchanged behavior.
            cohort_value: standing.level_avg,
            player_30d_scoring_avg: baseline,
            cohort_gender: cohort.gender,
            player_attempts_per_round: attemptsPerRound,
            confidence: evidence.confidence,
          };
          counterfactual = computeCounterfactual(cfInput);
        }

        // Backfill strokes_impact + floor priority from the counterfactual's
        // real per-round leverage (see the pure helpers above). The themes path
        // reads the counterfactual directly and is unaffected.
        const cfStrokes = backfilledStrokesImpact(evidence.strokes_impact, counterfactual, this.metricId);
        effectivePriority = leveragePriorityFloor(effectivePriority, counterfactual, this.metricId, evidence.confidence);

        evidence = {
          ...evidence,
          standing: {
            metric_id: standing.metric_id,
            player_value: standing.player_value,
            team_avg: standing.team_avg,
            team_n: standing.team_n,
            team_pct: standing.team_pct,
            // College/division cohort baseline — null until the cohort RPC lands;
            // carried so the StandingBar can render college + Tour markers.
            level_avg: standing.level_avg,
            level_n: standing.level_n,
            level_pct: standing.level_pct,
            pga_value: standing.pga_value,
            pga_delta: standing.pga_delta,
            computed_at: standing.computed_at,
          },
          counterfactual,
          strokes_impact: cfStrokes,
        } as typeof composed.evidence;
      }

      // Write-side honesty gate (regrade VAL-P1): no row ships 'high'/'urgent'
      // below MIN_CONF_FOR_HIGH, regardless of whether the priority came from
      // the generator's own composition or the leverage floor.
      const honestPriority = enforcePriorityConfidenceGate(
        effectivePriority,
        evidence.confidence,
      );

      const supabase = createAdminClient();
      const result = await upsertInsightV3(supabase, {
        player_id: this.playerId,
        category: this.category,
        insight_type: this.insightType,
        signature: `${V3_SIGNATURE_PREFIX}${composed.signature}`,
        title: composed.title,
        content: composed.content,
        priority: honestPriority,
        evidence: evidence as typeof composed.evidence,
      });

      if (result === GATED_OUT) {
        // Philosophy gate suppressed the write — a product decision to not
        // ADD a row, not evidence the old rows are stale. No retraction.
        return { id: null, gated: true };
      }
      // Fresh row written — retract siblings in scope it superseded (e.g.
      // a data-derived signature suffix moved: old band/pattern row goes).
      const retracted = await this.retractStaleInScope(
        `${V3_SIGNATURE_PREFIX}${composed.signature}`,
      );
      return { id: result, gated: false, retracted };
    } catch (err) {
      await logServerError(
        `${this.name} run() failed for player=${this.playerId}: ${err instanceof Error ? err.message : String(err)}`,
        { action: `v3.generator.${this.name}` },
      );
      return { id: null, gated: false };
    }
  }
}
