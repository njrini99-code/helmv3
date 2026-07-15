/**
 * CoachHelm BASEBALL metric registry (W10.2).
 *
 * Replicates the DIRECTION DISCIPLINE of the golf v3 registry
 * (`src/lib/coachhelm/v3/metrics/registry.ts`) — the single highest-risk item in
 * the wave plan:
 *
 *   "Metric DIRECTION mistakes learn backward (velo drop as improvement) —
 *    replicate the registry exactly."
 *
 * EVERY metric declares an EXPLICIT improvement direction so any consumer
 * reasoning about whether a change is an *improvement* resolves it from ONE
 * source — never by inferring sign from a raw `post − baseline` delta. A drop in
 * pitch velocity is NOT an improvement; a drop in two-strike chase rate IS.
 *
 * Unlike golf (where a `golf_metrics` DB table is the runtime source of truth),
 * baseball has no metrics table — these literals ARE the source of truth.
 *
 * #379 reconciliation note: these ids are derived from box-score/season and
 * event-grain columns (the CANONICAL read layers documented in
 * `docs/baseball/stats-architecture.md`) whenever a caller has migrated its
 * fetch onto them; `loaders.ts` transparently falls back to the legacy
 * flat/aggregate layer's box-score-style columns for callers that haven't
 * migrated yet (see `src/lib/baseball/stat-layer-manifest.ts` for the current
 * migration backlog — `loaders.ts` itself stays grandfathered there until
 * every caller feeds it canonical rows). Either way the derivation is honest
 * but coarse (no true pitch-level tracking backs most of these ids yet — see
 * loaders.ts's confidence recalibration), so several metrics are explicitly
 * labelled `proxy`.
 */

