'use client';

/**
 * ============================================================================
 * CoachHelm · chat · evidence figures
 * ----------------------------------------------------------------------------
 * The drawing layer under `EvidenceVisuals`. One card anatomy for every answer
 * visual — entity, title, the answer as a number, the figure, then one
 * provenance line — so a coach reads a putting curve, a scoring trend and a
 * strokes-gained split the same way.
 *
 * Why these are hand-drawn instead of the shared Recharts charts:
 *
 *   - The chat column is 360px on a phone and 830px on a desktop. A viewBox
 *     SVG (MakeCurve) scales its TEXT with the width, so its tick labels were
 *     ~6px on a phone and ~15px on a desktop. These figures measure their box
 *     and draw at real pixels, so an 11px label is 11px everywhere.
 *   - A round is a discrete event. A smoothed spline between rounds draws
 *     values that never happened; straight segments with a dot per round show
 *     what was measured.
 *   - Bars and diverging bars are HTML: labels wrap instead of truncating
 *     ("around the …"), and the value sits on the bar instead of on an axis.
 *
 * Data renders final on mount (no draw-on, no count-up), per the Fairway
 * motion rules.
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { InstrumentTable, InstrumentTableToggle } from '@/components/fairway/charts';
import type { ChartTableData } from '@/components/fairway/charts';
import { niceAxis } from '@/components/fairway/charts/TrendChart';
import { motion } from 'motion/react';
import { EVIDENCE_MOTION, useEvidenceMotion } from './EvidenceMotion';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface EvidenceCardProps {
  /** Who the figure is about ("Maya Chen", "Team"). */
  overline?: string;
  title: string;
  /** The answer, set large: the latest value, the biggest leak, the leader. */
  headline?: React.ReactNode;
  /** One line of provenance: window · sample · freshness. Always at the foot. */
  provenance?: string;
  /** Spoken summary of the figure (the figure itself is hidden from AT). */
  ariaLabel: string;
  tableData?: ChartTableData;
  /** The figure. Optional: a headline card is all headline. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * The one shell every chat visual sits in: matte surface, hairline border,
 * header → headline → figure → provenance footer.
 */
export function EvidenceCard({
  overline,
  title,
  headline,
  provenance,
  ariaLabel,
  tableData,
  children,
  className,
}: EvidenceCardProps) {
  const [showTable, setShowTable] = React.useState(false);
  const titleId = React.useId();
  const hasTable = Boolean(tableData && tableData.rows.length > 0);

  return (
    <section
      aria-labelledby={titleId}
      data-slot="evidence-card"
      className={cn('flex flex-col rounded-card border border-border-subtle bg-surface', className)}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          {overline && <p className="font-fw-sans text-caption text-text-tertiary">{overline}</p>}
          <h3 id={titleId} className="font-fw-sans text-body font-semibold text-text-primary">
            {title}
          </h3>
        </div>
        {hasTable && <InstrumentTableToggle show={showTable} onToggle={() => setShowTable((v) => !v)} />}
      </header>

      {headline && <div className="px-4 pt-3 sm:px-5">{headline}</div>}

      {children == null ? (
        <div className="pb-4 sm:pb-5" />
      ) : (
        <div className="px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
          {showTable && tableData ? (
            <InstrumentTable data={tableData} />
          ) : (
            // `inert`, not just aria-hidden: the figure is decorative for a
            // screen reader (the table is the readout), and nothing inside it
            // should take focus.
            <div role="img" aria-label={ariaLabel} className="relative w-full">
              <div aria-hidden inert className="w-full">
                {children}
              </div>
            </div>
          )}
        </div>
      )}

      {provenance && (
        <footer className="border-t border-border-subtle px-4 py-2.5 sm:px-5">
          <p className="font-fw-sans text-caption text-text-tertiary">{provenance}</p>
        </footer>
      )}
    </section>
  );
}

