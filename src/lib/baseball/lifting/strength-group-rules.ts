// =============================================================================
// src/lib/baseball/lifting/strength-group-rules.ts
//
// V11 Strength-group DYNAMIC RULE ENGINE (spec L177-198). Evaluates the 11 rule
// inputs against a per-player attribute snapshot and returns exactly the set of
// included players — the same engine powers the live preview (before save) and
// the recompute-on-save path that writes membership + audit rows.
//
// PURE + DETERMINISTIC: no I/O here. The read model assembles each player's
// `PlayerRuleAttributes` (one scoped pass over roster + workload + readiness +
// lift history); this module turns rule_json + attributes -> { included, reasons }.
// Separating the math from the fetch keeps it unit-testable and lets the preview
// and the commit path share one source of truth (no drift between "what you saw"
// and "what got saved").
//
// HONESTY: a predicate the player has no data for does NOT silently include them.
// AND-mode treats missing data as "does not match" (a soreness rule can't fire on
// a player who never checked in); the reason strings cite the matched predicate so
// the coach sees WHY each athlete is in the preview.
// =============================================================================

import type {
  BaseballStrengthGroupRules,
  BaseballAvailabilityStatus,
} from '@/lib/types/baseball-lifting-v11';

/** The per-player snapshot the engine evaluates rules against. */
export interface PlayerRuleAttributes {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  /** Latest staff-set availability status, if any. */
  availability_status: BaseballAvailabilityStatus | null;
  /** Sum of pitch_count over the lookback window (pitchers). */
  recent_pitch_count: number;
  /** Count of games appeared/started over the lookback window. */
  recent_game_starts: number;
  /** Max reported soreness severity on the latest check-in (0-10), or null. */
  latest_soreness_severity: number | null;
  /** Latest bodyweight in lbs (entries or profile fallback), or null. */
  bodyweight_lbs: number | null;
  /** Derived training age in years from grad_year, or null when unknown. */
  training_age_years: number | null;
  /** Whether the player has an incomplete (assigned/missed) lift in the window. */
  has_incomplete_lift: boolean;
  /** Whether the player completed a lift in the window. */
  has_completed_lift: boolean;
}

export interface RuleMatch {
  player_id: string;
  /** Human-readable reasons the player matched (each cites a predicate). */
  reasons: string[];
}

export interface RuleEvaluation {
  /** Players that satisfy the rule (sorted by last name). */
  matches: RuleMatch[];
  /** Player ids in match order (the membership set to persist). */
  included_ids: string[];
  /** True when the rule has no active predicates (matches nobody by design). */
  empty_rule: boolean;
}

const DEFAULT_LOOKBACK = 14;

/** Normalize a position code for comparison (P covers RHP/LHP/SP/RP). */
function positionMatches(target: string, playerPos: string | null): boolean {
  if (!playerPos) return false;
  const p = playerPos.trim().toUpperCase();
  const t = target.trim().toUpperCase();
  if (p === t) return true;
  // A 'P' target matches any pitcher code.
  if (t === 'P') return /^(P|RHP|LHP|SP|RP)$/.test(p);
  return false;
}

/**
 * Decide whether one player matches a rule, collecting a reason per matched
 * predicate. `match: 'all'` (default) requires every active predicate; `'any'`
 * requires at least one. Returns null when the player does not match.
 */
