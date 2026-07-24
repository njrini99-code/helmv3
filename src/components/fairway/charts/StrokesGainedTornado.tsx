'use client';

/**
 * ============================================================================
 * StrokesGainedTornado — the flagship diverging horizontal bar (§5.2)
 * ----------------------------------------------------------------------------
 * visx-based (the brief's surgical bespoke chart). Diverging bars around
 * x = 0 (the benchmark): green to the RIGHT (strokes gained), warm amber to
 * the LEFT (strokes lost). This REPLACES the old text rows + off-palette blue
 * box — and it is NOT two radars.
 *
 * Bars encode meaning by length + side (color is never the only channel); each
 * row is annotated with its signed value in tabular mono. Keyboard-focusable
 * rows announce their value via the row's `aria-label`; the full readout also
 * lives in ChartFrame's "view as table" toggle.
 * ========================================================================== */

import * as React from 'react';
import { Group } from '@visx/group';
import { Bar, Line } from '@visx/shape';
import { scaleBand, scaleLinear } from '@visx/scale';
import { ParentSize } from '@visx/responsive';
import {
  ChartFrame,
  type ChartFrameState,
  type ChartTableData,
} from './ChartFrame';
import { VIZ_CHROME, VIZ_COLOR, VIZ_DIVERGING, VIZ_FONT, formatSigned } from './theme';

export interface SGCategory {
  /** category name, e.g. "Off the Tee", "Approach", "Putting" */
  label: string;
  /** strokes gained vs benchmark (signed; + gained / − lost) */
  value: number;
}

export interface StrokesGainedTornadoProps {
  title?: React.ReactNode;
  overline?: string;
  subtitle?: React.ReactNode;
  takeaway?: string;
  data: SGCategory[];
  /** symmetric domain bound; auto from data if omitted */
  domainMax?: number;
  height?: number;
  state?: ChartFrameState;
  /** Optional copy overriding the default empty/insufficient/error message. */
  stateMessage?: string;
  actions?: React.ReactNode;
  className?: string;
}

const ROW_PAD = 0.32;
// Wide enough for the longest category label ("Around the Green") at labelSize,
// accounting for the -12px end-anchored offset — 104 clipped it to "round the Green".
// This is the DESKTOP ceiling — every consumer (RoundSGSummary,
// FairwayEffectiveness, VizLabClient, fairway-preview, PatternImpactDeck)
// renders this chart well past GUTTER_CEIL_WIDTH below, so `scaledGutter`
// resolves to exactly this constant there (desktop output untouched).
export const LABEL_GUTTER = 126;
// Below GUTTER_FLOOR_WIDTH the label gutter never shrinks past this — long
// labels truncate with an ellipsis (+ a <title> carrying the full text)
// instead of collapsing the plot further.
export const LABEL_GUTTER_MIN = 56;
export const VALUE_GUTTER = 56;
export const VALUE_GUTTER_MIN = 24;

/**
 * #111: a row's OWN signed value annotation ("−12.34") sits just past its bar
 * tip (`valX ± 6`), textAnchor'd AWAY from x = 0. When a bar's value lands
 * near the domain's extreme — a real case whenever a caller passes a tight
 * `domainMax` (no auto 1.15 headroom) or the data itself peaks the axis —
 * that annotation's own width can carry it PAST x = 0 (colliding with the
 * category label in the left gutter) or past innerW (past the right VALUE
 * gutter). Reserving this inset on both ends of the plotting range guarantees
 * clearance for the longest realistic annotation ("−12.34", 6 glyphs at
 * tickSize/600-weight) regardless of how tight the domain padding is.
 */
export const VALUE_INSET = 56;
// A narrow card has no width to spare for the full #111 inset — shrinking it
// toward zero at GUTTER_FLOOR_WIDTH trades a little of that collision margin
// (short values at narrow widths rarely reach it) for a bar track that isn't
// crushed to a sliver.
export const VALUE_INSET_MIN = 8;