export const BASEBALL_METRIC_IDS = [
  // --- Plate discipline / approach (hitting) -------------------------------
  // Strikeout rate = strikeouts / plate appearances. Lower is better.
  'k_rate',
  // Walk rate = walks / plate appearances. Higher is better.
  'bb_rate',
  // K/BB ratio (command of the strike zone for a HITTER). Lower is better.
  'hitter_k_bb_ratio',
  // Two-strike chase proxy: share of strikeouts that are likely chases,
  // inferred from K-rate spikes vs the player's own baseline. Lower is better.
  // PROXY — box score has no pitch-by-pitch chase data.
  'two_strike_chase_pct',

  // --- Production (hitting) ------------------------------------------------
  // Batting average. Higher is better.
  'batting_avg',
  // On-base proxy ((H+BB+HBP)/(AB+BB+HBP+SF)). Higher is better.
  'on_base_pct',
  // Slugging proxy (total bases / AB). Higher is better.
  'slugging_pct',

  // --- Contact quality (hitting, sensor-optional) --------------------------
  // Average exit velocity (mph). Higher is better.
  'avg_exit_velocity',
  // Max exit velocity (mph) — ceiling indicator. Higher is better.
  'max_exit_velocity',

  // --- Game-vs-practice (mental / transfer) --------------------------------
  // Game average minus practice average. A NEGATIVE gap (worse in games) is the
  // problem; we register the metric as the SIGNED gap and treat higher (less
  // negative / positive) as better.
  'game_practice_avg_delta',

  // --- Command (pitching) --------------------------------------------------
  // Strikeouts thrown per walk allowed. Higher is better.
  'pitcher_k_bb_ratio',
  // Walks allowed per inning. Lower is better (command decay signal).
  'walks_per_inning',
  // Strike percentage (strikes_thrown / pitches_thrown). Higher is better.
  'strike_pct',
  // Earned run average. Lower is better.
  'era',

  // --- Stuff (pitching, sensor-optional) -----------------------------------
  // Average pitch velocity (mph). Higher is better — and a DROP is a decay
  // signal, never an improvement (the canonical "learn backward" trap).
  'avg_pitch_velocity',
  // Max pitch velocity (mph). Higher is better.
  'max_pitch_velocity',

  // --- Workload (health) ---------------------------------------------------
  // Pitches thrown in a rolling window. There is NO "better" here — workload is
  // monitored against a safe ceiling, not optimized. Registered as
  // `neutral_threshold` so attribution NEVER treats more or fewer pitches as an
  // improvement; only the workload generator's ceiling logic interprets it.
  'rolling_pitch_count',
  // Innings pitched in a rolling window. Same neutral-threshold treatment.
  'rolling_innings',

  // --- Readiness / wellness (health, V10) ----------------------------------
  // Self-reported soreness 1-5 (5 = most sore). NEUTRAL_THRESHOLD: this is an
  // OPERATIONAL flag monitored against a ceiling, NEVER scored as an athletic
  // "improvement", and NEVER a medical diagnosis. Only the readiness generator
  // interprets it, and always with the "operational flag, not medical" caveat.
  'soreness_level',
  // Self-reported energy 1-5 (5 = best). Higher reads better, but it is still a
  // self-report — registered neutral_threshold so it can never drive an
  // athletic-improvement attribution; the readiness generator reads the floor.
  'energy_level',
  // Sleep hours. neutral_threshold for the same self-report reason.
  'sleep_hours',
  // Arm-status escalation (fresh<normal<tight<sore<pain), encoded 0-4.
  // neutral_threshold — an operational pitcher-readiness flag, never medical.
  'arm_status_level',

  // --- Strength / lift (performance, V10) ----------------------------------
  // Completed assignments / assigned (compliance). Higher is better.
  'lift_completion_rate',
  // Rolling avg RPE on completed lifts. neutral_threshold: a SPIKE is the
  // flagged condition (fatigue/over-reach), not "higher = better/worse".
  'lift_rpe_avg',

  // --- Practice (operations / effectiveness, V10) --------------------------
  // Share of a practice's attendees marked present (vs absent/limited/excused).
  // Higher is better.
  'practice_attendance_rate',
  // Movement of a focus metric AFTER a practice block targeting it, expressed as
  // an improvement-signed delta. Higher is better (positive = it moved the right
  // way). The effectiveness generator owns its honesty caveats.
  'practice_focus_movement',

  // --- Import quality (operations, V10) ------------------------------------
  // Share of import rows that carried a warning/error. Lower is better.
  'import_warning_rate',

  // --- Video evidence coverage (operations, V10) ---------------------------
  // Share of active diagnostic insights that have at least one linked clip.
  // Higher is better (more evidence-backed). PROXY — coverage, not quality.
  'video_evidence_coverage',

  // =========================================================================
  // V6 §Pattern Generators / V10 §Generator Families — DEEPENING THE CATALOG.
  // The five box-score generators + the six V10 ops families covered only
  // hitting(2)/pitching(1)/strength/ops. V10 line 243 + lines 353-383 RE-MANDATE
  // catching/defense/baserunning families with named metrics. These ids back
  // those families. They derive from the elite stat-EVENT tables (pitch events,
  // catching events, fielding events, baserunning events) that already exist
  // (migration 20260624000080) — NOT new box-score columns. Source-starved
  // metrics simply never load (the loaders degrade honestly), so a team with no
  // event data sees no false catching/defense signals.
  // =========================================================================

  // --- Hitting (deepened to the V6 12) -------------------------------------
  // RISP (runners-in-scoring-position) batting average MINUS overall average.
  // A NEGATIVE gap (worse with RISP) is the concern; registered as the signed
  // gap, higher (less negative) is better. Needs PA-level base_state context.
  'hitter_risp_avg_delta',
  // Share of FIRST-PITCH plate appearances the hitter took a strike (passive on
  // a hittable first pitch). Lower is better. Needs pitch-event count context.
  'hitter_first_pitch_take_rate',
  // In-zone contact rate (1 − whiff-on-in-zone-swings). A DECLINE is the
  // concern; higher is better. Needs pitch events with is_in_zone + is_whiff.
  'hitter_zone_contact_rate',
  // Game exit-velocity MINUS cage/practice exit-velocity. A negative gap (cage
  // EV not translating) is the concern; higher is better. Needs batted-ball EV.
  'hitter_game_cage_ev_gap',
  // Pull-side ground-ball (rollover) share of batted balls. Higher = more
  // rollover = worse; lower is better. Needs batted-ball spray + type.
  'hitter_pull_rollover_rate',

  // --- Pitching (deepened to the V6 12) ------------------------------------
  // First-pitch strike rate. Lower is the concern (falling behind); higher is
  // better. Needs pitch events with count_state.
  'pitcher_first_pitch_strike_rate',
  // Two-strike putaway rate = strikeouts / two-strike counts reached. Lower is
  // the concern (can't finish hitters); higher is better.
  'pitcher_two_strike_putaway_rate',
  // Velocity decay: late-window avg velo MINUS early-window avg velo within an
  // outing (negative = velo dropped late). A negative drop is the concern;
  // higher (no drop) is better. The canonical 'learn backward' guard applies —
  // a velo DROP is never an improvement. Needs pitch-event pitch_number + velo.
  'pitcher_velo_inning_decay',
  // Handedness split: opponent OPS-proxy vs the WORSE-platoon side MINUS the
  // better side (how exploitable one platoon side is). Higher gap = worse; lower
  // is better. Needs pitch/PA events with batter_handedness.
  'pitcher_handedness_split',
  // Pitch-mix predictability: share of the most-used pitch type in the most
  // common count bucket (one-dimensional in fastball counts). Higher = more
  // predictable = worse; lower is better. Needs pitch events with pitch_type.
  'pitcher_pitch_mix_predictability',

  // --- Catching (entirely new family — V10 named metrics) ------------------
  // Recent innings caught in a rolling window (workload). neutral_threshold —
  // monitored against a ceiling, never 'better'. V10: catcher_recent_innings_caught.
  'catcher_recent_innings_caught',
  // Throw accuracy on stolen-base/throwdown attempts (share accurate). Lower is
  // the concern; higher is better. V10: catcher_throw_accuracy.
  'catcher_throw_accuracy',
  // Pop time (sec, catch-to-tag) on throwdowns. Lower is better (a RISE is the
  // concern). PROXY-ish without a calibrated baseline → proxy fidelity.
  'catcher_pop_time',
  // Block-miss rate = misses / blockable balls. Lower is better.
  'catcher_block_miss_rate',
  // Run-game vulnerability: opponent stolen-base SUCCESS rate against this
  // catcher. Lower is better.
  'catcher_run_game_risk',

  // --- Defense (entirely new family) ---------------------------------------
  // Error-cluster rate = errors / fielding chances in the rolling window. Lower
  // is better. V10: defense_error_cluster_rate.
  'defense_error_cluster_rate',
  // Routine-play reliability = routine chances converted / routine chances.
  // Lower is the concern (booting routine plays); higher is better.
  'defense_routine_reliability',
  // Throwing accuracy on defensive throws (share accurate). Lower is the
  // concern; higher is better.
  'defense_throw_accuracy',
  // Bunt/PFP execution success rate on pitcher-fielding-practice-type plays.
  // Lower is the concern; higher is better.
  'defense_bunt_pfp_execution',

  // --- Baserunning (entirely new family — V10 named metric) ----------------
  // Outs-on-bases rate = baserunning outs (TOOTBLAN/CS-on-decision) / baserunning
  // opportunities. Lower is better. V10: baserunning_out_rate.
  'baserunning_out_rate',
  // Extra-base-taken rate = extra bases taken / extra-base opportunities. Lower
  // is the concern (passive baserunning); higher is better.
  'baserunning_extra_base_rate',
  // Caught-stealing decision-risk = poor-decision CS / steal attempts (bad jump /
  // bad read, NOT just being thrown out on a good jump). Lower is better.
  'baserunning_cs_decision_risk',
  // First-to-third aggressiveness = first-to-third taken / first-to-third
  // opportunities. Lower is the concern (station-to-station); higher is better.
  'baserunning_first_to_third_rate',

  // --- Class / operations (entirely new family — V6 §Class/operations) -----
  // Count of class sessions / availability conflicts overlapping a scheduled
  // practice block. neutral_threshold — a count monitored against a ceiling.
  // V10: class_conflict_count.
  'class_conflict_count',
  // Share of assigned actions/tasks/videos the player has NOT acknowledged.
  // Higher is the concern (no acknowledgement); lower is better.
  'missing_acknowledgement_rate',
  // Days since the player's profile/roster/source data last updated (staleness).
  // Higher is the concern; lower is better. neutral_threshold (a staleness clock,
  // not an athletic outcome).
  'stale_source_days',
  // Share of player-visible assigned items the player has not VIEWED (distinct
  // from not-acknowledged — they may not even be seeing them). Higher is the
  // concern; lower is better.
  'tasks_unseen_rate',
] as const;

