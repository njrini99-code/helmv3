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
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { IconDatabase, IconInfo, IconLayers } from '@/components/icons';
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
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
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
      <Card
        ref={ref}
        variant="flat"
        padding="none"
        data-slot="stat-visual-frame"
        data-state={resolvedState}
        aria-labelledby={titleId}
        className={cn(
          // Cream/green glass surface — matches the baseball Stats Center cards.
          'group/stat relative flex flex-col gap-4 rounded-2xl bg-cream-100/75 backdrop-blur-glass',
          'border border-warm-200/70 shadow-sm',
          padding === 'hero' ? 'p-8' : 'p-6',
          className,
        )}
        {...rest}
      >
        {/* Header — title cluster + actions/toggle */}
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {overline ? (
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warm-500">
                {overline}
              </p>
            ) : null}
            <h3 id={titleId} className="truncate text-lg font-semibold text-warm-900">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-warm-500">{subtitle}</p>
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
                className="inline-flex items-center gap-1 rounded-full bg-warm-100 px-2.5 py-1 text-xs font-medium text-warm-700 ring-1 ring-warm-200"
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
                className="inline-flex items-center gap-1 rounded-full bg-warm-100 px-2.5 py-1 text-xs font-medium text-warm-700 ring-1 ring-warm-200 tabular-nums"
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
        <div className="relative">
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
      </Card>
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
  // Shape-matched shimmer reserving the final chart height (no CLS).
  return (
    <Skeleton variant="chart" height={height} animation="shimmer" className="w-full rounded-xl" />
  );
}

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
  // Insufficient-data carries the concrete shortfall so the coach knows the bar.
  const detail =
    state === 'insufficient-data' && sample?.minForRead
      ? `${sample.size.toLocaleString()} of ${sample.minForRead.toLocaleString()} ${sample.unitLabel} captured. More data appears here as it lands.`
      : state === 'error'
        ? 'Try again, or check the source coverage board.'
        : 'Data appears here once it’s captured from a connected source.';

  return (
    <div
      style={{ minHeight: height }}
      role="status"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-1.5 rounded-xl px-6 text-center',
        'border border-dashed border-warm-200 bg-warm-50/60',
      )}
    >
      <span className="text-sm font-medium text-warm-700">{message}</span>
      <span className="max-w-sm text-xs text-warm-500">{detail}</span>
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