/**
 * The answer as a number: a big tabular figure, an optional verdict chip, and
 * a caption saying what the number is.
 */
export function Headline({
  value,
  chip,
  caption,
}: {
  value: React.ReactNode;
  chip?: React.ReactNode;
  caption?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-fw-sans text-h1 tabular-nums text-text-primary">{value}</span>
      {chip && <span className="self-center">{chip}</span>}
      {caption && <span className="basis-full font-fw-sans text-caption text-text-secondary">{caption}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

const useIsoLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/** The box's CSS width, kept current. Null until the first measure. */
function useMeasuredWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number | null] {
  const ref = React.useRef<T | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width) || null);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

// ---------------------------------------------------------------------------
// Line figure — rounds over time, or a rate across ordered bands
// ---------------------------------------------------------------------------

export interface LinePoint {
  key: string;
  /** X-axis label ("Sep 26", "3–8 ft"). */
  label: string;
  value: number;
  /** Dot radius in px; defaults to a uniform small dot. */
  radius?: number;
  /** Drawn as an outline: a thin sample that must not read as a solid one. */
  hollow?: boolean;
  /** The point the answer is about: a ring around the dot and a heavier label. */
  emphasis?: boolean;
}

export interface LineFigureProps {
  points: LinePoint[];
  format: (value: number) => string;
  height?: number;
  /** A dashed reference: the benchmark, or the player's own average. */
  reference?: { value: number; label: string };
  /** Fixed y-domain (a rate is always 0–100). Otherwise fitted to the data. */
  domain?: [number, number];
  /** Print every point's value (bands) or only the latest (rounds). */
  valueLabels?: 'all' | 'last';
  /** Every x label (bands) or first / middle / last (rounds). */
  xLabels?: 'all' | 'sparse';
  /** Shade under the line. On for bands, where the area is the make share. */
  area?: boolean;
}

const AXIS_FONT = 11;
const PLOT_TOP = 22;
const PLOT_BOTTOM = 24;

export function LineFigure({
  points,
  format,
  height = 176,
  reference,
  domain,
  valueLabels = 'last',
  xLabels = 'sparse',
  area = false,
}: LineFigureProps) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const gradientId = React.useId();

  const values = points.map((p) => p.value);
  const axis = React.useMemo(() => {
    if (domain) return niceAxis(domain[0], domain[1], 3);
    const all = reference ? [...values, reference.value] : values;
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = Math.max((max - min) * 0.18, Math.max(Math.abs(max), 1) * 0.02);
    return niceAxis(min - pad, max + pad, 4);
    // `values` is derived from `points` each render; key on the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, reference?.value, domain?.[0], domain?.[1]]);

  const gutter = Math.max(...axis.ticks.map((t) => format(t).length)) * 6.4 + 10;

  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width !== null && width > 0 && (
        <LineSvg
          width={width}
          height={height}
          points={points}
          axis={axis}
          gutter={gutter}
          format={format}
          reference={reference}
          valueLabels={valueLabels}
          xLabels={xLabels}
          area={area}
          gradientId={gradientId}
        />
      )}
    </div>
  );
}

