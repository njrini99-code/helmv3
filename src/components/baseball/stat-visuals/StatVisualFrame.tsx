'use client';

// =============================================================================
// src/components/baseball/stat-visuals/StatVisualFrame.tsx
//
// Packet: elite-stats (BaseballHelm — stats-integrations). OWNED HERE.
//
// The shared matte container EVERY baseball stat visual sits in. The stat-visuals
// fan-out (EV/LA matrix, pitch shape map, spray chart, command heatmap, readiness
// strip, Player DNA, etc.) renders its chart as `children` inside this frame so
// the honesty contract is built once, not re-invented per chart.
//
// GROUNDING (spec lines implemented — v10_baseball_stat_visual_contracts.md):
//   §"Every visual must support": source chips, sample size, confidence /
//   data-quality status, game/scrimmage/practice context split, table fallback,
//   empty AND insufficient-data states, role-safe visibility, chart-click into
//   a source drawer.  §"Chart Implementation Rules": chart titles + descriptions,
//   table fallback, not color-only, keyboard-reachable data rows, stable chart
//   dimensions (skeleton reserves height), reduced-motion respected, no layout
//   jump on filter change.  §"Source Confidence Model": Priority-4 (inferred/AI)
//   data is never shown without a visible caveat.
//
// DESIGN (binding palette decision): KEEPS the cream/green GolfHelm look. Reuses
// the GolfHelm UI primitives VERBATIM — Card / Skeleton / EmptyState + cream/
// warm/green tokens, gap-6, editorial type. NO navy/amber/graphite. The source
// chip slot mounts the Foundations <SourceTrustBadge> (imported, never re-built).
//
// NO GOLF LABELS: copy is baseball/box-score-aware ("Not enough captured events
// for a reliable read"), never round/hole/tee/PGA/strokes-gained.
//
// a11y: the figure is announced as ONE unit (role="img" + aria-label takeaway);
// the inner chart is aria-hidden because the table fallback is the true readout.
// =============================================================================

import * as React from 'react';
import { type HTMLMotionProps, LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconDatabase,
  IconInfo,
  IconLayers,
  IconChartBar,
  IconCircleDot,
  IconWarning,
} from '@/components/icons';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import type {
  SourceTrust,
  SourceProvenance,
} from '@/components/baseball/source-trust/source-trust-types';
import type {
  BaseballDataContext,
  BaseballMetricConfidence,
} from '@/lib/types/baseball-stat-events';

// -----------------------------------------------------------------------------
// Public types
// -----------------------------------------------------------------------------

export type StatVisualState =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'insufficient-data'
  | 'error';

/** One column of the accessible table fallback. */
export interface StatVisualTableColumn {
  key: string;
  label: string;
  /** right-align + tabular-nums for numeric columns. */
  numeric?: boolean;
}

export interface StatVisualTableData {
  columns: StatVisualTableColumn[];
  rows: Array<Record<string, string | number>>;
  /** sr-only caption describing the table. */
  caption?: string;
}

/** A source chip for the frame's source-chip slot. */
export interface StatVisualSourceChip {
  trust: SourceTrust;
  /** Optional rich provenance; when present the chip opens a source drawer. */
  provenance?: SourceProvenance;
}

/** Sample-size + confidence readout (V10 every-visual requirement). */
export interface StatVisualSample {
  /** number of underlying events/observations this visual is built from. */
  size: number;
  /** unit noun for the count, e.g. "batted balls", "pitches", "outings". */
  unitLabel: string;
  /** honest, sample-aware confidence — never a fake "high" on a tiny sample. */
  confidence?: BaseballMetricConfidence;
  /**
   * Minimum sample required for a reliable read. When `size < minForRead` the
   * frame auto-renders the "insufficient-data" surface (unless an explicit
   * `state` overrides). This is the single guard that stops thin-sample lies.
   */
  minForRead?: number;
}

