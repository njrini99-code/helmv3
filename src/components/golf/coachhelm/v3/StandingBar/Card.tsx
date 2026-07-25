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

import { m } from 'framer-motion';
import type { StandingBarProps } from './types';
import {
  deltaVsTeam,
  deriveAriaLabel,
  deriveState,
  formatValue,
  layoutMarkerPositions,
  BAR_MARKER_MIN_GAP_PCT,
  pgaReferenceLabel,
  resolveDisplayScale,
  shouldShowTeamMarker,
  standingSubjectLabel,
  teamRelativeText,
  toScalePct,
} from './utils';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';

/** Same SG-detection regex `pgaReferenceLabel` uses — SG metrics anchor to
 *  a definitional zero (the field average), so their widened display domain
 *  must stay symmetric around it (see `resolveDisplayScale`). */
const SG_METRIC_RE = /^sg_/;

type CardProps = StandingBarProps;

export function Card(props: CardProps) {
  const state = deriveState(props);
  const ariaLabel = deriveAriaLabel(props);

  // Loading / error / empty short-circuits
  if (state === 'loading') return <CardSkeleton />;
  if (state === 'error') return <CardError message={props.errorMessage} />;
  if (state === 'empty') return <CardEmpty label={props.metric_label} />;

  const showTeam = shouldShowTeamMarker(props);
  // Bug: `props.scale` (`metric-config.ts`'s fixed `default_scale`, e.g.
  // sg_approach: -1.5..1.5) is a TYPICAL range, not a hard bound — an
  // outlier round's team_avg/player_value can land outside it, which used
  // to clamp `toScalePct` to the literal 0%/100% edge (a marker rendered
  // "half-clipped" by the card's own `overflow-clip`, or simply drawn at
  // the wrong spot vs. its real value). Widen the domain to cover every
  // value actually being plotted before mapping any of them to a percent.
  const isSgMetric = SG_METRIC_RE.test(props.metric_id);
  const effectiveScale = resolveDisplayScale(
    props.scale,
    [props.player_value, showTeam ? props.team_avg : null, props.pga_omitted ? null : props.pga_value],
    { symmetric: isSgMetric },
  );
  const youPct = toScalePct(props.player_value, effectiveScale);
  const teamPct = showTeam && props.team_avg !== null ? toScalePct(props.team_avg, effectiveScale) : null;
  // P3: omit the reference marker entirely when the anchor is suppressed.
  const pgaPct = props.pga_omitted ? null : toScalePct(props.pga_value, effectiveScale);
  const delta = deltaVsTeam(props.player_value, props.team_avg, props.direction, props.unit);
  // EC-2: only narrate "Above/Below team average" when the team marker itself
  // renders (team_n>=5 && team_avg!=null). On a tiny roster the comparison is
  // statistical noise, so we suppress the caption alongside the hidden marker.
  const cohortText = showTeam
    ? teamRelativeText(props.player_value, props.team_avg, props.direction, props.unit)
    : '';
  const refLabel = pgaReferenceLabel(props.metric_id, props.is_womens).short;

  const toneColor =
    delta.tone === 'good' ? 'text-fw-success-ink' :
    delta.tone === 'bad'  ? 'text-fw-danger-ink' :
                            'text-text-tertiary';

  const subjectLabel = standingSubjectLabel(props.viewer_context, props.player_name);

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-state={state}
      className="overflow-clip rounded-fw-md border border-border-subtle bg-surface p-4 shadow-soft transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-raise motion-reduce:transform-none md:p-5"
    >
      {/* Header: label + vs-team arrow */}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-fw-display text-body-sm font-semibold tracking-[-0.01em] text-text-primary">
          {props.metric_label}
        </h3>
        {showTeam && (
          <span className={`shrink-0 font-fw-sans text-caption font-semibold tabular-nums ${toneColor}`}>
            {delta.arrow} vs team
          </span>
        )}
      </div>

      {/* Explicit comparison cells — no cryptic loose labels floating over a rail. */}
      <div className="mb-4 grid grid-cols-3 gap-2 tabular-nums">
        <ComparisonCell
          label="Team"
          value={showTeam && props.team_avg !== null ? formatValue(props.team_avg, props.unit) : '—'}
        />
        <ComparisonCell
          label={subjectLabel}
          value={formatValue(props.player_value, props.unit)}
          emphasis
        />
        <ComparisonCell
          label={refLabel}
          value={props.pga_omitted ? '—' : formatValue(props.pga_value, props.unit)}
        />
      </div>

      {/* Bar */}
      <Bar
        youPct={youPct}
        teamPct={teamPct}
        pgaPct={pgaPct}
        size="card"
        zeroPct={
          isSgMetric && effectiveScale.min < 0 && effectiveScale.max > 0
            ? toScalePct(0, effectiveScale)
            : null
        }
        fill={teamPct !== null ? { fromPct: teamPct, toPct: youPct, tone: delta.tone } : null}
      />

      {/* Scale endpoints — reflect the WIDENED domain (`effectiveScale`), not
          the raw caller-supplied `props.scale`, so the printed range always
          agrees with where the markers above actually sit. */}
      <div className="mt-1 flex items-baseline justify-between font-fw-mono text-eyebrow text-text-tertiary tabular-nums">
        <span>{formatValue(effectiveScale.min, props.unit)}</span>
        <span>{formatValue(effectiveScale.max, props.unit)}</span>
      </div>

      {/* Cohort text */}
      {props.show_cohort_text !== false && cohortText && (
        <p className={`mt-2 font-fw-sans text-caption font-medium ${toneColor}`}>{cohortText}</p>
      )}

      {state === 'cold-start' && (
        <p className="text-xs text-warm-500 mt-2">
          Team marker appears once 5+ teammates have 5+ rounds each.
        </p>
      )}
    </div>
  );
}

