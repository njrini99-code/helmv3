'use client';

/**
 * StandingBar — `card` size variant. Desktop standard.
 *
 * Master plan ASCII reference (Part VII.3):
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │ 6-15 ft Putting                              ↓ vs team │
 *   │       Team 41%      You 38%        PGA 49%             │
 *   │  ├──────[T]─────────[●]────────────[P]─────────────┤   │
 *   │  0%                                              60%   │
 *   │  Bottom 18% on your team                               │
 *   └────────────────────────────────────────────────────────┘
 */

import { m, useReducedMotion } from 'framer-motion';
import type { StandingBarProps } from './types';
import {
  deltaVsTeam,
  deriveAriaLabel,
  deriveState,
  formatValue,
  pgaReferenceLabel,
  shouldShowTeamMarker,
  standingSubjectLabel,
  teamRelativeText,
  toScalePct,
} from './utils';
import { EASE_CINEMATIC, DURATION } from '@/lib/coachhelm/v3/motion';

type CardProps = StandingBarProps;

export function Card(props: CardProps) {
  const state = deriveState(props);
  const ariaLabel = deriveAriaLabel(props);

  // Loading / error / empty short-circuits
  if (state === 'loading') return <CardSkeleton />;
  if (state === 'error') return <CardError message={props.errorMessage} />;
  if (state === 'empty') return <CardEmpty label={props.metric_label} />;

  const showTeam = shouldShowTeamMarker(props);
  const youPct = toScalePct(props.player_value, props.scale);
  const teamPct = showTeam && props.team_avg !== null ? toScalePct(props.team_avg, props.scale) : null;
  // P3: omit the reference marker entirely when the anchor is suppressed.
  const pgaPct = props.pga_omitted ? null : toScalePct(props.pga_value, props.scale);
  const delta = deltaVsTeam(props.player_value, props.team_avg, props.direction);
  // EC-2: only narrate "Above/Below team average" when the team marker itself
  // renders (team_n>=5 && team_avg!=null). On a tiny roster the comparison is
  // statistical noise, so we suppress the caption alongside the hidden marker.
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
      className="glass-standard rounded-2xl shadow-glass p-4 md:p-5"
    >
      {/* Header: label + vs-team arrow */}
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-medium text-warm-900 tracking-[-0.01em]">
          {props.metric_label}
        </h3>
        {showTeam && (
          <span className={`text-xs tabular-nums ${toneColor}`}>
            {delta.arrow} vs team
          </span>
        )}
      </div>

      {/* Value row: Team / You / PGA */}
      <div className="flex items-baseline justify-between text-xs text-warm-600 mb-2 tabular-nums">
        {showTeam && props.team_avg !== null ? (
          <span>Team {formatValue(props.team_avg, props.unit)}</span>
        ) : <span className="opacity-0">·</span>}
        <span className="text-warm-900 font-medium text-sm">
          {standingSubjectLabel(props.viewer_context, props.player_name)} {formatValue(props.player_value, props.unit)}
        </span>
        {props.pga_omitted
          ? <span className="opacity-0">·</span>
          : <span>{refLabel} {formatValue(props.pga_value, props.unit)}</span>}
      </div>

      {/* Bar */}
      <Bar
        youPct={youPct}
        teamPct={teamPct}
        pgaPct={pgaPct}
        size="card"
      />

      {/* Scale endpoints */}
      <div className="flex items-baseline justify-between text-eyebrow text-warm-400 mt-1 tabular-nums">
        <span>{formatValue(props.scale.min, props.unit)}</span>
        <span>{formatValue(props.scale.max, props.unit)}</span>
      </div>

      {/* Cohort text */}
      {props.show_cohort_text !== false && cohortText && (
        <p className={`text-xs mt-2 ${toneColor}`}>{cohortText}</p>
      )}

      {state === 'cold-start' && (
        <p className="text-xs text-warm-500 mt-2">
          Team marker appears once 5+ teammates have 5+ rounds each.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// State sub-components
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading standing"
      data-state="loading"
      className="glass-standard rounded-2xl shadow-glass p-5 animate-pulse"
    >
      <div className="h-3 w-32 bg-warm-100 rounded mb-3" />
      <div className="h-3 w-full bg-warm-100 rounded mb-2" />
      <div className="h-2 w-full bg-warm-100 rounded" />
    </div>
  );
}

function CardError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      data-state="error"
      className="glass-standard border-red-200 rounded-2xl p-5"
    >
      <p className="text-sm text-red-700">
        Couldn’t load standing.
      </p>
      {message && (
        <p className="text-xs text-red-600 mt-1 truncate" title={message}>
          {message}
        </p>
      )}
    </div>
  );
}

