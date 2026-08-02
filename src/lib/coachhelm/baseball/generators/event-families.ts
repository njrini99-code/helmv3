/**
 * CoachHelm BASEBALL event-grain generator families — catching / defense /
 * baserunning + the deepened hitting/pitching generators.
 *
 * WHY THIS FILE EXISTS
 *   The W10 skeleton + V10 ops families shipped 11 generators across only
 *   hitting(2)/pitching(1)/strength/operations. V10 line 243 + lines 353-383
 *   RE-MANDATE catching, defense, and baserunning generator FAMILIES with named
 *   metrics (catcher_recent_innings_caught, catcher_throw_accuracy,
 *   defense_error_cluster_rate, baserunning_out_rate), and the V6 spec lists 12
 *   hitting + 12 pitching generators. These were absent. This module builds them
 *   on the elite stat-EVENT loaders (loaders-events.ts) over tables that already
 *   exist (migration 20260624000080).
 *
 * CONTRACT — IDENTICAL to generators/index.ts (the wave-risk discipline):
 *   - direction + threshold resolved from the REGISTRY via
 *     baseballMetricBreachesThreshold (NEVER hand-coded sense, NEVER inferred
 *     from a raw delta — the #1 wave risk; a velo-decay or pop-time DROP is never
 *     scored as an improvement);
 *   - confidence taken VERBATIM from the loader (fidelity-capped, roster-
 *     recalibrated) — generators never re-invent confidence;
 *   - priority through BOTH the shared confidence gate (`gate`) AND the registry
 *     thin-sample clamp (`clampThinSample`) before any 'high' ships (wave risk #2:
 *     false 'high' on tiny rosters);
 *   - structured, sourced Diagnosis with an HONEST causality_level: a rate
 *     computed from RECORDED events is an observed_sequence for the rate itself,
 *     but the ROOT-CAUSE attribution (why the rate is high) is a hypothesis — so
 *     these carry inferred_hypothesis exactly like the box-score five, with the
 *     symptom stated as the measured fact and the cause stated as a hypothesis;
 *   - catcher workload (innings caught) is neutral_threshold → a recorded count,
 *     observed_sequence, like the pitching workload generator.
 *
 * Pure functions. The action persists; no DB, no side effects.
 */

import type { Diagnosis, InsightPriority } from '@/lib/coachhelm/shared/evidence-types';
import { buildConfidenceReason } from '@/lib/coachhelm/shared/base-generator';
import {
  baseballMetricBreachesThreshold,
  getBaseballMetricThreshold,
  type BaseballMetricId,
} from '../metrics/registry';
import type { LoadedMetric, LoadedPlayerMetrics } from '../loaders';
import {
  type BaseballInsightCandidate,
  driver,
  buildEvidence,
  playerVisibleFor,
  gate,
  clampThinSample,
  pct,
  r2,
} from './index';

// -----------------------------------------------------------------------------
// Shared rate-generator factory.
//
// Every event-family generator follows the SAME shape: read one registry metric,
// fire ONLY when it breaches the registry threshold (direction-aware), grade
// severity by how far past threshold, gate + clamp, and emit one candidate with
// a structured diagnosis. Centralizing this guarantees all 17 new generators
// obey the honesty contract identically — a generator can never accidentally
// hand-code the wrong comparison sense or skip a gate.
// -----------------------------------------------------------------------------

interface RateGeneratorSpec {
  /** Stable generator id (dedupe-key prefix + generated_by). */
  generator: string;
  /** insight_type — MUST match the AI regex; we prefix 'coachhelm_'. */
  insightType: string;
  /** The single registry metric this generator reads. */
  metric: BaseballMetricId;
  /** Card title. */
  title: string;
  /**
   * Severity step-thresholds measured as |value − registry threshold| in the
   * CONCERN direction. `high` and `medium` are the cut points; below `medium` →
   * low. Expressed as absolute magnitudes past the threshold.
   */
  severity: { high: number; medium: number };
  /** Build the human symptom from the breached metric. */
  symptom: (m: LoadedMetric) => string;
  /** Hypothesized root cause (a hypothesis, never asserted as fact). */
  rootCause: string;
  /** Coaching action. */
  action: string;
  /** Short body for the card. */
  body: (m: LoadedMetric) => string;
}