function evaluatePlayer(
  rule: BaseballStrengthGroupRules,
  a: PlayerRuleAttributes,
): RuleMatch | null {
  // Hard overrides first — coach-selected always wins over predicates.
  if (rule.always_exclude_player_ids?.includes(a.player_id)) return null;
  if (rule.always_include_player_ids?.includes(a.player_id)) {
    return { player_id: a.player_id, reasons: ['Coach-selected (always include)'] };
  }

  const mode = rule.match ?? 'all';
  const lookback = rule.lookback_days ?? DEFAULT_LOOKBACK;
  const results: Array<{ active: boolean; matched: boolean; reason: string }> = [];

  // 1. Position --------------------------------------------------------------
  if (rule.positions?.length) {
    const matched = rule.positions.some(
      (pos) => positionMatches(pos, a.primary_position) || positionMatches(pos, a.secondary_position),
    );
    results.push({ active: true, matched, reason: `Position is ${rule.positions.join(' / ')}` });
  }

  // 2. Class year (grad year) ------------------------------------------------
  if (rule.grad_years?.length) {
    const matched = a.grad_year != null && rule.grad_years.includes(a.grad_year);
    results.push({ active: true, matched, reason: `Class of ${rule.grad_years.join(' / ')}` });
  }

  // 3. Pitcher role (starter/reliever) — uses recent starts as the signal -----
  if (rule.pitcher_role?.length) {
    const isStarter = a.recent_game_starts > 0;
    const matched =
      (rule.pitcher_role.includes('starter') && isStarter) ||
      (rule.pitcher_role.includes('reliever') && !isStarter && /^(P|RHP|LHP|RP)$/.test((a.primary_position ?? '').toUpperCase()));
    results.push({ active: true, matched, reason: `Pitcher role: ${rule.pitcher_role.join(' / ')}` });
  }

  // 4. Availability status ---------------------------------------------------
  if (rule.availability_statuses?.length) {
    const matched =
      a.availability_status != null && rule.availability_statuses.includes(a.availability_status);
    results.push({
      active: true,
      matched,
      reason: `Availability is ${rule.availability_statuses.join(' / ')}`,
    });
  }

  // 5. Recent pitch count ----------------------------------------------------
  if (rule.min_recent_pitch_count != null) {
    const matched = a.recent_pitch_count >= rule.min_recent_pitch_count;
    results.push({
      active: true,
      matched,
      reason: `≥ ${rule.min_recent_pitch_count} pitches in last ${lookback}d (has ${a.recent_pitch_count})`,
    });
  }

  // 6. Recent game starts ----------------------------------------------------
  if (rule.min_recent_game_starts != null) {
    const matched = a.recent_game_starts >= rule.min_recent_game_starts;
    results.push({
      active: true,
      matched,
      reason: `≥ ${rule.min_recent_game_starts} starts in last ${lookback}d (has ${a.recent_game_starts})`,
    });
  }

  // 7. Soreness status -------------------------------------------------------
  if (rule.min_soreness_severity != null) {
    const matched =
      a.latest_soreness_severity != null && a.latest_soreness_severity >= rule.min_soreness_severity;
    results.push({
      active: true,
      matched,
      reason: `Reported soreness ≥ ${rule.min_soreness_severity}`,
    });
  }

  // 8 + 9. Bodyweight range --------------------------------------------------
  if (rule.bodyweight_min != null || rule.bodyweight_max != null) {
    const bw = a.bodyweight_lbs;
    const okMin = rule.bodyweight_min == null || (bw != null && bw >= rule.bodyweight_min);
    const okMax = rule.bodyweight_max == null || (bw != null && bw <= rule.bodyweight_max);
    const matched = bw != null && okMin && okMax;
    const lo = rule.bodyweight_min ?? '–';
    const hi = rule.bodyweight_max ?? '–';
    results.push({ active: true, matched, reason: `Bodyweight ${lo}–${hi} lb` });
  }

  // 10. Training age ---------------------------------------------------------
  if (rule.training_age_min != null || rule.training_age_max != null) {
    const ta = a.training_age_years;
    const okMin = rule.training_age_min == null || (ta != null && ta >= rule.training_age_min);
    const okMax = rule.training_age_max == null || (ta != null && ta <= rule.training_age_max);
    const matched = ta != null && okMin && okMax;
    const lo = rule.training_age_min ?? '–';
    const hi = rule.training_age_max ?? '–';
    results.push({ active: true, matched, reason: `Training age ${lo}–${hi} yr` });
  }

  // 11. Lift completion ------------------------------------------------------
  if (rule.lift_completion) {
    const matched =
      rule.lift_completion === 'completed' ? a.has_completed_lift : a.has_incomplete_lift;
    results.push({
      active: true,
      matched,
      reason: rule.lift_completion === 'completed'
        ? `Completed a lift in last ${lookback}d`
        : `Has an incomplete lift in last ${lookback}d`,
    });
  }

  const active = results.filter((r) => r.active);
  if (active.length === 0) return null; // no predicates => no match (empty rule)

  const matchedPredicates = active.filter((r) => r.matched);
  const satisfied = mode === 'all'
    ? matchedPredicates.length === active.length
    : matchedPredicates.length > 0;
  if (!satisfied) return null;

  return { player_id: a.player_id, reasons: matchedPredicates.map((r) => r.reason) };
}

/** Does a rule contain at least one active predicate (or an explicit include)? */
export function ruleHasPredicates(rule: BaseballStrengthGroupRules): boolean {
  return Boolean(
    rule.positions?.length ||
      rule.grad_years?.length ||
      rule.pitcher_role?.length ||
      rule.availability_statuses?.length ||
      rule.min_recent_pitch_count != null ||
      rule.min_recent_game_starts != null ||
      rule.min_soreness_severity != null ||
      rule.bodyweight_min != null ||
      rule.bodyweight_max != null ||
      rule.training_age_min != null ||
      rule.training_age_max != null ||
      rule.lift_completion ||
      rule.always_include_player_ids?.length,
  );
}

/**
 * Evaluate a dynamic rule against the roster snapshot. The result is the exact,
 * sorted set of included players the preview shows and the commit persists — one
 * engine, no drift.
 */
export function evaluateGroupRule(
  rule: BaseballStrengthGroupRules,
  roster: PlayerRuleAttributes[],
): RuleEvaluation {
  if (!ruleHasPredicates(rule)) {
    return { matches: [], included_ids: [], empty_rule: true };
  }
  const matches = roster
    .map((p) => evaluatePlayer(rule, p))
    .filter((m): m is RuleMatch => m !== null);

  const byId = new Map(roster.map((p) => [p.player_id, p]));
  matches.sort((x, y) => {
    const px = byId.get(x.player_id);
    const py = byId.get(y.player_id);
    return (px?.last_name ?? '').localeCompare(py?.last_name ?? '');
  });

  return {
    matches,
    included_ids: matches.map((m) => m.player_id),
    empty_rule: false,
  };
}

/**
 * Derive training age in years from grad year. A high-school senior (grad year ==
 * current year) is treated as ~4 training years; we clamp to [0, 8]. This is an
 * honest heuristic, NEVER a medical/physiological claim — it is only used to
 * segment the room. Returns null when grad year is unknown.
 */
export function trainingAgeFromGradYear(gradYear: number | null, today = new Date()): number | null {
  if (gradYear == null) return null;
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-11
  // A baseball "year" rolls in late summer; before August, last spring still counts.
  const seasonYear = month >= 7 ? year : year - 1;
  // Senior (graduating next spring) ~= 4 yrs of organized training; younger less.
  const yearsBeforeGrad = gradYear - 1 - seasonYear; // 0 for current seniors
  const age = 4 - yearsBeforeGrad;
  return Math.max(0, Math.min(8, age));
}