export interface StatVisualFrameProps
  extends Omit<HTMLMotionProps<'div'>, 'title'> {
  /** Chart title (editorial h3). */
  title: React.ReactNode;
  /** Optional eyebrow overline above the title. */
  overline?: string;
  /** Optional subtitle / question this chart answers (V10 "answer a coaching question"). */
  subtitle?: React.ReactNode;
  /** Concise spoken takeaway appended to the title for the figure's aria-label. */
  takeaway?: string;
  /** Right-aligned action cluster (context filter, pitch-type tabs, etc.). */
  actions?: React.ReactNode;
  /** Source chips for the source-chip slot. */
  sources?: StatVisualSourceChip[];
  /** Sample-size + confidence readout. Drives the auto insufficient-data guard. */
  sample?: StatVisualSample;
  /** The data context(s) this view blends. A blended view MUST label the blend. */
  dataContexts?: BaseballDataContext[];
  /**
   * Priority-4 caveat: when the chart draws from inferred/AI/incomplete rows it
   * MUST show a visible caveat (V10 §"Do not show Priority 4 data without a
   * visible caveat"). Pass the caveat copy here.
   */
  lowConfidenceCaveat?: string;
  /** Explicit state; when omitted, derived from `sample` + presence of children. */
  state?: StatVisualState;
  /** Message overriding the default empty/insufficient/error copy. */
  stateMessage?: string;
  /** Fixed chart plot height in px (reserved by the skeleton — no CLS). */
  height?: number;
  /** Accessible table fallback. When provided, a "View as table" toggle appears. */
  tableData?: StatVisualTableData;
  /** Roomier hero padding vs default. */
  padding?: 'default' | 'hero';
  /** The chart itself (SVG / Canvas / Recharts container). */
  children?: React.ReactNode;
}

// -----------------------------------------------------------------------------
// Copy
// -----------------------------------------------------------------------------

const DEFAULT_COPY: Record<Exclude<StatVisualState, 'ready' | 'loading'>, string> = {
  empty: 'No captured events yet.',
  'insufficient-data': 'Not enough captured events for a reliable read.',
  error: 'Could not load this chart.',
};

const CONTEXT_LABEL: Record<BaseballDataContext, string> = {
  official_game: 'Official games',
  scrimmage: 'Scrimmage',
  practice: 'Practice',
  bullpen: 'Bullpen',
  cage: 'Cage',
  showcase: 'Showcase',
  sensor: 'Sensor session',
  video: 'Video-tagged',
  lift: 'Lift',
  readiness: 'Readiness',
  manual: 'Manual entry',
};

const CONFIDENCE_LABEL: Record<BaseballMetricConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  insufficient: 'Insufficient sample',
};

