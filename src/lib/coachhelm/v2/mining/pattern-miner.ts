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
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { describeError, describeWriteFailure } from '@/lib/utils/describe-error';
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

/**
 * Compose a natural-reading clause from 1+ condition labels (bug #915 — the
 * template concatenation grammar). Every condition label is authored as a
 * standalone clause fragment that already carries its own leading connector
 * ("After 5+ days off", "In tournament", "Back-to-back rounds") — the OLD
 * template prefixed the WHOLE join with "When " and joined multiple labels
 * with " and ", which double-conjuncted:
 *   "When After 5+ days off and In tournament, you tend to score…"
 * This composer never adds a redundant leading "When", and recasts a
 * trailing "In <round type>" label ("In tournament" / "In qualifier") as
 * "in <round type> rounds" so it reads as a continuation of the first clause
 * instead of a second "When"-less fragment bolted on with "and":
 *   "After 5+ days off in tournament rounds, you tend to score…"
 * Any other trailing label falls back to a plain lowercase-led "and" join.
 * A single condition is returned verbatim (no "When" needed either way).
 */
export function joinConditionLabels(conditions: PatternCondition[]): string {
  const labels = conditions
    .map((c) => c.label || `${c.field} ${c.operator} ${String(c.value)}`)
    .filter((label) => label.length > 0);
  if (labels.length === 0) return 'Under these conditions';
  const [first, ...rest] = labels as [string, ...string[]];
  if (rest.length === 0) return first;
  const recast = rest.map((label) => {
    const roundType = /^In (.+)$/.exec(label);
    if (roundType) return `in ${roundType[1]!.toLowerCase()} rounds`;
    return `and ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  });
  return [first, ...recast].join(' ');
}

const THRESHOLDS = {
  minSupport: 0.05,      // 5% of rounds — loosened from 0.08 so 11-round players aren't starved
  minConfidence: 0.55,   // 55% confidence — kept as-is to avoid false positives
  minLift: 1.5,          // 1.5x lift — meaningful above random
  minSampleSize: 6,      // 6 rounds default — only applied at full strength when roundCount >= 16
  minStrokeImpact: 0.3,  // 0.3 strokes — meaningful impact
};

/**
 * Default round-load window (days). Matches the v3 shot-level generators (was
 * unbounded). A coach can override it per-team via
 * `golf_coach_philosophy.pattern_lookback_days`, which reaches the miner as
 * `PatternMinerOptions.lookbackDays`; this stays the value when nobody has.
 *
 * SCOPED TO THIS MINER. The other windows in the v2 mining layer (approach 60d,
 * course-management 365d/90d, tee-strategy 90d) are calibrated independently
 * per insight type and are deliberately NOT driven by the same setting.
 */
export const WINDOW_DAYS = 90;

/**
 * Absolute floor for the early-return guard when a player has too few rounds
 * to mine anything meaningful. We drop this below `THRESHOLDS.minSampleSize`
 * so 8–10 round players aren't rejected at the door — the per-condition
 * sample-size gate (computed by `effectiveMinSampleSize`) is what actually
 * controls whether each individual pattern is admissible.
 */
export const ABSOLUTE_MIN_ROUNDS = 4;

/**
 * Scale `minSampleSize` to the player's round count.
 *
 * Rationale: a fixed `minSampleSize=6` over 11 rounds means a pattern needs to
 * appear in >50% of all available rounds, which (combined with `minSupport`)
 * starves output for any player who hasn't golfed dozens of rounds.
 *
 * ⚠️ THIS DOCBLOCK USED TO DESCRIBE A DIFFERENT SCHEME THAN THE CODE BELOW IT, and
 * every one of its worked examples was wrong. It claimed "for roundCount >= 16, use
 * the full 6-round bar" and "below 16, max(3, ceil(roundCount * 0.25))", with
 * examples 14→4, 15→4, 16→6, 28→6. The implementation returns 3, 3, 3 and 4 for
 * those inputs. The inline comment inside the function is the accurate one — it
 * documents the deliberate move to 15%-throughout scaling and says so explicitly
 * ("was a flat 6-round cap above 16"). Corrected 2026-07-30 from values read by
 * EXECUTING the function, not from either comment.
 *
 * Two contradictory docblocks stacked here is what parked four specs in
 * `pattern-miner.test.ts` (see the TODO(plan-03) notes there). Those specs encoded
 * the stale scheme above, so un-skipping them as written would have failed.
 *
 * ACTUAL BEHAVIOUR, verified by execution across 0..60 and 100 —
 * the transition points are:
 *   roundCount  0..5  → 2   (below the mining floor entirely)
 *   roundCount  6..23 → 3
 *   roundCount 24..29 → 4
 *   roundCount 30..36 → 5
 *   roundCount 37+    → 6   (full bar, capped at THRESHOLDS.minSampleSize)
 *
 * So the full 6-round bar is reached organically around 37 rounds, NOT at 16.
 * Whether that is the canonical scheme remains Plan 03's call; this docblock only
 * stops the file contradicting itself.
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

/** Below this observation count, a "perfect" confidence is treated as unproven. */
export const MIN_OBS_FOR_FULL_CONFIDENCE = 8;

/**
 * Shrink confidence toward 0.5 (max-entropy) for small samples so a rule that
 * happens to be 3-for-3 isn't reported as 100% confident. Linear shrinkage in
 * sampleSize up to MIN_OBS_FOR_FULL_CONFIDENCE; identity at/above.
 *   cappedConfidence(1, 4) = 0.5 + 0.5*(4/8) = 0.75 ; cappedConfidence(1, 8) = 1
 */
export function cappedConfidence(confidence: number, sampleSize: number): number {
  if (!Number.isFinite(confidence)) return 0.5;
  if (sampleSize >= MIN_OBS_FOR_FULL_CONFIDENCE) return confidence;
  const w = Math.max(0, sampleSize) / MIN_OBS_FOR_FULL_CONFIDENCE;
  return 0.5 + (confidence - 0.5) * w;
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

export interface CompoundConditionSpec {
  conditions: PatternCondition[];
  test: (r: RoundData) => boolean;
}

/**
 * Compound condition specs. CONTEXT-only by construction: every condition is
 * independent of the round's own score. The former "GIR >=12 AND Putts >=34 ->
 * worse score" rule was DELETED (2026 audit) — putts and GIR are components of
 * score_to_par, so conditioning them against a score_to_par outcome is
 * tautological (it restates that putts are strokes).
 */
export const COMPOUND_CONDITION_SPECS: CompoundConditionSpec[] = [
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
];

/**
 * Pattern Mining class for discovering patterns in player data
 */
export interface PatternMinerOptions {
  /**
   * Rolling window (days) of rounds to mine. Defaults to `WINDOW_DAYS`.
   * Supplied by the caller from `golf_coach_philosophy.pattern_lookback_days`.
   */
  lookbackDays?: number;
  /**
   * Coach's "minimum rounds before CoachHelm speaks" floor
   * (`golf_coach_philosophy.min_rounds_for_signal`).
   *
   * Combined with `ABSOLUTE_MIN_ROUNDS` by `Math.max`, NOT replaced by it —
   * these two floors mean different things. `ABSOLUTE_MIN_ROUNDS` is a
   * technical bound (below 4 rounds there is nothing statistically mineable,
   * whatever the coach wants); `minRounds` is policy (a coach who wants 10
   * rounds of evidence before the engine opens its mouth). A coach can raise
   * the bar, never lower it below what the maths supports.
   */
  minRounds?: number;
}

/**
 * Resolve the two coach-configurable windows to the values the miner will
 * actually use. Extracted from the constructor so the precedence rules are
 * directly testable — they are the whole contract of the setting, and getting
 * `minRounds` backwards (replace instead of raise) would let a coach silently
 * lower the engine below what it can compute.
 */
export function resolveMinerWindows(options: PatternMinerOptions = {}): {
  lookbackDays: number;
  minRounds: number;
} {
  const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  return {
    lookbackDays: usable(options.lookbackDays)
      ? Math.max(1, options.lookbackDays)
      : WINDOW_DAYS,
    // max, not replace — see PatternMinerOptions.minRounds.
    minRounds: Math.max(ABSOLUTE_MIN_ROUNDS, usable(options.minRounds) ? options.minRounds : 0),
  };
}

export class PatternMiner {
  private playerId: string;
  private rounds: RoundData[] = [];
  private lookbackDays: number;
  private minRounds: number;

  constructor(playerId: string, options: PatternMinerOptions = {}) {
    this.playerId = playerId;
    const windows = resolveMinerWindows(options);
    this.lookbackDays = windows.lookbackDays;
    this.minRounds = windows.minRounds;
  }

  /**
   * Main entry point - mines all pattern types for a player
   */
  async minePatterns(): Promise<MinedPattern[]> {
    const supabase = createAdminClient();

    // Load features (available for potential future use)
    await extractAllFeatures(this.playerId);

    // Load rounds with computed fields
    const since = new Date(Date.now() - this.lookbackDays * 86400_000)
      .toISOString()
      .slice(0, 10);
    const { data: rounds, error } = await supabase
      .from('golf_rounds')
      .select('id, score_to_par, round_date, round_type, total_putts, total_fairways, total_fairways_hit, total_gir, total_gir_possible')
      .eq('player_id', this.playerId)
      .eq('status', 'completed')
      .gte('round_date', since)
      .order('round_date', { ascending: false })
      .limit(100);

    if (error || !rounds || rounds.length < this.minRounds) {
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
            // Routine "tried and found nothing" telemetry — keep the admin-feed +
            // console signal, but do not page Sentry (issues 13/1B).
            skipSentry: true,
            metadata: {
              playerId: this.playerId,
              roundCount: this.rounds.length,
              thresholds: { ...THRESHOLDS, scaledMinSampleSize: scaledMinSample },
            },
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
      // NOTE (QA-D): score-COMPONENT conditions ("Heavy putting day 33+ putts",
      // "Off the tee struggles <55% fairways", "Approach struggles <55% GIR")
      // were removed here for the SAME reason the blow-up condition below was.
      // Putts, fairways-hit and GIR are all components/proxies of the same
      // round's score_to_par, so testing them against a score_to_par outcome is
      // tautological: "when you take more putts you score worse" only restates
      // that putts ARE strokes, and "when you miss greens you score worse" only
      // restates that GIR drives scoring (it produced an absurd ~+6 "impact").
      // These describe SYMPTOMS, not causes — they never answer "why did the
      // putts/greens go bad." A conditional pattern must condition on something
      // INDEPENDENT of the round's score, i.e. CONTEXT (rest/rust, round type,
      // which remain above). Where strokes are lost — and the cause behind a
      // high-putt or low-GIR day — is the job of the strokes-gained breakdown
      // and the leak maps, not this conditional surface.
      //
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
    const compoundConditions = COMPOUND_CONDITION_SPECS;

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
    // Calibrate confidence for sample size, THEN derive conviction — so a tiny
    // "3-for-3" sample can't report confidence 1.00 / conviction-at-ceiling.
    const calibratedConfidence = cappedConfidence(confidence, sampleSize);
    const rawConviction = computeConvictionSafe(calibratedConfidence, support);
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
      confidence: calibratedConfidence,
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
    const conditionText = joinConditionLabels(conditions);

    const direction = strokeImpact > 0 ? 'worse' : 'better';
    const impact = Math.abs(strokeImpact).toFixed(1);

    return `${conditionText}, you tend to score ${impact} strokes ${direction} than average.`;
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
   * Task B14 — partial-success persistence: a failed row does not prevent the
   * remaining fresh rows from being attempted. Upserts run sequentially in
   * deterministic id order so concurrent miners acquire row locks in the same
   * order. If any row fails, stale-pattern supersede is skipped: retiring old
   * rows after only part of the fresh set landed would create a false absence.
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
    const ids = patterns.map((p) => p.id).sort();
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

    const rows = [...patterns]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((p) => {
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

    let upsertFailed = false;
    for (const row of rows) {
      try {
        const { error } = await fromFn
          .call(supabase, 'golf_patterns_v2')
          .upsert(row, { onConflict: 'id' });
        if (!error) continue;
        upsertFailed = true;
        await logServerError('pattern-miner.savePatterns db error', {
          action: 'pattern-miner.savePatterns',
          featureArea: 'coachhelm.mining',
          metadata: { dbError: error as unknown },
        });
      } catch (reason) {
        upsertFailed = true;
        await logServerError('pattern-miner.savePatterns rejected', {
          action: 'pattern-miner.savePatterns',
          featureArea: 'coachhelm.mining',
          metadata: { reason: String(reason) },
        });
      }
    }

    if (upsertFailed) return;

    // 2. Soft-supersede stale patterns (the recurring "old stuff" bug). Every
    //    mine covers a rolling 90-day window; a pattern that NO LONGER
    //    reproduces in the current window is absent from this fresh batch, so
    //    its prior row would otherwise linger as is_active=true forever and keep
    //    showing on the Patterns tab. Flip those to is_active=false — scoped to
    //    THIS run's player(s), never touching coach-set lifecycle states. This
    //    is a non-destructive supersede (NO delete), safe in this sync path, and
    //    idempotent: re-mining the same window converges (deterministic ids).
    const playerIds = [...new Set(patterns.map((p) => p.playerId).filter(Boolean))].sort();
    if (ids.length > 0 && playerIds.length > 0) {
      const idList = `(${ids.map((id) => `"${id}"`).join(',')})`;
      // Multi-row UPDATE racing a concurrent mine's upserts/supersede over the
      // same players can deadlock (observed live: 40P01 during the roster-sweep
      // cron, round-submit trigger and cron batch mining the same team
      // concurrently). Postgres aborts one victim wholesale and the supersede
      // is idempotent (deterministic ids, converges on re-run), so a short
      // retry absorbs it instead of surfacing a transient as an error.
      // Widened past `{ code }` so the logging below can read the message and
      // details supabase-js actually attaches, rather than reporting a
      // Postgres error by its code alone.
      let supersedeError: { code?: string; message?: string; details?: string | null } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          // Jitter decorrelates retries from the concurrent miner we
          // deadlocked with — fixed delays would re-collide in lock-step.
          const backoff = 200 * attempt + Math.floor(Math.random() * 150);
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
        const { error } = await fromUntyped(supabase, 'golf_patterns_v2')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .in('player_id', playerIds)
          .eq('is_active', true)
          .not('id', 'in', idList)
          // Keep coach-curated patterns visible; only retire auto-detected ones
          // (NULL or non-preserved lifecycle_state).
          .or('lifecycle_state.is.null,lifecycle_state.not.in.(confirmed,addressed,resolved,dismissed)');
        supersedeError = error;
        if (!error || error.code !== '40P01') break;
      }
      if (supersedeError) {
        // Name the cause in the message. `dbError` alone meant the incident read
        // "pattern-miner.savePatterns supersede stale" with no indication of
        // whether the three retries above lost to a deadlock, an RLS denial or a
        // timeout — and `describeError` is what stops a Postgres-shaped error
        // (which is not an `Error`) from rendering as '[object Object]'.
        //
        // A deadlock here is contention, not a defect: the retry loop is the
        // designed response, the newly-mined patterns are already committed, and
        // the only casualty is that a superseded pattern stays visible until the
        // next run. That is a 'warning'. Anything else is a real failure.
        const deadlocked = supersedeError.code === '40P01';
        await logServerError(
          `pattern-miner.savePatterns supersede stale: ${describeError(supersedeError)}`,
          {
            action: 'pattern-miner.savePatterns',
            featureArea: 'coachhelm.mining',
            extra: describeWriteFailure(supersedeError, {
              playerCount: playerIds.length,
              retries: 3,
              deadlocked,
            }),
          },
          deadlocked ? 'warning' : 'error',
        );
      }
    }
  }
}