/** Literal-union of every baseball metric id. */
export type BaseballMetricId = (typeof BASEBALL_METRIC_IDS)[number];



/** Type-narrowing guard. */
export function isBaseballMetricId(s: string): s is BaseballMetricId {
  return (BASEBALL_METRIC_IDS as readonly string[]).includes(s);
}

/**
 * Improvement direction for a metric.
 *
 *  - 'higher_better'     — bigger raw value is the better outcome.
 *  - 'lower_better'      — smaller raw value is the better outcome.
 *  - 'neutral_threshold' — there is NO "improvement" direction; the metric is
 *    monitored against a safe ceiling (workload). Attribution must NEVER score a
 *    change in either direction as an improvement; only the owning generator's
 *    threshold logic interprets it. This is the baseball-specific guard against
 *    the "learn backward" trap for load metrics.
 */
export type BaseballMetricDirection =
  | 'higher_better'
  | 'lower_better'
  | 'neutral_threshold';

/** Unit of a metric value (for diagnosis drivers + rendering). */
export type BaseballMetricUnit =
  | 'percent'
  | 'ratio'
  | 'count'
  | 'mph'
  | 'innings'
  | 'avg'; // batting-average-style 3-decimal rate

/** Whether a metric is a direct measurement or an honest proxy. */
export type BaseballMetricFidelity = 'measured' | 'proxy' | 'sensor_optional';

/**
 * Coaching domain a metric belongs to (V10 — drives generator ownership,
 * role-relevance ranking, and surface grouping). Mirrors the V10 spec domains
 * pared to what box-score + lite tables can honestly support today.
 */
