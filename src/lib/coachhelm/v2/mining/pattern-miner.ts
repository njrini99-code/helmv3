/**
 * Pattern Mining Engine
 *
 * Discovers non-obvious patterns from player data including:
 * - Conditional patterns (single condition → outcome)
 * - Compound patterns (multiple conditions → outcome)
 * - Anomaly patterns (unusual situations)
 * - Regression patterns (predictive correlations)
 */

import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import type {
  MinedPattern,
  PatternCondition,
  PatternOutcome,
  PatternType,
} from '../types';
import { extractAllFeatures } from '../features';

/**
 * Build a stable signature for a pattern from its inputs. The signature is
 * deterministic across runs for the same player + same conditions + same
 * outcome metric, so re-running the miner produces the same ID and upserts
 * (rather than inserts duplicates).
 */
function buildPatternSignature(
  patternType: PatternType,
  conditions: PatternCondition[],
  outcome: PatternOutcome,
): string {
  const conditionPart = [...conditions]
    .map((c) => `${c.field}:${c.operator}:${JSON.stringify(c.value)}`)
    .sort()
    .join('|');
  return `${patternType}::${conditionPart}::${outcome.metric}:${outcome.direction}`;
}

/**
 * Convert a SHA-256 hash of `(player_id, signature)` into a UUID-formatted
 * string so the existing `id uuid` column can store it. This lets
 * `.upsert(..., { onConflict: 'id' })` collapse duplicates from repeated runs
 * of the miner instead of inserting fresh rows each time.
 *
 * Format: 8-4-4-4-12 hex digits drawn from the first 16 bytes of the hash.
 * We set the version (4) and variant (10xx) bits per RFC 4122 so the value
 * is a syntactically valid UUID.
 */
