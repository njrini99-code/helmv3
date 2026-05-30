'use client';

/**
 * ============================================================================
 * StandingStrip — Fairway-native "PGA vs team vs you" comparison strip (§1c)
 * ----------------------------------------------------------------------------
 * The legacy `StandingBar` (Card/Inline/Hero) renders cold glass
 * (`bg-white/70 backdrop-blur-xl shadow-glass`) which violates the Fairway
 * "cream, not white / matte, no glass on content" rule inside `.fairway-ds`.
 * This is the flat, matte equivalent: it REUSES ONLY the legacy pure logic
 * helpers (`toScalePct`, `formatValue`, `deltaVsTeam`, `teamCohortText`,
 * `shouldShowTeamMarker`, `deriveAriaLabel`) and the legacy `StandingBarProps`
 * surface, so data wiring is identical, but renders entirely in Fairway
 * tokens (no glass, no skeuomorphism).
 *
 * Three markers on a `bg-inset` track — Team (T), You (●), PGA (P) — the same
 * three-marker model the legacy Card draws. Cold-start (team_n < 5) omits the
 * team marker; 'empty' / 'error' show honest matte states.
 *
 * REUSE (logic only, NOT styling): the helpers above come from
 * `@/components/golf/coachhelm/v3/StandingBar` (index re-exports utils.ts);
 * the prop type `StandingBarProps` is the legacy public surface.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import {
  type StandingBarProps,
  type RenderState,
  toScalePct,
  formatValue,
  deltaVsTeam,
  teamCohortText,
  deriveState,
  shouldShowTeamMarker,
  deriveAriaLabel,
} from '@/components/golf/coachhelm/v3/StandingBar';

/** StandingStrip shares the legacy StandingBar prop surface verbatim. */
export type StandingStripProps = StandingBarProps;

export function StandingStrip(props: StandingStripProps) {
  const state: RenderState = deriveState(props);
  const ariaLabel = deriveAriaLabel(props);

  if (state === 'loading') return <StripSkeleton />;
  if (state === 'error') return <StripError message={props.errorMessage} />;
  if (state === 'empty') return <StripEmpty label={props.metric_label} />;

  const showTeam = shouldShowTeamMarker(props);
  const youPct = toScalePct(props.player_value, props.scale);
  const teamPct = showTeam && props.team_avg !== null ? toScalePct(props.team_avg, props.scale) : null;
  const pgaPct = toScalePct(props.pga_value, props.scale);
  const delta = deltaVsTeam(props.player_value, props.team_avg, props.direction);
  const cohortText = props.show_cohort_text !== false ? teamCohortText(props.team_pct) : '';

  const deltaToneClass =
    delta.tone === 'good' ? 'text-accent-600' :
    delta.tone === 'bad'  ? 'text-danger' :
                            'text-text-tertiary';

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-slot="standing-strip"
      data-state={state}
      className="rounded-card border border-border-subtle bg-surface p-4"
    >
      {/* Header: label + vs-team delta */}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h4 className="truncate font-fw-sans text-body-sm font-medium text-text-primary">
          {props.metric_label}
        </h4>
        {showTeam ? (
          <span className={cn('font-fw-mono text-caption tabular-nums', deltaToneClass)}>
            {delta.arrow} vs team
          </span>
        ) : null}
      </div>

      {/* Value row: Team / You / PGA */}
      <div className="mb-2 flex items-baseline justify-between font-fw-mono text-caption tabular-nums text-text-tertiary">
        {showTeam && props.team_avg !== null ? (
          <span>Team {formatValue(props.team_avg, props.unit)}</span>
        ) : (
          <span className="opacity-0">·</span>
        )}
        <span className="font-fw-sans text-body-sm font-medium text-text-primary">
          You {formatValue(props.player_value, props.unit)}
        </span>
        <span>PGA {formatValue(props.pga_value, props.unit)}</span>
      </div>

      {/* Track + three markers */}
      <StripTrack youPct={youPct} teamPct={teamPct} pgaPct={pgaPct} />

      {/* Scale endpoints */}
      <div className="mt-1 flex items-baseline justify-between font-fw-mono text-eyebrow tabular-nums text-text-tertiary">
        <span>{formatValue(props.scale.min, props.unit)}</span>
        <span>{formatValue(props.scale.max, props.unit)}</span>
      </div>

      {/* Cohort text */}
      {cohortText ? (
        <p className={cn('mt-2 font-fw-sans text-caption', deltaToneClass)}>{cohortText}</p>
      ) : null}

      {state === 'cold-start' ? (
        <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
          Team marker appears once 5+ teammates have 5+ rounds each.
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Track + markers (flat, matte — no glass)                                   */
/* -------------------------------------------------------------------------- */

function StripTrack({
  youPct,
  teamPct,
  pgaPct,
}: {
  youPct: number;
  teamPct: number | null;
  pgaPct: number;
}) {
  return (
    <div className="relative h-2 w-full overflow-visible rounded-full bg-inset">
      {/* PGA reference marker (calm) */}
      <Marker leftPct={pgaPct} label="P" toneClass="bg-text-tertiary text-surface" />
      {/* Team marker — omitted in cold-start */}
      {teamPct !== null ? (
        <Marker leftPct={teamPct} label="T" toneClass="bg-text-secondary text-surface" />
      ) : null}
      {/* You marker — the hero, drawn last so it sits on top */}
      <Marker
        leftPct={youPct}
        label="●"
        toneClass="bg-accent-500 text-text-on-accent ring-2 ring-accent-200"
      />
    </div>
  );
}

function Marker({
  leftPct,
  label,
  toneClass,
}: {
  leftPct: number;
  label: string;
  toneClass: string;
}) {
  return (
    <span
      className={cn(
        'absolute top-1/2 flex h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center',
        'rounded-full text-eyebrow font-semibold',
        toneClass,
      )}
      style={{ left: `${leftPct}%` }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Honest matte states                                                        */
/* -------------------------------------------------------------------------- */

function StripSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading standing"
      data-state="loading"
      className="animate-pulse rounded-card border border-border-subtle bg-surface p-4 motion-reduce:animate-none"
    >
      <div className="mb-3 h-3 w-28 rounded bg-inset" />
      <div className="mb-2 h-2 w-full rounded bg-inset" />
      <div className="h-2 w-2/3 rounded bg-inset" />
    </div>
  );
}

function StripError({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      data-state="error"
      className="rounded-card border border-border-subtle bg-surface p-4"
    >
      <p className="font-fw-sans text-body-sm text-danger">Couldn&rsquo;t load standing.</p>
      {message ? (
        <p className="mt-1 truncate font-fw-sans text-caption text-text-tertiary" title={message}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

function StripEmpty({ label }: { label: string }) {
  return (
    <div
      data-state="empty"
      className="rounded-card border border-border-subtle bg-surface p-4"
    >
      <h4 className="font-fw-sans text-body-sm font-medium text-text-primary">{label}</h4>
      <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
        Log 5 rounds to see how you stack up.
      </p>
    </div>
  );
}