export type BaseballMetricDomain =
  | 'hitting'
  | 'pitching'
  | 'catching'
  | 'defense'
  | 'baserunning'
  | 'workload'
  | 'readiness'
  | 'performance' // strength / lift
  | 'practice'
  | 'academics' // class conflicts, academic risk
  | 'operations'; // import quality, video coverage, schedule, staleness, acks

interface BaseballMetricMeta {
  direction: BaseballMetricDirection;
  unit: BaseballMetricUnit;
  fidelity: BaseballMetricFidelity;
  /** Coaching domain (V10). */
  domain: BaseballMetricDomain;
  /**
   * EXPLICIT minimum observation count before a generator may emit a non-thin
   * signal on this metric. The wave plan's #2 risk (false 'high' on tiny
   * rosters) is closed here: below `min_sample` a generator must hold the
   * priority to at most 'low'. Recalibrated for baseball roster reality, NOT
   * golf-round scale. This is the registry-level companion to the loader's
   * confidence haircut — sample governs PRESENTABILITY, confidence governs the
   * NUMBER. (Set 1 for deterministic/rolling-window metrics that are honest at
   * a single observation, e.g. workload + schedule overlap.)
   */
  min_sample: number;
  /**
   * EXPLICIT activation threshold — the value at which the owning generator's
   * concern fires. Direction-aware: for `lower_better` the concern is value ≥
   * threshold (e.g. K-rate ≥ 0.28); for `higher_better` it is value ≤ threshold
   * (e.g. strike% ≤ 0.58); for `neutral_threshold` it is the ceiling/floor the
   * owning generator compares against (e.g. soreness ≥ 4). Centralizing the
   * threshold here (vs scattered literals in generators) is the registry
   * discipline the V10 spec mandates ("direction + min-sample + threshold").
   */
  threshold: number;
  /** Short human label. */
  label: string;
  /**
   * ROLE VISIBILITY FLOOR (V10 §"Role visibility is tested", delta-doc line 280;
   * the gap's registry contract "metric_key → … role visibility").
   *
   * Whether a SUBJECT PLAYER is EVER eligible to see a signal whose primary metric
   * is this one. This is a registry-level FLOOR, not the final decision: the final
   * player visibility is strictest-wins between (a) this floor and (b) the source-
   * ref visibility resolved per signal (playerVisibleFor). A metric with
   * `player_eligible: false` is staff-only coaching/scouting intelligence the
   * player should never be handed raw, EVEN IF a particular signal's underlying
   * source ref happened to be team/player_only — e.g. opponent-exploitability
   * scouting (handedness split, pitch-mix predictability, run-game vulnerability),
   * raw error-cluster/defensive-reliability call-outs, pop-time grades, and the
   * health/operational flags that are coach-judgment surfaces, not player metrics.
   *
   * Performance + plate-discipline + production + the player's own contact-quality
   * and lift-compliance metrics ARE player-eligible (true): they are the athlete's
   * own development record. The floor never WIDENS visibility — it can only keep a
   * source-visible signal staff-only, never the reverse.
   */
  player_eligible: boolean;
}

/**
 * The canonical per-metric metadata table. EXHAUSTIVE over BaseballMetricId via
 * `Record<BaseballMetricId, …>` so adding an id without a direction is a compile
 * error — the registry can never silently omit a direction.
 *
 * CRITICAL (mirrors golf P0-01): outcome/attribution code resolves direction
 * HERE and multiplies the raw delta by the improvement sign. It must never infer
 * sign from a raw delta.
 */