// Mobile-squeeze fix: at a ~310px card (phone width minus page + card
// padding), the old FIXED 126+56 margins plus a 56px-per-side #111 inset
// left the bar track only ~16px wide — the whole plot rendered as a sliver
// in the center of the card. Below GUTTER_CEIL_WIDTH, LABEL_GUTTER/
// VALUE_GUTTER/VALUE_INSET each interpolate linearly down to their _MIN
// toward GUTTER_FLOOR_WIDTH instead of staying pinned at their desktop
// constant. At/above GUTTER_CEIL_WIDTH every gutter is exactly its desktop
// constant — pixel-identical desktop rendering.
// Exported (alongside the constants above) purely for the colocated unit
// test — a pure-function assertion on the interpolation is far cheaper and
// more direct than reconstructing it from rendered SVG geometry.
export const GUTTER_FLOOR_WIDTH = 280;
export const GUTTER_CEIL_WIDTH = 480;

export function scaledGutter(width: number, min: number, max: number): number {
  if (width >= GUTTER_CEIL_WIDTH) return max;
  if (width <= GUTTER_FLOOR_WIDTH) return min;
  const t = (width - GUTTER_FLOOR_WIDTH) / (GUTTER_CEIL_WIDTH - GUTTER_FLOOR_WIDTH);
  return min + t * (max - min);
}

/**
 * Rough width (px) of a short SVG number label at the given font size — good
 * enough to reason about tick/annotation collision without real DOM layout
 * (`getBBox` isn't implemented in jsdom, and this must also work in SSR).
 * Exported for the colocated regression test, which asserts on this same
 * geometry rather than a real (unavailable-in-jsdom) bounding box.
 */
export function estimateLabelWidth(label: string, fontSize: number): number {
  return label.length * fontSize * 0.62;
}

/**
 * Truncates `label` to fit `maxWidth`, appending an ellipsis — the row
 * label's counterpart to `selectNonOverlappingTicks` below, using the same
 * jsdom/SSR-safe `estimateLabelWidth` heuristic instead of a real DOM
 * `getBBox`. Only engages once the responsive label gutter has shrunk below
 * what the label needs (narrow-card mobile squeeze fix) — the caller always
 * keeps the untruncated text available via a `<title>` child.
 */
export function truncateLabel(label: string, maxWidth: number, fontSize: number): string {
  if (estimateLabelWidth(label, fontSize) <= maxWidth) return label;
  const ELLIPSIS = '…';
  let fit = '';
  for (let i = 1; i <= label.length; i++) {
    const candidate = label.slice(0, i) + ELLIPSIS;
    if (estimateLabelWidth(candidate, fontSize) > maxWidth) break;
    fit = candidate;
  }
  return fit || ELLIPSIS;
}

export function StrokesGainedTornado({
  title = 'Strokes Gained',
  overline,
  subtitle,
  takeaway,
  data,
  domainMax,
  height = 260,
  state,
  stateMessage,
  actions,
  className,
}: StrokesGainedTornadoProps) {
  const resolvedState: ChartFrameState = state ?? (data.length === 0 ? 'empty' : 'ready');

  const tableData: ChartTableData = {
    caption: 'Strokes gained by category vs benchmark',
    columns: [
      { key: 'label', label: 'Category' },
      { key: 'value', label: 'Strokes gained', numeric: true },
    ],
    rows: data.map((d) => ({ label: d.label, value: formatSigned(d.value) })),
  };

  return (
    <ChartFrame
      title={title}
      overline={overline}
      subtitle={subtitle}
      takeaway={takeaway}
      state={resolvedState}
      stateMessage={stateMessage}
      height={height}
      tableData={tableData}
      actions={actions}
      className={className}
    >
      <ParentSize>
        {({ width, height: h }) =>
          width > 0 && h > 0 ? (
            <TornadoInner width={width} height={h} data={data} domainMax={domainMax} />
          ) : null
        }
      </ParentSize>
    </ChartFrame>
  );
}

/**
 * How many decimal places the x-axis ticks need so adjacent ticks never
 * collapse onto the same rounded label. `nice: true` guarantees a clean,
 * evenly-spaced tick STEP (1, 2, 5, 0.5, 0.02, …) — but a fixed 1-decimal
 * display doesn't scale down with it. A small-impact pattern set (a real,
 * common case — most patterns move well under a stroke) niced to a 0.02
 * step previously rendered three DISTINCT ticks as the indistinguishable
 * "+0.0 / −0.0 / +0.0" — a raw, unrounded-reading artifact from a display
 * precision that didn't match the scale's actual granularity. Deriving the
 * decimal count from the step itself keeps ticks honest at any scale.
 */