function rateGenerator(spec: RateGeneratorSpec) {
  return (player: LoadedPlayerMetrics): BaseballInsightCandidate[] => {
    const m = player.metrics[spec.metric];
    if (!m || m.value == null) return [];
    // Registry-resolved, direction-aware threshold test — the ONLY place the
    // concern sense is decided. Never hand-coded per generator.
    if (!baseballMetricBreachesThreshold(spec.metric, m.value)) return [];

    const confidence = m.confidence;
    // Magnitude past threshold in the concern direction (registry threshold).
    const breach = Math.abs(m.value - getBaseballMetricThreshold(spec.metric));
    const rawPriority: InsightPriority =
      breach >= spec.severity.high ? 'high' : breach >= spec.severity.medium ? 'medium' : 'low';
    const priority = clampThinSample(gate(rawPriority, confidence), spec.metric, m.sample_n);

    const diagnosis: Diagnosis = {
      symptom: spec.symptom(m),
      root_cause: spec.rootCause,
      // The RATE is measured, but the cause is a hypothesis → inferred_hypothesis
      // (identical honesty to the box-score five).
      causality_level: 'inferred_hypothesis',
      drivers: [driver(m)],
      recommended_action: spec.action,
      confidence_reason: buildConfidenceReason({ sample_n: m.sample_n, confidence_factors: m.confidence_factors }),
    };

    return [
      {
        generator: spec.generator,
        playerId: player.playerId,
        insightType: spec.insightType,
        title: spec.title,
        body: spec.body(m),
        priority,
        confidence,
        // Role-visibility floor: the deepened catching/defense/baserunning/pitching
        // families include staff-only scouting + coach-judgment metrics (handedness
        // split, pitch-mix predictability, run-game risk, error-cluster, pop time,
        // outs-on-bases, CS-decision-risk). Passing m.metric AND-s the registry's
        // per-metric player_eligible floor in so those never leak to a player even
        // if a source ref happened to permit it (strictest-wins).
        playerVisible: playerVisibleFor(m.source_refs, m.metric),
        evidence: buildEvidence(m, diagnosis, 'inferred_hypothesis'),
      },
    ];
  };
}

// =============================================================================
// HITTING (deepened) — first-pitch take, zone-contact decline, pull rollover,
// game-vs-cage EV gap, RISP gap.
// =============================================================================

const hitterFirstPitchTakeGenerator = rateGenerator({
  generator: 'hitter_first_pitch_take',
  insightType: 'coachhelm_hitter_first_pitch_take',
  metric: 'hitter_first_pitch_take_rate',
  title: 'Passive on hittable first pitches',
  severity: { high: 0.2, medium: 0.1 },
  symptom: (m) => `Taking ${pct(m.value!)} of hittable first pitches for strikes over ${m.sample_n} tracked first pitches.`,
  rootCause:
    'Likely a passive early-count approach — giving away a hittable pitch and falling behind. A hypothesis from pitch-tracking counts, not a swing-decision study.',
  action: 'First-pitch BP rounds with a green-light on the in-zone fastball; reward aggressive, on-time swings on hittable first pitches.',
  body: (m) => `Taking ${pct(m.value!)} of hittable first pitches. Hunting the early-count strike will cut deep counts.`,
});

export const hitterZoneContactGenerator = rateGenerator({
  generator: 'hitter_zone_contact_decline',
  insightType: 'coachhelm_hitter_zone_contact',
  metric: 'hitter_zone_contact_rate',
  title: 'In-zone contact slipping',
  severity: { high: 0.1, medium: 0.04 },
  symptom: (m) => `In-zone contact rate of ${pct(m.value!)} over ${m.sample_n} in-zone swings — below the contact-quality line.`,
  rootCause:
    'Whiffing on pitches in the zone points to timing or swing-path issues rather than chase. Hypothesis from pitch-tracking; confirm with swing video.',
  action: 'Timing + on-plane work: high-tee and machine rounds at game velo, with a contact-in-zone goal before chasing exit-velo gains.',
  body: (m) => `Only ${pct(m.value!)} in-zone contact. Whiffing strikes in the zone — timing/path work needed.`,
});

