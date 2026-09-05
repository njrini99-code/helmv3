/**
 * Causal Discovery Engine
 *
 * Tests for actual causation vs mere correlation including:
 * - Temporal precedence (X happens before Y)
 * - Dose-response (more X → more Y)
 * - Confounder elimination
 * - Natural experiments (when X changed, did Y follow?)
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import type {
  CausalRelationship,
  CausalEvidence,
  NaturalExperiment,
  CausalRelationshipType,
} from '../types';

interface RoundData {
  id: string;
  score_to_par: number;
  round_date: string;
  total_putts?: number | null;
  total_fairways_hit?: number | null;
  total_gir?: number | null;
  days_since_last?: number;
}

/**
 * Causal Discovery Engine for finding true causal relationships
 */
export class CausalEngine {
  private playerId: string;
  private teamId?: string;
  private rounds: RoundData[] = [];

  constructor(playerId: string, teamId?: string) {
    this.playerId = playerId;
    this.teamId = teamId;
  }

  /**
   * Discovers causal relationships for a player
   */
  async discoverCausalRelationships(): Promise<CausalRelationship[]> {
    const supabase = createAdminClient();

    // Load rounds
    const { data: rounds, error } = await supabase
      .from('golf_rounds')
      .select('id, score_to_par, round_date, total_putts, total_fairways_hit, total_gir')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      // DESCENDING + limit(100) = the player's most RECENT 100 rounds.
      //
      // This was `ascending: true`, which took the OLDEST 100: the moment a
      // player crossed 100 completed rounds their causal analysis froze on
      // their earliest data and never moved again, while the engine kept
      // running and kept writing rows — stale, not obviously broken.
      .order('round_date', { ascending: false })
      .limit(100);

    if (error || !rounds || rounds.length < 10) {
      if (error) {
        await logServerError(
          `causal-engine.discoverCausalRelationships: rounds query failed: ${describeError(error)}`,
          { action: 'coachhelm.causalEngine.discoverCausalRelationships', metadata: { playerId: this.playerId } },
        );
      }
      // Deliberate, not a swallow: this branch already covers a genuine
      // "not enough rounds yet" case (< 10) alongside the query-error case,
      // and both must answer the same way — no fabricated causal claim from
      // insufficient/failed data. Background mining (v2/orchestrator.ts),
      // fails closed. The error case is now logged, distinguishing it from
      // "insufficient sample" in the logs even though the return is the same.
      return [];
    }

    // ...then back to CHRONOLOGICAL before anything reads it.
    // `computeDaysSinceLast` treats `rounds[index - 1]` as the PREVIOUS round
    // and computes `curr - prev`, so a descending array yields a negative gap
    // for every round. That value feeds the causal-strength maths, so flipping
    // the sort WITHOUT this reverse would trade a visible staleness bug for a
    // silent correctness one. Selection order and processing order are two
    // different requirements; this is the seam where they meet.
    const chronological = [...rounds].reverse();

    this.rounds = this.computeDaysSinceLast(
      chronological.map((r) => ({
        id: r.id,
        score_to_par: r.score_to_par ?? 0,
        round_date: r.round_date,
        total_putts: r.total_putts,
        total_fairways_hit: r.total_fairways_hit,
        total_gir: r.total_gir,
      }))
    );

    const relationships: CausalRelationship[] = [];

    // Test known potential causal relationships
    const hypotheses = this.generateHypotheses();

    for (const hypothesis of hypotheses) {
      const result = await this.testCausality(hypothesis);
      if (result) {
        relationships.push(result);
      }
    }

    // Save to database
    await this.saveRelationships(relationships);

    return relationships;
  }