function tickDecimals(ticks: readonly number[]): number {
  if (ticks.length < 2) return 1;
  const step = Math.abs((ticks[1] as number) - (ticks[0] as number));
  if (!Number.isFinite(step) || step === 0) return 1;
  const str = step.toString();
  if (str.includes('e-')) {
    const exp = Number(str.split('e-')[1]);
    return Number.isFinite(exp) ? Math.min(exp, 4) : 1;
  }
  const dot = str.indexOf('.');
  return dot === -1 ? 0 : Math.min(str.length - dot - 1, 4);
}

/**
 * #111: `xScale.ticks(5)` is a REQUEST, not a guarantee — d3's tick algorithm
 * can return more ticks than asked for a "nicer" step (a small-magnitude
 * pattern set niced to a 0.02 step returns 7 ticks, e.g. "−0.06"/"−0.04"/…).
 * Combined with formatted labels wide enough to need decimals, those 7 ticks
 * can render closer together than their own label width — the digits visibly
 * merge ("−0.06−0.04" reading as one garbled run).
 *
 * This walks the candidate ticks left→right and keeps only the ones whose
 * estimated label footprint has real breathing room from the last KEPT
 * tick's footprint — a provable, width-independent guarantee that no two
 * rendered tick labels can ever overlap, however many ticks the scale hands
 * back or however narrow the plot gets.
 */
function selectNonOverlappingTicks(
  ticks: readonly number[],
  xScale: (v: number) => number,
  decimals: number,
): number[] {
  const MIN_TICK_GAP = 6;
  const kept: number[] = [];
  let lastRightEdge = -Infinity;
  for (const t of ticks) {
    const cx = xScale(t);
    const w = estimateLabelWidth(formatSigned(t, decimals), VIZ_FONT.tickSize);
    const leftEdge = cx - w / 2;
    if (leftEdge < lastRightEdge + MIN_TICK_GAP) continue;
    kept.push(t);
    lastRightEdge = cx + w / 2;
  }
  return kept;
}

/**
 * Exported for unit testing only — the parent `StrokesGainedTornado` always
 * mounts this through `<ParentSize>`, which needs real DOM layout. Rendering
 * `TornadoInner` directly with explicit `width`/`height` lets a test assert
 * on the resulting SVG geometry without fighting ResizeObserver in jsdom.
 */