function deterministicPatternId(playerId: string, signature: string): string {
  const hash = createHash('sha256').update(`${playerId}::${signature}`).digest();
  // Take first 16 bytes for a UUID-shaped value.
  const bytes = Buffer.from(hash.subarray(0, 16));
  // Set version to 5 (name-based, SHA-1) — close enough semantically; the
  // important thing is RFC 4122 conformance for Postgres uuid validation.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  // Set variant to RFC 4122 (10xx).
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const THRESHOLDS = {
  minSupport: 0.05,      // 5% of rounds — loosened from 0.08 so 11-round players aren't starved
  minConfidence: 0.55,   // 55% confidence — kept as-is to avoid false positives
  minLift: 1.5,          // 1.5x lift — meaningful above random
  minSampleSize: 6,      // 6 rounds default — only applied at full strength when roundCount >= 16
  minStrokeImpact: 0.3,  // 0.3 strokes — meaningful impact
};

/**
 * Absolute floor for the early-return guard when a player has too few rounds
 * to mine anything meaningful. We drop this below `THRESHOLDS.minSampleSize`
 * so 8–10 round players aren't rejected at the door — the per-condition
 * sample-size gate (computed by `effectiveMinSampleSize`) is what actually
 * controls whether each individual pattern is admissible.
 */
const ABSOLUTE_MIN_ROUNDS = 4;

/**
 * Scale `minSampleSize` to the player's round count.
 *
 * Rationale: a fixed `minSampleSize=6` over 11 rounds means a pattern needs
 * to appear in >50% of all available rounds, which (combined with
 * `minSupport`) starves output for any player who hasn't golfed dozens of
 * rounds. Instead:
 *   - For roundCount >= 16, use the full 6-round bar (well-calibrated).
 *   - Below 16 rounds, scale down: max(3, ceil(roundCount * 0.25)).
 *
 * Caps at THRESHOLDS.minSampleSize so we never exceed the configured ceiling.
 *
 * Examples:
 *   roundCount = 6  → 3
 *   roundCount = 8  → 3
 *   roundCount = 11 → 3
 *   roundCount = 12 → 3
 *   roundCount = 14 → 4
 *   roundCount = 15 → 4
 *   roundCount = 16 → 6 (full bar)
 *   roundCount = 28 → 6 (full bar)
 */
export function effectiveMinSampleSize(roundCount: number): number {
  // Scale at 15% of round count throughout (was a flat 6-round cap above 16).
  // Why this changed: a 28-round player with narrow round-type partitions
  // (e.g. 4 tournaments out of 28 rounds = 14% support) was blocked by the
  // flat floor — every per-condition matching set fell below 6 even though
  // the conditions were statistically meaningful. Rationale per the
  // parallel-debugging investigation that surfaced 18 starvation events
  // across 5 distinct players in 24h while ShotPatternMiner kept producing
  // contextual rows for the same players.
  //   roundCount = 11 → 3   (was 3)
  //   roundCount = 16 → 3   (was 6)
  //   roundCount = 20 → 3   (was 6)
  //   roundCount = 28 → 4   (was 6) ← unblocks tournament/qualifier conditions
  //   roundCount = 40 → 6   (was 6, full bar reached organically)
  //   roundCount = 60 → 6   (capped at THRESHOLDS.minSampleSize)
  // Other gates (minConfidence=0.55, minLift=1.5, minStrokeImpact=0.3) keep
  // false-positive risk bounded.
  if (roundCount < 6) return 2;
  return Math.min(
    THRESHOLDS.minSampleSize,
    Math.max(3, Math.round(roundCount * 0.15)),
  );
}

/**
 * Safely compute conviction = (1 - support) * confidence / (1 - confidence).
 *
 * LIVE-16 root cause: the raw formula divides by zero when confidence == 1,
 * and produces NaN when either input is NaN/non-finite. Those NaNs then
 * flowed into the NLG layer and were only masked downstream by
 * `sanitizeText`. This helper returns:
 *   - a finite number for confidence < 1
 *   - Infinity for the "pure rule" case (confidence == 1, support < 1)
 *   - null when the rule is trivial (confidence == support == 1) or any
 *     input is non-finite — callers substitute a sentinel (e.g. 10) when
 *     persisting.
 */
export function computeConvictionSafe(
  confidence: number,
  support: number,
): number | null {
  if (!Number.isFinite(confidence) || !Number.isFinite(support)) return null;
  if (confidence >= 1) {
    return support >= 1 ? null : Infinity;
  }
  return ((1 - support) * confidence) / (1 - confidence);
}

function normalizeRoundType(roundType?: string | null): string | null {
  if (!roundType) return roundType ?? null;
  return roundType === 'qualifying' ? 'qualifier' : roundType;
}

interface RoundData {
  id: string;
  score_to_par: number;
  round_date: string;
  round_type?: string | null;
  days_since_last?: number;
  putts?: number;
  total_fairways?: number;
  total_fairways_hit?: number;
  total_gir?: number;
  total_gir_possible?: number;
}

/**
 * Pattern Mining class for discovering patterns in player data
 */
export class PatternMiner {
  private playerId: string;
  private rounds: RoundData[] = [];

  constructor(playerId: string) {
    this.playerId = playerId;
  }

  /**
   * Main entry point - mines all pattern types for a player
   */
  async minePatterns(): Promise<MinedPattern[]> {
    const supabase = createAdminClient();

    // Load features (available for potential future use)
    await extractAllFeatures(this.playerId);

    // Load rounds with computed fields
    const { data: rounds, error } = await supabase
      .from('golf_rounds')
      .select('id, score_to_par, round_date, round_type, total_putts, total_fairways, total_fairways_hit, total_gir, total_gir_possible')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .order('round_date', { ascending: false })
      .limit(100);

    if (error || !rounds || rounds.length < ABSOLUTE_MIN_ROUNDS) {
      return [];
    }

    // Compute days_since_last for each round
    this.rounds = this.computeDaysSinceLast(rounds.map(r => ({
      id: r.id,
      score_to_par: r.score_to_par ?? 0,
      round_date: r.round_date,
      round_type: normalizeRoundType(r.round_type),
      putts: r.total_putts ?? undefined,
      total_fairways: r.total_fairways ?? undefined,
      total_fairways_hit: r.total_fairways_hit ?? undefined,
      total_gir: r.total_gir ?? undefined,
      total_gir_possible: r.total_gir_possible ?? undefined,
    })));

    // Mine different pattern types
    const [conditionalPatterns, compoundPatterns, anomalyPatterns] =
      await Promise.all([
        this.mineConditionalPatterns(),
        this.mineCompoundPatterns(),
        this.mineAnomalyPatterns(),
      ]);

    // Combine and deduplicate
    const allPatterns = [
      ...conditionalPatterns,
      ...compoundPatterns,
      ...anomalyPatterns,
    ];

    const deduplicatedPatterns = this.deduplicatePatterns(allPatterns);

    // Save patterns to database
    await this.savePatterns(deduplicatedPatterns);

    // Surface silent threshold starvation: when we have enough rounds to
    // theoretically produce patterns but the rule-based miner returns 0.
    // The `[pattern-miner.thresholds]` prefix makes this discoverable in
    // production logs and admin trace dashboards.
    //
    // Severity policy: emit at INFO when the miner had a fair shot
    // (roundCount >= the scaled per-pattern minSampleSize) — that's a
    // legitimate "tried and found nothing" signal, not a config bug. Only
    // promote to WARN when the player has a lot of rounds (>= 16) and we
    // still produced nothing, which suggests the thresholds genuinely need
    // re-tuning. This drops the noise floor (385+ events between 3 incidents
    // were per-cron-tick re-firings on the same low-round players).
    if (deduplicatedPatterns.length === 0 && this.rounds.length >= 10) {
      const scaledMinSample = effectiveMinSampleSize(this.rounds.length);
      const severity: 'info' | 'warning' =
        this.rounds.length >= 16 ? 'warning' : 'info';
      const message = `[pattern-miner.thresholds] 0 patterns produced for player ${this.playerId} despite ${this.rounds.length} rounds (minSupport=${THRESHOLDS.minSupport}, minConfidence=${THRESHOLDS.minConfidence}, scaledMinSampleSize=${scaledMinSample})`;
      if (severity === 'warning') {
        console.warn(message);
      } else {
        console.info(message);
      }
      try {
        await logServerEvent(
          message,
          {
            action: 'pattern-miner.thresholds.starvation',
            featureArea: 'coachhelm.mining',
            metadata: {
              playerId: this.playerId,
              roundCount: this.rounds.length,
              thresholds: { ...THRESHOLDS, scaledMinSampleSize: scaledMinSample },
            },
            // Routine pipeline signal — keep the admin-table audit trail and the
            // console line above, but don't open a recurring Sentry issue.
            skipSentry: true,
          },
          severity,
        );
      } catch {
        // Tracing must never break the miner — the console fallback above is enough.
      }
    }

    return deduplicatedPatterns;
  }

  /**
   * Computes days since last round for each round
   */
  private computeDaysSinceLast(rounds: RoundData[]): RoundData[] {
    const sorted = [...rounds].sort(
      (a, b) =>
        new Date(a.round_date).getTime() - new Date(b.round_date).getTime()
    );

    return sorted.map((round, index) => {
      if (index === 0) {
        return { ...round, days_since_last: 0 };
      }
      const prevRound = sorted[index - 1];
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
   * Mines conditional patterns (single condition → outcome)
   */
  private async mineConditionalPatterns(): Promise<MinedPattern[]> {
    const patterns: MinedPattern[] = [];
    const baselineAvg = this.calculateBaseline();
    const scaledMinSample = effectiveMinSampleSize(this.rounds.length);

    // Test various conditions.
    //
    // The original 4 conditions (rest/rust + round-type) were starving on
    // teams whose data lacks variation in those dimensions — e.g. Guilford
    // College Men's Golf has 11/12 tournament rounds for its top player and
    // back-to-back tournament days, so `round_type=tournament` saturates
    // (support 0.92, no lift) and `days_since_last>=7` matches almost
    // nothing. We add round-shape conditions derived from the per-round
    // counters that are already loaded — these surface "heavy putting day",
    // "fairway-poor day", "GIR-poor day", and "blow-up round" patterns that
    // any team will produce when those traits are present.
    const conditionsToTest: Array<{
      condition: PatternCondition;
      test: (r: RoundData) => boolean;
    }> = [
      // Rest/rust patterns
      {
        condition: {
          field: 'days_since_last',
          operator: 'gte',
          value: 7,
          label: 'After 7+ days off',
        },
        test: (r) => (r.days_since_last ?? 0) >= 7,
      },
      {
        condition: {
          field: 'days_since_last',
          operator: 'lte',
          value: 1,
          label: 'Back-to-back rounds',
        },
        test: (r) => (r.days_since_last ?? 0) <= 1,
      },
      // Round type patterns
      {
        condition: {
          field: 'round_type',
          operator: 'eq',
          value: 'tournament',
          label: 'In tournament',
        },
        test: (r) => r.round_type === 'tournament',
      },
      {
        condition: {
          field: 'round_type',
          operator: 'eq',
          value: 'qualifier',
          label: 'In qualifier',
        },
        test: (r) => r.round_type === 'qualifier',
      },
      // Putting-heavy days (33+ putts is a clear above-average putting load)
      {
        condition: {
          field: 'putts',
          operator: 'gte',
          value: 33,
          label: 'Heavy putting day (33+ putts)',
        },
        test: (r) => (r.putts ?? 0) >= 33,
      },
      // Low-fairway days (<55% fairways hit out of attempted)
      {
        condition: {
          field: 'fairway_pct',
          operator: 'lt',
          value: 0.55,
          label: 'Off the tee struggles (<55% fairways)',
        },
        test: (r) => {
          const att = r.total_fairways ?? 0;
          if (att <= 0) return false;
          return ((r.total_fairways_hit ?? 0) / att) < 0.55;
        },
      },
      // Low-GIR days (<55% GIR of possible)
      {
        condition: {
          field: 'gir_pct',
          operator: 'lt',
          value: 0.55,
          label: 'Approach struggles (<55% GIR)',
        },
        test: (r) => {
          const possible = r.total_gir_possible ?? 0;
          if (possible <= 0) return false;
          return ((r.total_gir ?? 0) / possible) < 0.55;
        },
      },
      // NOTE: a "Blow-up round (score_to_par >= +5)" condition was previously
      // included here, but it was tautological — its outcome is also
      // score_to_par, so the pattern read "when score is +5 or worse, score
      // is +5 or worse." That self-defining rule produced meaningless lift
      // values (1.33–1.71) and just restated the input. It was removed in
      // QA-B. If we want to surface blow-up tendencies in the future, the
      // outcome metric needs to be a NON-score field (e.g. fairway_pct,
      // putts_per_round) so the pattern actually predicts something.
    ];

    for (const { condition, test } of conditionsToTest) {
      const matchingRounds = this.rounds.filter(test);

      if (matchingRounds.length < scaledMinSample) continue;

      const matchingAvg =
        matchingRounds.reduce((a, r) => a + r.score_to_par, 0) /
        matchingRounds.length;
      const strokeImpact = matchingAvg - baselineAvg;

      // Only include if significant impact
      if (Math.abs(strokeImpact) < THRESHOLDS.minStrokeImpact) continue;

      // Calculate statistical measures
      const support = matchingRounds.length / this.rounds.length;

      // Define "bad round" as +3 or worse
      const badThreshold = 3;
      const matchingBadRounds = matchingRounds.filter(
        (r) => r.score_to_par >= badThreshold
      ).length;
      const totalBadRounds = this.rounds.filter(
        (r) => r.score_to_par >= badThreshold
      ).length;

      const confidence =
        matchingRounds.length > 0
          ? matchingBadRounds / matchingRounds.length
          : 0;
      const expectedBad = totalBadRounds / this.rounds.length;
      const lift = expectedBad > 0 ? confidence / expectedBad : 1;

      // Lift gate: the original `lift >= 1.5` requirement is mathematically
      // unreachable when the player's base rate of bad rounds (>= +3) is
      // high — e.g. when 75% of rounds are bad, no condition can produce
      // confidence > 1.0, so lift is capped at 1/0.75 ≈ 1.33. This is what
      // starved every Guilford College pattern despite real signal in the
      // stroke-impact dimension.
      //
      // Accept the pattern when EITHER:
      //   (a) classic gate: lift >= 1.5 over the bad-round base rate, OR
      //   (b) impact gate: |strokeImpact| >= 0.6 strokes — a half-shot per
      //       round is itself a strong signal, even when the player is so
      //       inconsistent overall that the bad-round base rate caps lift.
      const passesClassicGate =
        support >= THRESHOLDS.minSupport &&
        confidence >= THRESHOLDS.minConfidence &&
        lift >= THRESHOLDS.minLift;
      const passesImpactGate =
        support >= THRESHOLDS.minSupport &&
        Math.abs(strokeImpact) >= 0.6;

      if (passesClassicGate || passesImpactGate) {
        patterns.push(
          this.createPattern(
            'conditional',
            [condition],
            {
              metric: 'score_to_par',
              direction: strokeImpact > 0 ? 'increase' : 'decrease',
              magnitude: Math.abs(strokeImpact),
              comparison: 'vs_baseline',
            },
            support,
            confidence,
            lift,
            strokeImpact,
            matchingRounds.length
          )
        );
      }
    }

    return patterns;
  }

  /**
   * Mines compound patterns (multiple conditions → outcome)
   */
  private async mineCompoundPatterns(): Promise<MinedPattern[]> {
    const patterns: MinedPattern[] = [];
    const baselineAvg = this.calculateBaseline();
    const scaledMinSample = effectiveMinSampleSize(this.rounds.length);

    // Test combinations
    const compoundConditions: Array<{
      conditions: PatternCondition[];
      test: (r: RoundData) => boolean;
    }> = [
      // Rust + tournament pressure
      {
        conditions: [
          {
            field: 'days_since_last',
            operator: 'gte',
            value: 5,
            label: 'After 5+ days off',
          },
          {
            field: 'round_type',
            operator: 'eq',
            value: 'tournament',
            label: 'In tournament',
          },
        ],
        test: (r) =>
          (r.days_since_last ?? 0) >= 5 && r.round_type === 'tournament',
      },
      // High GIR but high putts (not capitalizing on greens)
      {
        conditions: [
          {
            field: 'total_gir',
            operator: 'gte',
            value: 12,
            label: 'GIR ≥12',
          },
          {
            field: 'putts',
            operator: 'gte',
            value: 34,
            label: 'Putts ≥34',
          },
        ],
        test: (r) =>
          (r.total_gir ?? 0) >= 12 && (r.putts ?? 0) >= 34,
      },
    ];

    for (const { conditions, test } of compoundConditions) {
      const matchingRounds = this.rounds.filter(test);

      // Compound patterns are rarer by construction — half the scaled
      // single-condition bar, with a floor of 3 so 8–12 round players can
      // still surface a compound hit when one exists.
      if (matchingRounds.length < Math.max(3, Math.ceil(scaledMinSample / 2)))
        continue;

      const matchingAvg =
        matchingRounds.reduce((a, r) => a + r.score_to_par, 0) /
        matchingRounds.length;
      const strokeImpact = matchingAvg - baselineAvg;

      if (Math.abs(strokeImpact) < THRESHOLDS.minStrokeImpact) continue;

      const support = matchingRounds.length / this.rounds.length;
      const badThreshold = 3;
      const matchingBadRounds = matchingRounds.filter(
        (r) => r.score_to_par >= badThreshold
      ).length;
      const totalBadRounds = this.rounds.filter(
        (r) => r.score_to_par >= badThreshold
      ).length;

      const confidence =
        matchingRounds.length > 0
          ? matchingBadRounds / matchingRounds.length
          : 0;
      const expectedBad = totalBadRounds / this.rounds.length;
      const lift = expectedBad > 0 ? confidence / expectedBad : 1;

      // Lower thresholds for compound patterns
      if (support >= 0.05 && confidence >= 0.5 && lift >= 1.3) {
        patterns.push(
          this.createPattern(
            'compound',
            conditions,
            {
              metric: 'score_to_par',
              direction: strokeImpact > 0 ? 'increase' : 'decrease',
              magnitude: Math.abs(strokeImpact),
              comparison: 'vs_baseline',
            },
            support,
            confidence,
            lift,
            strokeImpact,
            matchingRounds.length
          )
        );
      }
    }

    return patterns;
  }

  /**
   * Mines anomaly patterns (unusual situations with unusual outcomes)
   */
  private async mineAnomalyPatterns(): Promise<MinedPattern[]> {
    const patterns: MinedPattern[] = [];
    const baselineAvg = this.calculateBaseline();
    const stdDev = this.calculateStdDev();

    // Find rounds that are statistical outliers
    const outlierThreshold = 2 * stdDev;

    for (const round of this.rounds) {
      const deviation = Math.abs(round.score_to_par - baselineAvg);

      if (deviation > outlierThreshold) {
        // This is an outlier - look for what made it unusual
        const anomalyConditions: PatternCondition[] = [];

        if ((round.days_since_last ?? 0) >= 14) {
          anomalyConditions.push({
            field: 'days_since_last',
            operator: 'gte',
            value: 14,
            label: 'Extended break (14+ days)',
          });
        }

        if ((round.putts ?? 30) > 36) {
          anomalyConditions.push({
            field: 'putts',
            operator: 'gte',
            value: 36,
            label: 'High putts (36+)',
          });
        }

        if (anomalyConditions.length > 0) {
          // Find similar anomalous rounds
          const similarRounds = this.rounds.filter((r) => {
            const rDeviation = Math.abs(r.score_to_par - baselineAvg);
            return rDeviation > outlierThreshold;
          });

          if (similarRounds.length >= 3) {
            patterns.push(
              this.createPattern(
                'anomaly',
                anomalyConditions,
                {
                  metric: 'score_to_par',
                  direction: round.score_to_par > baselineAvg ? 'increase' : 'decrease',
                  magnitude: deviation,
                  comparison: 'vs_baseline',
                },
                similarRounds.length / this.rounds.length,
                1, // Anomalies are by definition 100% correlated with themselves
                1,
                round.score_to_par - baselineAvg,
                similarRounds.length
              )
            );
          }
        }
      }
    }

    return patterns;
  }

  /**
   * Calculates baseline scoring average
   */
  private calculateBaseline(): number {
    if (this.rounds.length === 0) return 0;
    return (
      this.rounds.reduce((a, r) => a + r.score_to_par, 0) / this.rounds.length
    );
  }

  /**
   * Calculates standard deviation of scores
   */
  private calculateStdDev(): number {
    if (this.rounds.length < 2) return 0;
    const mean = this.calculateBaseline();
    const squaredDiffs = this.rounds.map((r) =>
      Math.pow(r.score_to_par - mean, 2)
    );
    const variance =
      squaredDiffs.reduce((a, b) => a + b, 0) / this.rounds.length;
    return Math.sqrt(variance);
  }

  /**
   * Creates a MinedPattern object
   */
  private createPattern(
    type: PatternType,
    conditions: PatternCondition[],
    outcome: PatternOutcome,
    support: number,
    confidence: number,
    lift: number,
    strokeImpact: number,
    sampleSize: number
  ): MinedPattern {
    // Calculate conviction (NaN-safe; null sentinel substituted as 10)
    const rawConviction = computeConvictionSafe(confidence, support);
    const conviction = rawConviction === null ? 10 : rawConviction;

    // Calculate actionability
    const actionability = this.calculateActionability(conditions, strokeImpact);

    // Deterministic ID — repeated runs for the same player + same conditions
    // + same outcome metric collapse onto a single row via upsert(onConflict:
    // 'id'), so we no longer accumulate duplicate pattern rows on every
    // analyzePlayer invocation.
    const signature = buildPatternSignature(type, conditions, outcome);
    const id = deterministicPatternId(this.playerId, signature);

    return {
      id,
      playerId: this.playerId,
      patternType: type,
      conditions,
      outcome,
      support,
      confidence,
      lift,
      conviction: Math.min(conviction, 10), // Cap for readability
      strokeImpact,
      actionability,
      sampleSize,
      firstDetected: new Date().toISOString(),
      lastOccurrence: new Date().toISOString(),
      occurrenceCount: sampleSize,
      trend: 'new',
      isActive: true,
      description: this.generateDescription(conditions, outcome, strokeImpact),
      recommendation: this.generateRecommendation(conditions, outcome),
    };
  }

  /**
   * Calculates how actionable a pattern is
   */
  private calculateActionability(
    conditions: PatternCondition[],
    strokeImpact: number
  ): number {
    let actionability = 0.5;

    // Higher impact = more actionable
    actionability += Math.min(0.3, Math.abs(strokeImpact) / 10);

    // Some conditions are more controllable than others
    for (const condition of conditions) {
      if (condition.field === 'days_since_last') {
        // Rest is somewhat controllable
        actionability += 0.1;
      }
      if (condition.field === 'round_type') {
        // Can choose which events to enter
        actionability += 0.05;
      }
    }

    return Math.min(1, actionability);
  }

  /**
   * Generates human-readable description
   */
  private generateDescription(
    conditions: PatternCondition[],
    _outcome: PatternOutcome,
    strokeImpact: number
  ): string {
    const conditionText = conditions
      .map((c) => c.label || `${c.field} ${c.operator} ${c.value}`)
      .join(' and ');

    const direction = strokeImpact > 0 ? 'worse' : 'better';
    const impact = Math.abs(strokeImpact).toFixed(1);

    return `When ${conditionText}, you tend to score ${impact} strokes ${direction} than average.`;
  }

  /**
   * Generates recommendation based on pattern
   */
  private generateRecommendation(
    conditions: PatternCondition[],
     
    _outcome: PatternOutcome
  ): string {
    // Simple rule-based recommendations
    for (const condition of conditions) {
      if (condition.field === 'days_since_last' && condition.operator === 'gte') {
        if ((condition.value as number) >= 7) {
          return 'Consider a practice round before important events after extended breaks.';
        }
      }
      if (condition.field === 'putts' && condition.operator === 'gte') {
        return 'Focus on converting GIR opportunities with improved putting practice.';
      }
    }

    return 'Monitor this pattern and discuss with your coach.';
  }

  /**
   * Deduplicates patterns based on similarity
   */
  private deduplicatePatterns(patterns: MinedPattern[]): MinedPattern[] {
    const unique: MinedPattern[] = [];

    for (const pattern of patterns) {
      const isDuplicate = unique.some((existing) =>
        this.areSimilarPatterns(pattern, existing)
      );

      if (!isDuplicate) {
        unique.push(pattern);
      }
    }

    return unique;
  }

  /**
   * Checks if two patterns are similar enough to be duplicates
   */
  private areSimilarPatterns(a: MinedPattern, b: MinedPattern): boolean {
    if (a.patternType !== b.patternType) return false;
    if (a.conditions.length !== b.conditions.length) return false;

    // Check if all conditions are the same
    for (const condA of a.conditions) {
      const hasMatch = b.conditions.some(
        (condB) =>
          condA.field === condB.field &&
          condA.operator === condB.operator &&
          condA.value === condB.value
      );
      if (!hasMatch) return false;
    }

    return true;
  }

  /**
   * Map a MinedPattern to the `golf_patterns_v2` insert-row shape.
   *
   * Task B13 adds:
   *   - severity          (row column, default 'medium')
   *   - lifecycle_state   (row column, default 'detected' on first write)
   *   - source_round_ids  (text[] column, empty array when unknown)
   */
  private toRow(pattern: MinedPattern): Record<string, unknown> {
    return {
      id: pattern.id,
      player_id: pattern.playerId,
      pattern_type: pattern.patternType,
      conditions: pattern.conditions,
      outcome: pattern.outcome,
      support: pattern.support,
      confidence: pattern.confidence,
      lift: pattern.lift,
      conviction: pattern.conviction,
      stroke_impact: pattern.strokeImpact,
      actionability: pattern.actionability,
      sample_size: pattern.sampleSize,
      first_detected: pattern.firstDetected,
      last_occurrence: pattern.lastOccurrence,
      occurrence_count: pattern.occurrenceCount,
      trend: pattern.trend,
      is_active: pattern.isActive,
      severity: pattern.severity ?? 'medium',
      lifecycle_state: pattern.lifecycleState ?? 'detected',
      source_round_ids: pattern.sourceRoundIds ?? [],
      metadata: {
        description: pattern.description,
        recommendation: pattern.recommendation,
      },
    };
  }

  /**
   * Saves patterns to database.
   *
   * Task B14 — partial-success persistence: the prior loop threw on the
   * first failure and aborted the rest. Switch to \`Promise.allSettled\`
   * so the engine writes every pattern it can; failures are captured via
   * \`logServerError\` so the admin dashboard still surfaces the issue.
   *
   * 2026-05-24 Wave 8 — lifecycle_state preservation + auto-promotion.
   * Prior behavior: \`onConflict: 'id'\` overwrites — re-upserts blew away
   * coach-set lifecycle states (\`confirmed\` via validation UI,
   * \`addressed\`/\`resolved\`/\`dismissed\` via management UI) every miner
   * run. Now we:
   *   1. Fetch existing \`lifecycle_state\` for each pattern.id in a
   *      single batched read.
   *   2. If a coach has already touched the row
   *      (state ∈ {confirmed, addressed, resolved, dismissed}), preserve
   *      that state — the miner is statistical, the coach is canonical.
   *   3. Else if the pattern qualifies as corroborated
   *      (occurrence_count ≥ 5 AND first_detected > 14d ago), bump to
   *      \`confirmed\`. Mirrors the Wave 7A migration's one-time backfill
   *      so the backlog doesn't re-accumulate.
   *   4. Else fall through to the existing 'detected' default.
   */
  private async savePatterns(patterns: MinedPattern[]): Promise<void> {
    if (patterns.length === 0) return;

    const supabase = createAdminClient();

    // 1. Batch-fetch existing lifecycle_state for every id we're about to
    //    upsert, so we can preserve coach-set values.
    const ids = patterns.map((p) => p.id);
    type ExistingRow = { id: string; lifecycle_state: string | null };
    const { data: existingRows } = await (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          in: (col: string, ids: string[]) => Promise<{ data: ExistingRow[] | null }>;
        };
      };
    })
      .from('golf_patterns_v2')
      .select('id, lifecycle_state')
      .in('id', ids);

    const existingByPatternId = new Map<string, string | null>(
      (existingRows ?? []).map((r) => [r.id, r.lifecycle_state]),
    );

    // Resolve the lifecycle_state we want to write for each pattern.
    const PRESERVED_STATES = new Set(['confirmed', 'addressed', 'resolved', 'dismissed']);
    const AUTO_PROMOTE_MIN_OCCURRENCES = 5;
    const AUTO_PROMOTE_MIN_AGE_MS = 14 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - AUTO_PROMOTE_MIN_AGE_MS;

    const rows = patterns.map((p) => {
      const existing = existingByPatternId.get(p.id);
      let resolvedState: string;
      if (existing && PRESERVED_STATES.has(existing)) {
        resolvedState = existing;
      } else if (
        (p.lifecycleState ?? 'detected') === 'detected' &&
        p.occurrenceCount >= AUTO_PROMOTE_MIN_OCCURRENCES &&
        new Date(p.firstDetected).getTime() < cutoff
      ) {
        resolvedState = 'confirmed';
      } else {
        resolvedState = p.lifecycleState ?? 'detected';
      }
      return { ...this.toRow(p), lifecycle_state: resolvedState };
    });

    const fromFn = (supabase as unknown as {
      from: (t: string) => {
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string },
        ) => Promise<{ error: { message: string } | null }>;
      };
    }).from;

    const results = await Promise.allSettled(
      rows.map((row) =>
        fromFn.call(supabase, 'golf_patterns_v2').upsert(row, { onConflict: 'id' }),
      ),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        await logServerError('pattern-miner.savePatterns rejected', {
          action: 'pattern-miner.savePatterns',
          featureArea: 'coachhelm.mining',
          metadata: { reason: String(result.reason) },
        });
      } else if (result.value.error) {
        await logServerError('pattern-miner.savePatterns db error', {
          action: 'pattern-miner.savePatterns',
          featureArea: 'coachhelm.mining',
          metadata: { dbError: result.value.error as unknown },
        });
      }
    }
  }
}