  /**
   * Computes days since last round for each round
   */
  private computeDaysSinceLast(rounds: RoundData[]): RoundData[] {
    return rounds.map((round, index) => {
      if (index === 0) {
        return { ...round, days_since_last: 0 };
      }
      const prevRound = rounds[index - 1];
      if (!prevRound) {
        return { ...round, days_since_last: 0 };
      }
      const prevDate = new Date(prevRound.round_date);
      const currDate = new Date(round.round_date);
      const daysDiff = Math.floor(
        (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return { ...round, days_since_last: daysDiff };
    });
  }

  /**
   * Generates hypotheses to test
   */
  private generateHypotheses(): CausalHypothesis[] {
    return [
      {
        cause: 'practice_frequency',
        causeMetric: 'rounds_per_week',
        effect: 'scoring',
        effectMetric: 'score_to_par',
        getCauseValue: (r: RoundData) =>
          r.days_since_last !== undefined && r.days_since_last > 0
            ? 7 / r.days_since_last
            : 7,
        getEffectValue: (r: RoundData) => r.score_to_par,
        mechanism: 'More practice maintains muscle memory and rhythm',
      },
      {
        cause: 'putting',
        causeMetric: 'total_putts',
        effect: 'scoring',
        effectMetric: 'score_to_par',
        getCauseValue: (r: RoundData) => r.total_putts ?? null,
        getEffectValue: (r: RoundData) => r.score_to_par,
        mechanism: 'Lower putts directly reduce total strokes',
      },
      {
        cause: 'greens_in_regulation',
        causeMetric: 'total_gir',
        effect: 'scoring',
        effectMetric: 'score_to_par',
        getCauseValue: (r: RoundData) => r.total_gir ?? null,
        getEffectValue: (r: RoundData) => r.score_to_par,
        mechanism: 'Hitting more greens creates more birdie opportunities',
      },
      {
        cause: 'driving_accuracy',
        causeMetric: 'total_fairways_hit',
        effect: 'scoring',
        effectMetric: 'score_to_par',
        getCauseValue: (r: RoundData) => r.total_fairways_hit ?? null,
        getEffectValue: (r: RoundData) => r.score_to_par,
        mechanism: 'Hitting more fairways leads to better approach opportunities',
      },
      // THE ONLY HYPOTHESIS HERE THAT IS NOT A TAUTOLOGY.
      //
      // The four above all end at `score_to_par`, and all four causes are
      // arithmetic COMPONENTS of the score. "Hitting more greens lowers your
      // score" is the definition of scoring, not a discovery. Production shows
      // the consequence: 5,641 relationships across 4 cause metrics and ONE
      // effect metric, `total_gir -> score_to_par` alone accounting for 4,282
      // of them. The engine had never once explained why a component moved,
      // which is the mechanism behind "insights are not root-cause".
      //
      // A root cause needs an effect that is not the score. This is the chain
      // the product's own research doc documents and quantifies —
      // docs/v3-research-golf-domain.md:146, "Drive -> Approach Distance/Lie ->
      // GIR ... Lie quality premium: fairway -> ~65% GIR from 150; rough ->
      // ~45%; sand -> ~25%" — which is what satisfies the blocking review rule
      // that every causal claim trace to that document.
      //
      // Both fields are already on RoundData, so this costs no extra loading.
      {
        cause: 'driving_accuracy',
        causeMetric: 'total_fairways_hit',
        effect: 'greens_in_regulation',
        effectMetric: 'total_gir',
        getCauseValue: (r: RoundData) => r.total_fairways_hit ?? null,
        getEffectValue: (r: RoundData) => r.total_gir ?? null,
        mechanism:
          'Approach play from the fairway holds ~65% GIR at 150 yards against ~45% from rough and ~25% from sand, so fairways won convert into greens hit (research: Drive -> Approach Lie -> GIR)',
      },
      // THE SECOND NON-TAUTOLOGY, and the one that changes a coach's CONCLUSION
      // rather than only widening the engine's vocabulary.
      //
      // `total_putts -> score_to_par` above reports a confounded number as a
      // cause. docs/v3-research-golf-domain.md:29 states the confound directly:
      // "putts-per-round is *lower* for bad iron players (they chip close and
      // 1-putt for bogey)". So a low putt count is not evidence of good
      // putting — it can be evidence of missed greens, and a coach reading
      // "putting looks fine" off it draws the wrong conclusion.
      //
      // Testing GIR -> putts makes that confound explicit per player instead of
      // leaving it as a footnote in a research document nobody on the team
      // reads. Where the relationship holds, "your putts per round are low
      // BECAUSE you are missing greens" is a root cause; where it does not, the
      // player's putting number can be read at face value.
      //
      // Measured 2026-08-18: of Guilford's 12 active players, 5 carry any
      // active causal relationship and every one of those except a single
      // `total_fairways_hit -> total_gir` terminates in `score_to_par`. Adding
      // one research-backed pair produced the only genuine root cause on the
      // roster. This is that lever pulled once more.
      //
      // Both fields are already on RoundData, so this costs no extra loading.
      {
        cause: 'greens_in_regulation',
        causeMetric: 'total_gir',
        effect: 'putting_volume',
        effectMetric: 'total_putts',
        getCauseValue: (r: RoundData) => r.total_gir ?? null,
        getEffectValue: (r: RoundData) => r.total_putts ?? null,
        mechanism:
          'Putts per round is confounded by greens hit — a player who misses greens chips close and 1-putts for bogey, so a low putt count can mask poor iron play rather than show good putting (research: traditional-stat interaction effects)',
      },
    ];
  }

  /**
   * Tests a specific causal hypothesis
   */
  private async testCausality(
    hypothesis: CausalHypothesis
  ): Promise<CausalRelationship | null> {
    // Get cause and effect values
    const dataPoints = this.rounds
      .map((r) => ({
        cause: hypothesis.getCauseValue(r),
        effect: hypothesis.getEffectValue(r),
        date: r.round_date,
      }))
      .filter((d) => d.cause !== null && d.effect !== null) as Array<{
      cause: number;
      effect: number;
      date: string;
    }>;

    if (dataPoints.length < 10) {
      return null;
    }

    // Test 1: Temporal precedence (cause values from earlier rounds predict later effects)
    const temporalPrecedence = this.checkTemporalPrecedence(dataPoints);

    // Test 2: Dose-response (more X → more Y)
    const doseResponse = this.checkDoseResponse(dataPoints);

    // Test 3: Analyze natural experiments
    const naturalExperiments = this.analyzeNaturalExperiments(
      dataPoints,
      hypothesis.cause
    );

    // Calculate correlation strength
    const correlation = this.calculateCorrelation(dataPoints);

    // Determine if causal
    const passedTests =
      (temporalPrecedence ? 1 : 0) +
      (doseResponse.confirmed ? 1 : 0) +
      (naturalExperiments.length > 0 ? 1 : 0);

    // Need at least 2 tests passed and reasonable correlation
    if (passedTests < 2 || Math.abs(correlation) < 0.3) {
      return null;
    }

    // Build evidence
    const evidence: CausalEvidence = {
      temporalPrecedence,
      doseResponseConfirmed: doseResponse.confirmed,
      confoundersControlled: [],
      naturalExperiments,
    };

    // Calculate confidence
    const confidence = this.calculateCausalConfidence(
      correlation,
      passedTests,
      dataPoints.length
    );

    // Determine relationship type
    const relationshipType = this.determineRelationshipType(
      hypothesis,
      doseResponse
    );

    // Calculate intervention potential
    const interventionPotential = this.calculateInterventionPotential(
      hypothesis.cause
    );

    return {
      id: crypto.randomUUID(),
      playerId: this.playerId,
      teamId: this.teamId,
      cause: hypothesis.cause,
      causeMetric: hypothesis.causeMetric,
      effect: hypothesis.effect,
      effectMetric: hypothesis.effectMetric,
      relationshipType,
      strength: Math.abs(correlation),
      confidence,
      mechanism: hypothesis.mechanism,
      confounders: [],
      doseResponse: doseResponse.confirmed,
      interventionPotential,
      evidence,
      validationCount: 1,
    };
  }

  /**
   * Checks if cause temporally precedes effect
   */
  private checkTemporalPrecedence(
    dataPoints: Array<{ cause: number; effect: number; date: string }>
  ): boolean {
    // Compare lagged cause values with current effect
    let laggedCorrelation = 0;
    let count = 0;

    for (let i = 1; i < dataPoints.length; i++) {
      // Does previous round's cause relate to current round's effect?
      const prevPoint = dataPoints[i - 1];
      const currPoint = dataPoints[i];
      if (!prevPoint || !currPoint) continue;

      const prevCause = prevPoint.cause;
      const currEffect = currPoint.effect;

      laggedCorrelation += prevCause * currEffect;
      count++;
    }

    // If lagged correlation is meaningful, temporal precedence exists
    return count > 0 && Math.abs(laggedCorrelation / count) > 0.2;
  }

  /**
   * Checks for dose-response relationship
   */
  private checkDoseResponse(
    dataPoints: Array<{ cause: number; effect: number }>
  ): { confirmed: boolean; direction: 'positive' | 'negative' } {
    // Sort by cause value
    const sorted = [...dataPoints].sort((a, b) => a.cause - b.cause);

    // Divide into thirds
    const third = Math.floor(sorted.length / 3);
    const lowThird = sorted.slice(0, third);
    const midThird = sorted.slice(third, 2 * third);
    const highThird = sorted.slice(2 * third);

    // Calculate average effect for each third
    const lowAvg =
      lowThird.reduce((a, d) => a + d.effect, 0) / lowThird.length;
    const midAvg =
      midThird.reduce((a, d) => a + d.effect, 0) / midThird.length;
    const highAvg =
      highThird.reduce((a, d) => a + d.effect, 0) / highThird.length;

    // Check for monotonic relationship
    const isIncreasing = lowAvg < midAvg && midAvg < highAvg;
    const isDecreasing = lowAvg > midAvg && midAvg > highAvg;

    return {
      confirmed: isIncreasing || isDecreasing,
      direction: isIncreasing ? 'positive' : 'negative',
    };
  }

  /**
   * Analyzes natural experiments
   */
  private analyzeNaturalExperiments(
    dataPoints: Array<{ cause: number; effect: number; date: string }>,
    causeName: string
  ): NaturalExperiment[] {
    const experiments: NaturalExperiment[] = [];

    // Look for significant changes in cause value
    const causeStdDev = this.calculateStdDev(dataPoints.map((d) => d.cause));

    for (let i = 1; i < dataPoints.length; i++) {
      const currPoint = dataPoints[i];
      const prevPoint = dataPoints[i - 1];
      if (!currPoint || !prevPoint) continue;

      const causeDelta = currPoint.cause - prevPoint.cause;

      // Significant change = more than 1 std dev
      if (Math.abs(causeDelta) > causeStdDev) {
        const effectDelta = currPoint.effect - prevPoint.effect;

        // Did effect change in expected direction?
        const supportsCausality =
          (causeDelta > 0 && effectDelta !== 0) ||
          (causeDelta < 0 && effectDelta !== 0);

        experiments.push({
          date: currPoint.date,
          causeChange: `${causeName} ${causeDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(causeDelta).toFixed(1)}`,
          effectChange: `Score ${effectDelta > 0 ? 'worsened' : 'improved'} by ${Math.abs(effectDelta).toFixed(1)}`,
          supportsCausality,
        });

        // Limit to 5 experiments
        if (experiments.length >= 5) break;
      }
    }

    return experiments;
  }

  /**
   * Calculates Pearson correlation
   */
  private calculateCorrelation(
    dataPoints: Array<{ cause: number; effect: number }>
  ): number {
    const n = dataPoints.length;
    if (n < 2) return 0;

    const causes = dataPoints.map((d) => d.cause);
    const effects = dataPoints.map((d) => d.effect);

    const meanCause = causes.reduce((a, b) => a + b, 0) / n;
    const meanEffect = effects.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let sumCauseSq = 0;
    let sumEffectSq = 0;

    for (let i = 0; i < n; i++) {
      const causeVal = causes[i] ?? 0;
      const effectVal = effects[i] ?? 0;
      const causeDiff = causeVal - meanCause;
      const effectDiff = effectVal - meanEffect;
      numerator += causeDiff * effectDiff;
      sumCauseSq += causeDiff * causeDiff;
      sumEffectSq += effectDiff * effectDiff;
    }

    const denominator = Math.sqrt(sumCauseSq * sumEffectSq);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Calculates standard deviation
   */
  private calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    const variance =
      squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculates confidence in causal relationship
   */
  private calculateCausalConfidence(
    correlation: number,
    testsPassed: number,
    sampleSize: number
  ): number {
    let confidence = 0.3; // Base

    // Correlation strength
    confidence += Math.min(0.3, Math.abs(correlation) * 0.4);

    // Tests passed
    confidence += testsPassed * 0.1;

    // Sample size bonus
    if (sampleSize >= 30) confidence += 0.1;
    if (sampleSize >= 50) confidence += 0.05;

    return Math.min(0.95, confidence);
  }

  /**
   * Determines relationship type
   */
  private determineRelationshipType(
    _hypothesis: CausalHypothesis,
    doseResponse: { confirmed: boolean; direction: 'positive' | 'negative' }
  ): CausalRelationshipType {
    // Simple heuristic - could be made more sophisticated
    if (doseResponse.confirmed) {
      return 'direct';
    }
    return 'mediated';
  }

  /**
   * Calculates intervention potential
   */
  private calculateInterventionPotential(cause: string): number {
    // How much can this cause be influenced?
    const potentials: Record<string, number> = {
      practice_frequency: 0.9, // Very controllable
      putting: 0.7, // Can practice
      greens_in_regulation: 0.6, // Can work on approach
      front_nine_performance: 0.4, // Somewhat indirect
    };

    return potentials[cause] ?? 0.5;
  }

  /**
   * Saves relationships to database — IDEMPOTENT, non-destructive.
   *
   * The table has NO natural-key unique constraint and `id` was minted fresh
   * with `crypto.randomUUID()` on every run, so the prior `upsert(onConflict:'id')`
   * never collided and every per-round review APPENDED a duplicate copy (one
   * gir→scoring relationship existed 1,831×). We fix this WITHOUT a migration,
   * WITHOUT a unique constraint, and WITHOUT any delete-then-insert (the GolfHelm
   * hard rule: no destructive writes in a save path):
   *
   *   For each relationship, look up an existing row by NATURAL KEY
   *   (player_id, cause, effect, relationship_type). If one exists, UPDATE it in
   *   place (refreshing the engine output) and KEEP its existing id; otherwise
   *   INSERT with the freshly-minted id. Re-runs converge on one row per logical
   *   relationship instead of growing unboundedly.
   *
   * The natural key MUST stay consistent with the read action's JS dedupe key
   * (`player_id|cause|effect|relationship_type` — see
   * `src/app/golf/actions/causal-relationships.ts`).
   *
   * STALE-DATA RULE (same class as the golf_patterns_v2 / golf_coach_insights
   * fixes): every fire re-tests the full hypothesis set over the player's last
   * 100 rounds, so a relationship that STOPS passing is simply absent from
   * `relationships`. Without retiring it, its prior row lingered as is_active
   * forever and the read surfaced stale strength/confidence. After the upserts
   * we soft-supersede this player's active rows that did NOT fire this run
   * (is_active=false, NEVER delete — the GolfHelm no-destructive-write-in-a-
   * save-path rule). This is the ONLY caller and it runs only after the
   * rounds>=10 gate in discoverCausalRelationships, so reaching here means the
   * analysis genuinely executed: an empty `relationships` is a real "no
   * significant relationship" signal and SHOULD retire every active row.
   */
  private async saveRelationships(
    relationships: CausalRelationship[]
  ): Promise<void> {
    const supabase = createAdminClient();

    // Type assertion for new table not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from('golf_causal_relationships' as any) as any;

    const nowIso = new Date().toISOString();
    // Ids that fired this run — the survivors the supersede pass must NOT touch.
    const keptIds: string[] = [];

    for (const rel of relationships) {
      // The mutable engine-output payload, shared by both the update and the
      // insert paths. `id`, `player_id`, and the natural-key columns are NOT in
      // here because they identify the row (set only on insert / matched on update).
      // `is_active: true` reactivates a row that a prior run had superseded but
      // that is firing again this run.
      const payload = {
        relationship_type: rel.relationshipType,
        strength: rel.strength,
        confidence: rel.confidence,
        mechanism: rel.mechanism,
        confounders: rel.confounders,
        dose_response: rel.doseResponse,
        intervention_potential: rel.interventionPotential,
        evidence: rel.evidence,
        validation_count: rel.validationCount,
        is_active: true,
        updated_at: nowIso,
      };

      // Look up an existing row by NATURAL KEY (player_id, cause, effect,
      // relationship_type). `relationship_type` is part of the key so a
      // direct→mediated reclassification of the same cause/effect remains its
      // own logical row rather than overwriting the other.
      const { data: existing, error: lookupError } = await table
        .select('id')
        .eq('player_id', rel.playerId)
        .eq('cause', rel.cause)
        .eq('effect', rel.effect)
        .eq('relationship_type', rel.relationshipType)
        .limit(1)
        .maybeSingle();

      if (lookupError) {
        throw new Error(
          `Failed to look up CoachHelm causal relationship: ${lookupError.message}`
        );
      }

      if (existing?.id) {
        // UPDATE in place — refresh the engine output, keep the existing id.
        keptIds.push(existing.id);
        const { error: updateError } = await table
          .update(payload)
          .eq('id', existing.id);

        if (updateError) {
          throw new Error(
            `Failed to update CoachHelm causal relationship: ${updateError.message}`
          );
        }
      } else {
        // INSERT a new row with the freshly-minted id + identity columns.
        keptIds.push(rel.id);
        const { error: insertError } = await table.insert({
          id: rel.id,
          player_id: rel.playerId,
          team_id: rel.teamId,
          cause: rel.cause,
          cause_metric: rel.causeMetric,
          effect: rel.effect,
          effect_metric: rel.effectMetric,
          ...payload,
        });

        if (insertError) {
          throw new Error(
            `Failed to save CoachHelm causal relationship: ${insertError.message}`
          );
        }
      }
    }

    // Soft-supersede: retire this player's active rows that did NOT fire this
    // run. Scoped to this.playerId, non-destructive (no delete), idempotent.
    // Runs even when `relationships` is empty (retire all) — a legitimate
    // "no significant relationship anymore" outcome. Non-fatal: the core
    // upserts already succeeded, so a cleanup failure must not abort the
    // player's wider analysis batch (this runs inside the orchestrator's
    // Promise.all); log and move on, the next fire converges.
    let supersede = table
      .update({ is_active: false, updated_at: nowIso })
      .eq('player_id', this.playerId)
      .eq('is_active', true);
    if (keptIds.length > 0) {
      const idList = `(${keptIds.map((id) => `"${id}"`).join(',')})`;
      supersede = supersede.not('id', 'in', idList);
    }
    const { error: supersedeError } = await supersede;
    if (supersedeError) {
      await logServerError('causal-engine.saveRelationships supersede stale', {
        action: 'causal-engine.saveRelationships',
        featureArea: 'coachhelm.mining',
        metadata: { dbError: supersedeError as unknown, playerId: this.playerId },
      });
    }
  }
}

/**
 * Hypothesis to test
 */
interface CausalHypothesis {
  cause: string;
  causeMetric: string;
  effect: string;
  effectMetric: string;
  getCauseValue: (r: RoundData) => number | null;
  getEffectValue: (r: RoundData) => number | null;
  mechanism: string;
}