const hitterPullRolloverGenerator = rateGenerator({
  generator: 'hitter_pull_rollover',
  insightType: 'coachhelm_hitter_pull_rollover',
  metric: 'hitter_pull_rollover_rate',
  title: 'Pull-side rollover trend',
  severity: { high: 0.15, medium: 0.07 },
  symptom: (m) => `${pct(m.value!)} of batted balls are pull-side ground balls over ${m.sample_n} batted balls.`,
  rootCause:
    'Rolling over the top of the ball to the pull side — often early bat-head or casting. A batted-ball-spray pattern, not a mechanics measurement.',
  action: 'Oppo-gap BP and stay-through-the-ball drills; track GB-pull share next block to confirm the pattern is shrinking.',
  body: (m) => `${pct(m.value!)} pull-side ground balls. Rolling over — oppo-direction work will flatten the spray.`,
});

const hitterGameCageEvGapGenerator = rateGenerator({
  generator: 'hitter_game_cage_ev_gap',
  insightType: 'coachhelm_hitter_ev_gap',
  metric: 'hitter_game_cage_ev_gap',
  title: 'Cage EV not translating to games',
  severity: { high: 4, medium: 2 },
  symptom: (m) => `Game exit velocity is ${r2(Math.abs(m.value!))} mph below cage exit velocity across the tracked window.`,
  rootCause:
    'Exit-velo earned in the cage is not showing up in games — usually a pressure/timing transfer gap, not a strength gap. Hypothesis from paired EV samples.',
  action: 'Live ABs and game-velo machine work with EV tracked in-game; build the cage routine to mirror game timing and intent.',
  body: (m) => `Game EV ${r2(Math.abs(m.value!))} mph under cage EV. Power isn't transferring — add game-like reps.`,
});

const hitterRispGapGenerator = rateGenerator({
  generator: 'hitter_risp_gap',
  insightType: 'coachhelm_hitter_risp_gap',
  metric: 'hitter_risp_avg_delta',
  title: 'RISP approach gap',
  severity: { high: 0.08, medium: 0.04 },
  symptom: (m) => `Batting average with runners in scoring position is ${Math.round(Math.abs(m.value!) * 1000)} points below overall average.`,
  rootCause:
    'Production drops with RISP — most often an over-aggressive or anxious approach in run-scoring spots rather than a mechanical change. Proxy from base-state-tagged PAs.',
  action: 'Situational hitting with consequences in practice; a consistent RISP pre-pitch routine to keep the same approach as bases-empty.',
  body: (m) => `RISP avg ${Math.round(Math.abs(m.value!) * 1000)} pts below overall. Approach tightens up with runners on.`,
});

// =============================================================================
// PITCHING (deepened) — first-pitch strike, two-strike putaway, velo decay,
// handedness split, pitch-mix predictability.
// =============================================================================

const pitcherFirstPitchStrikeGenerator = rateGenerator({
  generator: 'pitcher_first_pitch_strike',
  insightType: 'coachhelm_pitcher_first_pitch_strike',
  metric: 'pitcher_first_pitch_strike_rate',
  title: 'First-pitch strike rate low',
  severity: { high: 0.08, medium: 0.04 },
  symptom: (m) => `Throwing first-pitch strikes only ${pct(m.value!)} of the time over ${m.sample_n} tracked first pitches.`,
  rootCause:
    'Falling behind 1-0 too often puts the pitcher in hitter counts. A pitch-tracking rate; the why (tempo, conviction, command) needs a bullpen look.',
  action: 'Bullpen work dedicated to strike-one with the fastball to both halves; chart first-pitch-strike % the next outing as the success metric.',
  body: (m) => `${pct(m.value!)} first-pitch strikes. Getting ahead 0-1 changes every at-bat.`,
});

const pitcherTwoStrikePutawayGenerator = rateGenerator({
  generator: 'pitcher_two_strike_putaway',
  insightType: 'coachhelm_pitcher_putaway',
  metric: 'pitcher_two_strike_putaway_rate',
  title: 'Two-strike putaway problem',
  severity: { high: 0.08, medium: 0.04 },
  symptom: (m) => `Finishing only ${pct(m.value!)} of two-strike counts with a strikeout over ${m.sample_n} two-strike pitches.`,
  rootCause:
    'Reaching two strikes but not putting hitters away — often nibbling or a missing chase pitch. A pitch-tracking rate; confirm the putaway-pitch usage.',
  action: 'Two-strike sequencing in bullpens: a defined putaway pitch + chase location; track putaway rate next outing.',
  body: (m) => `${pct(m.value!)} two-strike putaway. Hitters are escaping two-strike counts.`,
});