export function TornadoInner({
  width,
  height,
  data,
  domainMax,
}: {
  width: number;
  height: number;
  data: SGCategory[];
  domainMax?: number;
}) {
  // Mobile-squeeze fix: gutters scale with the ACTUAL container width instead
  // of staying pinned at their desktop pixel constants (see `scaledGutter`).
  const labelGutter = scaledGutter(width, LABEL_GUTTER_MIN, LABEL_GUTTER);
  const valueGutter = scaledGutter(width, VALUE_GUTTER_MIN, VALUE_GUTTER);
  const margin = { top: 8, right: valueGutter, bottom: 22, left: labelGutter };

  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  const bound = React.useMemo(() => {
    const peak = data.reduce((m, d) => Math.max(m, Math.abs(d.value)), 0);
    const v = domainMax ?? peak * 1.15;
    return v === 0 ? 1 : v;
  }, [data, domainMax]);

  // #111: inset both ends of the plotting range so a value annotation at the
  // domain's extreme always has room to render without crossing x = 0 (into
  // the category-label gutter) or innerW (past the value gutter) — halved on
  // a plot too narrow to afford the full inset rather than going negative.
  const valueInset = scaledGutter(width, VALUE_INSET_MIN, VALUE_INSET);
  const plotInset = Math.min(valueInset, innerW / 2);
  const xScale = React.useMemo(
    () =>
      scaleLinear<number>({
        domain: [-bound, bound],
        range: [plotInset, innerW - plotInset],
        nice: true,
      }),
    [bound, innerW, plotInset],
  );

  // Keyed by ROW INDEX, never by `d.label`. Two rows can legitimately share a
  // label (e.g. `PatternImpactDeck`'s "Most impactful patterns" tornado uses
  // the player's NAME as the label, and one player can have two separate
  // high-impact patterns in the top-N) — `scaleBand`'s domain is a distinct
  // key set, so a duplicate label previously collapsed both rows onto the
  // SAME band, rendering their bars and value-annotation text on top of each
  // other (e.g. two adjacent "+4.10" / "+4.67" labels reading as the single
  // garbled string "+4.10+4.67"). Index-based keys are always unique.
  const yScale = React.useMemo(
    () =>
      scaleBand<number>({
        domain: data.map((_, i) => i),
        range: [0, innerH],
        padding: ROW_PAD,
      }),
    [data, innerH],
  );

  const zeroX = xScale(0);
  const barH = yScale.bandwidth();
  const rawXTicks = xScale.ticks(5);
  const xTickDecimals = tickDecimals(rawXTicks);
  const xTicks = selectNonOverlappingTicks(rawXTicks, xScale, xTickDecimals);

  // Available width for a category label before it must truncate — the text
  // is end-anchored at x = -12 (local/Group-offset coords), so it grows
  // leftward from there toward the SVG's own left edge. At the full desktop
  // gutter this is deliberately unbounded rather than `LABEL_GUTTER - 12`:
  // `estimateLabelWidth`'s per-char heuristic (tuned for the cheap tick-
  // collision check above) slightly OVERESTIMATES "Around the Green" versus
  // LABEL_GUTTER's own real-browser-tuned value, so gating on it even at the
  // desktop constant would truncate a label the desktop margin was
  // explicitly sized to fit — a regression. Truncation only ever engages
  // once the gutter has actually shrunk below the desktop constant.
  const labelMaxWidth = labelGutter >= LABEL_GUTTER ? Infinity : Math.max(20, labelGutter - 12);

  return (
    <svg width={width} height={height} aria-hidden>
      <Group left={margin.left} top={margin.top}>
        {/* x ticks — sparse, signed, tabular */}
        {xTicks.map((t) => (
          <g key={t}>
            <Line
              from={{ x: xScale(t), y: 0 }}
              to={{ x: xScale(t), y: innerH }}
              stroke={VIZ_CHROME.grid}
              strokeWidth={1}
            />
            <text
              x={xScale(t)}
              y={innerH + 16}
              textAnchor="middle"
              fontSize={VIZ_FONT.tickSize}
              fontFamily={VIZ_FONT.numeric}
              fill={VIZ_COLOR.textTertiary}
            >
              {formatSigned(t, xTickDecimals)}
            </text>
          </g>
        ))}

        {/* the emphasized baseline at x = 0 (the benchmark) */}
        <Line
          from={{ x: zeroX, y: 0 }}
          to={{ x: zeroX, y: innerH }}
          stroke={VIZ_CHROME.benchmark}
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />

        {data.map((d, i) => {
          const y = yScale(i) ?? 0;
          const valX = xScale(d.value);
          const positive = d.value >= 0;
          const barX = positive ? zeroX : valX;
          const barW = Math.abs(valX - zeroX);
          const fill = positive ? VIZ_DIVERGING.positive : VIZ_DIVERGING.negative;
          const displayLabel = truncateLabel(d.label, labelMaxWidth, VIZ_FONT.labelSize);
          return (
            <g key={`${i}-${d.label}`}>
              {/* category label in the left gutter — truncated with a
                  <title> fallback once the responsive gutter can't fit it
                  whole (narrow-card mobile squeeze fix) */}
              <text
                x={-12}
                y={y + barH / 2}
                dy="0.32em"
                textAnchor="end"
                fontSize={VIZ_FONT.labelSize}
                fontFamily={VIZ_FONT.numeric}
                fill={VIZ_COLOR.textSecondary}
              >
                {displayLabel !== d.label ? <title>{d.label}</title> : null}
                {displayLabel}
              </text>
              <Bar
                x={barX}
                y={y}
                width={barW}
                height={barH}
                fill={fill}
                rx={4}
              />
              {/* signed value annotation just past the bar tip */}
              <text
                x={positive ? valX + 6 : valX - 6}
                y={y + barH / 2}
                dy="0.32em"
                textAnchor={positive ? 'start' : 'end'}
                fontSize={VIZ_FONT.tickSize}
                fontFamily={VIZ_FONT.numeric}
                fontWeight={600}
                fill={VIZ_COLOR.textPrimary}
              >
                {formatSigned(d.value)}
              </text>
            </g>
          );
        })}
      </Group>
    </svg>
  );
}
