/**
 * v3 StandingBar — pure-function helpers.
 *
 * All math + formatting + a11y derivation lives here so the React
 * components stay declarative. Unit-tested in
 * src/test/golf/components/StandingBar.test.tsx (utils.test path).
 */

import type {
  Direction,
  RenderState,
  StandingBarProps,
  Unit,
} from './types';
import { TEAM_MARKER_MIN_N } from './types';

/**
 * Position a value within [scale.min, scale.max] as a 0-100 percentage.
 * Clamped — out-of-range values stick to the edge.
 */
export function toScalePct(value: number, scale: { min: number; max: number }): number {
  if (scale.max === scale.min) return 50;
  const pct = ((value - scale.min) / (scale.max - scale.min)) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * CF-3: the reference ("P") marker is mislabeled "PGA" for strokes-gained
 * metrics. SG is a zero-sum, field-relative quantity — the "0" reference is
 * the FIELD AVERAGE (Tour-relative baseline), not a PGA Tour player's score.
 * Labeling it "PGA 0.00" implies the Tour shoots flat-zero, overstating every
 * elite-amateur weakness. For sg_* metrics the reference reads "Field Avg";
 * for every other metric the PGA Tour value is a genuine Tour standard and
 * keeps the "PGA" label.
 *
 * `short` is the compact marker label ("Field Avg" / "PGA"); `long` is the
 * a11y phrase ("Field average" / "PGA Tour").
 */
export function pgaReferenceLabel(metric_id: string): { short: string; long: string } {
  if (/^sg_/.test(metric_id)) {
    return { short: 'Field Avg', long: 'Field average' };
  }
  return { short: 'PGA', long: 'PGA Tour' };
}

/** Display formatter per unit. */
export function formatValue(value: number, unit: Unit): string {
  switch (unit) {
    case 'percent': return `${value.toFixed(0)}%`;
    case 'strokes': return value.toFixed(2);
    case 'yards':   return `${value.toFixed(0)} yd`;
    case 'feet':    return `${value.toFixed(0)} ft`;
    case 'count':   return value.toFixed(1);
    default: {
      const _exhaustive: never = unit;
      return String(_exhaustive);
    }
  }
}

/**
 * Derive an arrow + semantic tone for "player vs team" comparison.
 * Used by the size-variant headers (↑ vs team / ↓ vs team).
 *
 * Returns 'neutral' when delta is below noise threshold or team is null.
 */
export function deltaVsTeam(
  player_value: number,
  team_avg: number | null,
  direction: Direction,
): { arrow: '↑' | '↓' | '·'; tone: 'good' | 'bad' | 'neutral' } {
  if (team_avg === null || !Number.isFinite(team_avg)) {
    return { arrow: '·', tone: 'neutral' };
  }
  const diff = player_value - team_avg;
  if (Math.abs(diff) < 0.01) return { arrow: '·', tone: 'neutral' };
  // Arrow describes WHERE the player sits relative to team (above/below).
  // Tone describes whether that's good or bad for this metric's direction.
  const arrow: '↑' | '↓' = diff > 0 ? '↑' : '↓';
  const better = direction === 'higher_better' ? diff > 0 : diff < 0;
  return { arrow, tone: better ? 'good' : 'bad' };
}

/**
 * Translate `team_pct` (0-100, higher = better) into the cohort-text
 * line shown beneath the bar.
 *
 *   90+ → "Top X% on your team"
 *   75-89 → "Top quartile on your team"
 *   50-74 → "Above team average"
 *   25-49 → "Below team average"
 *   <25 → "Bottom X% on your team"
 *
 * Returns empty string for cold-start (no team_pct).
 *
 * EC-2: `team_n` is an OPTIONAL tiny-N guard. `team_pct` is a PERCENT_RANK()
 * that degenerates to 0/100 for the only/worst row on a tiny roster — which
 * produced "Bottom 1% on your team" for a team of one. When `team_n` is passed
 * and below the team-marker floor (TEAM_MARKER_MIN_N), we suppress the caption
 * entirely. Omitting `team_n` keeps the legacy permissive behavior so callers
 * that already gate upstream (e.g. via shouldShowTeamMarker) are unaffected.
 */
export function teamCohortText(
  team_pct: number | null | undefined,
  team_n?: number | null,
): string {
  if (team_pct === null || team_pct === undefined || !Number.isFinite(team_pct)) {
    return '';
  }
  if (team_n !== undefined && team_n !== null && team_n < TEAM_MARKER_MIN_N) {
    return '';
  }
  const pct = Math.round(team_pct);
  if (pct >= 90) return `Top ${Math.max(1, 100 - pct)}% on your team`;
  if (pct >= 75) return 'Top quartile on your team';
  if (pct >= 50) return 'Above team average';
  if (pct >= 25) return 'Below team average';
  return `Bottom ${Math.max(1, pct)}% on your team`;
}

/**
 * Mean-relative cohort line — describes the player's position vs the TEAM
 * AVERAGE the bar's "T" marker actually renders (props.team_avg). Keeping the
 * caption mean-relative makes it agree with the ↑/↓ arrow, the tone color, and
 * the marker position. (The older percentile-based teamCohortText could read
 * "Above team average" while the mean-delta arrow pointed DOWN on an
 * outlier-skewed team — the contradiction surfaced on the round-review SG
 * cards, e.g. You 0.17 vs Team-mean 1.02 dragged up by one 6.64 teammate.)
 */
export function teamRelativeText(
  player_value: number,
  team_avg: number | null,
  direction: Direction,
): string {
  if (team_avg === null || !Number.isFinite(team_avg)) return '';
  const diff = player_value - team_avg;
  if (Math.abs(diff) < 0.01) return 'About your team average';
  const better = direction === 'higher_better' ? diff > 0 : diff < 0;
  return better ? 'Above team average' : 'Below team average';
}

/**
 * Derive the auto state from the props when one isn't passed explicitly.
 * 'error' and 'empty' must be passed in; this function returns either
 * 'cold-start' (when team data is insufficient) or 'happy'.
 */
export function deriveState(props: Pick<StandingBarProps, 'state' | 'team_avg' | 'team_n'>): RenderState {
  if (props.state) return props.state;
  const teamN = props.team_n ?? 0;
  if (props.team_avg === null || teamN < TEAM_MARKER_MIN_N) return 'cold-start';
  return 'happy';
}

/** Whether the team marker should render. */
export function shouldShowTeamMarker(props: Pick<StandingBarProps, 'team_avg' | 'team_n'>): boolean {
  if (props.team_avg === null) return false;
  if ((props.team_n ?? 0) < TEAM_MARKER_MIN_N) return false;
  return true;
}

/** Auto-derive a single-sentence aria label. */
export function deriveAriaLabel(props: StandingBarProps): string {
  if (props.ariaLabel) return props.ariaLabel;
  const you = formatValue(props.player_value, props.unit);
  const parts = [`${props.metric_label}. You: ${you}.`];
  // P3: omit the reference phrase entirely when the anchor is suppressed —
  // a women's player on a metric with no credible women's baseline must not be
  // narrated against a misleading men's value.
  if (!props.pga_omitted) {
    // CF-3: SG metrics anchor to the FIELD AVERAGE (0), not a PGA Tour score.
    const refLabel = pgaReferenceLabel(props.metric_id).long;
    parts.push(`${refLabel}: ${formatValue(props.pga_value, props.unit)}.`);
  }
  if (props.team_avg !== null && (props.team_n ?? 0) >= TEAM_MARKER_MIN_N) {
    parts.push(`Team average: ${formatValue(props.team_avg, props.unit)}.`);
  }
  const cohort = teamRelativeText(props.player_value, props.team_avg, props.direction);
  if (cohort) parts.push(cohort + '.');
  return parts.join(' ');
}