function CardEmpty({ label }: { label: string }) {
  return (
    <div
      data-state="empty"
      className="glass-standard rounded-2xl shadow-glass p-5"
    >
      <h3 className="text-sm font-medium text-warm-900 tracking-[-0.01em]">{label}</h3>
      <p className="text-xs text-warm-500 mt-2">
        Log 5 rounds to see how you stack up.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared inner bar — exported as a named const so Inline + Hero can reuse.
// ---------------------------------------------------------------------------

interface BarProps {
  youPct: number;
  teamPct: number | null;
  /** Null → the reference ("P") marker is omitted (audit P3 suppressed anchor). */
  pgaPct: number | null;
  size: 'card' | 'inline' | 'hero';
}

export function Bar({ youPct, teamPct, pgaPct, size }: BarProps) {
  const height = size === 'inline' ? 'h-1.5' : size === 'hero' ? 'h-3' : 'h-2';
  const markerSize = size === 'inline' ? 'w-2 h-2' : size === 'hero' ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5';

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
      className={`relative ${height} w-full bg-warm-100 rounded-full overflow-visible`}
    >
      {/* PGA marker (background, light) — omitted when pgaPct is null (P3). */}
      {pgaPct !== null && (
        <Marker
          kind="ref"
          leftPct={pgaPct}
          markerSize={markerSize}
          label="P"
          toneClass="bg-warm-400 text-white"
          delay={0.08}
        />
      )}
      {/* Team marker — omitted in cold-start */}
      {teamPct !== null && (
        <Marker
          kind="ref"
          leftPct={teamPct}
          markerSize={markerSize}
          label="T"
          toneClass="bg-warm-600 text-white"
          delay={0.14}
        />
      )}
      {/* You marker — the hero, drawn last so it sits on top */}
      <Marker
        kind="hero"
        leftPct={youPct}
        markerSize={markerSize}
        label="●"
        toneClass="bg-primary-600 text-white ring-2 ring-primary-200 shadow-[0_0_0_4px_rgba(22,163,74,0.16)]"
        delay={0.22}
      />
    </m.div>
  );
}

interface MarkerProps {
  kind: 'ref' | 'hero';
  leftPct: number;
  markerSize: string;
  label: string;
  toneClass: string;
  delay: number;
}

function Marker({ kind, leftPct, markerSize, label, toneClass, delay }: MarkerProps) {
  // Per master plan W13 + v3 feature audit: every marker scales in from
  // origin AND slides from leftPct=0 to its true position on mount. The
  // player's eye gets pulled to the "You" marker via a more dramatic
  // scale (0.4 → 1) vs the reference markers' subtler 0.7 → 1. Both
  // share canonical EASE_CINEMATIC at DURATION.short. Reduced-motion
  // users see the marker at its final position immediately, no animation.
  const reduce = useReducedMotion();
  const initialScale = kind === 'hero' ? 0.4 : 0.7;
  const transition = {
    duration: DURATION.short,
    delay,
    ease: EASE_CINEMATIC,
  };
  return (
    <m.div
      initial={reduce ? false : { opacity: 0, scale: initialScale, left: '0%' }}
      animate={reduce ? false : { opacity: 1, scale: 1, left: `${leftPct}%` }}
      transition={reduce ? undefined : transition}
      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${markerSize} rounded-full flex items-center justify-center text-eyebrow font-semibold ${toneClass}`}
      style={{ left: `${leftPct}%`, transformOrigin: 'center' }}
      aria-hidden="true"
    >
      {label}
    </m.div>
  );
}