export const BASEBALL_METRIC_META: Record<BaseballMetricId, BaseballMetricMeta> = {
  // Plate discipline / approach — the player's OWN development record → eligible.
  k_rate: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'hitting', min_sample: 8, threshold: 0.28, label: 'Strikeout rate', player_eligible: true },
  bb_rate: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'hitting', min_sample: 8, threshold: 0.06, label: 'Walk rate', player_eligible: true },
  hitter_k_bb_ratio: { direction: 'lower_better', unit: 'ratio', fidelity: 'measured', domain: 'hitting', min_sample: 8, threshold: 3.0, label: 'Hitter K/BB', player_eligible: true },
  two_strike_chase_pct: { direction: 'lower_better', unit: 'percent', fidelity: 'proxy', domain: 'hitting', min_sample: 10, threshold: 0.28, label: 'Two-strike chase (proxy)', player_eligible: true },

  // Production — the competitive record the athlete owns → eligible.
  batting_avg: { direction: 'higher_better', unit: 'avg', fidelity: 'measured', domain: 'hitting', min_sample: 10, threshold: 0.25, label: 'Batting average', player_eligible: true },
  on_base_pct: { direction: 'higher_better', unit: 'avg', fidelity: 'proxy', domain: 'hitting', min_sample: 10, threshold: 0.33, label: 'On-base % (proxy)', player_eligible: true },
  slugging_pct: { direction: 'higher_better', unit: 'avg', fidelity: 'proxy', domain: 'hitting', min_sample: 10, threshold: 0.38, label: 'Slugging % (proxy)', player_eligible: true },

  // Contact quality — the player's own batted-ball record → eligible.
  avg_exit_velocity: { direction: 'higher_better', unit: 'mph', fidelity: 'sensor_optional', domain: 'hitting', min_sample: 6, threshold: 88, label: 'Avg exit velocity', player_eligible: true },
  max_exit_velocity: { direction: 'higher_better', unit: 'mph', fidelity: 'sensor_optional', domain: 'hitting', min_sample: 6, threshold: 95, label: 'Max exit velocity', player_eligible: true },

  // Game vs practice — concern is a NEGATIVE gap (game well below practice). The
  // player benefits from owning the transfer gap → eligible.
  game_practice_avg_delta: { direction: 'higher_better', unit: 'avg', fidelity: 'measured', domain: 'hitting', min_sample: 8, threshold: -0.05, label: 'Game − practice avg', player_eligible: true },

  // Pitching command — the pitcher's own command record → eligible.
  pitcher_k_bb_ratio: { direction: 'higher_better', unit: 'ratio', fidelity: 'measured', domain: 'pitching', min_sample: 5, threshold: 1.5, label: 'Pitcher K/BB', player_eligible: true },
  walks_per_inning: { direction: 'lower_better', unit: 'ratio', fidelity: 'measured', domain: 'pitching', min_sample: 5, threshold: 0.6, label: 'Walks per inning', player_eligible: true },
  strike_pct: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'pitching', min_sample: 5, threshold: 0.58, label: 'Strike %', player_eligible: true },
  era: { direction: 'lower_better', unit: 'ratio', fidelity: 'measured', domain: 'pitching', min_sample: 5, threshold: 5.0, label: 'ERA', player_eligible: true },

  // Pitching stuff — DROP IS NOT IMPROVEMENT. The pitcher's own velo → eligible.
  avg_pitch_velocity: { direction: 'higher_better', unit: 'mph', fidelity: 'sensor_optional', domain: 'pitching', min_sample: 4, threshold: 85, label: 'Avg pitch velocity', player_eligible: true },
  max_pitch_velocity: { direction: 'higher_better', unit: 'mph', fidelity: 'sensor_optional', domain: 'pitching', min_sample: 4, threshold: 90, label: 'Max pitch velocity', player_eligible: true },

  // Workload — a HEALTH/SAFETY judgment surface a coach owns; a raw "workload risk"
  // handed to a player drives self-medication, not development → STAFF-ONLY floor.
  rolling_pitch_count: { direction: 'neutral_threshold', unit: 'count', fidelity: 'measured', domain: 'workload', min_sample: 1, threshold: 100, label: 'Rolling pitch count', player_eligible: false },
  rolling_innings: { direction: 'neutral_threshold', unit: 'innings', fidelity: 'measured', domain: 'workload', min_sample: 1, threshold: 7, label: 'Rolling innings', player_eligible: false },

  // Readiness / wellness (V10) — operational coach-judgment flags, NEVER medical
  // and never a player-facing metric → STAFF-ONLY floor.
  soreness_level: { direction: 'neutral_threshold', unit: 'count', fidelity: 'measured', domain: 'readiness', min_sample: 2, threshold: 4, label: 'Soreness (1-5)', player_eligible: false },
  energy_level: { direction: 'neutral_threshold', unit: 'count', fidelity: 'measured', domain: 'readiness', min_sample: 2, threshold: 2, label: 'Energy (1-5)', player_eligible: false },
  sleep_hours: { direction: 'neutral_threshold', unit: 'count', fidelity: 'measured', domain: 'readiness', min_sample: 2, threshold: 6, label: 'Sleep hours', player_eligible: false },
  arm_status_level: { direction: 'neutral_threshold', unit: 'count', fidelity: 'measured', domain: 'readiness', min_sample: 1, threshold: 3, label: 'Arm-status escalation', player_eligible: false },

  // Strength / lift (V10) — completion is the player's own accountability metric
  // (eligible); RPE-spike is a fatigue judgment the staff interprets (staff-only).
  lift_completion_rate: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'performance', min_sample: 3, threshold: 0.7, label: 'Lift completion rate', player_eligible: true },
  lift_rpe_avg: { direction: 'neutral_threshold', unit: 'ratio', fidelity: 'measured', domain: 'performance', min_sample: 3, threshold: 8.5, label: 'Avg lift RPE', player_eligible: false },

  // Practice (V10) — coaching/operations effectiveness, not a player metric.
  practice_attendance_rate: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'practice', min_sample: 2, threshold: 0.8, label: 'Practice attendance rate', player_eligible: false },
  practice_focus_movement: { direction: 'higher_better', unit: 'avg', fidelity: 'measured', domain: 'practice', min_sample: 2, threshold: 0, label: 'Practice focus movement', player_eligible: false },

  // Operations (V10) — data-quality / coverage are staff ops surfaces.
  import_warning_rate: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'operations', min_sample: 1, threshold: 0.15, label: 'Import warning rate', player_eligible: false },
  video_evidence_coverage: { direction: 'higher_better', unit: 'percent', fidelity: 'proxy', domain: 'operations', min_sample: 1, threshold: 0.5, label: 'Video evidence coverage', player_eligible: false },

  // --- Hitting (deepened) ---------------------------------------------------
  // RISP context is event-derived → proxy until PA-level base-state coverage is
  // dense. Concern is a negative gap (worse with RISP); higher (less negative)
  // is better, threshold -0.05 mirrors the game-vs-practice gap discipline.
  // The hitter's own approach metrics → player-eligible.
  hitter_risp_avg_delta: { direction: 'higher_better', unit: 'avg', fidelity: 'proxy', domain: 'hitting', min_sample: 8, threshold: -0.05, label: 'RISP − overall avg', player_eligible: true },
  hitter_first_pitch_take_rate: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'hitting', min_sample: 12, threshold: 0.55, label: 'First-pitch take rate', player_eligible: true },
  hitter_zone_contact_rate: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'hitting', min_sample: 15, threshold: 0.82, label: 'In-zone contact rate', player_eligible: true },
  hitter_game_cage_ev_gap: { direction: 'higher_better', unit: 'mph', fidelity: 'sensor_optional', domain: 'hitting', min_sample: 8, threshold: -3, label: 'Game − cage exit velo', player_eligible: true },
  hitter_pull_rollover_rate: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'hitting', min_sample: 12, threshold: 0.35, label: 'Pull-side rollover rate', player_eligible: true },

  // --- Pitching (deepened) --------------------------------------------------
  // A pitcher's own execution metrics are player-eligible; the two that describe
  // how OPPONENTS can EXPLOIT him (handedness split, pitch-mix predictability) are
  // staff-only SCOUTING intelligence — surfaced raw they teach a player to be
  // self-conscious, not to improve, and they are competitive-prep, not a metric.
  pitcher_first_pitch_strike_rate: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'pitching', min_sample: 20, threshold: 0.58, label: 'First-pitch strike rate', player_eligible: true },
  pitcher_two_strike_putaway_rate: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'pitching', min_sample: 12, threshold: 0.2, label: 'Two-strike putaway rate', player_eligible: true },
  // Velo decay is the canonical learn-backward trap: a DROP is never better.
  // higher_better on the signed (late − early) delta means a negative drop is
  // the flagged condition. sensor_optional (needs per-pitch velo). The pitcher's
  // own fatigue curve is part of his development record → eligible.
  pitcher_velo_inning_decay: { direction: 'higher_better', unit: 'mph', fidelity: 'sensor_optional', domain: 'pitching', min_sample: 15, threshold: -1.5, label: 'Velo decay within outing', player_eligible: true },
  pitcher_handedness_split: { direction: 'lower_better', unit: 'ratio', fidelity: 'proxy', domain: 'pitching', min_sample: 20, threshold: 0.25, label: 'Handedness split gap', player_eligible: false },
  pitcher_pitch_mix_predictability: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'pitching', min_sample: 20, threshold: 0.8, label: 'Pitch-mix predictability', player_eligible: false },

  // --- Catching -------------------------------------------------------------
  // Innings caught = workload → neutral_threshold (ceiling-monitored, never
  // 'better') AND a health/availability judgment surface → staff-only. Pop time
  // is an unvalidated proxy GRADE (staff scouting). Run-game vulnerability is
  // opponent-exploitability scouting → staff-only. The catcher's own throw/block
  // EXECUTION rates are his development record → eligible.
  catcher_recent_innings_caught: { direction: 'neutral_threshold', unit: 'innings', fidelity: 'measured', domain: 'catching', min_sample: 1, threshold: 25, label: 'Recent innings caught', player_eligible: false },
  catcher_throw_accuracy: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'catching', min_sample: 6, threshold: 0.7, label: 'Catcher throw accuracy', player_eligible: true },
  catcher_pop_time: { direction: 'lower_better', unit: 'ratio', fidelity: 'proxy', domain: 'catching', min_sample: 5, threshold: 2.05, label: 'Pop time (s)', player_eligible: false },
  catcher_block_miss_rate: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'catching', min_sample: 8, threshold: 0.15, label: 'Block-miss rate', player_eligible: true },
  catcher_run_game_risk: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'catching', min_sample: 6, threshold: 0.75, label: 'Run-game SB success allowed', player_eligible: false },

  // --- Defense --------------------------------------------------------------
  // Raw error-cluster + routine-reliability call-outs are coach-judgment surfaces
  // (a player shown "you boot 12% of routine plays" gets paralyzed, not better) →
  // staff-only. The fielder's own throw/PFP EXECUTION rates are eligible.
  defense_error_cluster_rate: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'defense', min_sample: 10, threshold: 0.12, label: 'Error rate (chances)', player_eligible: false },
  defense_routine_reliability: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'defense', min_sample: 10, threshold: 0.92, label: 'Routine-play reliability', player_eligible: false },
  defense_throw_accuracy: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'defense', min_sample: 8, threshold: 0.85, label: 'Defensive throw accuracy', player_eligible: true },
  defense_bunt_pfp_execution: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'defense', min_sample: 5, threshold: 0.7, label: 'Bunt/PFP execution', player_eligible: true },

  // --- Baserunning ----------------------------------------------------------
  // Outs-on-bases and CS-decision-risk are coach-judgment / instruction surfaces
  // (decision quality the coach corrects in person) → staff-only. The runner's
  // own aggressiveness/extra-base rates are eligible development metrics.
  baserunning_out_rate: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'baserunning', min_sample: 8, threshold: 0.12, label: 'Outs-on-bases rate', player_eligible: false },
  baserunning_extra_base_rate: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'baserunning', min_sample: 8, threshold: 0.4, label: 'Extra-base-taken rate', player_eligible: true },
  baserunning_cs_decision_risk: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'baserunning', min_sample: 6, threshold: 0.3, label: 'CS decision-risk rate', player_eligible: false },
  baserunning_first_to_third_rate: { direction: 'higher_better', unit: 'percent', fidelity: 'measured', domain: 'baserunning', min_sample: 6, threshold: 0.45, label: 'First-to-third rate', player_eligible: true },

  // --- Class / operations ---------------------------------------------------
  // Conflict count is a deterministic count against a ceiling → neutral_threshold,
  // and an operations/academics coordination surface staff resolve → staff-only.
  class_conflict_count: { direction: 'neutral_threshold', unit: 'count', fidelity: 'measured', domain: 'academics', min_sample: 1, threshold: 1, label: 'Class/practice conflicts', player_eligible: false },
  missing_acknowledgement_rate: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'operations', min_sample: 3, threshold: 0.4, label: 'Unacknowledged-action rate', player_eligible: false },
  // Staleness is a clock, not an athletic outcome → neutral_threshold (a change
  // in either direction is never an athletic improvement); threshold is the days
  // ceiling past which data is considered stale. A staff data-ops surface.
  stale_source_days: { direction: 'neutral_threshold', unit: 'count', fidelity: 'measured', domain: 'operations', min_sample: 1, threshold: 21, label: 'Days since data refresh', player_eligible: false },
  tasks_unseen_rate: { direction: 'lower_better', unit: 'percent', fidelity: 'measured', domain: 'operations', min_sample: 3, threshold: 0.5, label: 'Unseen-task rate', player_eligible: false },
};