function ComparisonCell({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? 'min-w-0 rounded-fw-sm border border-accent-200 bg-accent-50 px-2.5 py-2 text-center'
          : 'min-w-0 rounded-fw-sm bg-surface-sunken px-2.5 py-2 text-center'
      }
    >
      <span className="sr-only">{label} {value}</span>
      <span className="block truncate font-fw-display text-eyebrow font-semibold uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </span>
      <strong
        className={
          emphasis
            ? 'mt-0.5 block truncate font-fw-mono text-body-lg font-semibold text-accent-800 tabular-nums'
            : 'mt-0.5 block truncate font-fw-mono text-body font-medium text-text-primary tabular-nums'
        }
      >
        {value}
      </strong>
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
  /** Where zero sits on the widened domain (SG metrics only) — draws a hairline
   *  tick so "ahead of / behind the field" is legible at a glance. */
  zeroPct?: number | null;
  /** Tonal span between the team marker and the player marker — the actual
   *  "this is you vs team" read. Without it the bar is three floating dots. */
  fill?: { fromPct: number; toPct: number; tone: 'good' | 'bad' | 'neutral' } | null;
}

/** Inline color + animated opacity — NOT `bg-fw-danger/30`-style utilities:
 *  these tokens are plain `var(...)` colors without `<alpha-value>`, so
 *  Tailwind v3 silently drops every opacity-modified class (verified against
 *  the compiled CSS 2026-07-24 — the fill rendered as nothing). */
const FILL_TONE: Record<'good' | 'bad' | 'neutral', { color: string; alpha: number }> = {
  good: { color: 'var(--fw-color-success)', alpha: 0.32 },
  bad: { color: 'var(--fw-color-danger)', alpha: 0.26 },
  neutral: { color: 'var(--fw-color-border-strong)', alpha: 0.5 },
};

