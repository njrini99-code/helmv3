/**
 * StandingBar — `inline` size variant. Mobile chip.
 *
 * Master plan ASCII reference (Part VII.3):
 *
 *   ┌─────────────────────────────┐
 *   │ 6-15 ft Putting   ↓ vs team │
 *   │ T 41% · You 38% · PGA 49%   │
 *   │ ├─[T]─[●]──[P]──────────┤   │
 *   │ Bottom 18% team             │
 *   └─────────────────────────────┘
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

export function Inline(props: StandingBarProps) {
  const state = deriveState(props);
  const ariaLabel = deriveAriaLabel(props);

  if (state === 'loading') return <InlineSkeleton />;
  if (state === 'error')   return <InlineError message={props.errorMessage} />;
  if (state === 'empty')   return <InlineEmpty label={props.metric_label} />;

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
      className="glass-standard rounded-xl px-3 py-2"
    >
      {/* Header: label + vs-team arrow */}
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-xs font-medium text-warm-900 truncate">
          {props.metric_label}
        </span>
        {showTeam && (
          <span className={`text-eyebrow tabular-nums shrink-0 ${toneColor}`}>
            {delta.arrow} vs team
          </span>
        )}
      </div>

      {/* Compact dot-separated values */}
      <div className="text-eyebrow text-warm-600 tabular-nums mb-1.5 truncate">
        {showTeam && props.team_avg !== null && (
          <>T {formatValue(props.team_avg, props.unit)} · </>
        )}
        <span className="text-warm-900 font-medium">You {formatValue(props.player_value, props.unit)}</span>
        {!props.pga_omitted && (
          <>
            {' · '}
            {refLabel} {formatValue(props.pga_value, props.unit)}
          </>
        )}
      </div>

      {/* Bar */}
      <Bar youPct={youPct} teamPct={teamPct} pgaPct={pgaPct} size="inline" />

      {/* Cohort text — single line, compact */}
      {props.show_cohort_text !== false && cohortText && (
        <p className={`text-eyebrow mt-1 truncate ${toneColor}`}>{cohortText}</p>
      )}
    </div>
  );
}

function InlineSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading standing"
      data-state="loading"
      className="glass-standard rounded-xl px-3 py-2 animate-pulse"
    >
      <div className="h-2.5 w-24 bg-warm-100 rounded mb-2" />
      <div className="h-1.5 w-full bg-warm-100 rounded" />
    </div>
  );
}

function InlineError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      data-state="error"
      className="glass-standard border-red-200 rounded-xl px-3 py-2"
    >
      <p className="text-eyebrow text-red-700">Couldn’t load standing.</p>
      {message && (
        <p className="text-eyebrow text-red-600 truncate" title={message}>{message}</p>
      )}
    </div>
  );
}

function InlineEmpty({ label }: { label: string }) {
  return (
    <div
      data-state="empty"
      className="glass-standard rounded-xl px-3 py-2"
    >
      <p className="text-xs font-medium text-warm-900 truncate">{label}</p>
      <p className="text-eyebrow text-warm-500 mt-1">Log 5 rounds to unlock standing.</p>
    </div>
  );
}
