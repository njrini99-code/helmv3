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
 */
export function teamCohortText(team_pct: number | null | undefined): string {
  if (team_pct === null || team_pct === undefined || !Number.isFinite(team_pct)) {
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
  const pga = formatValue(props.pga_value, props.unit);
  const parts = [`${props.metric_label}. You: ${you}.`, `PGA Tour: ${pga}.`];
  if (props.team_avg !== null && (props.team_n ?? 0) >= TEAM_MARKER_MIN_N) {
    parts.push(`Team average: ${formatValue(props.team_avg, props.unit)}.`);
  }
  const cohort = teamCohortText(props.team_pct);
  if (cohort) parts.push(cohort + '.');
  return parts.join(' ');
}