/**
 * Resolve the improvement direction for ANY metric id. Unknown ids return
 * 'neutral_threshold' as the SAFE default for baseball: with no direction signal
 * we must NOT score a change as an improvement in either direction (a wrong sign
 * is worse than no sign for a coach-facing tool). This differs deliberately from
 * golf's 'higher_better' default because golf's unknown ids never reach the
 * weight update, whereas baseball attribution is younger and we choose the
 * conservative no-op.
 */
export function getBaseballMetricDirection(metricId: string): BaseballMetricDirection {
  const meta = (BASEBALL_METRIC_META as Record<string, BaseballMetricMeta | undefined>)[metricId];
  return meta ? meta.direction : 'neutral_threshold';
}

/**
 * Sign multiplier turning a raw `post − baseline` delta into an *improvement*
 * magnitude: `+1` when higher is better, `-1` when lower is better, `0` for a
 * neutral-threshold metric (so a workload change can NEVER be scored as an
 * improvement). Multiply the raw delta by this before any "did it get better?"
 * reasoning.
 */
export function baseballImprovementSign(metricId: string): 1 | -1 | 0 {
  switch (getBaseballMetricDirection(metricId)) {
    case 'higher_better':
      return 1;
    case 'lower_better':
      return -1;
    case 'neutral_threshold':
      return 0;
  }
}

