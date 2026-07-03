/**
 * StandingBar — `hero` size variant. Player dashboard hero placement.
 *
 * Larger type, more breathing room than Card. Used at the top of the
 * mobile player dashboard wrapping the LLM hero narrative (W31).
 */

import type { StandingBarProps } from './types';
import { Bar } from './Card';
import {
  deltaVsTeam,
  deriveAriaLabel,
  deriveState,
  formatValue,
  pgaReferenceLabel,
  shouldShowTeamMarker,
  teamRelativeText,
  toScalePct,
} from './utils';

export function Hero(props: StandingBarProps) {
  const state = deriveState(props);
  const ariaLabel = deriveAriaLabel(props);

  if (state === 'loading') return <HeroSkeleton />;
  if (state === 'error')   return <HeroError message={props.errorMessage} />;
  if (state === 'empty')   return <HeroEmpty label={props.metric_label} />;

  const showTeam = shouldShowTeamMarker(props);
  const youPct = toScalePct(props.player_value, props.scale);
  const teamPct = showTeam && props.team_avg !== null ? toScalePct(props.team_avg, props.scale) : null;
  // P3: omit the reference marker entirely when the anchor is suppressed.
  const pgaPct = props.pga_omitted ? null : toScalePct(props.pga_value, props.scale);
  const delta = deltaVsTeam(props.player_value, props.team_avg, props.direction);
  // EC-2: suppress the team-relative caption when the team marker is hidden
  // (tiny roster) — same team_n>=5 floor the marker uses.
  const cohortText = showTeam
    ? teamRelativeText(props.player_value, props.team_avg, props.direction)
    : '';
  const refLabel = pgaReferenceLabel(props.metric_id, props.is_womens).short;

  const toneColor =
    delta.tone === 'good' ? 'text-primary-700' :
    delta.tone === 'bad'  ? 'text-red-600' :
                            'text-warm-500';

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-state={state}
      className="glass-prominent rounded-3xl shadow-glass p-6"
    >
      {/* Eyebrow + label */}
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="text-eyebrow font-medium uppercase tracking-[0.08em] text-warm-500">
          Standing
        </p>
        {showTeam && (
          <span className={`text-xs tabular-nums ${toneColor}`}>
            {delta.arrow} vs team
          </span>
        )}
      </div>
      <h2 className="text-lg md:text-xl font-medium text-warm-900 tracking-[-0.015em] mb-4">
        {props.metric_label}
      </h2>

      {/* Big You value — focal point */}
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-3xl md:text-4xl font-medium text-warm-900 tabular-nums tracking-[-0.02em]">
          {formatValue(props.player_value, props.unit)}
        </span>
        <span className="text-xs text-warm-500">You</span>
      </div>

      {/* Team / PGA reference values */}
      <div className="flex items-baseline gap-4 text-xs text-warm-600 tabular-nums mb-4">
        {showTeam && props.team_avg !== null && (
          <span>Team {formatValue(props.team_avg, props.unit)}</span>
        )}
        {!props.pga_omitted && (
          <span>{refLabel} {formatValue(props.pga_value, props.unit)}</span>
        )}
      </div>

      {/* Bar */}
      <Bar youPct={youPct} teamPct={teamPct} pgaPct={pgaPct} size="hero" />

      {/* Scale endpoints */}
      <div className="flex items-baseline justify-between text-eyebrow text-warm-400 mt-1.5 tabular-nums">
        <span>{formatValue(props.scale.min, props.unit)}</span>
        <span>{formatValue(props.scale.max, props.unit)}</span>
      </div>

      {/* Cohort text */}
      {props.show_cohort_text !== false && cohortText && (
        <p className={`text-sm mt-4 ${toneColor}`}>{cohortText}</p>
      )}

      {state === 'cold-start' && (
        <p className="text-xs text-warm-500 mt-3">
          Team marker appears once 5+ teammates have 5+ rounds each.
        </p>
      )}
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading standing"
      data-state="loading"
      className="glass-prominent rounded-3xl shadow-glass p-6 animate-pulse"
    >
      <div className="h-3 w-20 bg-warm-100 rounded mb-2" />
      <div className="h-5 w-48 bg-warm-100 rounded mb-6" />
      <div className="h-8 w-24 bg-warm-100 rounded mb-2" />
      <div className="h-3 w-32 bg-warm-100 rounded mb-4" />
      <div className="h-3 w-full bg-warm-100 rounded" />
    </div>
  );
}

function HeroError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      data-state="error"
      className="glass-prominent border-red-200 rounded-3xl p-6"
    >
      <p className="text-sm font-medium text-red-700">
        Couldn’t load standing.
      </p>
      {message && (
        <p className="text-xs text-red-600 mt-2 truncate" title={message}>
          {message}
        </p>
      )}
    </div>
  );
}

function HeroEmpty({ label }: { label: string }) {
  return (
    <div
      data-state="empty"
      className="glass-prominent rounded-3xl shadow-glass p-6"
    >
      <p className="text-eyebrow font-medium uppercase tracking-[0.08em] text-warm-500 mb-1">
        Standing
      </p>
      <h2 className="text-lg md:text-xl font-medium text-warm-900 tracking-[-0.015em]">
        {label}
      </h2>
      <p className="text-sm text-warm-500 mt-3">
        Log 5 rounds to see where you stack up against PGA Tour and your team.
      </p>
    </div>
  );
}
