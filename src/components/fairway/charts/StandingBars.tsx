'use client';

/**
 * ============================================================================
 * StandingBars — labeled horizontal bar rows, replacing every "dot on a
 * rail" standing visual in the app (owner: "I've asked repeatedly to get rid
 * of these slider things. Everywhere... Replace it with an actual
 * component.")
 * ----------------------------------------------------------------------------
 * The legacy family (`golf/coachhelm/v3/StandingBar` Card/Inline/Hero,
 * `fairway/charts/StandingStrip`, `fairway/modules/StandingTrack`) all draw
 * the SAME shape: a track with 2-3 small circular markers pinned to a
 * position. That reads as decoration, not data — three unlabeled dots on a
 * line convey "somewhere on a scale," not "how far, in what unit, better or
 * worse." This renders the SAME comparison (You / Team / Tour) as three
 * separately-labeled, separately-valued bar rows instead — the visual
 * language of `fairway/modules/RailBars` (a rail per row, filled to the
 * value, a right-aligned tabular number) and `fairway/modules/DivergingBars`
 * (a zero-centered rail, green/amber by which side of zero is "better") —
 * reimplemented locally rather than imported, because both of those live in
 * `modules/`, one folder away, and this component's siblings
 * (`StandingStrip.tsx`) only ever import logic from
 * `golf/coachhelm/v3/StandingBar` + local `./theme` — a `charts/ -> modules/`
 * edge would be a new, one-way dependency direction this folder doesn't have.
 *
 * REUSE (logic only, NOT styling, mirrors `StandingStrip.tsx`'s own doc
 * comment): every number on screen — the widened display scale, the
 * per-metric SG "Field Avg" vs "PGA/LPGA" label, the mean-relative "Above/
 * Below team average" caption, the cold-start (team_n < 5) gate, the derived
 * aria label — comes from `golf/coachhelm/v3/StandingBar`'s pure helpers.
 * Nothing here recomputes standing math; it only lays it out as bars.
 *
 * Metric semantics decide the geometry, not a per-call-site choice:
 *   - `sg_*` metrics (the only "signed", field-average-anchored metrics in
 *     `metric-config.ts` — same `/^sg_/` test every sibling component uses)
 *     get a zero-centered DIVERGING bar per row: green when that row's own
 *     value sits on the metric's better side of zero, amber on the worse
 *     side. The reference row for an SG metric is ALWAYS "Field Avg 0.00"
 *     (SG is computed against that zero by definition), so it renders with
 *     no visible fill — an honest, correctly-drawn no-op, not a duplicate
 *     lie.
 *   - Every other metric (percent / feet / yards / count / non-SG strokes)
 *     gets a plain RAIL bar per row: fill width = the row's position inside
 *     the same widened `[min, max]` domain every row shares, so the three
 *     bars are visually comparable. This mirrors the existing convention
 *     (`toScalePct` maps linearly across the domain regardless of
 *     `direction` — a lower-is-better metric's rail isn't flipped, same as
 *     the legacy dot never was).
 *
 * Cold-start (team_n < 5 or team_avg === null): the Team row is DROPPED
 * entirely (not shown as a "—" placeholder — the caller has no team number
 * to show), and the summary line explains why instead of narrating a
 * comparison that isn't drawn.
 *
 * `pga_omitted`: the reference row is dropped entirely (mirrors every
 * sibling component's P3 audit fix — a player with no credible cohort
 * anchor must never be drawn against a misleading value).
 *
 * A11y: a semantic `<figure>` (not `role="img"`, which would swallow its own
 * children from the accessibility tree) carries the full derived
 * `aria-label`; a visually-hidden `<table>` inside gives assistive tech the
 * real row/value pairs a screen reader can navigate, not just one flattened
 * sentence.
 *
 * Motion: none. No entrance animation to gate behind
 * `prefers-reduced-motion` — bars render at their final position and size on
 * first paint, always.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/fairway/feedback';
import { TABULAR_NUMS, formatSigned } from './theme';
import {
  type StandingBarProps,
  type RenderState,
  toScalePct,
  formatValue,
  deltaVsTeam,
  teamRelativeText,
  valuesDisplayEqual,
  deriveState,
  shouldShowTeamMarker,
  deriveAriaLabel,
  pgaReferenceLabel,
  neutralizeForCoach,
  standingSubjectLabel,
  resolveDisplayScale,
} from '@/components/golf/coachhelm/v3/StandingBar';

export interface StandingBarsProps extends Omit<StandingBarProps, 'size'> {
  /** Row/track thickness + type scale. Default 'md'. Shadows the legacy
   *  `StandingBarProps.size` (inline/card/hero) on purpose — this component
   *  has its own, much smaller size vocabulary. */
  size?: 'sm' | 'md';
  /**
   * 'rows' (default) — full card with header pill + rows + a one-line
   * summary underneath. 'compact' — the same rows at tighter spacing with
   * no summary paragraph (still present in the hidden a11y table + the
   * figure's aria-label), for a narrow rail/sidebar placement.
   */
  layout?: 'rows' | 'compact';
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