export const pitcherVeloDecayGenerator = rateGenerator({
  generator: 'pitcher_velo_decay',
  insightType: 'coachhelm_pitcher_velo_decay',
  metric: 'pitcher_velo_inning_decay',
  title: 'Velo dropping within outings',
  severity: { high: 1.5, medium: 0.5 },
  symptom: (m) => `Average velocity drops ${r2(Math.abs(m.value!))} mph from early to late pitches within outings.`,
  // NOTE: registry direction is higher_better on the SIGNED (late−early) delta,
  // so the breach test fires on a NEGATIVE drop — a velo decline is NEVER scored
  // as an improvement (the canonical learn-backward guard).
  rootCause:
    'Velocity fading late in outings can signal conditioning or workload fatigue — NOT a mechanical fix to force. A measured per-pitch trend; screen workload before mechanics.',
  action: 'Review recent workload and pitch counts; build late-outing conditioning. Confirm the drop is fatigue, not effort, before any mechanical change.',
  body: (m) => `Velo fades ${r2(Math.abs(m.value!))} mph late in outings. Check workload/conditioning first.`,
});

const pitcherHandednessSplitGenerator = rateGenerator({
  generator: 'pitcher_handedness_split',
  insightType: 'coachhelm_pitcher_handedness_split',
  metric: 'pitcher_handedness_split',
  title: 'Exploitable platoon split',
  severity: { high: 0.18, medium: 0.1 },
  symptom: (m) => `Whiff rate differs ${pct(m.value!)} between L and R hitters over the tracked sample — one platoon side is far more comfortable.`,
  rootCause:
    'A large platoon gap means one handedness sees the ball well — usually a missing weapon to that side. A pitch-tracking proxy (whiff gap), not full platoon-OPS.',
  action: 'Add or sharpen the pitch that plays to the weaker side (e.g. a changeup to opposite-hand hitters); plan sequencing by handedness.',
  body: (m) => `${pct(m.value!)} whiff-rate gap L vs R. One platoon side is exploitable — add a weapon to that side.`,
});

const pitcherPitchMixGenerator = rateGenerator({
  generator: 'pitcher_pitch_mix_predictability',
  insightType: 'coachhelm_pitcher_pitch_mix',
  metric: 'pitcher_pitch_mix_predictability',
  title: 'Predictable in fastball counts',
  severity: { high: 0.12, medium: 0.06 },
  symptom: (m) => `Throwing one pitch type ${pct(m.value!)} of the time in fastball counts over ${m.sample_n} such pitches.`,
  rootCause:
    'One-dimensional in hitter counts lets hitters sit on a pitch. A pitch-usage rate; the fix is sequencing, not stuff.',
  action: 'Build an off-speed-in-fastball-counts plan in bullpens; chart pitch usage by count to confirm the mix is less predictable.',
  body: (m) => `${pct(m.value!)} one pitch in fastball counts. Hitters can sit — vary the mix in hitter counts.`,
});

// =============================================================================
// CATCHING — pop time, block-miss cluster, run-game risk, throw accuracy,
// workload (innings caught).
// =============================================================================

const catcherThrowAccuracyGenerator = rateGenerator({
  generator: 'catcher_throw_accuracy',
  insightType: 'coachhelm_catcher_throw_accuracy',
  metric: 'catcher_throw_accuracy',
  title: 'Throwdown accuracy low',
  severity: { high: 0.15, medium: 0.07 },
  symptom: (m) => `Accurate on ${pct(m.value!)} of throwdowns over ${m.sample_n} attempts.`,
  rootCause:
    'Inconsistent transfer/footwork on throws to bases. A recorded accuracy rate; the mechanical cause needs a throwing-station look.',
  action: 'Transfer + footwork throwing station; track throwdown accuracy weekly. Pair with the run-game risk signal if both are firing.',
  body: (m) => `${pct(m.value!)} throwdown accuracy. Transfer/footwork station will tighten the throws.`,
});

