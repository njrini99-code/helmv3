/**
 * CoachHelm V2 Intelligence Orchestrator
 *
 * Main entry point that coordinates all V2 intelligence components:
 * - Feature extraction
 * - Pattern mining
 * - Causal discovery
 * - Prediction
 * - Learning
 * - Reasoning
 * - NLG
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { extractAllFeatures } from './features';
import { PatternMiner, CausalEngine, ShotPatternMiner, ShotStateIntelligence, StatsInsightGenerator, CorrelationDiscovery, analyzeLieSpecificMissPatterns } from './mining';
// W25 cutover: 6 v2 generator imports below are unused by the orchestrator
// (replaced by v3 BaseGenerator runs further down). They remain importable
// from their respective files until W26 sunset. The 3 STILL used (approach
// miss, tee strategy, worst holes) lack v3 equivalents pending a shot-source
// helper — they keep running through v2 until then.
import { generateApproachMissInsights } from './mining/approach-analytics';
import { generateTeeStrategyInsights } from './mining/tee-strategy';
import { generateWorstHolesInsights } from './mining/course-management';

// v3 BaseGenerator subclasses for the 7 generators cut over in W25.
import { PuttDistanceGenerator } from '@/lib/coachhelm/v3/generators/putt-distance';
import { PuttBiasGenerator } from '@/lib/coachhelm/v3/generators/putt-bias';
import { ScramblingGenerator } from '@/lib/coachhelm/v3/generators/scrambling';
import { ParTypeGenerator } from '@/lib/coachhelm/v3/generators/par-type';
import { CourseMgmtGenerator } from '@/lib/coachhelm/v3/generators/course-mgmt';
import { PressureGapGenerator } from '@/lib/coachhelm/v3/generators/pressure-gap';
import { WarmupHoleGenerator } from '@/lib/coachhelm/v3/generators/warmup-hole';
import { runWithGate } from './insights/gate-context';
import type { StatsInsight, MetricCorrelation, LieMissAnalysis, ShotCategoryInsight, DispersionInsight, RootCauseInsight, ShotStateAnalysis, ShotStateInsight } from './mining';
import { PerformancePredictor, TrajectoryForecaster } from './prediction';
import { BehaviorLearner, CrossLearner } from './learning';
import { ReasoningEngine, ConfidenceCalibrator } from './reasoning';
import { InsightComposer } from './nlg';
import { buildPlayerBaseline } from './stats/baselines';
import { analyzeMultiWindowTrends } from './trends/multi-window';
import { detectAnomalies } from './stats/anomaly-detector';
import { detectStreaks } from './trends/streak-detector';
import { scoreInsight, shouldShowInsight } from './feedback/insight-scorer';
import { logServerError } from '@/lib/server-error-logger';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

import type {
  AnalysisOptions,
  PlayerAnalysis,
  IntelligentRoundReview,
  ComposedInsight,
  UserInteraction,
  ExtractedFeatures,
  MinedPattern,
  CausalRelationship,
  PerformancePrediction,
  TrajectoryForecast,
  InsightContext,
  ShotPatternAnalysis,
  ShotPattern,
  ReasoningResult,
} from './types';

interface RoundReviewShotRow {
  hole_number: number;
  shot_number: number;
  shot_type: string | null;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  distance_unit_before: string | null;
  distance_unit_after: string | null;
  lie_before: string | null;
  lie_after: string | null;
  result: string | null;
  miss_direction: string | null;
}

interface RoundReviewHoleRow {
  hole_number: number;
  par: number | null;
  score: number | null;
  gir: boolean | null;
  up_and_down: boolean | null;
  fairway_hit: boolean | null;
  penalty_strokes: number | null;
}

interface RoundSpecificBracketStats {
  label: string;
  sampleSize: number;
  severeCount: number;
  severeRate: number;
  avgAfterYards: number;
}

const ROUND_REVIEW_APPROACH_BRACKETS = [
  { label: '50-100 yards', min: 50, max: 100 },
  { label: '100-150 yards', min: 100, max: 150 },
  { label: '150-200 yards', min: 150, max: 200 },
  { label: '200+ yards', min: 200, max: Number.POSITIVE_INFINITY },
];

/**
 * Default alert thresholds when `CoachPhilosophy` rows are missing.
 * Chosen to match prior hard-coded behavior at orchestrator lines 481/493/508
 * so rollouts don't accidentally shift alert volume for coaches who haven't
 * saved a philosophy yet.
 */
const DEFAULT_DECLINE_THRESHOLD = 3;
const DEFAULT_PRESSURE_GAP_THRESHOLD = 2;

/**
 * Apply the coach's personal alert thresholds to a single signal.
 *
 * LIVE-24: prior alert logic hard-coded `> 2 / > 3 / > 5` comparisons in
 * `synthesizeAlerts`, silently ignoring the persisted `CoachPhilosophy.
 * declineThreshold` / `pressureGapThreshold` (set via the coaching-intelligence
 * settings screen). Aggressive coaches got the same firehose of alerts as
 * conservative ones.
 *
 * This helper is pure + exported so it can be unit-tested without wiring
 * the full orchestrator, and call sites below substitute it for the
 * inline numeric literals.
 */
export function applyPhilosophyThresholds(
  signal: { predictedValue?: number; strokeImpact?: number },
  philosophy: { declineThreshold?: number; pressureGapThreshold?: number },
): { shouldAlert: boolean; severity: 'critical' | 'warning' | 'info' } {
  const decline = philosophy.declineThreshold ?? DEFAULT_DECLINE_THRESHOLD;
  const pressure = philosophy.pressureGapThreshold ?? DEFAULT_PRESSURE_GAP_THRESHOLD;
  const triggersDecline = (signal.predictedValue ?? 0) > decline;
  const triggersPressure = (signal.strokeImpact ?? 0) > pressure;
  const shouldAlert = triggersDecline || triggersPressure;
  const isCritical = (signal.predictedValue ?? 0) > decline + 2;
  const severity: 'critical' | 'warning' | 'info' = isCritical
    ? 'critical'
    : shouldAlert
      ? 'warning'
      : 'info';
  return { shouldAlert, severity };
}

/**
 * Main CoachHelm Intelligence class that orchestrates all V2 components
 */
class CoachHelmIntelligence {
  private reasoningEngine: ReasoningEngine;
  private confidenceCalibrator: ConfidenceCalibrator;
  private insightComposer: InsightComposer;
  /**
   * Per-call cache for `fetchPlayerStats`. `analyzePlayer` and
   * `generateRoundReview` both call it (and `analyzeRoundForReview` etc.
   * downstream may call it again) — without a cache we hit the heavy
   * `getDetailedStatsAsAdmin` action multiple times for the same player
   * inside one analysis. Cleared at the top of every `analyzePlayer` so
   * stats stay fresh across separate analysis runs.
   */
  private _statsCache: Map<string, GolfStats | undefined> = new Map();

  constructor() {
    this.reasoningEngine = new ReasoningEngine();
    this.confidenceCalibrator = new ConfidenceCalibrator();
    this.insightComposer = new InsightComposer();
  }