/** Lookup the unit for a metric (defaults to 'count' for unknowns). */
export function getBaseballMetricUnit(metricId: string): BaseballMetricUnit {
  return (BASEBALL_METRIC_META as Record<string, BaseballMetricMeta | undefined>)[metricId]?.unit ?? 'count';
}

/** Lookup the fidelity for a metric (defaults to 'proxy' for unknowns — honest). */
export function getBaseballMetricFidelity(metricId: string): BaseballMetricFidelity {
  return (BASEBALL_METRIC_META as Record<string, BaseballMetricMeta | undefined>)[metricId]?.fidelity ?? 'proxy';
}

/** Human label for a metric (defaults to the id). */
export function getBaseballMetricLabel(metricId: string): string {
  return (BASEBALL_METRIC_META as Record<string, BaseballMetricMeta | undefined>)[metricId]?.label ?? metricId;
}

/** Coaching domain for a metric (defaults to 'operations' for unknowns). */
export function getBaseballMetricDomain(metricId: string): BaseballMetricDomain {
  return (BASEBALL_METRIC_META as Record<string, BaseballMetricMeta | undefined>)[metricId]?.domain ?? 'operations';
}

/**
 * Minimum observation count before a generator may present a non-thin signal on
 * this metric (V10). Defaults to a CONSERVATIVE 8 for unknowns — a new metric
 * with no declared min-sample must not auto-present as confident.
 */