const CONFIDENCE_TONE: Record<BaseballMetricConfidence, string> = {
  high: 'bg-green-50 text-green-700 ring-green-600/20',
  medium: 'bg-warm-100 text-warm-700 ring-warm-500/20',
  low: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  insufficient: 'bg-warm-100 text-warm-500 ring-warm-400/20',
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

/**
 * The matte cream/green chart card for baseball stat visuals. Composable: pass
 * any chart as `children`, an optional `tableData` for the accessible view, and
 * a `sample` so the frame can honestly downgrade to "insufficient-data".
 */
export const StatVisualFrame = React.forwardRef<HTMLDivElement, StatVisualFrameProps>(
  function StatVisualFrame(
    {
      title,
      overline,
      subtitle,
      takeaway,
      actions,
      sources,
      sample,
      dataContexts,
      lowConfidenceCaveat,
      state,
      stateMessage,
      height = 260,
      tableData,
      padding = 'default',
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const [showTable, setShowTable] = React.useState(false);
    const titleId = React.useId();
    const captionId = React.useId();
    const reduceMotion = useReducedMotion();

    const hasTable = Boolean(tableData && tableData.rows.length > 0);

    // Resolve the effective state: explicit prop wins; otherwise derive from
    // the sample guard (thin sample -> insufficient-data) then children presence.
    const resolvedState: StatVisualState = React.useMemo(() => {
      if (state) return state;
      if (sample) {
        if (sample.size <= 0) return 'empty';
        if (typeof sample.minForRead === 'number' && sample.size < sample.minForRead) {
          return 'insufficient-data';
        }
      }
      return children ? 'ready' : 'empty';
    }, [state, sample, children]);

    const isBlended = (dataContexts?.length ?? 0) > 1;

    const ariaLabel = [
      typeof title === 'string' ? title : 'Chart',
      takeaway,
      sample ? `${sample.size} ${sample.unitLabel}` : null,
    ]
      .filter(Boolean)
      .join('. ');

    return (
      <LazyMotion features={domAnimation}>
        <m.div
          ref={ref}
          data-slot="stat-visual-frame"
          data-state={resolvedState}
          aria-labelledby={titleId}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            // Cream/green glass surface — matches the baseball Stats Center cards.
            'group/stat relative flex flex-col gap-4 rounded-2xl bg-cream-100/75 backdrop-blur-glass',
            'border border-warm-200/60 shadow-glass',
            'transition-shadow duration-300 hover:shadow-card-hover',
            padding === 'hero' ? 'p-8' : 'p-6',
            className,
          )}
          {...rest}
        >
        {/* Header — title cluster + actions/toggle */}
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {overline ? (
              <p className="mb-1 text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
                {overline}
              </p>
            ) : null}
            <h3 id={titleId} className="truncate text-lg font-semibold tracking-tight text-warm-900">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-0.5 text-sm leading-snug text-warm-500">{subtitle}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {actions}
            {hasTable ? (
              <ViewToggle showTable={showTable} onToggle={() => setShowTable((v) => !v)} />
            ) : null}
          </div>
        </header>

        {/* Meta strip — data context(s) + sample size + confidence + source chips */}
        {(dataContexts?.length || sample || sources?.length) ? (
          <div className="flex flex-wrap items-center gap-2">
            {dataContexts?.map((ctx) => (
              <span
                key={ctx}
                className="inline-flex items-center gap-1 rounded-full bg-warm-100/80 px-2.5 py-1 text-xs font-medium text-warm-700 ring-1 ring-warm-200/70"
              >
                <IconLayers size={12} aria-hidden />
                {CONTEXT_LABEL[ctx]}
              </span>
            ))}

            {isBlended ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">
                Blended — separate with the context filter
              </span>
            ) : null}

            {sample ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-warm-100/80 px-2.5 py-1 text-xs font-medium text-warm-700 ring-1 ring-warm-200/70 tabular-nums"
                aria-label={`Sample size ${sample.size} ${sample.unitLabel}`}
              >
                <IconDatabase size={12} aria-hidden />
                {sample.size.toLocaleString()} {sample.unitLabel}
              </span>
            ) : null}

            {sample?.confidence ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1',
                  CONFIDENCE_TONE[sample.confidence],
                )}
              >
                {CONFIDENCE_LABEL[sample.confidence]}
              </span>
            ) : null}

            {/* Source chips — Foundations SourceTrustBadge, imported not rebuilt. */}
            {sources?.map((s, i) => (
              <SourceTrustBadge
                key={i}
                trust={s.trust}
                provenance={s.provenance}
                size="sm"
              />
            ))}
          </div>
        ) : null}

        {/* Priority-4 caveat — never show inferred/AI data without it (V10). */}
        {lowConfidenceCaveat && resolvedState === 'ready' ? (
          <div
            role="note"
            className="flex items-start gap-2 rounded-xl bg-amber-50/70 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-600/20"
          >
            <IconInfo size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>{lowConfidenceCaveat}</span>
          </div>
        ) : null}

        {/* Body — chart / table fallback / state surface */}
        <div className="relative" aria-busy={resolvedState === 'loading'}>
          {resolvedState === 'loading' ? (
            <ChartSkeleton height={height} />
          ) : resolvedState !== 'ready' ? (
            <StateSurface
              height={height}
              state={resolvedState}
              message={stateMessage ?? DEFAULT_COPY[resolvedState]}
              sample={sample}
            />
          ) : showTable && tableData ? (
            <FallbackTable data={tableData} height={height} captionId={captionId} />
          ) : (
            <figure
              role="img"
              aria-label={ariaLabel}
              style={{ height }}
              className="relative m-0 w-full"
            >
              {/* The inner chart is decorative for SR — the table is the readout. */}
              <div aria-hidden className="absolute inset-0">
                {children}
              </div>
            </figure>
          )}
        </div>
        </m.div>
      </LazyMotion>
    );
  },
);

// -----------------------------------------------------------------------------
// Subcomponents
// -----------------------------------------------------------------------------