  /**
   * Performs full player analysis
   *
   * @param playerId - The player's UUID
   * @param options - Analysis options
   */
  async analyzePlayer(
    playerId: string,
    options: AnalysisOptions = {}
  ): Promise<PlayerAnalysis | null> {
    const {
      includePatterns = true,
      includeCausal = true,
      includePredictions = true,
      includeTrajectory = false,
      includeShotPatterns = true,
      includeLieAnalysis = true,
      depth = 'standard',
    } = options;

    // Drop any stats cached from a prior analyzePlayer run (different player
    // or stale data from earlier in the process lifetime). Within a single
    // analyzePlayer call the cache lets repeat callers share one fetch.
    this._statsCache.clear();

    // Tier-1 evidence-backed insights (Groups A + B + C — Insight Quality phase).
    // These read directly from raw tables and don't depend on the legacy
    // feature extraction. Run them first so they fire even when the legacy
    // pipeline can't produce features for a player. Persisted via
    // `upsertInsight` with dedup/lifecycle.
    //
    // 2026-05-17: closes audit Q-NEW-5. The previous code awaited
    // Promise.allSettled with no capture, so a throwing generator was
    // silently ignored unless the generator's own catch path called
    // logServerError. Now we capture the settled array, route every rejected
    // reason through logServerError with generator + player context, and
    // accumulate a per-generator summary that flows out via the analyze-player
    // route response.
    // W25 CUTOVER (2026-05-25):
    //   - 7 generators swapped to v3 BaseGenerator runs (puttDistance,
    //     puttMissBias, scrambling, parType, warmupHole, pressureGap,
    //     courseMgmt). Each v3 instance writes one insight with
    //     engine_version='v3' + 'v3:' signature prefix via
    //     upsertInsightV3 — clean coexistence with any residual v2 rows.
    //   - 3 stay on v2 (approachMiss, teeStrategy, worstHoles) — no v3
    //     equivalent yet because they need a shot-source helper. Plan:
    //     follow-up wave adds the helper, then those swap too.
    //   - 1 NET-NEW (courseMgmt) — v3 only, no v2 equivalent.
    //   - Coverage regression vs v2: puttDistance covers 3 buckets in
    //     v3 (3-5, 5-10, 10-15) vs 5 in v2; puttMissBias covers 2
    //     directions (left, right) vs 4 (high/low/left/right). The
    //     missing buckets/directions are less actionable and will be
    //     added when the v3 metric IDs align with cache columns.
    const tier1Generators: Array<{ name: string; fn: () => Promise<unknown> }> = [
      // v3 — putt distance (3 buckets)
      { name: 'v3.puttDistance.3_5ft',   fn: () => new PuttDistanceGenerator(playerId, '3_5ft').run() },
      { name: 'v3.puttDistance.5_10ft',  fn: () => new PuttDistanceGenerator(playerId, '5_10ft').run() },
      { name: 'v3.puttDistance.10_15ft', fn: () => new PuttDistanceGenerator(playerId, '10_15ft').run() },
      // v3 — putt bias (left / right; diagnostic, no PGA standing)
      { name: 'v3.puttBias.left',  fn: () => new PuttBiasGenerator(playerId, 'left').run() },
      { name: 'v3.puttBias.right', fn: () => new PuttBiasGenerator(playerId, 'right').run() },
      // v3 — scrambling (sand only; rough/fairway pending cache split)
      { name: 'v3.scrambling.sand', fn: () => new ScramblingGenerator(playerId, 'sand').run() },
      // v3 — per-par scoring (3 instances)
      { name: 'v3.parType.3', fn: () => new ParTypeGenerator(playerId, 3).run() },
      { name: 'v3.parType.4', fn: () => new ParTypeGenerator(playerId, 4).run() },
      { name: 'v3.parType.5', fn: () => new ParTypeGenerator(playerId, 5).run() },
      // v3 — course management (NET-NEW; 2 variants)
      { name: 'v3.courseMgmt.penalty',   fn: () => new CourseMgmtGenerator(playerId, 'penalty').run() },
      { name: 'v3.courseMgmt.bigNumber', fn: () => new CourseMgmtGenerator(playerId, 'big_number').run() },
      // v3 — pressure + warmup
      { name: 'v3.pressureGap', fn: () => new PressureGapGenerator(playerId).run() },
      { name: 'v3.warmupHole',  fn: () => new WarmupHoleGenerator(playerId).run() },
      // v2 (deferred — no v3 equivalent yet)
      { name: 'v2.approachMiss', fn: () => generateApproachMissInsights(playerId) },
      { name: 'v2.teeStrategy',  fn: () => generateTeeStrategyInsights(playerId) },
      { name: 'v2.worstHoles',   fn: () => generateWorstHolesInsights(playerId) },
    ];
    // 2026-05-24 Wave 7B — when caller supplies a philosophyGate, run the
    // tier-1 generators inside AsyncLocalStorage so every upsertInsight
    // they trigger inherits the gate and skips writes the coach's
    // philosophy would have archived after the fact. Replaces the post-
    // write filter in triggerPlayerInsightsAfterRound (insights.ts).
    //
    // 2026-05-24 Wave 8 — runWithGate now returns metrics. The gated-out
    // count is stashed on `tier1GateMetrics` so it can be returned from
    // analyzePlayer alongside `generatorSummary` for caller-side logging.
    const runTier1 = () =>
      Promise.allSettled(tier1Generators.map((g) => g.fn()));
    let tier1Settled: PromiseSettledResult<unknown>[];
    let tier1GateMetrics: { gatedCount: number } | null = null;
    if (options.philosophyGate) {
      const wrapped = await runWithGate(options.philosophyGate, runTier1);
      tier1Settled = wrapped.result;
      tier1GateMetrics = wrapped.metrics;
    } else {
      tier1Settled = await runTier1();
    }
    const tier1Successes: string[] = [];
    const tier1Failures: Array<{ generator: string; reason: string }> = [];
    for (let i = 0; i < tier1Settled.length; i++) {
      const result = tier1Settled[i];
      const generator = tier1Generators[i]!.name;
      if (!result) continue;
      if (result.status === 'rejected') {
        const r = (result as PromiseRejectedResult).reason as unknown;
        const reason = r instanceof Error ? r.message : String(r);
        tier1Failures.push({ generator, reason });
        await logServerError(`tier-1 generator '${generator}' rejected: ${reason}`, {
          action: 'analyzePlayer.tier1Generator',
          featureArea: 'coachhelm',
          playerId,
          extra: { generator, reason },
        });
      } else {
        tier1Successes.push(generator);
      }
    }
    // generatorSummary is attached to the analyzePlayer return below so the
    // post-round trigger and analyze-player route can surface partial failures.
    const generatorSummary = { successes: tier1Successes, failures: tier1Failures };

    // Extract features for the legacy pipeline
    const features = await extractAllFeatures(playerId);
    if (!features) {
      return null;
    }

    // === NEW: Fetch recent rounds for statistical foundation ===
    const supabaseClient = createAdminClient();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const { data: recentRounds } = await supabaseClient
      .from('golf_rounds')
      .select('id, score_to_par, total_putts, total_fairways, total_fairways_hit, total_gir, total_gir_possible')
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .gte('round_date', ninetyDaysAgo.toISOString())
      .order('round_date', { ascending: true });

    // === NEW: Statistical foundation ===
    const playerBaseline = buildPlayerBaseline(
      (recentRounds ?? []).map(r => ({
        metrics: {
          scoreToPar: r.score_to_par ?? 0,
          putts: r.total_putts ?? 0,
          fairwayPct: (r.total_fairways ?? 0) > 0 ? ((r.total_fairways_hit ?? 0) / (r.total_fairways ?? 1)) * 100 : 0,
          girPct: (r.total_gir_possible ?? 0) > 0 ? ((r.total_gir ?? 0) / (r.total_gir_possible ?? 1)) * 100 : 0,
        }
      }))
    );

    // === Parallelize independent mining/prediction steps ===
    // All six only need `playerId` and don't consume each other's outputs, so
    // run them concurrently via Promise.all. Roughly halves analyzePlayer's
    // wall-clock for the heavy section (each step is its own DB round-trip).
    const wantShotPatterns = includeShotPatterns || depth === 'deep';
    const wantLieAnalysis = includeLieAnalysis || depth === 'deep';

    const [
      minedPatterns,
      shotPatternsResult,
      lieAnalysisResult,
      shotStateResult,
      causalResult,
      predictionResult,
    ] = await Promise.all([
      includePatterns
        ? new PatternMiner(playerId).minePatterns()
        : Promise.resolve<MinedPattern[]>([]),
      wantShotPatterns
        ? new ShotPatternMiner(playerId).analyzeShotPatterns()
        : Promise.resolve(null),
      wantLieAnalysis
        ? analyzeLieSpecificMissPatterns(playerId)
        : Promise.resolve(null),
      new ShotStateIntelligence(playerId).analyze(),
      includeCausal
        ? new CausalEngine(playerId).discoverCausalRelationships()
        : Promise.resolve<CausalRelationship[]>([]),
      includePredictions
        ? new PerformancePredictor(playerId).predictPerformance()
        : Promise.resolve(null),
    ]);

    const patterns: MinedPattern[] = minedPatterns;
    const shotPatterns: ShotPatternAnalysis | undefined = shotPatternsResult ?? undefined;
    const lieAnalysis: LieMissAnalysis | undefined = lieAnalysisResult ?? undefined;
    const shotStateAnalysis = shotStateResult;
    const causalRelationships: CausalRelationship[] = causalResult;

    // Calibrate prediction confidence sequentially after the parallel batch —
    // it's a fast in-memory call but depends on the prediction's confidence.
    const predictions: PerformancePrediction[] = [];
    if (predictionResult) {
      predictionResult.calibratedConfidence = await this.confidenceCalibrator.calibrate(
        predictionResult.confidence,
      );
      predictions.push(predictionResult);
    }

    // Generate trajectory
    let trajectory: TrajectoryForecast | undefined;
    if (includeTrajectory || depth === 'deep') {
      const forecaster = new TrajectoryForecaster(playerId);
      trajectory = (await forecaster.forecastTrajectory()) ?? undefined;
    }

    // Fetch comprehensive stats for stats-based insights
    const stats = await this.fetchPlayerStats(playerId);

    // === V3 Statistical Analysis ===
    const scoreToPars = (recentRounds ?? []).map(r => r.score_to_par ?? 0);
    const trendAnalysis = analyzeMultiWindowTrends(scoreToPars, 'scoreToPar', true);

    const scoreBaseline = playerBaseline.metrics['scoreToPar'];
    const anomalies = scoreBaseline ? detectAnomalies(scoreToPars, scoreBaseline, 'scoreToPar') : [];
    const streaks = detectStreaks(scoreToPars, scoreBaseline?.ewma ?? 0);

    // Generate insights (including shot patterns, stats-based, and lie-specific)
    const insights = this.prioritizeInsights(await this.generateInsights(
      playerId,
      features,
      patterns,
      causalRelationships,
      predictions,
      shotPatterns,
      stats,
      lieAnalysis,
      shotStateAnalysis ?? undefined,
      playerBaseline
    ));

    // === Score and filter insights ===
    const scoredInsights = insights
      .map(insight => {
        // Derive insight type from reasoning chain or tone rather than hardcoding 'pattern'
        const insightType = insight.reasoning?.reasoningChain?.[0]?.type ?? insight.tone ?? 'pattern';
        return {
          ...insight,
          feedbackScore: scoreInsight(insight.confidence, insight.strokeImpact ?? 0, insightType, []).finalScore,
        };
      })
      .filter(insight => shouldShowInsight({ baseScore: insight.confidence, feedbackAdjustment: 0, finalScore: insight.feedbackScore, shouldShow: true }))
      .sort((a, b) => b.feedbackScore - a.feedbackScore);

    // Determine alert level
    const alertLevel = this.determineAlertLevel(patterns, predictions, features);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      patterns,
      causalRelationships,
      features
    );

    // Get primary insight
    const primaryInsight = scoredInsights.length > 0
      ? scoredInsights[0]!
      : {
          headline: 'Analysis Complete',
          body: 'No significant insights at this time.',
          tone: 'neutral' as const,
          confidence: 0.5,
        };