export function getBaseballMetricMinSample(metricId: string): number {
  return (BASEBALL_METRIC_META as Record<string, BaseballMetricMeta | undefined>)[metricId]?.min_sample ?? 8;
}

/** Centralized activation threshold for a metric (V10). NaN for unknowns. */
export function getBaseballMetricThreshold(metricId: string): number {
  return (BASEBALL_METRIC_META as Record<string, BaseballMetricMeta | undefined>)[metricId]?.threshold ?? Number.NaN;
}

/**
 * Direction-aware "is this value past the concern threshold?" test (V10). The
 * single place generators ask "does this metric warrant a signal?" so the
 * comparison sense is resolved from the registry, NEVER hand-coded per call:
 *   - lower_better      → concern when value ≥ threshold (e.g. K-rate too high)
 *   - higher_better     → concern when value ≤ threshold (e.g. strike% too low)
 *   - neutral_threshold → concern when value ≥ threshold (a ceiling breach;
 *     energy/sleep floors are handled by their owning generator, which can read
 *     the threshold directly via getBaseballMetricThreshold).
 */
export function baseballMetricBreachesThreshold(metricId: string, value: number): boolean {
  const t = getBaseballMetricThreshold(metricId);
  if (!Number.isFinite(t)) return false;
  switch (getBaseballMetricDirection(metricId)) {
    case 'lower_better':
      return value >= t;
    case 'higher_better':
      return value <= t;
    case 'neutral_threshold':
      return value >= t;
  }
}

/**
 * Registry-level thin-sample gate (V10, wave risk #2). Returns true when a
 * sample is below the metric's declared `min_sample`, meaning a generator MUST
 * cap its priority to at most 'low' (a thin band can never present as 'high').
 * This is the registry companion to the loader's fidelity confidence haircut.
 */
export function isBaseballSampleThin(metricId: string, sampleN: number): boolean {
  return sampleN < getBaseballMetricMinSample(metricId);
}

/**
 * ROLE-VISIBILITY FLOOR resolver (V10 §"Role visibility is tested").
 *
 * Is a SUBJECT PLAYER ever eligible to see a signal whose primary metric is this
 * one? Defaults to FALSE for an UNKNOWN id — the conservative posture: a metric
 * with no declared role visibility must NOT auto-flow to a player (a wrong "yes"
 * leaks coaching/scouting/health intelligence; a wrong "no" merely keeps it in
 * the staff inbox where the source drawer still shows it). This mirrors the
 * registry's other safe-default discipline (`neutral_threshold` direction,
 * `proxy` fidelity for unknowns).
 */
export function getBaseballMetricPlayerEligible(metricId: string): boolean {
  return (BASEBALL_METRIC_META as Record<string, BaseballMetricMeta | undefined>)[metricId]?.player_eligible ?? false;
}

/**
 * Strictest-wins ROLE VISIBILITY for a metric-anchored signal: combine the
 * registry's per-metric player-eligibility FLOOR with the visibility the signal's
 * SOURCE REFS already resolved (source-level visibility, e.g. from
 * `strictestVisibility`). A player may see the signal ONLY when BOTH allow it:
 *
 *   playerVisible = registryFloorAllowsPlayer  AND  sourceRefsAllowPlayer
 *
 * The floor can only NARROW visibility (a staff-only metric can never be widened
 * to the player by a permissive source ref); it never widens it. Passing
 * `sourceAllowsPlayer=true` with an unknown/staff-only metric yields false — the
 * conservative result. This is the single helper every surface (generators,
 * snapshot writer, signal mapper) should call so "who can see this metric" is
 * resolved from ONE place, exactly as the metric DIRECTION is.
 */
export function baseballMetricPlayerVisible(
  metricId: string,
  sourceAllowsPlayer: boolean,
): boolean {
  return getBaseballMetricPlayerEligible(metricId) && sourceAllowsPlayer;
}