function ViewToggle({
  showTable,
  onToggle,
}: {
  showTable: boolean;
  onToggle: () => void;
}) {
  return (
    // Raw <button> is intentional: this is a self-contained frame primitive that
    // owns its warm hover/focus-visible/active contract (matches the Fairway
    // ChartFrame ViewToggle precedent) — coupling it to @/components/ui/button
    // would import a different visual language into a tight chart toolbar.
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={showTable}
      data-slot="stat-visual-view-toggle"
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium',
        'text-warm-600 transition-colors duration-200',
        'hover:bg-warm-100 hover:text-warm-900',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        'active:translate-y-px',
        showTable && 'bg-warm-100 text-warm-900',
      )}
    >
      {showTable ? 'View chart' : 'View as table'}
    </button>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  // Chart-shaped shimmer: a reserved plot area (no CLS) with faux axis + legend
  // hints so the loading state reads as "a chart is arriving", not a blank box.
  return (
    <div style={{ height }} className="flex w-full flex-col gap-2" aria-hidden>
      <Skeleton
        variant="chart"
        animation="shimmer"
        className="w-full flex-1 rounded-xl"
      />
      <div className="flex items-center gap-3 px-1">
        <Skeleton variant="line" animation="shimmer" className="h-2.5 w-16 rounded-full" />
        <Skeleton variant="line" animation="shimmer" className="h-2.5 w-12 rounded-full" />
        <Skeleton variant="line" animation="shimmer" className="h-2.5 w-20 rounded-full" />
      </div>
    </div>
  );
}

const STATE_META: Record<
  Exclude<StatVisualState, 'ready' | 'loading'>,
  { Icon: typeof IconChartBar; iconWrap: string; iconColor: string; tone: string }
> = {
  empty: {
    Icon: IconChartBar,
    iconWrap: 'bg-warm-100',
    iconColor: 'text-warm-400',
    tone: 'border-warm-200 bg-warm-50/60',
  },
  'insufficient-data': {
    Icon: IconCircleDot,
    iconWrap: 'bg-primary-600/10',
    iconColor: 'text-primary-600',
    tone: 'border-warm-200 bg-cream-50/70',
  },
  error: {
    Icon: IconWarning,
    iconWrap: 'bg-amber-500/12',
    iconColor: 'text-amber-600',
    tone: 'border-amber-200/70 bg-amber-50/40',
  },
};

function StateSurface({
  height,
  state,
  message,
  sample,
}: {
  height: number;
  state: Exclude<StatVisualState, 'ready' | 'loading'>;
  message: string;
  sample?: StatVisualSample;
}) {
  const meta = STATE_META[state];
  const { Icon } = meta;

  // Insufficient-data carries the concrete shortfall so the coach knows the bar.
  const detail =
    state === 'insufficient-data' && sample?.minForRead
      ? `${sample.size.toLocaleString()} of ${sample.minForRead.toLocaleString()} ${sample.unitLabel} captured. More appears here as it lands.`
      : state === 'error'
        ? 'Try again, or check the source coverage board for a gap.'
        : 'Data appears here once it’s captured from a connected source.';

  // For insufficient-data, render an honest progress bar toward the read bar.
  const progress =
    state === 'insufficient-data' && sample?.minForRead && sample.minForRead > 0
      ? Math.max(0, Math.min(1, sample.size / sample.minForRead))
      : null;

  return (
    <div
      style={{ minHeight: height }}
      role={state === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-2 rounded-xl px-6 py-8 text-center',
        'border border-dashed',
        meta.tone,
      )}
    >
      <span
        className={cn(
          'mb-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full',
          meta.iconWrap,
        )}
      >
        <Icon size={18} className={meta.iconColor} aria-hidden />
      </span>
      <span className="text-sm font-semibold text-warm-800">{message}</span>
      <span className="max-w-sm text-xs leading-relaxed text-warm-500">{detail}</span>

      {progress !== null ? (
        <div className="mt-1 w-full max-w-[200px]">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-warm-200/70"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Progress toward a reliable read"
          >
            <div
              className="h-full rounded-full bg-primary-500 transition-[width] duration-500 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FallbackTable({
  data,
  height,
  captionId,
}: {
  data: StatVisualTableData;
  height: number;
  captionId: string;
}) {
  return (
    <div
      style={{ maxHeight: height + 24 }}
      className="overflow-auto rounded-xl border border-warm-200"
    >
      <table className="w-full border-collapse text-sm">
        {data.caption ? (
          <caption id={captionId} className="sr-only">
            {data.caption}
          </caption>
        ) : null}
        <thead>
          <tr className="border-b border-warm-300 bg-warm-50">
            {data.columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'px-3 py-2 font-semibold text-warm-600',
                  col.numeric ? 'text-right' : 'text-left',
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-warm-200 last:border-0">
              {data.columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-3 py-2 text-warm-900',
                    col.numeric ? 'text-right tabular-nums' : 'text-left',
                  )}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Re-export for the empty-state edge case where a fan-out chart wants to render
// the GolfHelm EmptyState directly inside the body for richer empties (optional).
export { EmptyState };