    return {
      playerId,
      analyzedAt: new Date().toISOString(),
      features,
      patterns,
      causalRelationships,
      predictions,
      trajectory,
      shotPatterns,
      lieAnalysis,
      insights: scoredInsights,
      primaryInsight,
      recommendations,
      alertLevel,
      trendAnalysis,
      anomalies,
      streaks,
      generatorSummary,
      tier1GateMetrics,
    };
  }

  /**
   * Generates enhanced round review with V2 intelligence
   *
   * @param roundId - The round's UUID
   * @param playerId - The player's UUID
   */
  async generateRoundReview(
    roundId: string,
    playerId: string
  ): Promise<IntelligentRoundReview | null> {
    // Get features
    const features = await extractAllFeatures(playerId);
    if (!features) {
      return null;
    }

    // Get patterns
    const miner = new PatternMiner(playerId);
    const patterns = await miner.minePatterns();

    // Get causal relationships
    const causalEngine = new CausalEngine(playerId);
    const causalInsights = await causalEngine.discoverCausalRelationships();

    // Get prediction when available, but do not block round-review generation
    // if the predictive layer has not produced a record for this player yet.
    const predictor = new PerformancePredictor(playerId);
    const prediction = await predictor.predictPerformance();

    // Pull the same evidence-rich layers used in full player analysis so
    // round reviews are grounded in shot data, stats, and root causes.
    const shotMiner = new ShotPatternMiner(playerId);
    const shotPatterns = (await shotMiner.analyzeShotPatterns()) ?? undefined;
    const lieAnalysis = (await analyzeLieSpecificMissPatterns(playerId)) ?? undefined;
    const shotStateAnalysis = (await new ShotStateIntelligence(playerId).analyze()) ?? undefined;
    const stats = await this.fetchPlayerStats(playerId);

    const playerLevelInsights = this.prioritizeInsights(await this.generateInsights(
      playerId,
      features,
      patterns,
      causalInsights,
      prediction ? [prediction] : [],
      shotPatterns,
      stats,
      lieAnalysis,
      shotStateAnalysis
      // No per-player baseline available here (round-review path); stats
      // insights will fall back to the static benchmark table.
    ));
    const roundSpecificInsights = await this.buildRoundSpecificInsights(roundId);
    const prioritizedInsights = this.mergeRoundSpecificInsights(
      roundSpecificInsights,
      playerLevelInsights
    );

    const primaryReviewInsight = prioritizedInsights[0];

    // Apply reasoning
    const reasoning = this.reasoningEngine.reason(
      {
        type: 'performance_change',
        description: 'Round performance analysis',
        data: { roundId },
      },
      {
        features,
        patterns,
        causalRelationships: causalInsights,
      }
    );

    // Calibrate confidence
    reasoning.calibratedConfidence = await this.confidenceCalibrator.calibrate(
      reasoning.confidence
    );

    const composedReview = primaryReviewInsight ?? {
      headline: 'Round Review Ready',
      body: 'The round has been analyzed, but there is not yet enough evidence to surface a high-confidence takeaway.',
      tone: 'neutral' as const,
      confidence: reasoning.calibratedConfidence,
      reasoning,
    };

    // Generate focus areas
    const focusAreas = this.identifyFocusAreas(patterns, causalInsights, prioritizedInsights);

    // Determine practice priority
    const practicePriority = this.determinePracticePriority(
      patterns,
      causalInsights,
      prioritizedInsights
    );

    return {
      roundId,
      playerId,
      summary: this.buildRoundReviewSummary(prioritizedInsights, prediction, features),
      primaryTakeaway: primaryReviewInsight?.headline ?? composedReview.headline,
      patternsApplied: patterns.filter((p) => p.isActive).slice(0, 3),
      causalInsights: causalInsights.slice(0, 2),
      prediction: prediction ?? null,
      reasoning,
      composedReview,
      focusAreas,
      practicePriority,
    };
  }

  /**
   * Generates alerts for a coach's team
   *
   * @param coachId - The coach's UUID
   * @param teamId - The team's UUID
   */
  async generateAlerts(
    coachId: string,
    teamId: string
  ): Promise<ComposedInsight[]> {
    const alerts: ComposedInsight[] = [];

    // Initialize behavior learner for coach preferences
    const behaviorLearner = new BehaviorLearner(coachId, 'coach');
    await behaviorLearner.getLearnedPreferences();

    // Get team patterns via cross-learner
    const crossLearner = new CrossLearner(teamId);
    await crossLearner.buildGlobalPatternLibrary();

    // Validate past predictions (no-op until validation data accumulates)
    // this.outcomeValidator tracks validations as they arrive via .validate()

    // Update calibration (no-op until prediction feedback accumulates)
    // this.confidenceCalibrator tracks calibration as predictions are scored via .update()

    // Query team players
    const supabase = createAdminClient();

    // LIVE-24: load coach philosophy once per run; prior code hard-coded
    // decline/pressure thresholds and ignored persisted per-coach settings.
    const { data: philosophyRow } = await supabase
      .from('golf_coach_philosophy')
      .select('decline_threshold, pressure_gap_threshold')
      .eq('coach_id', coachId)
      .maybeSingle();
    const philosophy = {
      declineThreshold: philosophyRow?.decline_threshold ?? undefined,
      pressureGapThreshold: philosophyRow?.pressure_gap_threshold ?? undefined,
    };

    const { data: teamMembers } = await supabase
      .from('golf_team_members')
      .select('player_id')
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (!teamMembers || teamMembers.length === 0) {
      return alerts;
    }

    // Analyze each player with lightweight options for alert generation
    const BATCH_SIZE = 3;
    for (let i = 0; i < teamMembers.length; i += BATCH_SIZE) {
      const batch = teamMembers.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (member) => {
          const analysis = await this.analyzePlayer(member.player_id, {
            includePatterns: true,
            includeCausal: false,
            includePredictions: true,
            includeShotPatterns: false,
            includeLieAnalysis: false,
            depth: 'quick',
          });
          return { playerId: member.player_id, analysis };
        })
      );

      for (const result of batchResults) {
        if (result.status !== 'fulfilled' || !result.value.analysis) continue;

        const { playerId, analysis } = result.value;
        const { patterns, predictions, alertLevel } = analysis;

        // Only generate alerts for warning+ level players
        if (alertLevel === 'none' || alertLevel === 'info') continue;

        // High-impact patterns become alerts — gate on the coach's
        // persisted pressureGapThreshold (LIVE-24).
        for (const pattern of patterns.filter((p) => {
          if (!p.isActive || p.confidence <= 0.65) return false;
          const gate = applyPhilosophyThresholds({ strokeImpact: p.strokeImpact }, philosophy);
          return gate.shouldAlert;
        })) {
          const reasoning = this.reasoningEngine.reason(
            {
              type: 'pattern_detected',
              description: pattern.description || 'Alert pattern',
              // ReasoningEngine.reason() requires Record<string, unknown>; the
              // typed MinedPattern shape lacks the index signature, so a
              // double-cast bridge is required here.
              data: pattern as unknown as Record<string, unknown>,
            },
            { features: analysis.features, patterns }
          );

          reasoning.calibratedConfidence = await this.confidenceCalibrator.calibrate(
            reasoning.confidence
          );

          const context: InsightContext = {
            playerId,
            isForCoach: true,
            verbosity: 'brief',
            playerState: this.inferPlayerState(analysis.features),
            recentPerformance: this.inferRecentPerformance(analysis.features),
          };

          const patternGate = applyPhilosophyThresholds(
            { strokeImpact: pattern.strokeImpact },
            philosophy,
          );
          alerts.push(
            this.insightComposer.compose(
              {
                type: 'alert',
                data: {
                  ...pattern,
                  severity: patternGate.severity === 'critical' ? 'critical' : 'warning',
                  playerId,
                },
                reasoning,
                features: analysis.features,
              },
              context
            )
          );
        }

        // Negative predictions become alerts — gate on declineThreshold.
        for (const pred of predictions.filter((p) => {
          const gate = applyPhilosophyThresholds({ predictedValue: p.predictedValue }, philosophy);
          return gate.shouldAlert;
        })) {
          const context: InsightContext = {
            playerId,
            isForCoach: true,
            verbosity: 'brief',
            playerState: this.inferPlayerState(analysis.features),
            recentPerformance: this.inferRecentPerformance(analysis.features),
          };

          const predGate = applyPhilosophyThresholds(
            { predictedValue: pred.predictedValue },
            philosophy,
          );
          alerts.push(
            this.insightComposer.compose(
              {
                type: 'alert',
                data: {
                  ...pred,
                  severity: predGate.severity === 'critical' ? 'critical' : 'warning',
                  playerId,
                },
              },
              context
            )
          );
        }
      }
    }

    // Sort alerts: critical first, then by confidence
    alerts.sort((a, b) => {
      const severityOrder = { urgent: 0, cautionary: 1, neutral: 2, encouraging: 3, celebratory: 4 };
      const aSev = severityOrder[a.tone] ?? 2;
      const bSev = severityOrder[b.tone] ?? 2;
      if (aSev !== bSev) return aSev - bSev;
      return b.confidence - a.confidence;
    });

    return alerts;
  }

  /**
   * Generates cross-player team-level insights by finding shared patterns.
   * Identifies patterns affecting multiple players (team-wide trends).
   *
   * @param teamId - The team's UUID
   */
  async generateTeamPatternInsights(
    teamId: string
  ): Promise<ComposedInsight[]> {
    const insights: ComposedInsight[] = [];

    try {
      const crossLearner = new CrossLearner(teamId);
      const globalPatterns = await crossLearner.buildGlobalPatternLibrary();

      // Filter to patterns affecting multiple team players
      const teamWidePatterns = globalPatterns.filter(
        (gp) => gp.playerCount >= 2 && gp.confidence >= 0.6
      ).sort((a, b) => {
        const aScore = a.playerCount * Math.abs(a.averageImpact) * a.confidence;
        const bScore = b.playerCount * Math.abs(b.averageImpact) * b.confidence;
        return bScore - aScore;
      });

      for (const gp of teamWidePatterns.slice(0, 5)) {
        const isPositive = gp.averageImpact < 0; // negative stroke impact = good
        const tone = isPositive ? 'encouraging' : gp.averageImpact > 1.5 ? 'urgent' : 'cautionary';
        const teamStrokeSwing = gp.averageImpact * gp.playerCount;

        const headline = isPositive
          ? `Team Strength: ${gp.patternType.replace(/_/g, ' ')} across ${gp.playerCount} players`
          : `Team Priority: ${gp.patternType.replace(/_/g, ' ')} affecting ${gp.playerCount} players`;

        const bodyParts: string[] = [];
        bodyParts.push(
          `${gp.playerCount} players share this ${gp.patternType.replace(/_/g, ' ')} pattern.`
        );
        bodyParts.push(
          `Average impact: ${gp.averageImpact > 0 ? '+' : ''}${gp.averageImpact.toFixed(1)} strokes per round across ${gp.instanceCount} observed instances.`
        );
        bodyParts.push(
          `${teamStrokeSwing > 0 ? 'Estimated team cost' : 'Estimated team edge'}: ${teamStrokeSwing > 0 ? '+' : ''}${teamStrokeSwing.toFixed(1)} strokes per competitive round.`
        );
        if (!isPositive) {
          bodyParts.push(
            'Consider a team-wide practice focus targeting this area.'
          );
        }

        insights.push({
          headline,
          body: bodyParts.join(' '),
          callToAction: isPositive
            ? 'Protect this edge in team practice and document the habits the best performers are repeating.'
            : `Build the next team session around this weakness first; it is affecting ${gp.playerCount} players and roughly ${teamStrokeSwing.toFixed(1)} team strokes.`,
          tone,
          confidence: gp.confidence,
          strokeImpact: Math.abs(teamStrokeSwing),
          reasoning: {
            conclusion: `Cross-player analysis found ${gp.playerCount} players with the same ${gp.patternType} pattern`,
            confidence: gp.confidence,
            calibratedConfidence: gp.confidence,
            reasoningChain: [
              {
                stepNumber: 1,
                type: 'inductive' as const,
                premise: `Analyzed patterns across team roster`,
                inference: `${gp.playerCount} players exhibit the same pattern with ${(gp.prevalence * 100).toFixed(0)}% team prevalence`,
                conclusion: 'This is a team-level pattern, not individual variation',
                confidence: gp.confidence,
                evidence: [
                  `${gp.playerCount} players affected`,
                  `${gp.instanceCount} total instances observed`,
                  `Average confidence: ${(gp.confidence * 100).toFixed(0)}%`,
                ],
              },
            ],
            alternatives: [],
            sensitivities: [],
          },
        });
      }
    } catch (error) {
      console.error('[CoachHelm] Error generating team pattern insights:', error);
      await logServerError(
        `CoachHelm orchestrator failed generating team pattern insights: ${error instanceof Error ? error.message : String(error)}`,
        { action: 'coachhelm.orchestrator.generateTeamPatternInsights', featureArea: 'coachhelm' }
      );
    }

    return insights;
  }

  /**
   * Records an interaction for learning
   *
   * @param interaction - The user interaction
   */
  async learn(interaction: UserInteraction): Promise<void> {
    const learner = new BehaviorLearner(
      interaction.entityId,
      interaction.entityType
    );
    await learner.learnFromInteraction(interaction);
  }

  /**
   * Generates composed insights from analysis
   */
  private async generateInsights(
    playerId: string,
    features: ExtractedFeatures,
    patterns: MinedPattern[],
    causal: CausalRelationship[],
    predictions: PerformancePrediction[],
    shotPatterns?: ShotPatternAnalysis,
    stats?: GolfStats,
    lieAnalysis?: LieMissAnalysis,
    shotStateAnalysis?: ShotStateAnalysis,
    playerBaseline?: import('./stats/baselines').PlayerBaseline,
  ): Promise<ComposedInsight[]> {
    const insights: ComposedInsight[] = [];

    const context: InsightContext = {
      playerId,
      isForCoach: false,
      verbosity: 'balanced',
      playerState: this.inferPlayerState(features),
      recentPerformance: this.inferRecentPerformance(features),
    };

    // Stats-based insights (highest priority - directly tied to stroke savings)
    if (stats && stats.roundsPlayed >= 3) {
      const statsInsights = await this.generateStatsInsights(playerId, stats, playerBaseline);
      insights.push(...statsInsights);
    }

    // Shot-state intelligence insights (par + lie + before/after yardage)
    if (shotStateAnalysis) {
      const shotStateInsights = shotStateAnalysis.insights.map((insight) =>
        this.convertShotStateInsightToComposed(insight)
      );
      insights.push(...shotStateInsights);
    }

    // Cross-metric correlation insights (pressure, scoring patterns)
    const correlationInsights = await this.generateCorrelationInsights(playerId);
    insights.push(...correlationInsights);

    // Lie-specific analysis insights (shot category & dispersion)
    if (lieAnalysis) {
      const lieInsights = this.generateLieAnalysisInsights(lieAnalysis);
      insights.push(...lieInsights);
    }

    // Pattern insights
    for (const pattern of patterns.filter((p) => p.isActive).slice(0, 3)) {
      const reasoning = this.reasoningEngine.reason(
        {
          type: 'pattern_detected',
          description: pattern.description || 'Pattern detected',
          // See note above: reason() requires Record<string, unknown>.
          data: pattern as unknown as Record<string, unknown>,
        },
        { features, patterns, causalRelationships: causal }
      );

      reasoning.calibratedConfidence = await this.confidenceCalibrator.calibrate(
        reasoning.confidence
      );

      insights.push(
        this.insightComposer.compose(
          {
            type: 'pattern',
            data: pattern,
            reasoning,
            features,
          },
          context
        )
      );
    }

    // Shot pattern insights (critical patterns only)
    if (shotPatterns?.criticalPatterns) {
      for (const shotPattern of shotPatterns.criticalPatterns.slice(0, 2)) {
        // Create shot-specific reasoning chain based on the actual pattern data
        // NOT the generic player state reasoning
        const shotReasoning = this.buildShotPatternReasoning(shotPattern);

        const calibratedConfidence = await this.confidenceCalibrator.calibrate(
          shotPattern.confidence
        );

        insights.push({
          headline: `Shot Pattern: ${shotPattern.situation.distanceRange.label}`,
          body: shotPattern.insight,
          callToAction: shotPattern.recommendation,
          tone: shotPattern.dispersionPattern.startsWith('one_way') ? 'cautionary' : 'neutral',
          confidence: shotPattern.confidence,
          reasoning: {
            ...shotReasoning,
            calibratedConfidence,
          },
        });
      }
    }

    // Prediction insights
    for (const prediction of predictions) {
      const reasoning = this.reasoningEngine.reason(
        {
          type: 'performance_change',
          description: 'Performance forecast',
          // See note above: reason() requires Record<string, unknown>.
          data: prediction as unknown as Record<string, unknown>,
        },
        { features, patterns }
      );

      reasoning.calibratedConfidence = await this.confidenceCalibrator.calibrate(
        reasoning.confidence
      );

      insights.push(
        this.insightComposer.compose(
          {
            type: 'prediction',
            data: prediction,
            reasoning,
            features,
          },
          context
        )
      );
    }

    return insights;
  }

  /**
   * Prioritizes insights by scoring value, confidence, and evidence density.
   * This prevents low-impact but high-confidence observations from outranking
   * the truly useful coaching takeaways.
   */
  private prioritizeInsights(insights: ComposedInsight[]): ComposedInsight[] {
    const deduped = new Map<string, { insight: ComposedInsight; score: number }>();

    for (const insight of insights) {
      const key = this.getInsightDedupKey(insight);
      const score = this.scoreInsight(insight);
      const existing = deduped.get(key);

      if (!existing || score > existing.score) {
        deduped.set(key, { insight, score });
      }
    }

    return [...deduped.values()]
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.insight)
      .slice(0, 12);
  }

  private scoreInsight(insight: ComposedInsight): number {
    const toneWeight: Record<ComposedInsight['tone'], number> = {
      urgent: 0.18,
      cautionary: 0.14,
      neutral: 0.08,
      encouraging: 0.06,
      celebratory: 0.04,
    };

    const strokeComponent = Math.min(1, (insight.strokeImpact ?? 0) / 2.5) * 0.45;
    const confidenceComponent = Math.max(0, Math.min(1, insight.confidence)) * 0.3;
    const evidenceCount =
      insight.evidenceMetrics?.length
      ?? insight.reasoning?.reasoningChain.length
      ?? 0;
    const evidenceComponent = Math.min(1, evidenceCount / 4) * 0.17;

    return strokeComponent + confidenceComponent + evidenceComponent + (toneWeight[insight.tone] ?? 0);
  }

  private getInsightDedupKey(insight: ComposedInsight): string {
    return `${insight.headline}|${insight.body}`
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildRoundReviewSummary(
    insights: ComposedInsight[],
    prediction: PerformancePrediction | null,
    features: ExtractedFeatures
  ): string {
    const topInsights = insights.slice(0, 3);

    if (topInsights.length === 0) {
      const form = this.inferRecentPerformance(features);
      if (prediction) {
        const forecast = this.formatScoreToPar(prediction.predictedValue);
        return `Recent form is ${form}. Current forecast is ${forecast}, so the next practice block should stay focused on scoring stability.`;
      }
      return `Recent form is ${form}. Current practice block should stay focused on scoring stability and the highest-confidence shot patterns from recent rounds.`;
    }

    const summaryParts: string[] = [topInsights[0]!.body];

    if (topInsights[1]) {
      summaryParts.push(`Secondary theme: ${topInsights[1]!.body}`);
    }

    const mostActionable = topInsights.find((insight) => insight.callToAction);
    if (mostActionable?.callToAction) {
      summaryParts.push(`Next step: ${mostActionable.callToAction}`);
    }

    return summaryParts.join(' ');
  }

  private async buildRoundSpecificInsights(roundId: string): Promise<ComposedInsight[]> {
    const supabase = createAdminClient();

    const [{ data: shots }, { data: holes }] = await Promise.all([
      supabase
        .from('golf_shots')
        .select('hole_number, shot_number, shot_type, distance_to_hole_before, distance_to_hole_after, distance_unit_before, distance_unit_after, lie_before, lie_after, result, miss_direction')
        .eq('round_id', roundId)
        .order('hole_number', { ascending: true })
        .order('shot_number', { ascending: true }),
      supabase
        .from('golf_holes')
        .select('hole_number, par, score, gir, up_and_down, fairway_hit, penalty_strokes')
        .eq('round_id', roundId)
        .order('hole_number', { ascending: true }),
    ]);

    const roundShots = (shots ?? []) as RoundReviewShotRow[];
    const roundHoles = (holes ?? []) as RoundReviewHoleRow[];

    if (roundShots.length === 0 && roundHoles.length === 0) {
      return [];
    }

    const insights: ComposedInsight[] = [];

    const severeApproachInsight = this.buildRoundSevereApproachInsight(roundShots);
    if (severeApproachInsight) insights.push(severeApproachInsight);

    const liePenaltyInsight = this.buildRoundLiePenaltyInsight(roundShots);
    if (liePenaltyInsight) insights.push(liePenaltyInsight);

    const teeMissInsight = this.buildRoundTeeMissInsight(roundShots);
    if (teeMissInsight) insights.push(teeMissInsight);

    const scrambleInsight = this.buildRoundScrambleInsight(roundHoles);
    if (scrambleInsight) insights.push(scrambleInsight);

    return insights.sort((a, b) => (b.strokeImpact ?? 0) - (a.strokeImpact ?? 0));
  }

  private mergeRoundSpecificInsights(
    roundSpecificInsights: ComposedInsight[],
    playerLevelInsights: ComposedInsight[]
  ): ComposedInsight[] {
    const merged: ComposedInsight[] = [];
    const seen = new Set<string>();

    for (const insight of [...roundSpecificInsights, ...playerLevelInsights]) {
      const key = `${insight.headline}|${insight.body}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(insight);
    }

    return merged;
  }

  private buildRoundSevereApproachInsight(shots: RoundReviewShotRow[]): ComposedInsight | null {
    const missedApproaches = shots.filter((shot) => {
      if (shot.shot_type !== 'approach' || shot.distance_to_hole_before == null) return false;
      return shot.result !== 'green' && shot.result !== 'hole' && shot.lie_after !== 'green';
    });

    if (missedApproaches.length < 2) return null;

    const bracketStats = ROUND_REVIEW_APPROACH_BRACKETS.map((bracket): RoundSpecificBracketStats | null => {
      const inBracket = missedApproaches.filter((shot) => {
        const beforeYards = this.toRoundReviewYards(shot.distance_to_hole_before, shot.distance_unit_before);
        return beforeYards != null && beforeYards >= bracket.min && beforeYards < bracket.max;
      });

      if (inBracket.length < 2) return null;

      const severeShots = inBracket.filter((shot) => this.isSevereRoundApproachMiss(shot));
      const afterYards = inBracket
        .map((shot) => this.toRoundReviewYards(shot.distance_to_hole_after, shot.distance_unit_after))
        .filter((value): value is number => value != null);

      return {
        label: bracket.label,
        sampleSize: inBracket.length,
        severeCount: severeShots.length,
        severeRate: severeShots.length / inBracket.length,
        avgAfterYards: afterYards.length > 0
          ? afterYards.reduce((sum, value) => sum + value, 0) / afterYards.length
          : 0,
      };
    }).filter((item): item is RoundSpecificBracketStats => item != null);

    const topBracket = bracketStats
      .filter((item) => item.severeRate >= 0.5)
      .sort((a, b) => {
        const byRate = b.severeRate - a.severeRate;
        if (Math.abs(byRate) > 0.001) return byRate;
        return b.sampleSize - a.sampleSize;
      })[0];

    if (!topBracket) return null;

    const severePct = Math.round(topBracket.severeRate * 100);

    return {
      headline: `Round Approach Check: ${topBracket.label} produced the biggest misses`,
      body: `${topBracket.severeCount} of ${topBracket.sampleSize} missed approaches from ${topBracket.label} finished more than 25 yards away or in a penalty state in this round.`,
      callToAction: severePct >= 75
        ? 'Play to the safe side of the target and favor solid contact over chasing a perfect shot from this yardage.'
        : 'Keep the target wider from this yardage window and prioritize finishing inside a playable leave.',
      tone: severePct >= 75 ? 'urgent' : 'cautionary',
      confidence: Math.min(0.9, 0.55 + topBracket.sampleSize * 0.08),
      strokeImpact: Number((topBracket.severeRate * Math.max(1, topBracket.sampleSize / 2)).toFixed(1)),
      evidenceMetrics: [
        { label: 'Yardage window', value: topBracket.label },
        { label: 'Severe misses', value: `${topBracket.severeCount}/${topBracket.sampleSize}` },
        { label: 'Severe miss rate', value: `${severePct}%` },
        { label: 'Average leave', value: `${Math.round(topBracket.avgAfterYards)}y` },
      ],
    };
  }

  private buildRoundLiePenaltyInsight(shots: RoundReviewShotRow[]): ComposedInsight | null {
    const approachShots = shots.filter((shot) => shot.shot_type === 'approach');
    if (approachShots.length < 4) return null;

    let bestInsight: ComposedInsight | null = null;
    let bestGap = 0;

    for (const bracket of ROUND_REVIEW_APPROACH_BRACKETS) {
      const fairwayShots = approachShots.filter((shot) => {
        const beforeYards = this.toRoundReviewYards(shot.distance_to_hole_before, shot.distance_unit_before);
        return beforeYards != null
          && beforeYards >= bracket.min
          && beforeYards < bracket.max
          && shot.lie_before === 'fairway'
          && shot.distance_to_hole_after != null;
      });
      const roughShots = approachShots.filter((shot) => {
        const beforeYards = this.toRoundReviewYards(shot.distance_to_hole_before, shot.distance_unit_before);
        return beforeYards != null
          && beforeYards >= bracket.min
          && beforeYards < bracket.max
          && shot.lie_before === 'rough'
          && shot.distance_to_hole_after != null;
      });

      if (fairwayShots.length < 2 || roughShots.length < 2) continue;

      const fairwayAvg = this.averageRoundReviewAfterYards(fairwayShots);
      const roughAvg = this.averageRoundReviewAfterYards(roughShots);
      if (fairwayAvg == null || roughAvg == null) continue;

      const gap = roughAvg - fairwayAvg;
      if (gap <= 6 || gap <= bestGap) continue;

      bestGap = gap;
      bestInsight = {
        headline: `Round Lie Penalty: rough from ${bracket.label} cost you the next shot`,
        body: `From ${bracket.label}, fairway approaches finished ${Math.round(fairwayAvg)} yards away on average versus ${Math.round(roughAvg)} yards from rough in this round.`,
        callToAction: 'When you miss the fairway into this yardage window, shift to a safer target and protect against the expensive leave.',
        tone: gap >= 12 ? 'urgent' : 'cautionary',
        confidence: Math.min(0.88, 0.55 + (fairwayShots.length + roughShots.length) * 0.05),
        strokeImpact: Number((Math.max(0.8, gap / 10)).toFixed(1)),
        evidenceMetrics: [
          { label: 'Window', value: bracket.label },
          { label: 'Fairway leave', value: `${Math.round(fairwayAvg)}y` },
          { label: 'Rough leave', value: `${Math.round(roughAvg)}y` },
          { label: 'Gap', value: `${Math.round(gap)}y` },
        ],
      };
    }

    return bestInsight;
  }

  private buildRoundTeeMissInsight(shots: RoundReviewShotRow[]): ComposedInsight | null {
    const teeShots = shots.filter((shot) => shot.shot_type === 'tee');
    const missedFairways = teeShots.filter((shot) => shot.lie_after && shot.lie_after !== 'fairway' && shot.lie_after !== 'green');

    if (missedFairways.length < 3) return null;

    const rightMisses = missedFairways.filter((shot) => {
      const direction = shot.miss_direction ?? '';
      return direction === 'right' || direction.endsWith('_right') || direction.startsWith('right_');
    }).length;
    const leftMisses = missedFairways.filter((shot) => {
      const direction = shot.miss_direction ?? '';
      return direction === 'left' || direction.endsWith('_left') || direction.startsWith('left_');
    }).length;

    const dominantDirection = rightMisses >= leftMisses ? 'right' : 'left';
    const dominantCount = dominantDirection === 'right' ? rightMisses : leftMisses;

    if (dominantCount / missedFairways.length < 0.75) return null;

    return {
      headline: `Round Driving Pattern: missed fairways piled up ${dominantDirection}`,
      body: `${dominantCount} of ${missedFairways.length} missed fairways finished ${dominantDirection} in this round, which repeatedly pushed the next shot into a worse lie.`,
      callToAction: `Start the ball a touch ${dominantDirection === 'right' ? 'left' : 'right'} of the final target and commit to the playable side.`,
      tone: 'cautionary',
      confidence: Math.min(0.84, 0.55 + missedFairways.length * 0.06),
      strokeImpact: Number((missedFairways.length * 0.3).toFixed(1)),
      evidenceMetrics: [
        { label: 'Missed fairways', value: missedFairways.length },
        { label: 'Dominant side', value: dominantDirection },
        { label: 'Directional share', value: `${Math.round((dominantCount / missedFairways.length) * 100)}%` },
      ],
    };
  }

  private buildRoundScrambleInsight(holes: RoundReviewHoleRow[]): ComposedInsight | null {
    const missedGreens = holes.filter((hole) => hole.gir === false);
    if (missedGreens.length < 5) return null;

    const scrambleFails = missedGreens.filter((hole) => hole.up_and_down === false && hole.score != null && hole.par != null && hole.score > hole.par);
    if (scrambleFails.length < 4) return null;

    return {
      headline: 'Round Damage Pattern: missed greens kept turning into bogeys',
      body: `${scrambleFails.length} of ${missedGreens.length} missed greens became bogey or worse in this round, so the scoring damage kept happening after the first miss.`,
      callToAction: 'Treat the first recovery shot as a scoring save: leave uphill, favor center green, and remove the big miss after the miss.',
      tone: 'cautionary',
      confidence: Math.min(0.86, 0.55 + missedGreens.length * 0.04),
      strokeImpact: Number(((scrambleFails.length / missedGreens.length) * 2).toFixed(1)),
      evidenceMetrics: [
        { label: 'Missed greens', value: missedGreens.length },
        { label: 'Bogeys after miss', value: scrambleFails.length },
        { label: 'Failure rate', value: `${Math.round((scrambleFails.length / missedGreens.length) * 100)}%` },
      ],
    };
  }

  private toRoundReviewYards(distance: number | null, unit: string | null): number | null {
    if (distance == null) return null;
    return unit === 'feet' ? distance / 3 : distance;
  }

  private isSevereRoundApproachMiss(shot: RoundReviewShotRow): boolean {
    const afterYards = this.toRoundReviewYards(shot.distance_to_hole_after, shot.distance_unit_after);
    return shot.lie_after === 'penalty' || (afterYards != null && afterYards > 25);
  }

  private averageRoundReviewAfterYards(shots: RoundReviewShotRow[]): number | null {
    const values = shots
      .map((shot) => this.toRoundReviewYards(shot.distance_to_hole_after, shot.distance_unit_after))
      .filter((value): value is number => value != null);

    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private formatScoreToPar(value: number): string {
    if (Math.abs(value) < 0.05) return 'E';
    return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  }

  /**
   * Determines overall alert level
   */
  private determineAlertLevel(
    patterns: MinedPattern[],
    predictions: PerformancePrediction[],
    features: ExtractedFeatures
  ): 'none' | 'info' | 'warning' | 'critical' {
    // Check for critical patterns
    const criticalPatterns = patterns.filter(
      (p) => p.strokeImpact > 2 && p.confidence > 0.7
    );
    if (criticalPatterns.length > 0) {
      return 'critical';
    }

    // Check for warning patterns
    const warningPatterns = patterns.filter(
      (p) => p.strokeImpact > 1 && p.confidence > 0.6
    );
    if (warningPatterns.length > 0) {
      return 'warning';
    }

    // Check predictions
    for (const pred of predictions) {
      if (pred.predictedValue > 5) {
        return 'warning';
      }
    }

    // Check features
    if (features.contextual.formCycle === 'declining') {
      return 'info';
    }

    return 'none';
  }

  /**
   * Generates recommendations
   */
  private generateRecommendations(
    patterns: MinedPattern[],
    causal: CausalRelationship[],
    features: ExtractedFeatures
  ): string[] {
    const recommendations: string[] = [];

    // From patterns
    for (const pattern of patterns.filter((p) => p.isActive && p.recommendation)) {
      recommendations.push(pattern.recommendation!);
    }

    // From causal
    for (const rel of causal.filter((c) => c.interventionPotential > 0.7)) {
      recommendations.push(
        `Consider addressing ${rel.cause} to improve ${rel.effect}.`
      );
    }

    // From features
    if (features.temporal.daysSinceLastRound > 7) {
      recommendations.push(
        'Consider a practice round before competitive play after extended break.'
      );
    }

    if (features.contextual.formCycle === 'declining') {
      recommendations.push(
        'Review fundamentals and consider focused practice sessions.'
      );
    }

    return recommendations.slice(0, 5);
  }

  /**
   * Infers player state from features
   */
  private inferPlayerState(
    features: ExtractedFeatures
  ): 'improving' | 'stable' | 'struggling' | 'unknown' {
    if (features.temporal.recentFormScore > 0.3) {
      return 'improving';
    }
    if (features.temporal.recentFormScore < -0.3) {
      return 'struggling';
    }
    if (Math.abs(features.temporal.scoringTrend7Day) < 0.2) {
      return 'stable';
    }
    return 'unknown';
  }

  /**
   * Infers recent performance from features
   */
  private inferRecentPerformance(
    features: ExtractedFeatures
  ): 'good' | 'average' | 'poor' {
    const formCycle = features.contextual.formCycle;
    if (formCycle === 'peak' || formCycle === 'rising') {
      return 'good';
    }
    if (formCycle === 'declining' || formCycle === 'trough') {
      return 'poor';
    }
    return 'average';
  }

  /**
   * Identifies focus areas from analysis
   */
  private identifyFocusAreas(
    patterns: MinedPattern[],
    causal: CausalRelationship[],
    insights: ComposedInsight[] = []
  ): string[] {
    const areas: string[] = [];

    for (const insight of insights.filter((item) => item.tone === 'urgent' || item.tone === 'cautionary')) {
      const area = this.extractFocusAreaFromInsight(insight);
      if (area) {
        areas.push(area);
      }
    }

    // From patterns with negative impact
    for (const pattern of patterns.filter((p) => p.strokeImpact > 0.5)) {
      const condition = pattern.conditions[0];
      if (condition) {
        areas.push(condition.label || condition.field);
      }
    }

    // From causal with high intervention potential
    for (const rel of causal.filter((c) => c.interventionPotential > 0.6)) {
      areas.push(rel.cause);
    }

    return Array.from(new Set(areas)).slice(0, 3);
  }

  private extractFocusAreaFromInsight(insight: ComposedInsight): string | null {
    const headline = insight.headline.trim();
    if (!headline) return null;

    const normalized = headline.toLowerCase();
    if (normalized.includes('putt')) return 'Putting';
    if (normalized.includes('approach')) return 'Approach Play';
    if (normalized.includes('driving') || normalized.includes('fairway')) return 'Driving';
    if (normalized.includes('short game') || normalized.includes('scrambl')) return 'Short Game';
    if (normalized.includes('pressure')) return 'Pressure Performance';
    if (normalized.includes('dispersion')) return 'Shot Dispersion';
    if (normalized.includes('par 5')) return 'Par 5 Scoring';
    if (normalized.includes('par 3')) return 'Par 3 Scoring';

    return headline.split(':')[0]?.trim() ?? null;
  }

  /**
   * Determines practice priority
   */
  private determinePracticePriority(
    patterns: MinedPattern[],
    causal: CausalRelationship[],
    insights: ComposedInsight[] = []
  ): string {
    const topActionableInsight = insights.find(
      (insight) => (insight.tone === 'urgent' || insight.tone === 'cautionary') && insight.callToAction
    );

    if (topActionableInsight?.callToAction) {
      return topActionableInsight.callToAction;
    }

    // Find highest impact actionable pattern
    const actionablePatterns = patterns
      .filter((p) => p.actionability > 0.5 && p.strokeImpact > 0.3)
      .sort((a, b) => b.strokeImpact * b.actionability - a.strokeImpact * a.actionability);

    const top = actionablePatterns[0];
    if (top) {
      return top.recommendation || 'Address top pattern through focused practice.';
    }

    // Fall back to causal
    const topCausal = causal
      .filter((c) => c.interventionPotential > 0.5)
      .sort((a, b) => b.strength - a.strength)[0];

    if (topCausal) {
      return `Focus on improving ${topCausal.cause} to enhance ${topCausal.effect}.`;
    }

    return 'Continue current practice routine.';
  }

  /**
   * Builds shot-specific reasoning for shot pattern insights
   * Instead of using generic player state reasoning, this creates reasoning
   * that directly relates to the shot pattern data
   */
  private buildShotPatternReasoning(pattern: ShotPattern): Omit<ReasoningResult, 'calibratedConfidence'> {
    const reasoningChain = [];
    let stepNumber = 1;

    // Step 1: Analyze the data sample
    reasoningChain.push({
      stepNumber: stepNumber++,
      type: 'inductive' as const,
      premise: `Analyzed ${pattern.sampleSize} shots from ${pattern.situation.distanceRange.label} distance`,
      inference: `Sample size of ${pattern.sampleSize} provides ${pattern.confidence > 0.8 ? 'high' : pattern.confidence > 0.6 ? 'moderate' : 'limited'} statistical confidence`,
      conclusion: `Pattern is ${pattern.confidence > 0.7 ? 'statistically significant' : 'worth monitoring'}`,
      confidence: pattern.confidence,
      evidence: [
        `${pattern.sampleSize} shots analyzed`,
        `${Math.round(pattern.confidence * 100)}% confidence level`,
      ],
    });

    // Step 2: Analyze primary miss tendency
    const topTendency = pattern.tendencies[0];
    if (topTendency) {
      const pct = Math.round(topTendency.frequency * 100);
      reasoningChain.push({
        stepNumber: stepNumber++,
        type: 'inductive' as const,
        premise: `When missing from this distance, ${pct}% of misses are ${this.formatMissDirection(topTendency.direction)}`,
        inference: pct > 50
          ? 'This is a dominant miss pattern requiring attention'
          : pct > 35
            ? 'This is a notable tendency that can be addressed'
            : 'This is a minor tendency to be aware of',
        conclusion: `Primary miss direction is ${this.formatMissDirection(topTendency.direction)} at ${pct}%`,
        confidence: topTendency.frequency,
        evidence: [
          `${pct}% frequency for ${topTendency.direction}`,
          `Consistency score: ${Math.round(topTendency.consistency * 100)}%`,
        ],
      });
    }

    // Step 3: Analyze dispersion pattern
    reasoningChain.push({
      stepNumber: stepNumber++,
      type: 'deductive' as const,
      premise: `Dispersion pattern is classified as "${pattern.dispersionPattern.replace(/_/g, ' ')}"`,
      inference: this.getDispersionImplication(pattern.dispersionPattern),
      conclusion: this.getDispersionConclusion(pattern.dispersionPattern),
      confidence: 0.85,
      evidence: [
        `Distance control score: ${Math.round(pattern.distanceControlScore * 100)}%`,
        `Average proximity: ${pattern.avgProximity.toFixed(1)} yards`,
      ],
    });

    // Build overall conclusion
    const conclusion = this.buildShotPatternConclusion(pattern);

    return {
      conclusion,
      confidence: pattern.confidence,
      reasoningChain,
      alternatives: [
        {
          explanation: 'Equipment or ball flight characteristics',
          probability: 0.15,
          whyLessLikely: 'Pattern is consistent across multiple rounds',
        },
        {
          explanation: 'Course conditions or wind patterns',
          probability: 0.1,
          whyLessLikely: 'Pattern appears in varying conditions',
        },
      ],
      sensitivities: [
        {
          assumption: 'Miss direction data is accurately recorded',
          ifChanged: 'If recording is inconsistent',
          impactOnConclusion: 'Pattern reliability would decrease',
        },
      ],
    };
  }

  /**
   * Formats miss direction for readable output
   */
  private formatMissDirection(direction: string): string {
    const mapping: Record<string, string> = {
      short: 'short',
      long: 'long',
      left: 'left',
      right: 'right',
      short_left: 'short-left',
      short_right: 'short-right',
      long_left: 'long-left',
      long_right: 'long-right',
    };
    return mapping[direction.toLowerCase()] ?? direction;
  }

  /**
   * Gets the implication of a dispersion pattern
   */
  private getDispersionImplication(dispersion: string): string {
    const implications: Record<string, string> = {
      one_way_right: 'Ball flight or swing path creates consistent right-side misses',
      one_way_left: 'Ball flight or swing path creates consistent left-side misses',
      one_way_short: 'Club selection or swing commitment leads to distance shortfall',
      one_way_long: 'Club selection or swing aggression leads to overshoot',
      scattered: 'Multiple factors are affecting shot consistency',
      tight: 'Shot dispersion is well controlled for this distance',
    };
    return implications[dispersion] ?? 'Analyzing dispersion characteristics';
  }

  /**
   * Gets the conclusion for a dispersion pattern
   */
  private getDispersionConclusion(dispersion: string): string {
    const conclusions: Record<string, string> = {
      one_way_right: 'A predictable miss pattern that can be used for course management',
      one_way_left: 'A predictable miss pattern that can be used for course management',
      one_way_short: 'Distance control requires attention - consider club selection adjustment',
      one_way_long: 'Distance control requires attention - consider club selection adjustment',
      scattered: 'Consistency work needed to tighten shot dispersion',
      tight: 'Distance is well controlled - maintain current approach',
    };
    return conclusions[dispersion] ?? 'Continue monitoring this pattern';
  }

  /**
   * Builds the overall conclusion for a shot pattern
   */
  private buildShotPatternConclusion(pattern: ShotPattern): string {
    const topTendency = pattern.tendencies[0];
    if (!topTendency) {
      return `From ${pattern.situation.distanceRange.label}, your shots show good distribution with no dominant miss pattern.`;
    }

    const pct = Math.round(topTendency.frequency * 100);
    const dir = this.formatMissDirection(topTendency.direction);

    if (pattern.dispersionPattern.startsWith('one_way')) {
      return `From ${pattern.situation.distanceRange.label}, you have a consistent ${dir} miss at ${pct}%. This is a predictable pattern that can be accounted for in course management.`;
    }

    return `From ${pattern.situation.distanceRange.label}, your primary miss is ${dir} at ${pct}%. Focus on swing path and face angle to address this tendency.`;
  }

  /**
   * Fetches comprehensive player stats for insight generation.
   *
   * The engine runs from multiple non-interactive contexts (post-round
   * fire-and-forget, safety-net cron, nightly roster-sweep cron) where
   * no user session/cookies are available. We therefore use the admin-
   * scoped variant which skips the user auth gate — the caller of
   * `analyzePlayer` is already a trusted server-side caller that
   * authorized the player by other means.
   */
  private async fetchPlayerStats(playerId: string): Promise<GolfStats | undefined> {
    if (this._statsCache.has(playerId)) {
      return this._statsCache.get(playerId);
    }
    try {
      // Dynamic import to avoid client/server import issues.
      const { getDetailedStatsAsAdmin } = await import('@/app/golf/actions/stats-data');
      const stats = await getDetailedStatsAsAdmin(playerId, 'overall');
      this._statsCache.set(playerId, stats);
      return stats;
    } catch (error) {
      console.error('[CoachHelm] Error fetching player stats:', error);
      await logServerError(
        `CoachHelm orchestrator failed fetching player stats: ${error instanceof Error ? error.message : String(error)}`,
        { action: 'coachhelm.orchestrator.fetchPlayerStats', featureArea: 'coachhelm', playerId }
      );
      this._statsCache.set(playerId, undefined);
      return undefined;
    }
  }

  /**
   * Generates stats-based insights from comprehensive golf statistics
   * These insights are directly tied to stroke savings and are high priority
   */
  private async generateStatsInsights(
    playerId: string,
    stats: GolfStats,
    playerBaseline?: import('./stats/baselines').PlayerBaseline,
  ): Promise<ComposedInsight[]> {
    const generator = new StatsInsightGenerator(playerId);
    if (playerBaseline) {
      // Task B12: prefer the per-player EWMA baseline when available so
      // insight bodies read "above your average" rather than "below D2 avg".
      generator.setPlayerBaseline(playerBaseline);
    }
    const statsInsights = await generator.generateInsights(stats);

    // Convert stats insights to composed insights format
    return statsInsights.map((insight) => this.convertStatsInsightToComposed(insight));
  }

  /**
   * Generates insights from cross-metric correlations
   * Discovers relationships between metrics that reveal deeper patterns
   */
  private async generateCorrelationInsights(
    playerId: string
  ): Promise<ComposedInsight[]> {
    const insights: ComposedInsight[] = [];

    try {
      const correlationDiscovery = new CorrelationDiscovery(playerId);
      const correlations = await correlationDiscovery.discoverMetricCorrelations();

      // Take top 3 most significant correlations
      for (const correlation of correlations.slice(0, 3)) {
        const composedInsight = this.convertCorrelationToComposed(correlation);
        insights.push(composedInsight);
      }
    } catch (error) {
      console.error('[CoachHelm] Error generating correlation insights:', error);
      await logServerError(
        `CoachHelm orchestrator failed generating correlation insights: ${error instanceof Error ? error.message : String(error)}`,
        { action: 'coachhelm.orchestrator.generateCorrelationInsights', featureArea: 'coachhelm', playerId }
      );
    }

    return insights;
  }

  /**
   * Converts a MetricCorrelation to the ComposedInsight format
   */
  private convertCorrelationToComposed(
    correlation: MetricCorrelation
  ): ComposedInsight {
    // Map significance to tone
    const toneMap: Record<string, ComposedInsight['tone']> = {
      high: correlation.correlation < 0 ? 'cautionary' : 'neutral',
      medium: 'neutral',
      low: 'encouraging',
    };

    // Build reasoning chain
    type ReasoningType = 'inductive' | 'deductive' | 'abductive';
    const reasoningChain: Array<{
      stepNumber: number;
      type: ReasoningType;
      premise: string;
      inference: string;
      conclusion: string;
      confidence: number;
      evidence: string[];
    }> = [
      {
        stepNumber: 1,
        type: 'inductive' as ReasoningType,
        premise: `Analyzed correlation between ${correlation.metricA} and ${correlation.metricB}`,
        inference: `Correlation coefficient of ${correlation.correlation.toFixed(2)} indicates ${
          Math.abs(correlation.correlation) >= 0.6 ? 'strong' :
          Math.abs(correlation.correlation) >= 0.4 ? 'moderate' : 'weak'
        } relationship`,
        conclusion: `${correlation.significance} significance correlation discovered`,
        confidence: Math.abs(correlation.correlation),
        evidence: [
          `r = ${correlation.correlation.toFixed(2)}`,
          `Sample size: ${correlation.sampleSize} rounds`,
          correlation.context || 'Overall analysis',
        ],
      },
      {
        stepNumber: 2,
        type: 'deductive' as ReasoningType,
        premise: `Estimated stroke impact: ${correlation.strokeImpact.toFixed(1)} strokes/round`,
        inference: correlation.strokeImpact > 1
          ? 'This is a significant area affecting scoring'
          : 'This pattern has measurable impact on performance',
        conclusion: `Addressing this correlation could save ${correlation.strokeImpact.toFixed(1)} strokes per round`,
        confidence: Math.min(0.9, Math.abs(correlation.correlation) + 0.2),
        evidence: [`Stroke impact: ${correlation.strokeImpact.toFixed(2)}`],
      },
    ];

    // Create headline from the insight
    const headline = this.createCorrelationHeadline(correlation);

    return {
      headline,
      body: correlation.insight,
      callToAction: correlation.recommendation,
      tone: toneMap[correlation.significance] ?? 'neutral',
      confidence: Math.abs(correlation.correlation),
      reasoning: {
        conclusion: correlation.insight,
        confidence: Math.abs(correlation.correlation),
        calibratedConfidence: Math.abs(correlation.correlation), // Will be calibrated if needed
        reasoningChain,
        alternatives: [],
        sensitivities: [
          {
            assumption: 'Correlation reflects causal relationship',
            ifChanged: 'If confounding variables exist',
            impactOnConclusion: 'Relationship strength may vary',
          },
        ],
      },
    };
  }

  /**
   * Creates a concise headline for a correlation insight
   */
  private createCorrelationHeadline(correlation: MetricCorrelation): string {
    // Generate contextual headlines based on metric types
    if (correlation.metricA.includes('putt') && correlation.metricB.includes('pressure')) {
      return 'Pressure Putting Pattern';
    }
    if (correlation.metricA.includes('gir') && correlation.metricB.includes('score')) {
      return 'Approach Impact on Scoring';
    }
    if (correlation.metricA.includes('fairway') && correlation.metricB.includes('scoring')) {
      return 'Fairway Accuracy Impact';
    }
    if (correlation.metricA.includes('penalty')) {
      return 'Penalty Impact Analysis';
    }
    if (correlation.metricA.includes('three_putt')) {
      return 'Three-Putt Pattern';
    }

    // Default headline
    return `${this.formatMetricName(correlation.metricA)} Correlation`;
  }

  /**
   * Formats a metric name for display
   */
  private formatMetricName(metric: string): string {
    return metric
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace('Gir', 'GIR')
      .replace('Pct', '%');
  }

  /**
   * Converts a StatsInsight to the ComposedInsight format used by the orchestrator
   */
  private convertStatsInsightToComposed(insight: StatsInsight): ComposedInsight {
    // Map priority to tone
    const toneMap: Record<string, ComposedInsight['tone']> = {
      critical: 'urgent',
      high: 'cautionary',
      medium: 'neutral',
      low: 'encouraging',
    };

    // Build reasoning chain from evidence metrics
    type ReasoningType = 'inductive' | 'deductive' | 'abductive';
    const reasoningChain: Array<{
      stepNumber: number;
      type: ReasoningType;
      premise: string;
      inference: string;
      conclusion: string;
      confidence: number;
      evidence: string[];
    }> = insight.evidenceMetrics.map((metric, i) => {
      const hasBenchmark = metric.benchmark !== undefined && metric.benchmark !== null;
      let conclusion: string;
      if (metric.trend) {
        conclusion = `Trend is ${metric.trend}`;
      } else if (hasBenchmark) {
        // Parse numeric value from string for comparison
        const numValue = parseFloat(String(metric.value).replace(/[^0-9.-]/g, ''));
        const gap = !isNaN(numValue) ? numValue - Number(metric.benchmark) : 0;
        conclusion = gap < 0
          ? `${Math.abs(gap).toFixed(1)} below benchmark — area for improvement`
          : gap > 0
            ? `${gap.toFixed(1)} above benchmark — performing well`
            : `At benchmark level`;
      } else {
        conclusion = `Data point from ${insight.category} analysis`;
      }

      return {
        stepNumber: i + 1,
        type: (hasBenchmark ? 'deductive' : 'inductive') as ReasoningType,
        premise: `${metric.label}: ${metric.value}`,
        inference: hasBenchmark
          ? `Benchmark: ${metric.benchmark}${String(metric.value).includes('%') ? '%' : ''}`
          : 'Derived from shot-level data',
        conclusion,
        confidence: insight.confidence,
        evidence: [`${metric.label}: ${metric.value}`],
      };
    });

    // Add stroke impact reasoning step
    if (insight.strokeImpact > 0) {
      reasoningChain.push({
        stepNumber: reasoningChain.length + 1,
        type: 'deductive' as ReasoningType,
        premise: `Estimated stroke impact: ${insight.strokeImpact.toFixed(1)} strokes per round`,
        inference: insight.strokeImpact >= 1.0
          ? 'This is a major area for improvement — fixing this changes scores'
          : insight.strokeImpact >= 0.5
            ? 'This is a significant area for improvement'
            : 'Addressing this would provide incremental gains',
        conclusion: `Potential savings: ${insight.strokeImpact.toFixed(1)} strokes/round`,
        confidence: insight.confidence,
        evidence: [`Stroke impact: ${insight.strokeImpact.toFixed(2)}`],
      });
    }

    // Build structured evidence metrics for direct UI consumption
    const structuredEvidence = insight.evidenceMetrics.map((metric) => {
      const numValue = parseFloat(String(metric.value).replace(/[^0-9.-]/g, ''));
      const hasBenchmark = metric.benchmark !== undefined && metric.benchmark !== null;
      return {
        label: metric.label,
        value: metric.value,
        benchmark: metric.benchmark ?? null,
        trend: metric.trend as 'improving' | 'declining' | 'stable' | undefined,
        belowBenchmark: hasBenchmark && !isNaN(numValue) ? numValue < Number(metric.benchmark) : undefined,
      };
    });

    return {
      headline: insight.headline,
      body: insight.body,
      callToAction: insight.recommendation,
      tone: toneMap[insight.priority] ?? 'neutral',
      confidence: insight.confidence,
      strokeImpact: insight.strokeImpact > 0 ? insight.strokeImpact : undefined,
      evidenceMetrics: structuredEvidence.length > 0 ? structuredEvidence : undefined,
      reasoning: {
        conclusion: `${insight.headline}: ${insight.body}`,
        confidence: insight.confidence,
        calibratedConfidence: insight.confidence,
        reasoningChain,
        alternatives: [],
        sensitivities: [],
      },
    };
  }

  /**
   * Converts a ShotStateInsight into a composed insight.
   * These insights are built from par/lie/yardage baselines and use
   * both before- and after-shot yardage to surface hidden scoring leaks.
   */
  private convertShotStateInsightToComposed(insight: ShotStateInsight): ComposedInsight {
    const toneMap: Record<ShotStateInsight['type'], ComposedInsight['tone']> = {
      state_leak: 'cautionary',
      danger_side: 'urgent',
      lie_penalty: 'cautionary',
    };

    type ReasoningType = 'inductive' | 'deductive' | 'abductive';
    const reasoningChain: Array<{
      stepNumber: number;
      type: ReasoningType;
      premise: string;
      inference: string;
      conclusion: string;
      confidence: number;
      evidence: string[];
    }> = [
      {
        stepNumber: 1,
        type: 'inductive' as ReasoningType,
        premise: 'Compared shot states by par, lie, and yardage window using distance before and after the shot',
        inference: insight.evidence[0] ?? 'A state-specific scoring leak was detected',
        conclusion: insight.headline,
        confidence: insight.confidence,
        evidence: insight.evidence,
      },
      {
        stepNumber: 2,
        type: 'deductive' as ReasoningType,
        premise: `Estimated impact is ${insight.strokeImpact.toFixed(2)} strokes per round`,
        inference: insight.strokeImpact > 0.6
          ? 'This state is a major driver of scoring inefficiency'
          : 'This state creates a measurable but contained scoring tax',
        conclusion: insight.recommendation,
        confidence: insight.confidence,
        evidence: [`Stroke impact: ${insight.strokeImpact.toFixed(2)}`],
      },
    ];

    return {
      headline: insight.headline,
      body: insight.body,
      callToAction: insight.recommendation,
      tone: toneMap[insight.type] ?? 'neutral',
      confidence: insight.confidence,
      strokeImpact: insight.strokeImpact,
      evidenceMetrics: insight.evidence.map((item, index) => ({
        label: index === 0 ? 'Primary evidence' : `Evidence ${index + 1}`,
        value: item,
      })),
      reasoning: {
        conclusion: insight.body,
        confidence: insight.confidence,
        calibratedConfidence: insight.confidence,
        reasoningChain,
        alternatives: [],
        sensitivities: [],
      },
    };
  }

  /**
   * Generates insights from lie-specific analysis (shot category & dispersion)
   * Converts ShotCategoryInsight[] and DispersionInsight[] to ComposedInsight[]
   */
  private generateLieAnalysisInsights(
    lieAnalysis: LieMissAnalysis
  ): ComposedInsight[] {
    const insights: ComposedInsight[] = [];

    // Convert shot category insights
    if (lieAnalysis.shotCategoryAnalysis?.insights) {
      for (const insight of lieAnalysis.shotCategoryAnalysis.insights) {
        insights.push(this.convertShotCategoryInsightToComposed(insight));
      }
    }

    // Convert dispersion insights
    if (lieAnalysis.dispersionAnalysis?.insights) {
      for (const insight of lieAnalysis.dispersionAnalysis.insights) {
        insights.push(this.convertDispersionInsightToComposed(insight));
      }
    }

    // Also convert root cause insights if available
    if (lieAnalysis.rootCauseInsights) {
      for (const insight of lieAnalysis.rootCauseInsights.slice(0, 2)) {
        insights.push(this.convertRootCauseInsightToComposed(insight));
      }
    }

    return insights;
  }

  /**
   * Converts a ShotCategoryInsight to ComposedInsight format
   */
  private convertShotCategoryInsightToComposed(insight: ShotCategoryInsight): ComposedInsight {
    // Map severity to tone
    const toneMap: Record<string, ComposedInsight['tone']> = {
      critical: 'urgent',
      warning: 'cautionary',
      info: 'neutral',
    };

    // Build reasoning chain from evidence
    type ReasoningType = 'inductive' | 'deductive' | 'abductive';
    const reasoningChain: Array<{
      stepNumber: number;
      type: ReasoningType;
      premise: string;
      inference: string;
      conclusion: string;
      confidence: number;
      evidence: string[];
    }> = [
      {
        stepNumber: 1,
        type: 'inductive' as ReasoningType,
        premise: `Analyzed ${insight.category}${insight.bracket ? ` (${insight.bracket.label})` : ''} shot patterns`,
        inference: insight.evidence[0] ?? 'Pattern identified from shot data',
        conclusion: insight.headline,
        confidence: insight.severity === 'critical' ? 0.9 : insight.severity === 'warning' ? 0.75 : 0.6,
        evidence: insight.evidence,
      },
    ];

    // Add stroke impact step if significant
    if (insight.strokeImpact > 0.3) {
      reasoningChain.push({
        stepNumber: 2,
        type: 'deductive' as ReasoningType,
        premise: `Estimated stroke impact: ${insight.strokeImpact.toFixed(1)} strokes/round`,
        inference: insight.strokeImpact > 1
          ? 'This is a high-priority improvement area'
          : 'Addressing this provides measurable improvement',
        conclusion: `Potential savings: ${insight.strokeImpact.toFixed(1)} strokes per round`,
        confidence: 0.8,
        evidence: [`Stroke impact: ${insight.strokeImpact.toFixed(2)}`],
      });
    }

    const confidence = insight.severity === 'critical' ? 0.9 : insight.severity === 'warning' ? 0.75 : 0.6;

    return {
      headline: this.formatCategoryHeadline(insight),
      body: insight.body,
      callToAction: insight.recommendation,
      tone: toneMap[insight.severity] ?? 'neutral',
      confidence,
      strokeImpact: insight.strokeImpact > 0 ? insight.strokeImpact : undefined,
      reasoning: {
        conclusion: insight.body,
        confidence,
        calibratedConfidence: confidence,
        reasoningChain,
        alternatives: [],
        sensitivities: [
          {
            assumption: 'Shot data accurately reflects typical performance',
            ifChanged: 'If data includes unusual rounds or conditions',
            impactOnConclusion: 'Pattern reliability may vary',
          },
        ],
      },
    };
  }

  /**
   * Converts a DispersionInsight to ComposedInsight format
   */
  private convertDispersionInsightToComposed(insight: DispersionInsight): ComposedInsight {
    // Dispersion insights are typically warning-level as they identify scatter patterns
    const tone: ComposedInsight['tone'] = insight.strokeImpact > 1 ? 'cautionary' : 'neutral';

    // Build reasoning chain
    type ReasoningType = 'inductive' | 'deductive' | 'abductive';
    const reasoningChain: Array<{
      stepNumber: number;
      type: ReasoningType;
      premise: string;
      inference: string;
      conclusion: string;
      confidence: number;
      evidence: string[];
    }> = [
      {
        stepNumber: 1,
        type: 'inductive' as ReasoningType,
        premise: `Analyzed dispersion pattern for ${insight.category}${insight.bracket ? ` (${insight.bracket.label})` : ''}`,
        inference: insight.evidence[0] ?? 'Dispersion pattern analyzed',
        conclusion: insight.headline,
        confidence: 0.8,
        evidence: insight.evidence,
      },
    ];

    if (insight.strokeImpact > 0) {
      reasoningChain.push({
        stepNumber: 2,
        type: 'deductive' as ReasoningType,
        premise: `Dispersion inefficiency costs ~${insight.strokeImpact.toFixed(1)} strokes/round`,
        inference: 'Tightening dispersion would reduce bogey/worse outcomes',
        conclusion: `Improving consistency could save ${insight.strokeImpact.toFixed(1)} strokes`,
        confidence: 0.75,
        evidence: [`Stroke impact: ${insight.strokeImpact.toFixed(2)}`],
      });
    }

    return {
      headline: this.formatDispersionHeadline(insight),
      body: insight.body,
      callToAction: insight.recommendation,
      tone,
      confidence: 0.8,
      strokeImpact: insight.strokeImpact > 0 ? insight.strokeImpact : undefined,
      reasoning: {
        conclusion: insight.body,
        confidence: 0.8,
        calibratedConfidence: 0.8,
        reasoningChain,
        alternatives: [
          {
            explanation: 'Equipment or ball flight characteristics',
            probability: 0.15,
            whyLessLikely: 'Pattern persists across multiple rounds',
          },
        ],
        sensitivities: [
          {
            assumption: 'Dispersion measured from target line',
            ifChanged: 'If course setup varies significantly',
            impactOnConclusion: 'Absolute values may shift',
          },
        ],
      },
    };
  }

  /**
   * Converts a RootCauseInsight to ComposedInsight format
   */
  private convertRootCauseInsightToComposed(insight: RootCauseInsight): ComposedInsight {
    // Map confidence to tone
    const tone: ComposedInsight['tone'] = insight.confidence > 0.8 ? 'cautionary' :
      insight.confidence > 0.6 ? 'neutral' : 'encouraging';

    // Build reasoning chain
    type ReasoningType = 'inductive' | 'deductive' | 'abductive';
    const reasoningChain: Array<{
      stepNumber: number;
      type: ReasoningType;
      premise: string;
      inference: string;
      conclusion: string;
      confidence: number;
      evidence: string[];
    }> = [
      {
        stepNumber: 1,
        type: 'abductive' as ReasoningType,
        premise: `Observed consistent pattern across ${insight.affectedLies.join(', ')} lies`,
        inference: `Root cause likely related to ${insight.category.replace('_', ' ')}`,
        conclusion: insight.headline,
        confidence: insight.confidence,
        evidence: insight.evidence,
      },
    ];

    if (insight.strokeImpact > 0) {
      reasoningChain.push({
        stepNumber: 2,
        type: 'deductive' as ReasoningType,
        premise: `This pattern affects scoring by ~${insight.strokeImpact.toFixed(1)} strokes/round`,
        inference: 'Addressing root cause would improve multiple shot types',
        conclusion: insight.recommendation,
        confidence: insight.confidence,
        evidence: [`Stroke impact: ${insight.strokeImpact.toFixed(2)}`],
      });
    }

    return {
      headline: `Root Cause: ${insight.headline}`,
      body: insight.body,
      callToAction: insight.recommendation,
      tone,
      confidence: insight.confidence,
      strokeImpact: insight.strokeImpact > 0 ? insight.strokeImpact : undefined,
      reasoning: {
        conclusion: insight.body,
        confidence: insight.confidence,
        calibratedConfidence: insight.confidence,
        reasoningChain,
        alternatives: [],
        sensitivities: [],
      },
    };
  }

  /**
   * Formats a headline for shot category insights
   */
  private formatCategoryHeadline(insight: ShotCategoryInsight): string {
    const categoryNames: Record<string, string> = {
      driving: 'Driving',
      approach: 'Approach',
      around_green: 'Short Game',
    };

    const category = categoryNames[insight.category] ?? insight.category;

    if (insight.bracket) {
      return `${category} (${insight.bracket.label}): ${insight.headline}`;
    }

    return `${category}: ${insight.headline}`;
  }

  /**
   * Formats a headline for dispersion insights
   */
  private formatDispersionHeadline(insight: DispersionInsight): string {
    const categoryNames: Record<string, string> = {
      driving: 'Driving Dispersion',
      approach: 'Approach Dispersion',
      around_green: 'Short Game Dispersion',
    };

    const category = categoryNames[insight.category] ?? `${insight.category} Dispersion`;

    if (insight.bracket) {
      return `${insight.bracket.label}: ${insight.headline}`;
    }

    return `${category}: ${insight.headline}`;
  }
}

/**
 * Singleton instance of CoachHelmIntelligence
 */
export const coachHelmIntelligence = new CoachHelmIntelligence();