interface Row {
  key: 'you' | 'team' | 'ref';
  label: string;
  rawValue: number;
  emphasis?: boolean;
}

export function StandingBars(props: StandingBarsProps) {
  const { size = 'md', layout = 'rows' } = props;
  const state: RenderState = deriveState(props);
  // `deriveAriaLabel` types its param as the legacy `StandingBarProps`
  // (whose `size: SizeVariant` this component intentionally shadows with a
  // different, smaller vocabulary — see `StandingBarsProps`). It never reads
  // `size` in its own logic, so a throwaway legacy value satisfies the type
  // without affecting the derived label.
  const ariaLabel = deriveAriaLabel({ ...props, size: 'card' });

  if (state === 'loading') return <BarsSkeleton />;
  if (state === 'error') return <BarsError message={props.errorMessage} />;
  if (state === 'empty') return <BarsEmpty label={props.metric_label} />;

  const showTeam = shouldShowTeamMarker(props);
  const isSgMetric = /^sg_/.test(props.metric_id);
  // Same domain-widening every sibling component performs before mapping any
  // value to a position — `props.scale` is a TYPICAL range, not a hard
  // bound (metric-config.ts's fixed defaults), so an outlier round can post
  // a value beyond it. Widen first so a real value never silently renders
  // at the same spot as a clamped one.
  const effectiveScale = resolveDisplayScale(
    props.scale,
    [props.player_value, showTeam ? props.team_avg : null, props.pga_omitted ? null : props.pga_value],
    { symmetric: isSgMetric },
  );

  const delta = deltaVsTeam(props.player_value, props.team_avg, props.direction, props.unit);
  const deltaToneClass =
    delta.tone === 'good' ? 'text-accent-600' :
    delta.tone === 'bad'  ? 'text-fw-warning-ink' :
                            'text-text-tertiary';

  const subjectLabel = standingSubjectLabel(props.viewer_context, props.player_name);
  const refLabel = pgaReferenceLabel(props.metric_id, props.is_womens).short;

  const rows: Row[] = [
    { key: 'you', label: subjectLabel, rawValue: props.player_value, emphasis: true },
  ];
  if (showTeam && props.team_avg !== null) {
    rows.push({ key: 'team', label: 'Team', rawValue: props.team_avg });
  }
  if (!props.pga_omitted) {
    rows.push({ key: 'ref', label: refLabel, rawValue: props.pga_value });
  }
  const teamRow = rows.find((r) => r.key === 'team');

  // Summary line: a signed (SG) metric shows the actual numeric gap — "+0.38
  // vs team" is legible on its own for a strokes-per-round quantity. Every
  // other metric keeps the categorical phrase Card/Inline/Hero/StandingStrip
  // already use, since a raw percent/feet/count delta alone reads worse than
  // "Above team average" without the metric's own scale for context. Cold
  // start replaces either with the honest reason the row is missing, exactly
  // like every sibling component's own cold-start caption.
  let cohortText = '';
  if (showTeam && teamRow) {
    if (valuesDisplayEqual(props.player_value, teamRow.rawValue, props.unit)) {
      cohortText = 'Matches team average';
    } else if (isSgMetric) {
      cohortText = `${formatSigned(props.player_value - teamRow.rawValue)} vs team`;
    } else {
      cohortText = teamRelativeText(props.player_value, teamRow.rawValue, props.direction, props.unit);
    }
    cohortText = neutralizeForCoach(cohortText, props.viewer_context);
  }
  const showCohortLine = props.show_cohort_text !== false && layout !== 'compact';

  const barHeight = size === 'sm' ? 'h-1.5' : 'h-2';
  const labelWidthClass = size === 'sm' ? 'w-9' : 'w-11';
  const rowGap = layout === 'compact' ? 'gap-1' : 'gap-2';

  function railBar(row: Row) {
    const pct = clampPct(toScalePct(row.rawValue, effectiveScale));
    const fillClass =
      row.key === 'you' ? 'bg-accent-650' :
      row.key === 'team' ? 'bg-border-strong' :
                            'bg-text-tertiary';
    return (
      <span className={cn('relative block w-full rounded-full bg-surface-sunken', barHeight)}>
        <span
          aria-hidden="true"
          className={cn('absolute inset-y-0 left-0 rounded-full', fillClass)}
          style={{ width: `${pct}%` }}
        />
      </span>
    );
  }

  function divergingBar(row: Row) {
    // effectiveScale is symmetric for SG metrics (resolveDisplayScale's
    // `symmetric` option), so `max` is the same half-domain magnitude on
    // both sides of the zero anchor.
    const half = effectiveScale.max > 0 ? effectiveScale.max : 1;
    const pct = Math.min(50, (Math.abs(row.rawValue) / half) * 50);
    const better = props.direction === 'higher_better' ? row.rawValue > 0 : row.rawValue < 0;
    const worse = props.direction === 'higher_better' ? row.rawValue < 0 : row.rawValue > 0;
    return (
      <span className={cn('relative block w-full rounded-full bg-surface-sunken', barHeight)}>
        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-warm-400" />
        {better || worse ? (
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-y-0 rounded-full',
              better ? 'left-1/2 bg-accent-500' : 'right-1/2 bg-fw-warning',
            )}
            style={{ width: `${pct}%` }}
          />
        ) : null}
      </span>
    );
  }

  return (
    <figure
      aria-label={ariaLabel}
      data-slot="standing-bars"
      data-state={state}
      className="overflow-clip rounded-card border border-border-subtle bg-surface p-4 shadow-soft"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <figcaption className="min-w-0 flex-1 break-words font-fw-display text-body font-semibold tracking-[-0.01em] text-text-primary">
          {props.metric_label}
        </figcaption>
        {showTeam ? (
          <span
            data-slot="standing-bars-delta-pill"
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-fw-mono text-caption font-bold tabular-nums',
              delta.tone === 'good'
                ? 'bg-accent-650 text-text-on-accent'
                : delta.tone === 'bad'
                  ? 'bg-fw-warning-bg text-fw-warning-ink'
                  : 'bg-inset text-text-secondary',
            )}
          >
            {delta.arrow} vs team
          </span>
        ) : null}
      </div>

      <div data-slot="standing-bars-rows" className={cn('grid', rowGap)}>
        {rows.map((row) => (
          <div key={row.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5">
            <span
              className={cn(
                'truncate font-fw-sans text-caption',
                labelWidthClass,
                row.emphasis ? 'font-semibold text-text-primary' : 'text-text-tertiary',
              )}
            >
              {row.label}
            </span>
            {isSgMetric ? divergingBar(row) : railBar(row)}
            <span
              style={TABULAR_NUMS}
              className="whitespace-nowrap text-right font-fw-mono text-caption font-semibold tabular-nums text-text-primary"
            >
              {formatValue(row.rawValue, props.unit)}
            </span>
          </div>
        ))}
      </div>

      {showCohortLine && cohortText ? (
        <p
          data-slot="standing-bars-summary"
          className={cn('mt-3 font-fw-sans text-caption font-medium', deltaToneClass)}
        >
          {cohortText}
        </p>
      ) : null}

      {layout !== 'compact' && state === 'cold-start' ? (
        <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
          Team marker appears once 5+ teammates have 5+ rounds each.
        </p>
      ) : null}

      {/* Real tabular data for assistive tech — NOT swallowed by role="img"
          (the figure carries no such role), so this table stays reachable. */}
      <table className="sr-only">
        <caption>{props.metric_label} standing detail</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{formatValue(row.rawValue, props.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* Honest matte states — identical copy/classes to StandingStrip's own        */
/* -------------------------------------------------------------------------- */

function BarsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading standing"
      data-state="loading"
      className="rounded-card border border-border-subtle bg-surface p-4"
    >
      <Skeleton className="mb-3 h-3 w-28 rounded" />
      <Skeleton className="mb-2 h-2 w-full rounded" />
      <Skeleton className="h-2 w-2/3 rounded" />
    </div>
  );
}

function BarsError({ message }: { message?: string }) {
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

function BarsEmpty({ label }: { label: string }) {
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