export const catcherPopTimeGenerator = rateGenerator({
  generator: 'catcher_pop_time',
  insightType: 'coachhelm_catcher_pop_time',
  metric: 'catcher_pop_time',
  title: 'Pop time slow',
  severity: { high: 0.2, medium: 0.08 },
  symptom: (m) => `Average pop time of ${r2(m.value!)}s over ${m.sample_n} throwdowns — above the run-control line.`,
  rootCause:
    'A slow pop time gives the running game an edge. A timing measurement (proxy without a calibrated radar baseline); transfer + exchange are the usual levers.',
  action: 'Exchange-speed drills (clean transfer, quick footwork); re-time pop after a focused block to confirm improvement.',
  body: (m) => `Pop time ${r2(m.value!)}s. Faster exchange will protect against the run game.`,
});

const catcherBlockMissGenerator = rateGenerator({
  generator: 'catcher_block_miss',
  insightType: 'coachhelm_catcher_block_miss',
  metric: 'catcher_block_miss_rate',
  title: 'Block-miss cluster',
  severity: { high: 0.12, medium: 0.06 },
  symptom: (m) => `Missing ${pct(m.value!)} of blockable balls over ${m.sample_n} block chances.`,
  rootCause:
    'Blocking misses let runners advance in key spots. A recorded miss rate; positioning/anticipation are the usual causes — confirm by pitch type/location.',
  action: 'Blocking station emphasizing down-and-arm-side reads; success = block control in the tagged zone. Link the highest-leverage misses to video.',
  body: (m) => `${pct(m.value!)} block-miss rate. Blocking station on the problem zone.`,
});

const catcherRunGameGenerator = rateGenerator({
  generator: 'catcher_run_game_risk',
  insightType: 'coachhelm_catcher_run_game',
  metric: 'catcher_run_game_risk',
  title: 'Run-game vulnerability',
  severity: { high: 0.12, medium: 0.06 },
  symptom: (m) => `Opponents are successful on ${pct(m.value!)} of steal attempts against this catcher over ${m.sample_n} attempts.`,
  rootCause:
    'A high SB-success rate combines pop time, accuracy, and pitcher times-to-plate — a battery problem, not only the catcher. A recorded success rate.',
  action: 'Address as a battery: catcher exchange + pitcher slide-step/hold work; review the pitcher-catcher pairing signal alongside this.',
  body: (m) => `${pct(m.value!)} SB success allowed. Work the battery (pop + pitcher holds) together.`,
});

const catcherWorkloadGenerator = rateGenerator({
  generator: 'catcher_workload',
  insightType: 'coachhelm_catcher_workload',
  metric: 'catcher_recent_innings_caught',
  title: 'Catcher workload high',
  severity: { high: 10, medium: 4 },
  symptom: (m) => `Caught ${r2(m.value!)} innings in the last 7 days — above the rolling workload ceiling.`,
  rootCause:
    'Accumulated catching workload raises soreness and injury risk and degrades throwing/blocking late in games. A recorded count, monitored against a ceiling.',
  action: 'Plan a partial or full day at DH/off; rotate the backup catcher before the next heavy stretch. Confirm the rolling innings before the next start.',
  body: (m) => `${r2(m.value!)} innings caught in 7 days — over the ceiling. Plan a catching rest day.`,
});

// =============================================================================
// DEFENSE — error cluster, routine reliability, throw accuracy, bunt/PFP.
// =============================================================================

export const defenseErrorClusterGenerator = rateGenerator({
  generator: 'defense_error_cluster',
  insightType: 'coachhelm_defense_error_cluster',
  metric: 'defense_error_cluster_rate',
  title: 'Error cluster',
  severity: { high: 0.1, medium: 0.05 },
  symptom: (m) => `Committing errors on ${pct(m.value!)} of fielding chances over ${m.sample_n} chances.`,
  rootCause:
    'A cluster of errors above the chance-rate line. A recorded rate; whether it is fielding vs throwing (and which position) drives the drill — break it down by type.',
  action: 'Targeted infield/outfield reps by the dominant error type (fielding vs throwing); track error rate over the next two weeks.',
  body: (m) => `${pct(m.value!)} error rate. Break down by type and rep the dominant failure.`,
});

