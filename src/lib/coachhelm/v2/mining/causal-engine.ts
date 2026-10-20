/**
 * "Moves with" relationship engine (historically the Causal Discovery Engine;
 * the class, table and file keep that name so callers and history stay put).
 *
 * Owner decision "honest correlation" (2026-09-28, CoachHelm deep audit rows
 * 33/34): this engine finds CORRELATIONS inside one player's own rounds. It
 * does not establish causation and nothing it writes may say so.
 *
 * A relationship is stored only when it passes `correlation-gate.ts`:
 * >= 15 paired rounds, a two-sided t-test on Pearson r, Benjamini-Hochberg
 * FDR across this player's hypotheses in the run (q < 0.05), and |r| >= 0.3.
 * The SIGNED r, n, p and q are stored in `evidence`; `strength` is |r|;
 * `confidence` is 1 - q; `relationship_type` is 'bidirectional' (the only
 * value the table's CHECK allows that claims no direction).
 *
 * Dose-response, a centred lag-1 cross-correlation and round-to-round
 * "natural experiments" are still recorded as DESCRIPTIVE evidence. They are
 * not part of the gate: the lag test was previously a mean of raw un-centred
 * products (it passed for any positive-valued metrics) and the natural
 * experiment counted any change at all, so both passed on 100% of rows.
 *
 * Hypotheses whose cause is an arithmetic component of the score and whose
 * effect is the score were dropped: they restate the scorecard.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import {
  CORRELATION_METHOD_VERSION,
  MIN_PAIRED_ROUNDS,
  benjaminiHochberg,
  correlationPValue,
  lagOneCrossCorrelation,
  passesCorrelationGate,
  pearson,
} from '@/lib/coachhelm/v3/causality/correlation-gate';
import type {
  CausalRelationship,
  CausalEvidence,
  NaturalExperiment,
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
  /**
   * @param options.persist Whether to write the result to
   *   `golf_causal_relationships` (default `true`, so the post-round trigger,
   *   crons and explicit analyze actions keep persisting). READ-ONLY callers
   *   (the player CoachHelm page load, via analyzePlayer's `persistPatterns:
   *   false`) pass `false`: a page read must not write, and a failed write
   *   here throws, which rejected analyzePlayer and failed the whole page
   *   (Bridge ca4409c2 / ed64f3b6, 2026-09-28: "Failed to update CoachHelm
   *   causal relationship: TypeError: fetch failed").
   */
  async discoverCausalRelationships(
    options: { persist?: boolean } = {}
  ): Promise<CausalRelationship[]> {
    const { persist = true } = options;
    const supabase = createAdminClient();

    // Load rounds
    const { data: rounds, error } = await supabase
      .from('golf_rounds')
      .select('id, score_to_par, round_date, total_putts, total_fairways_hit, total_gir')
      .eq('player_id', this.playerId)
      .eq('is_test', false)
      .eq('status', 'completed')
      // DESCENDING + limit(100) = the player's most RECENT 100 rounds.
      //
      // This was `ascending: true`, which took the OLDEST 100: the moment a
      // player crossed 100 completed rounds their causal analysis froze on
      // their earliest data and never moved again, while the engine kept
      // running and kept writing rows — stale, not obviously broken.
      .order('round_date', { ascending: false })
      .limit(100);

    if (error || !rounds) {
      await logServerError(
        `causal-engine.discoverCausalRelationships: rounds query failed: ${describeError(error)}`,
        { action: 'coachhelm.causalEngine.discoverCausalRelationships', metadata: { playerId: this.playerId } },
      );
      // Fails closed and touches nothing: a failed read is not evidence that
      // a stored relationship stopped holding.
      return [];
    }

    if (rounds.length < MIN_PAIRED_ROUNDS) {
      // A genuine "not enough rounds" answer. Rows written under the old
      // 10-round gate no longer pass, so a writer retires them (the supersede
      // pass with nothing kept) instead of leaving them live.
      if (persist) {
        await this.saveRelationships([]);
      }
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

    // Measure every hypothesis first: the FDR correction needs the whole
    // family of p-values before any single one can be judged.
    const measured = this.generateHypotheses()
      .map((h) => this.measureHypothesis(h))
      .filter((m): m is MeasuredHypothesis => m !== null);
    const qValues = benjaminiHochberg(measured.map((m) => m.pValue));

    const relationships: CausalRelationship[] = [];
    measured.forEach((m, i) => {
      const q = qValues[i] ?? 1;
      if (!passesCorrelationGate({ r: m.correlation, n: m.dataPoints.length, q })) return;
      relationships.push(this.buildRelationship(m, q, measured.length));
    });

    // Save to database (writers only; see `options.persist`).
    if (persist) {
      await this.saveRelationships(relationships);
    }

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
   * The hypotheses tested each run. Each is a pair of per-round values whose
   * correlation is worth showing a coach. Pairs where the cause is an
   * arithmetic component of the score and the effect is the score (putts,
   * GIR or fairways -> score_to_par) were removed on 2026-09-28: they are the
   * scorecard, and they made up 56 of 96 live rows. Mechanism strings are a
   * hedged reading of the research doc, never a causal assertion.
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
        mechanism:
          'Playing more often may keep rhythm and feel sharper, so scores can tend to track how often rounds are played',
      },
      // docs/v3-research-golf-domain.md:146, "Drive -> Approach Distance/Lie
      // -> GIR ... fairway -> ~65% GIR from 150; rough -> ~45%; sand -> ~25%".
      {
        cause: 'driving_accuracy',
        causeMetric: 'total_fairways_hit',
        effect: 'greens_in_regulation',
        effectMetric: 'total_gir',
        getCauseValue: (r: RoundData) => r.total_fairways_hit ?? null,
        getEffectValue: (r: RoundData) => r.total_gir ?? null,
        mechanism:
          'Approaches from the fairway tend to hold more greens (~65% GIR at 150 yards against ~45% from rough and ~25% from sand), which may be why these two often move together (research: Drive -> Approach Lie -> GIR)',
      },
      // docs/v3-research-golf-domain.md:29: "putts-per-round is *lower* for
      // bad iron players (they chip close and 1-putt for bogey)". Where this
      // pair moves together, a putt count can reflect greens hit rather than
      // putting.
      {
        cause: 'greens_in_regulation',
        causeMetric: 'total_gir',
        effect: 'putting_volume',
        effectMetric: 'total_putts',
        getCauseValue: (r: RoundData) => r.total_gir ?? null,
        getEffectValue: (r: RoundData) => r.total_putts ?? null,
        mechanism:
          'Putt counts can be confounded by greens hit: a player who misses greens often chips close and 1-putts, so a putt count may track greens hit rather than putting (research: traditional-stat interaction effects)',
      },
    ];
  }

  /**
   * Pairs up one hypothesis's values and computes its signed Pearson r and
   * t-test p-value. Null below MIN_PAIRED_ROUNDS pairs (not tested at all, so
   * it does not enter the FDR family either).
   */
  private measureHypothesis(hypothesis: CausalHypothesis): MeasuredHypothesis | null {
    const dataPoints = this.rounds
      .map((r) => ({
        cause: hypothesis.getCauseValue(r),
        effect: hypothesis.getEffectValue(r),
        date: r.round_date,
      }))
      .filter((d) => d.cause !== null && d.effect !== null) as DataPoint[];

    if (dataPoints.length < MIN_PAIRED_ROUNDS) {
      return null;
    }

    const correlation = pearson(
      dataPoints.map((d) => d.cause),
      dataPoints.map((d) => d.effect),
    );
    return {
      hypothesis,
      dataPoints,
      correlation,
      pValue: correlationPValue(correlation, dataPoints.length),
    };
  }

  /** A hypothesis that passed the gate, as the stored relationship. */
  private buildRelationship(
    m: MeasuredHypothesis,
    qValue: number,
    hypothesesTested: number,
  ): CausalRelationship {
    const { hypothesis, dataPoints, correlation, pValue } = m;
    const sign = Math.sign(correlation) || 1;

    const lag = lagOneCrossCorrelation(
      dataPoints.map((d) => d.cause),
      dataPoints.map((d) => d.effect),
      sign,
    );
    const doseResponse = this.checkDoseResponse(dataPoints);
    const naturalExperiments = this.analyzeNaturalExperiments(dataPoints, hypothesis, sign);

    const evidence: CausalEvidence = {
      method: CORRELATION_METHOD_VERSION,
      correlation,
      sampleN: dataPoints.length,
      pValue,
      qValue,
      hypothesesTested,
      temporalPrecedence: lag.supports,
      lagCorrelation: lag.r,
      doseResponseConfirmed: doseResponse.confirmed,
      confoundersControlled: [],
      naturalExperiments,
    };

    return {
      id: crypto.randomUUID(),
      playerId: this.playerId,
      teamId: this.teamId,
      cause: hypothesis.cause,
      causeMetric: hypothesis.causeMetric,
      effect: hypothesis.effect,
      effectMetric: hypothesis.effectMetric,
      // A correlation claims no direction, and 'bidirectional' is the only
      // value the table's CHECK constraint allows that says so. It also moves
      // the natural key off the old 'direct'/'mediated' rows, so the
      // supersede pass retires every pre-gate row on the next run.
      relationshipType: 'bidirectional',
      strength: Math.abs(correlation),
      // How unlikely the pattern is to be chance after the FDR correction.
      // Not a causal probability, and the panel does not call it one.
      confidence: Math.min(0.99, 1 - qValue),
      mechanism: hypothesis.mechanism,
      confounders: [],
      doseResponse: doseResponse.confirmed,
      interventionPotential: this.calculateInterventionPotential(hypothesis.cause),
      evidence,
      validationCount: 1,
    };
  }

  /**
   * Checks for dose-response relationship
   */
  private checkDoseResponse(
    dataPoints: DataPoint[]
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
   * Round-to-round "natural experiments": consecutive rounds where the cause
   * jumped by more than one SD. One supports the pattern only when the effect
   * moved in the direction the correlation predicts AND by more than one SD of
   * the effect (beyond ordinary round-to-round noise). Descriptive only.
   */
  private analyzeNaturalExperiments(
    dataPoints: DataPoint[],
    hypothesis: CausalHypothesis,
    correlationSign: number,
  ): NaturalExperiment[] {
    const experiments: NaturalExperiment[] = [];
    const causeStdDev = this.calculateStdDev(dataPoints.map((d) => d.cause));
    const effectStdDev = this.calculateStdDev(dataPoints.map((d) => d.effect));

    for (let i = 1; i < dataPoints.length; i++) {
      const currPoint = dataPoints[i];
      const prevPoint = dataPoints[i - 1];
      if (!currPoint || !prevPoint) continue;

      const causeDelta = currPoint.cause - prevPoint.cause;
      if (Math.abs(causeDelta) <= causeStdDev) continue;

      const effectDelta = currPoint.effect - prevPoint.effect;
      const predictedSign = Math.sign(causeDelta) * correlationSign;
      const supportsCausality =
        Math.sign(effectDelta) === predictedSign && Math.abs(effectDelta) > effectStdDev;

      experiments.push({
        date: currPoint.date,
        causeChange: `${hypothesis.causeMetric} ${causeDelta > 0 ? 'rose' : 'fell'} by ${Math.abs(causeDelta).toFixed(1)}`,
        effectChange: `${hypothesis.effectMetric} ${effectDelta > 0 ? 'rose' : effectDelta < 0 ? 'fell' : 'did not move'}${effectDelta !== 0 ? ` by ${Math.abs(effectDelta).toFixed(1)}` : ''}`,
        supportsCausality,
      });

      if (experiments.length >= 5) break;
    }

    return experiments;
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
   * save-path rule). discoverCausalRelationships calls this only after a
   * successful rounds read (never on a query error), either with the
   * relationships that passed the gate or with [] when the player has fewer
   * than MIN_PAIRED_ROUNDS rounds: an empty `relationships` is a real "no
   * relationship passes the gate" signal and SHOULD retire every active row,
   * including rows written under an older, looser gate.
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

interface DataPoint {
  cause: number;
  effect: number;
  date: string;
}

interface MeasuredHypothesis {
  hypothesis: CausalHypothesis;
  dataPoints: DataPoint[];
  /** Signed same-round Pearson r. */
  correlation: number;
  pValue: number;
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
