'use client';

/**
 * ============================================================================
 * StandingStrip — Fairway-native "PGA vs team vs you" comparison strip (§1c)
 * ----------------------------------------------------------------------------
 * The legacy `StandingBar` (Card/Inline/Hero) renders cold glass
 * (`bg-white/70 backdrop-blur-xl shadow-glass`) which violates the Fairway
 * "cream, not white / matte, no glass on content" rule inside `.fairway-ds`.
 * This is the flat, matte equivalent: it REUSES ONLY the legacy pure logic
 * helpers (`toScalePct`, `formatValue`, `deltaVsTeam`, `teamRelativeText`,
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
import { Skeleton } from '@/components/fairway/feedback';
import {
  type StandingBarProps,
  type RenderState,
  type MarkerLayoutInput,
  toScalePct,
  formatValue,
  deltaVsTeam,
  teamRelativeText,
  deriveState,
  shouldShowTeamMarker,
  deriveAriaLabel,
  pgaReferenceLabel,
  neutralizeForCoach,
  standingSubjectLabel,
  resolveDisplayScale,
  layoutMarkerPositions,
  MARKER_MIN_GAP_PCT,
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
  // CF-3's SG-metric detector, hoisted above the scale math below — the SAME
  // regex `isFieldAvgRef` used to compute on its own further down. SG
  // metrics anchor to a definitional zero (field average), so the widened
  // domain (next) must stay symmetric around it, not drift off-center.
  const isSgMetric = /^sg_/.test(props.metric_id);
  // Bug: `props.scale` (metric-config's fixed per-metric range, e.g.
  // sg_approach: -1.5..1.5) is a TYPICAL range, not a hard bound — an
  // outlier round's team_avg/player_value can land outside it. Clamping
  // `toScalePct` to that fixed domain used to pin the marker at the literal
  // 0%/100% edge — which the card's own `overflow-clip` cuts in half, and
  // which silently draws a -2.43 in the exact same spot as a -1.50. Widen
  // the domain to cover every value actually being plotted first.
  const effectiveScale = resolveDisplayScale(
    props.scale,
    [props.player_value, showTeam ? props.team_avg : null, props.pga_omitted ? null : props.pga_value],
    { symmetric: isSgMetric },
  );
  const youPct = toScalePct(props.player_value, effectiveScale);
  const teamPct = showTeam && props.team_avg !== null ? toScalePct(props.team_avg, effectiveScale) : null;
  // F006: omit the reference tick + value entirely when the anchor is suppressed
  // (mirror legacy Card.tsx). A women's player on a metric with no credible
  // women's baseline must NOT be drawn against a misleading men's-Tour value.
  const pgaPct = props.pga_omitted ? null : toScalePct(props.pga_value, effectiveScale);
  const delta = deltaVsTeam(props.player_value, props.team_avg, props.direction, props.unit);
  // W1 regression fix: the caption MUST derive from the same mean-relative
  // comparison as the ↑/↓ arrow + tone above (both come from `delta`, which is
  // `deltaVsTeam(player_value, team_avg, direction)`). The percentile-based
  // `teamCohortText(team_pct, team_n)` this used to call can disagree with
  // that arrow on a skewed roster — e.g. a player at 0.81 sits ABOVE the
  // 0.65 team-mean (arrow up, "better than team") but BELOW the 50th
  // percentile if a handful of teammates cluster just above them, so the old
  // caption read "Below team average" under an up-arrow "better" badge. Use
  // `teamRelativeText`, the same mean-relative helper Card/Inline/Hero use,
  // so value + arrow + caption always agree. Gate on the SAME team_n>=5 floor
  // the team marker uses (`showTeam`), so we never narrate a comparison we
  // won't draw.
  const cohortText =
    props.show_cohort_text !== false && showTeam
      ? neutralizeForCoach(
          teamRelativeText(props.player_value, props.team_avg, props.direction, props.unit),
          props.viewer_context,
        )
      : '';
  // Bug #915: the hero marker/readout is labeled "You" for a player's own
  // view, but a coach reading a teammate's card sees the player's initials
  // instead — the coach is never "you" to the player being read.
  const heroLabel = standingSubjectLabel(props.viewer_context, props.player_name);
  // CF-3: SG metrics anchor to the field average (0), not a PGA Tour score.
  // Women's teams get "LPGA" instead of "PGA" for non-SG metrics.
  const refLabel = pgaReferenceLabel(props.metric_id, props.is_womens).short;
  // Bug #949 #7: an SG metric's reference value is DEFINITIONALLY 0 (the
  // field average IS the zero point SG is computed against) — a "Field Avg
  // 0.00" readout column can never say anything else, on every player, every
  // team, every time. It was also a straight duplicate of the SAME "FIELD
  // AVG" text already labeling the reference tick on the bar above. Suppress
  // the redundant readout for SG metrics only — non-SG metrics still anchor
  // to a genuine, informative PGA/LPGA Tour number in that third column.
  const isFieldAvgRef = isSgMetric;

  // ONE "behind-benchmark" hue: 'bad' reads as the neutral/amber system tone
  // (fw-warning) everywhere a strip renders — not red — so it never collides
  // with a genuinely-red error state, and matches the amber "behind Tour"
  // read used elsewhere on the same stats surfaces.
  const deltaToneClass =
    delta.tone === 'good' ? 'text-accent-600' :
    delta.tone === 'bad'  ? 'text-fw-warning-ink' :
                            'text-text-tertiary';

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      data-slot="standing-strip"
      data-state={state}
      // overflow-clip: containment safety net for the You-badge + tick
      // labels in `StripTrack` below — see `clampPct` there for the actual
      // fix (a wider edge margin so nothing needs to clip in practice).
      className="overflow-clip rounded-card border border-border-subtle bg-surface p-4 shadow-soft"
    >
      {/* Header: label + vs-team delta as a colored pill (green = better).
          finding [120] — the title used `truncate` (single-line ellipsis),
          which silently swallowed a metric label's distinguishing suffix
          (e.g. two labels that only differ in their trailing qualifier
          collapsed to the same visible ellipsis). Wrap instead: `min-w-0`
          lets the title shrink inside the flex row, `break-words` lets a
          long label wrap onto a second line rather than clip, and the row
          switches to `items-start` so a wrapped two-line title doesn't
          vertically center-crush the delta pill beside it. */}
      <div className="mb-1 flex items-start justify-between gap-2">
        <h4 className="min-w-0 flex-1 break-words font-fw-display text-body font-semibold tracking-[-0.01em] text-text-primary">
          {props.metric_label}
        </h4>
        {showTeam ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-fw-mono text-caption font-bold tabular-nums',
              delta.tone === 'good'
                ? 'bg-accent-700 text-text-on-accent'
                : delta.tone === 'bad'
                  ? 'bg-fw-warning-bg text-fw-warning-ink'
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

      {/* High-contrast readouts (You is the green hero figure). Bug #949 #7:
          an SG metric's reference column is dropped here — it's a constant
          "Field Avg 0.00" (SG is computed AGAINST that zero point, so it can
          never read anything else) that only duplicated the same "FIELD AVG"
          text the tick above already carries. The tick stays (a useful
          visual anchor); the redundant, unchanging number does not. Non-SG
          metrics keep the real, informative PGA/LPGA readout. */}
      <div className={cn('grid gap-2', isFieldAvgRef ? 'grid-cols-2' : 'grid-cols-3')}>
        <Readout label={heroLabel} value={formatValue(props.player_value, props.unit)} tone="accent" align="start" />
        {showTeam && props.team_avg !== null ? (
          <Readout
            label="Team"
            value={formatValue(props.team_avg, props.unit)}
            align={isFieldAvgRef ? 'end' : 'center'}
          />
        ) : (
          <Readout
            label="Team"
            value="—"
            tone="muted"
            align={isFieldAvgRef ? 'end' : 'center'}
          />
        )}
        {/* F006: suppress the reference value too when omitted — render "—". */}
        {isFieldAvgRef ? null : props.pga_omitted ? (
          <Readout label={refLabel} value="—" tone="muted" align="end" />
        ) : (
          <Readout label={refLabel} value={formatValue(props.pga_value, props.unit)} align="end" />
        )}
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

/**
 * Keep markers + the floating badge clear of the very edge so nothing
 * clips. 5%/95% (the pre-existing margin) only accounts for the DOT/PIN
 * marker itself — it doesn't leave room for the wider text mounted beside
 * it (the "You" value badge, or a tick's "FIELD AVG"/"TEAM" label), which
 * is centered on the SAME left:% via `-translate-x-1/2`. On a 390px mobile
 * card the track is ~300-320px wide; "FIELD AVG" at the track's own
 * font/size runs ~60-70px, so its half-width (~30-35px) needs roughly a
 * 10-11% margin just to clear the track's own edge — 5% clipped it before
 * `overflow-clip` was added to the card above. 13% gives real clearance
 * (not just a clip backstop) for every label this component renders,
 * verified against the longest ("FIELD AVG") at the narrowest supported
 * card width.
 */
const clampPct = (n: number) => Math.max(13, Math.min(87, n));

function StripTrack({
  youPct,
  teamPct,
  pgaPct,
  youValue,
  refLabel,
}: {
  youPct: number;
  teamPct: number | null;
  /** F006: null → the reference ("P") tick is omitted (suppressed anchor). */
  pgaPct: number | null;
  youValue: string;
  /** CF-3: the reference-tick label ("PGA" / "FIELD AVG"). */
  refLabel: string;
}) {
  // Bug: near-equal values (e.g. player and team landing within a percent
  // or two of each other) put the You dot directly on top of a tick,
  // effectively hiding one marker behind the other. Nudge apart any raw
  // positions within MARKER_MIN_GAP_PCT before drawing — computed ONCE
  // here so both the tier-1 "You" badge above and the tier-2 dot/ticks
  // below read the SAME final position (nudging only one of the two would
  // make the badge point at a different spot than the dot it labels).
  //
  // ORDER BEFORE CLAMP (audit 2026-07-24, P-06). `clampPct` squashes every
  // out-of-domain value onto the same band edge, so two markers below the
  // domain both became 13% — and `layoutMarkerPositions` separates ties in
  // ARRAY order, not by value. That silently INVERTED the comparison: on
  // "SG: Total" (you -4.44, team -5.02) the You dot drew to the LEFT of the
  // Team tick, contradicting both the numbers printed beside it and the
  // card's own "Above team average" verdict — and "SG: Putting", where the
  // player really was behind, rendered a pixel-identical chart.
  //
  // Ranking by the TRUE (unclamped) value first means the tie-break inside
  // `layoutMarkerPositions` — a stable sort — preserves real value order, so
  // clamping can never reorder two markers again.
  const trueOrder: MarkerLayoutInput[] = [{ key: 'you', pct: youPct }];
  if (pgaPct !== null) trueOrder.push({ key: 'pga', pct: pgaPct });
  if (teamPct !== null) trueOrder.push({ key: 'team', pct: teamPct });
  trueOrder.sort((a, b) => a.pct - b.pct);
  const rawMarkers: MarkerLayoutInput[] = trueOrder.map((m) => ({ key: m.key, pct: clampPct(m.pct) }));
  // Pass the 13-87 band INTO the layout instead of clamping its output.
  //
  // This line used to be `.map((p) => [p.key, clampPct(p.pct)])`, which undid
  // the work it had just done: `layoutMarkerPositions` guarantees a 9-point
  // gap but only knew about the full 0-100 rail, so on a card where every
  // value sits outside the band the nudged positions landed below 13 and the
  // per-marker clamp collapsed them all back onto 13 — drawing the Team tick
  // underneath the You dot. Reproduced on prod 2026-07-25 with SG: Putting
  // (you -3.00, team -3.15 on a ±3.65 domain → 8.9% and 6.8%, both clamped to
  // 13). Given the bounds, the layout shifts the whole chain instead, so the
  // gap survives.
  const nudged = new Map(
    layoutMarkerPositions(rawMarkers, MARKER_MIN_GAP_PCT, 13, 87).map((p) => [p.key, p.pct]),
  );
  const you = nudged.get('you')!;
  const pga = pgaPct !== null ? nudged.get('pga')! : null;
  const team = teamPct !== null ? nudged.get('team')! : null;
  return (
    <div className="relative px-1 pb-7">
      {/* Tier 1 — the floating green "You" value badge gets its OWN row in
          normal document flow, strictly above the tick-label tier below.
          Previously the badge was absolutely positioned inside the same
          box as the track's tick labels (just a top offset apart), so
          whenever youPct and teamPct landed close together the badge
          visually swallowed the "TEAM" above-bar label (only a stray
          letter would peek out from behind the pill). Two stacked flow
          boxes can never overlap regardless of how close the two markers
          are — this is a structural guarantee, not a distance threshold. */}
      <div className="relative h-7" data-slot="you-badge-tier">
        <div
          className="absolute top-0 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-700 px-2.5 py-1 font-fw-mono text-caption font-bold tabular-nums text-text-on-accent shadow-soft"
          style={{ left: `${you}%` }}
        >
          {youValue}
        </div>
      </div>

      {/* Tier 2 — headroom for the "TEAM" above-bar label, then the track
          itself. Lives below tier 1 in flow, so it (and the TEAM label
          inside it) is always clear of the You badge. */}
      <div className="relative pt-7" data-slot="track-tier">
        {/* The track — defined ring so it reads against the card */}
        <div className="relative h-2.5 w-full rounded-full bg-inset ring-1 ring-inset ring-border-strong">
          {/* Reference tick — black, high contrast (PGA, or "FIELD AVG" for SG).
              Label goes BELOW the bar so it never collides with the TEAM label.
              F006: omitted entirely when the anchor is suppressed (pga === null). */}
          {pga !== null ? (
            <Tick leftPct={pga} barClass="bg-text-primary" labelClass="text-text-secondary" label={refLabel} labelSide="below" />
          ) : null}
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
          'font-fw-mono text-body font-semibold tabular-nums',
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
      className="rounded-card border border-border-subtle bg-surface p-4"
    >
      <Skeleton className="mb-3 h-3 w-28 rounded" />
      <Skeleton className="mb-2 h-2 w-full rounded" />
      <Skeleton className="h-2 w-2/3 rounded" />
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