function LineSvg({
  width,
  height,
  points,
  axis,
  gutter,
  format,
  reference,
  valueLabels,
  xLabels,
  area,
  gradientId,
}: {
  width: number;
  height: number;
  points: LinePoint[];
  axis: { min: number; max: number; ticks: number[] };
  gutter: number;
  format: (value: number) => string;
  reference?: { value: number; label: string };
  valueLabels: 'all' | 'last';
  xLabels: 'all' | 'sparse';
  area: boolean;
  gradientId: string;
}) {
  const animate = useEvidenceMotion();
  const d0 = EVIDENCE_MOTION.figureDelay;
  // Half a band of inset on each side so the first and last dots, and their
  // labels, never sit on the card edge.
  const inset = xLabels === 'all' ? Math.min(32, (width - gutter) / (points.length * 2)) : 8;
  const x0 = gutter + inset;
  const x1 = width - inset - 4;
  const y0 = PLOT_TOP;
  const y1 = height - PLOT_BOTTOM;
  const span = axis.max - axis.min || 1;

  const xAt = (i: number) =>
    points.length === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (points.length - 1);
  const yAt = (v: number) => y1 - ((v - axis.min) / span) * (y1 - y0);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${r1(xAt(i))},${r1(yAt(p.value))}`).join('');
  const areaPath = `${path}L${r1(xAt(points.length - 1))},${y1}L${r1(xAt(0))},${y1}Z`;

  const last = points.length - 1;
  const shownX = new Set(
    xLabels === 'all' ? points.map((_, i) => i) : [0, Math.floor(last / 2), last].filter((i) => i >= 0),
  );

  const refY = reference ? yAt(reference.value) : null;
  const lastY = points.length > 0 ? yAt(points[last]!.value) : 0;
  const refLabelBelow = refY !== null && lastY <= refY && refY - lastY < 22;

  return (
    <svg width={width} height={height} className="block overflow-visible font-fw-sans">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--fw-color-accent-500)" stopOpacity={0.16} />
          <stop offset="100%" stopColor="var(--fw-color-accent-500)" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Gridlines + y ticks */}
      {axis.ticks.map((t) => (
        <g key={t}>
          <line x1={gutter} x2={width} y1={yAt(t)} y2={yAt(t)} stroke="var(--fw-viz-grid)" strokeWidth={1} />
          <text
            x={gutter - 8}
            y={yAt(t)}
            dy="0.35em"
            textAnchor="end"
            fontSize={AXIS_FONT}
            fill="var(--fw-color-text-tertiary)"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {format(t)}
          </text>
        </g>
      ))}

      {/* Reference */}
      {reference && refY !== null && (
        <g>
          <line
            x1={gutter}
            x2={width}
            y1={refY}
            y2={refY}
            stroke="var(--fw-viz-benchmark)"
            strokeWidth={1.25}
            strokeDasharray="4 4"
          />
          <text
            x={width}
            // Above the line, unless the latest point sits there.
            y={refLabelBelow ? refY + 14 : refY - 6}
            textAnchor="end"
            fontSize={AXIS_FONT}
            fontWeight={500}
            fill="var(--fw-color-text-secondary)"
          >
            {reference.label} {format(reference.value)}
          </text>
        </g>
      )}

      <motion.path
        d={areaPath}
        fill={`url(#${gradientId})`}
        initial={animate ? { opacity: 0 } : false}
        animate={{ opacity: area ? 1 : 0.6 }}
        transition={{ duration: EVIDENCE_MOTION.line.duration, delay: animate ? d0 + 0.2 : 0 }}
      />

      {/* The line draws left to right, round by round; then each round's dot lands. */}
      <motion.path
        d={path}
        fill="none"
        stroke="var(--fw-color-accent-500)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ ...EVIDENCE_MOTION.line, delay: animate ? d0 : 0 }}
      />

      {/* Points */}
      {points.map((p, i) => {
        const isLast = i === last;
        const r = p.radius ?? (isLast && valueLabels === 'last' ? 4.5 : 3);
        const showValue = valueLabels === 'all';
        const cy = yAt(p.value);
        // Each dot lands as the line reaches it.
        const at = d0 + EVIDENCE_MOTION.line.duration * (last > 0 ? i / last : 1) * 0.9;
        return (
          <motion.g
            key={p.key}
            initial={animate ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ ...EVIDENCE_MOTION.dot, delay: animate ? at : 0 }}
          >
            {p.emphasis && (
              <circle
                cx={xAt(i)}
                cy={cy}
                r={r + 5}
                fill="none"
                stroke="var(--fw-color-accent-500)"
                strokeWidth={1.5}
                opacity={0.5}
              />
            )}
            {isLast && valueLabels === 'last' && (
              <circle cx={xAt(i)} cy={cy} r={r + 4} fill="var(--fw-color-accent-500)" opacity={0.14} />
            )}
            <circle
              cx={xAt(i)}
              cy={cy}
              r={r}
              fill={p.hollow ? 'var(--fw-color-surface)' : 'var(--fw-color-accent-500)'}
              stroke={p.hollow ? 'var(--fw-color-accent-500)' : 'var(--fw-color-surface)'}
              strokeWidth={1.5}
            />
            {showValue && (
              <text
                x={xAt(i)}
                y={cy - r - 7}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="var(--fw-color-text-primary)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {format(p.value)}
              </text>
            )}
            {shownX.has(i) && (
              <text
                x={xAt(i)}
                y={height - 6}
                textAnchor={xLabels === 'all' ? 'middle' : i === 0 ? 'start' : i === last ? 'end' : 'middle'}
                fontSize={AXIS_FONT}
                fill="var(--fw-color-text-tertiary)"
              >
                {p.label}
              </text>
            )}
          </motion.g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Bar rows — categories, or players on one metric
// ---------------------------------------------------------------------------

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Shown under the label: "41 shots", "15 rounds". */
  detail?: string;
  /** Leading marker, e.g. a rank. */
  lead?: string;
  /** The row the figure is about (the leader, the selected band). */
  emphasis?: boolean;
}

/**
 * Horizontal rows, one per category or player, as HTML.
 *
 * `scale="zero"` draws bars from zero — right for distances and counts.
 * `scale="fit"` places a dot on a shared axis fitted to the values — right for
 * a scoring average, where 72.6 and 75.8 drawn from zero are two bars of the
 * same length and the ranking the coach asked for disappears.
 */
export function BarRows({
  rows,
  format,
  scale = 'zero',
}: {
  rows: BarRow[];
  format: (value: number) => string;
  scale?: 'zero' | 'fit';
}) {
  const animate = useEvidenceMotion();
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;
  const fit = React.useMemo(() => {
    if (scale !== 'fit') return null;
    const vs = rows.map((r) => r.value);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 0.005, 0.5);
    return niceAxis(lo - pad, hi + pad, 3);
  }, [rows, scale]);

  const position = (v: number) =>
    fit ? ((v - fit.min) / (fit.max - fit.min || 1)) * 100 : Math.max(2, (Math.abs(v) / max) * 100);

  return (
    <div>
      <ol className="flex flex-col gap-3">
        {rows.map((r, idx) => (
          <li
            key={r.key}
            className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]"
          >
            <div className="flex min-w-0 items-baseline gap-2">
              {r.lead && (
                <span className="w-4 shrink-0 font-fw-sans text-caption tabular-nums text-text-tertiary">
                  {r.lead}
                </span>
              )}
              <div className="min-w-0">
                <p
                  className={cn(
                    'truncate font-fw-sans text-body-sm text-text-primary',
                    r.emphasis && 'font-semibold',
                  )}
                >
                  {r.label}
                </p>
                {r.detail && <p className="font-fw-sans text-caption text-text-tertiary">{r.detail}</p>}
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2.5">
              {fit ? (
                <div className="relative h-2 min-w-0 flex-1 rounded-full bg-surface-sunken">
                  <motion.span
                    initial={animate ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{
                      ...EVIDENCE_MOTION.dot,
                      delay: animate ? EVIDENCE_MOTION.figureDelay + idx * 0.05 : 0,
                    }}
                    className={cn(
                      'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--fw-color-surface)]',
                      r.emphasis ? 'bg-accent-fill' : 'bg-[var(--fw-color-accent-300)]',
                    )}
                    style={{ left: `${position(r.value)}%` }}
                  />
                </div>
              ) : (
                <div className="h-2 min-w-0 flex-1 rounded-full bg-surface-sunken">
                  <motion.div
                    initial={animate ? { scaleX: 0 } : false}
                    animate={{ scaleX: 1 }}
                    transition={{
                      ...EVIDENCE_MOTION.bar,
                      delay: animate ? EVIDENCE_MOTION.figureDelay + idx * 0.05 : 0,
                    }}
                    className={cn(
                      'h-full origin-left rounded-full',
                      r.emphasis ? 'bg-accent-fill' : 'bg-[var(--fw-color-accent-300)]',
                    )}
                    style={{ width: `${position(r.value)}%` }}
                  />
                </div>
              )}
              <span
                className={cn(
                  'w-14 shrink-0 text-right font-fw-sans text-body-sm tabular-nums text-text-primary',
                  r.emphasis ? 'font-semibold' : 'font-medium',
                )}
              >
                {format(r.value)}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {fit && (
        // The fitted axis's ends, so a dot's position reads as a value and the
        // axis is visibly not zero-based.
        <div className="mt-2 grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-x-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
          <span />
          <div className="flex justify-between pr-[4.125rem] font-fw-sans text-caption tabular-nums text-text-tertiary">
            <span>{format(fit.min)}</span>
            <span>{format(fit.max)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diverging rows — signed distance from a baseline (strokes gained)
// ---------------------------------------------------------------------------

/**
 * Each category as a bar either side of zero: gained to the right in green,
 * lost to the left in amber. The value is printed at the bar's end, and the
 * label has its own line so "Around the green" is never cut to "around the …".
 */
export function DivergingRows({
  rows,
  format,
}: {
  rows: Array<{ key: string; label: string; value: number }>;
  format: (value: number) => string;
}) {
  const animate = useEvidenceMotion();
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0.1);
  return (
    <div>
      <div className="mb-2 grid grid-cols-2 font-fw-sans text-caption text-text-tertiary">
        <span>Lost</span>
        <span className="text-right">Gained</span>
      </div>
      <ol className="relative flex flex-col gap-3.5">
        {/* The zero line, the baseline every bar is measured from. */}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border-strong" />
        {rows.map((r, idx) => {
          // 34% of the width at most, so the printed value always fits beyond
          // the longest bar.
          const pct = (Math.abs(r.value) / max) * 34;
          const gained = r.value >= 0;
          return (
            <li key={r.key} className="relative">
              <p className="mb-1 font-fw-sans text-body-sm text-text-primary">{r.label}</p>
              <div className="relative h-5">
                <motion.div
                  initial={animate ? { scaleX: 0 } : false}
                  animate={{ scaleX: 1 }}
                  transition={{
                    ...EVIDENCE_MOTION.bar,
                    delay: animate ? EVIDENCE_MOTION.figureDelay + idx * 0.06 : 0,
                  }}
                  className={cn(
                    'absolute top-0 h-full rounded-fw-sm',
                    gained ? 'origin-left' : 'origin-right',
                  )}
                  style={{
                    background: gained ? 'var(--fw-viz-div-pos)' : 'var(--fw-viz-div-neg)',
                    width: `${Math.max(pct, 0.75)}%`,
                    ...(gained ? { left: '50%' } : { right: '50%' }),
                  }}
                />
                <motion.span
                  initial={animate ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{
                    ...EVIDENCE_MOTION.dot,
                    delay: animate ? EVIDENCE_MOTION.figureDelay + 0.3 + idx * 0.06 : 0,
                  }}
                  className={cn(
                    'absolute top-0 flex h-full items-center font-fw-sans text-caption font-semibold tabular-nums',
                    gained ? 'text-fw-success-ink' : 'text-fw-warning-ink',
                  )}
                  style={
                    gained ? { left: `calc(50% + ${pct}% + 6px)` } : { right: `calc(50% + ${pct}% + 6px)` }
                  }
                >
                  {format(r.value)}
                </motion.span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
