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
  pgaReferenceLabel,
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
  // EC-2: a team percentile is meaningless on a tiny roster — PERCENT_RANK()
  // returns 0/100 for the only/worst row, so "Bottom 1% on your team" fires on
  // a team of one. Gate the cohort caption on the SAME team_n>=5 floor the team
  // marker uses (`showTeam`), so we never narrate a percentile we won't draw.
  const cohortText =
    props.show_cohort_text !== false && showTeam
      ? teamCohortText(props.team_pct, props.team_n)
      : '';
  // CF-3: SG metrics anchor to the field average (0), not a PGA Tour score.
  // Women's teams get "LPGA" instead of "PGA" for non-SG metrics.
  const refLabel = pgaReferenceLabel(props.metric_id, props.is_womens).short;

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
      className="rounded-card border border-border-subtle bg-surface p-4 shadow-soft"
    >
      {/* Header: label + vs-team delta as a colored pill (green = better) */}
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="truncate font-fw-display text-body font-semibold tracking-[-0.01em] text-text-primary">
          {props.metric_label}
        </h4>
        {showTeam ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-fw-mono text-caption font-bold tabular-nums',
              delta.tone === 'good'
                ? 'bg-accent-500 text-text-on-accent'
                : delta.tone === 'bad'
                  ? 'bg-fw-danger-bg text-fw-danger'
                  : 'bg-inset text-text-secondary',
            )}
          >
            {delta.arrow} vs team
          </span>
        ) : null}
      </div>

      {/* Premium meter — green "You" hero, black reference tick, grey Team tick */}
      <StripTrack
        youPct={youPct}
        teamPct={teamPct}
        pgaPct={pgaPct}
        youValue={formatValue(props.player_value, props.unit)}
        refLabel={refLabel.toUpperCase()}
      />

      {/* High-contrast 3-up readouts (You is the green hero figure) */}
      <div className="grid grid-cols-3 gap-2">
        <Readout label="You" value={formatValue(props.player_value, props.unit)} tone="accent" align="start" />
        {showTeam && props.team_avg !== null ? (
          <Readout label="Team" value={formatValue(props.team_avg, props.unit)} align="center" />
        ) : (
          <Readout label="Team" value="—" tone="muted" align="center" />
        )}
        <Readout label={refLabel} value={formatValue(props.pga_value, props.unit)} align="end" />
      </div>

      {/* Cohort text */}
      {cohortText ? (
        <p className={cn('mt-3 font-fw-sans text-caption font-medium', deltaToneClass)}>{cohortText}</p>
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
/* Premium meter — green "you" hero on a defined track, dark field ticks      */
/* -------------------------------------------------------------------------- */

/** Keep markers + the floating badge clear of the very edge so nothing clips. */
const clampPct = (n: number) => Math.max(5, Math.min(95, n));

function StripTrack({
  youPct,
  teamPct,
  pgaPct,
  youValue,
  refLabel,
}: {
  youPct: number;
  teamPct: number | null;
  pgaPct: number;
  youValue: string;
  /** CF-3: the reference-tick label ("PGA" / "FIELD AVG"). */
  refLabel: string;
}) {
  const you = clampPct(youPct);
  const pga = clampPct(pgaPct);
  const team = teamPct !== null ? clampPct(teamPct) : null;
  return (
    <div className="relative px-1 pt-8 pb-7">
      {/* Floating green "You" value badge above the hero marker */}
      <div
        className="absolute top-1 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-500 px-2.5 py-1 font-fw-mono text-caption font-bold tabular-nums text-text-on-accent shadow-soft"
        style={{ left: `${you}%` }}
      >
        {youValue}
      </div>

      {/* The track — defined ring so it reads against the card */}
      <div className="relative h-2.5 w-full rounded-full bg-inset ring-1 ring-inset ring-border-strong">
        {/* Reference tick — black, high contrast (PGA, or "FIELD AVG" for SG).
            Label goes BELOW the bar so it never collides with the TEAM label. */}
        <Tick leftPct={pga} barClass="bg-text-primary" labelClass="text-text-secondary" label={refLabel} labelSide="below" />
        {/* Team tick — mid grey (omitted in cold-start).
            Label goes ABOVE the bar so it can never overwrite the reference label
            even when the two ticks land within a few pixels of each other. */}
        {team !== null ? (
          <Tick leftPct={team} barClass="bg-text-tertiary" labelClass="text-text-tertiary" label="TEAM" labelSide="above" />
        ) : null}
        {/* You — the green hero dot, drawn last so it sits on top */}
        <span
          className="absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500 shadow-soft ring-[3px] ring-surface"
          style={{ left: `${you}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function Tick({
  leftPct,
  barClass,
  labelClass,
  label,
  labelSide,
}: {
  leftPct: number;
  barClass: string;
  labelClass: string;
  label: string;
  /** Which side of the bar the text label appears on.
   *  'below' (default) places the label under the track;
   *  'above' places it above — use for the TEAM tick so it never
   *  collides with the reference tick label when both are close together. */
  labelSide: 'above' | 'below';
}) {
  return (
    <span
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${leftPct}%` }}
      aria-hidden="true"
    >
      <span className={cn('block h-4 w-[2.5px] rounded-full', barClass)} />
      <span
        className={cn(
          'absolute left-1/2 -translate-x-1/2 font-fw-mono text-eyebrow font-semibold uppercase tracking-wide whitespace-nowrap',
          labelSide === 'above'
            ? 'bottom-[calc(100%+5px)]'
            : 'top-[calc(100%+5px)]',
          labelClass,
        )}
      >
        {label}
      </span>
    </span>
  );
}

function Readout({
  label,
  value,
  tone = 'default',
  align = 'start',
}: {
  label: string;
  value: string;
  tone?: 'accent' | 'default' | 'muted';
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5',
        align === 'center' ? 'items-center text-center' : align === 'end' ? 'items-end text-right' : 'items-start',
      )}
    >
      <span className="font-fw-mono text-eyebrow uppercase tracking-wide text-text-tertiary">{label}</span>
      <span
        className={cn(
          'font-fw-display text-body font-semibold tabular-nums',
          tone === 'accent' ? 'text-accent-600' : tone === 'muted' ? 'text-text-tertiary' : 'text-text-primary',
        )}
      >
        {value}
      </span>
    </div>
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