export function Bar({ youPct, teamPct, pgaPct, size, zeroPct = null, fill = null }: BarProps) {
  const height = size === 'inline' ? 'h-1.5' : size === 'hero' ? 'h-3' : 'h-2.5';
  const markerSize = size === 'inline' ? 'w-2 h-2' : size === 'hero' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  const fillLeft = fill ? Math.min(fill.fromPct, fill.toPct) : 0;
  const fillWidth = fill ? Math.abs(fill.toPct - fill.fromPct) : 0;

  // Bug: each Marker draws its letter ('T'/'●'/'P') INSIDE a small circle
  // directly on top of the raw scale position — when two values are
  // near-equal (e.g. team 0.70 vs player 0.81 on a 3-unit scale is only
  // ~3.7% apart) their circles land on top of each other and render as a
  // single unreadable blob. Nudge apart any markers within MARKER_MIN_GAP_PCT
  // of one another before rendering (BAR_MARKER_MIN_GAP_PCT — the small-chip
  // gap, NOT StandingStrip's wider text-pill gap); the underlying values/positions used
  // everywhere ELSE (readouts, aria label) are untouched — only the glyph's
  // drawn position moves.
  const rawPositions: Array<{ key: 'pga' | 'team' | 'you'; pct: number }> = [{ key: 'you', pct: youPct }];
  if (pgaPct !== null) rawPositions.push({ key: 'pga', pct: pgaPct });
  if (teamPct !== null) rawPositions.push({ key: 'team', pct: teamPct });
  const laidOut = layoutMarkerPositions(rawPositions, BAR_MARKER_MIN_GAP_PCT);
  const drawnPct = new Map(laidOut.map((p) => [p.key, p.pct]));

  // The rail itself renders IMMEDIATELY (a plain div, no entrance animation).
  // Gating it behind a framer opacity-fade left the whole bar blank on a slow
  // machine until the animation caught up — the window Nick photographed. Only
  // the fill + markers get a (position-stable) entrance now.
  return (
    <div
      className={`relative ${height} w-full rounded-full bg-surface-sunken shadow-[inset_0_1px_2px_rgb(28_25_23/0.08)] overflow-visible`}
    >
      {/* Zero hairline (SG metrics) — the field-average anchor. */}
      {zeroPct !== null && (
        <span
          aria-hidden="true"
          className="absolute -inset-y-1 w-px -translate-x-1/2 rounded-full bg-border-strong"
          style={{ left: `${zeroPct}%` }}
        />
      )}
      {/* Team→you delta fill — reads direction + size of the gap in one glance. */}
      {fill && fillWidth >= 0.75 && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: FILL_TONE[fill.tone].alpha }}
          transition={{ duration: DURATION.short, delay: 0.1, ease: EASE_CINEMATIC }}
          aria-hidden="true"
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${fillLeft}%`,
            width: `${fillWidth}%`,
            backgroundColor: FILL_TONE[fill.tone].color,
          }}
        />
      )}
      {/* PGA marker (background, light) — omitted when pgaPct is null (P3). */}
      {pgaPct !== null && (
        <Marker
          kind="ref"
          leftPct={drawnPct.get('pga')!}
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
          leftPct={drawnPct.get('team')!}
          markerSize={markerSize}
          label="T"
          toneClass="bg-warm-600 text-white"
          delay={0.14}
        />
      )}
      {/* You marker — the hero, drawn last so it sits on top.
       *
       * The label is EMPTY on purpose: the filled circle IS the mark. It used
       * to pass '●', which rendered an 11px (`text-eyebrow`) white bullet glyph
       * inside a 12px (`w-3 h-3`) `bg-primary-600` circle — the glyph covered
       * the middle and the "you" marker read as a hollow white donut with a
       * thin green rim (Nick's 07-24 round-review screenshot). That inverted
       * the hierarchy: the two REFERENCE chips ('T'/'P') were legible while the
       * hero mark looked like an empty placeholder. A solid brand-green dot
       * against lettered references is the intended read, and it stays
       * unambiguous at every size variant. */}
      <Marker
        kind="hero"
        leftPct={drawnPct.get('you')!}
        markerSize={markerSize}
        label=""
        toneClass="bg-primary-600 ring-2 ring-primary-200 shadow-[0_0_0_4px_rgba(22,163,74,0.16)]"
        delay={0.22}
      />
    </div>
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
  // Position is STATIC — `style.left` is the single source of truth and is
  // always the marker's true `leftPct`. We only animate `opacity` + `scale`
  // (GPU-safe transform props) so the marker fades/scales in AT its correct
  // spot.
  //
  // Bug it fixes (Nick, 07-24, "these bars are still not fixed… asked 5×"):
  // the old code animated `left` from '0%' → `${leftPct}%` while ALSO setting
  // `style.left`. On a slow machine the markers were caught mid-slide —
  // clustered at the far-left edge, and the hero "You" marker could overshoot
  // its card. Never animate a layout property (`left`); animating transform/
  // opacity only means there is no transient where a marker is visible but
  // mispositioned. Uses `useReducedMotionGuard` (not raw `useReducedMotion`,
  // which returns null pre-hydration → #418) per CLAUDE.md.
  const reduce = useReducedMotionGuard();
  const initialScale = kind === 'hero' ? 0.4 : 0.7;
  const transition = {
    duration: DURATION.short,
    delay,
    ease: EASE_CINEMATIC,
  };
  return (
    <m.div
      initial={reduce ? false : { opacity: 0, scale: initialScale }}
      animate={reduce ? false : { opacity: 1, scale: 1 }}
      transition={reduce ? undefined : transition}
      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${markerSize} rounded-full flex items-center justify-center text-eyebrow font-semibold ${toneClass}`}
      style={{ left: `${leftPct}%`, transformOrigin: 'center' }}
      aria-hidden="true"
    >
      {label}
    </m.div>
  );
}