const defenseRoutineReliabilityGenerator = rateGenerator({
  generator: 'defense_routine_reliability',
  insightType: 'coachhelm_defense_routine',
  metric: 'defense_routine_reliability',
  title: 'Routine plays unreliable',
  severity: { high: 0.08, medium: 0.04 },
  symptom: (m) => `Converting only ${pct(m.value!)} of routine chances over ${m.sample_n} routine plays.`,
  rootCause:
    'Routine plays are the floor of defense — booting them costs more than missing hard plays. A recorded conversion rate; usually focus/footwork, not range.',
  action: 'High-rep routine-ball circuits with game tempo; emphasize footwork and a clean transfer before any range work.',
  body: (m) => `${pct(m.value!)} routine-play reliability. Lock down the floor with high-rep routine circuits.`,
});

const defenseThrowAccuracyGenerator = rateGenerator({
  generator: 'defense_throw_accuracy',
  insightType: 'coachhelm_defense_throw_accuracy',
  metric: 'defense_throw_accuracy',
  title: 'Defensive throws off-line',
  severity: { high: 0.1, medium: 0.05 },
  symptom: (m) => `Accurate on ${pct(m.value!)} of defensive throws over ${m.sample_n} throws.`,
  rootCause:
    'Off-line throws turn outs into extra bases. A recorded accuracy rate; footwork and arm slot are the usual levers — confirm by play type.',
  action: 'Throwing-accuracy station (set feet, consistent slot, target work); track throw accuracy by play type.',
  body: (m) => `${pct(m.value!)} throw accuracy. Footwork + arm-slot station will straighten the throws.`,
});

const defenseBuntPfpGenerator = rateGenerator({
  generator: 'defense_bunt_pfp',
  insightType: 'coachhelm_defense_bunt_pfp',
  metric: 'defense_bunt_pfp_execution',
  title: 'Bunt/PFP execution gap',
  severity: { high: 0.15, medium: 0.07 },
  symptom: (m) => `Executing bunt/PFP plays at ${pct(m.value!)} over ${m.sample_n} reps.`,
  rootCause:
    'Bunt-defense and pitcher-fielding plays are rep-and-communication driven; a low rate is usually a practice-volume gap, not talent. A recorded success rate.',
  action: 'Add a weekly bunt-defense / PFP block with assigned coverages and verbal communication; track execution to a team target.',
  body: (m) => `${pct(m.value!)} bunt/PFP execution. Add a weekly PFP block with assigned coverages.`,
});

// =============================================================================
// BASERUNNING — outs-on-bases, extra-base-missed, CS decision risk, 1st-to-3rd.
// =============================================================================

export const baserunningOutRateGenerator = rateGenerator({
  generator: 'baserunning_out_rate',
  insightType: 'coachhelm_baserunning_out_rate',
  metric: 'baserunning_out_rate',
  title: 'Outs-on-bases risk',
  severity: { high: 0.1, medium: 0.05 },
  symptom: (m) => `Making outs on the bases ${pct(m.value!)} of the time over ${m.sample_n} baserunning opportunities.`,
  rootCause:
    'Running into outs erases offense. A recorded out rate; usually reads/decisions rather than speed — confirm by event type (advance vs steal).',
  action: 'Baserunning reads + decision work (secondary leads, picking up the ball/coach); review the outs with the player.',
  body: (m) => `${pct(m.value!)} outs-on-bases. Reads/decisions work will keep the line moving.`,
});

const baserunningExtraBaseGenerator = rateGenerator({
  generator: 'baserunning_extra_base',
  insightType: 'coachhelm_baserunning_extra_base',
  metric: 'baserunning_extra_base_rate',
  title: 'Passive on the bases',
  severity: { high: 0.15, medium: 0.07 },
  symptom: (m) => `Taking the extra base on only ${pct(m.value!)} of opportunities over ${m.sample_n} chances.`,
  rootCause:
    'Leaving extra bases on the table costs scoring chances. A recorded take-rate; usually aggressiveness/reads, balanced against the out-rate signal.',
  action: 'Aggressive-but-smart baserunning reps (turns at first, reading outfielder depth/arm); pair with the out-rate signal so aggression stays controlled.',
  body: (m) => `${pct(m.value!)} extra-base rate. Smarter aggression on turns will add 90 feet.`,
});

const baserunningCsDecisionGenerator = rateGenerator({
  generator: 'baserunning_cs_decision',
  insightType: 'coachhelm_baserunning_cs_decision',
  metric: 'baserunning_cs_decision_risk',
  title: 'Caught-stealing decision risk',
  severity: { high: 0.15, medium: 0.07 },
  symptom: (m) => `${pct(m.value!)} of steal attempts ended in a poor-decision caught stealing over ${m.sample_n} attempts.`,
  rootCause:
    'Bad jumps/reads on steals — distinct from being thrown out on a good jump. A recorded decision-flagged CS rate; green-light discipline is the lever.',
  action: 'Jump/read work and clearer green-light rules by count/pitcher; review the poor-decision steals on video with the player.',
  body: (m) => `${pct(m.value!)} poor-decision CS. Tighten green-light rules and rep the jump.`,
});

const baserunningFirstToThirdGenerator = rateGenerator({
  generator: 'baserunning_first_to_third',
  insightType: 'coachhelm_baserunning_first_to_third',
  metric: 'baserunning_first_to_third_rate',
  title: 'Station-to-station first-to-third',
  severity: { high: 0.15, medium: 0.07 },
  symptom: (m) => `Going first-to-third on only ${pct(m.value!)} of opportunities over ${m.sample_n} chances.`,
  rootCause:
    'Not pushing first-to-third leaves runs on the bases. A recorded take-rate; reads off the bat and outfielder positioning are the usual levers.',
  action: 'First-to-third reads in baserunning practice (ball in front vs behind, outfielder arm); set a team take-rate target.',
  body: (m) => `${pct(m.value!)} first-to-third rate. Reads off the bat will turn singles into scoring position.`,
});

// =============================================================================
// Registry of the deepened event-family generators + their ids/types.
// =============================================================================

/** Every per-player event-family generator the engine runs. */
const BASEBALL_EVENT_FAMILY_GENERATORS = [
  // hitting (deepened)
  hitterFirstPitchTakeGenerator,
  hitterZoneContactGenerator,
  hitterPullRolloverGenerator,
  hitterGameCageEvGapGenerator,
  hitterRispGapGenerator,
  // pitching (deepened)
  pitcherFirstPitchStrikeGenerator,
  pitcherTwoStrikePutawayGenerator,
  pitcherVeloDecayGenerator,
  pitcherHandednessSplitGenerator,
  pitcherPitchMixGenerator,
  // catching
  catcherThrowAccuracyGenerator,
  catcherPopTimeGenerator,
  catcherBlockMissGenerator,
  catcherRunGameGenerator,
  catcherWorkloadGenerator,
  // defense
  defenseErrorClusterGenerator,
  defenseRoutineReliabilityGenerator,
  defenseThrowAccuracyGenerator,
  defenseBuntPfpGenerator,
  // baserunning
  baserunningOutRateGenerator,
  baserunningExtraBaseGenerator,
  baserunningCsDecisionGenerator,
  baserunningFirstToThirdGenerator,
] as const;

/** Run every event-family generator for one player. */
export function runBaseballEventFamilyGenerators(
  player: LoadedPlayerMetrics,
): BaseballInsightCandidate[] {
  const out: BaseballInsightCandidate[] = [];
  for (const g of BASEBALL_EVENT_FAMILY_GENERATORS) out.push(...g(player));
  return out;
}

export const BASEBALL_EVENT_FAMILY_INSIGHT_TYPES = [
  'coachhelm_hitter_first_pitch_take',
  'coachhelm_hitter_zone_contact',
  'coachhelm_hitter_pull_rollover',
  'coachhelm_hitter_ev_gap',
  'coachhelm_hitter_risp_gap',
  'coachhelm_pitcher_first_pitch_strike',
  'coachhelm_pitcher_putaway',
  'coachhelm_pitcher_velo_decay',
  'coachhelm_pitcher_handedness_split',
  'coachhelm_pitcher_pitch_mix',
  'coachhelm_catcher_throw_accuracy',
  'coachhelm_catcher_pop_time',
  'coachhelm_catcher_block_miss',
  'coachhelm_catcher_run_game',
  'coachhelm_catcher_workload',
  'coachhelm_defense_error_cluster',
  'coachhelm_defense_routine',
  'coachhelm_defense_throw_accuracy',
  'coachhelm_defense_bunt_pfp',
  'coachhelm_baserunning_out_rate',
  'coachhelm_baserunning_extra_base',
  'coachhelm_baserunning_cs_decision',
  'coachhelm_baserunning_first_to_third',
] as const;
