'use client';

/**
 * ============================================================================
 * ChartFrame — the matte container every Fairway chart sits in
 * ----------------------------------------------------------------------------
 * Implements DESIGN-SYSTEM.md §5 / §6 "ChartCard": matte `bg-surface`, ONE
 * elevation step, Fraunces-quiet title (h3 = General Sans), a "view as table"
 * toggle on EVERY chart (a11y + the precise readout coaches want), and the
 * first-class states skeleton → empty/insufficient-data → error.
 *
 * Charts are MATTE here — glass appears only in the tooltip (§4.3 allow-list).
 * The wrapper carries `role="img"` + a concise `aria-label` takeaway so the
 * whole figure is announced as one unit (the inner SVG/Canvas is aria-hidden).
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { TABULAR_NUMS, chartAriaLabel } from './theme';

export type ChartFrameState = 'ready' | 'loading' | 'empty' | 'insufficient-data' | 'error';

/** One row of the accessible table fallback. */
export interface ChartTableColumn {
  key: string;
  label: string;
  /** right-align + tabular for numeric columns */
  numeric?: boolean;
}

export interface ChartTableData {
  columns: ChartTableColumn[];
  rows: Array<Record<string, string | number>>;
  caption?: string;
}

export interface ChartFrameProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Card title (General Sans h3 — sans quiets the UI per §3.2). */
  title: React.ReactNode;
  /** Optional eyebrow overline above the title. */
  overline?: string;
  /** Optional subtitle / source line under the title (caption, tertiary). */
  subtitle?: React.ReactNode;
  /** Right-aligned action cluster (e.g. BenchmarkSelector, FormatToggle). */
  actions?: React.ReactNode;
  /** Concise spoken takeaway appended to the title for `aria-label`. */
  takeaway?: string;
  /** Drives skeleton / empty / error rendering. Defaults to `ready`. */
  state?: ChartFrameState;
  /** Optional message overriding the default empty/error copy. */
  stateMessage?: string;
  /** Fixed chart plot height in px (the area the child fills). */
  height?: number;
  /** Tabular fallback — when provided, a "view as table" toggle is shown. */
  tableData?: ChartTableData;
  /** Roomier hero padding (`p-8`) vs default (`p-6`). */
  padding?: 'default' | 'hero';
  /** The chart itself (SVG / ResponsiveContainer / Canvas). */
  children?: React.ReactNode;
}

const DEFAULT_COPY: Record<Exclude<ChartFrameState, 'ready' | 'loading'>, string> = {
  empty: 'No data to show yet.',
  'insufficient-data': 'Not enough rounds for a reliable read.',
  error: "Couldn't load this chart.",
};

/**
 * The matte chart card. Composable: pass any chart as `children`, an optional
 * `tableData` for the accessible table view, and a `state` for honest empties.
 */
export const ChartFrame = React.forwardRef<HTMLDivElement, ChartFrameProps>(function ChartFrame(
  {
    title,
    overline,
    subtitle,
    actions,
    takeaway,
    state = 'ready',
    stateMessage,
    height = 240,
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
  const hasTable = Boolean(tableData && tableData.rows.length > 0);
  const label = chartAriaLabel(typeof title === 'string' ? title : 'Chart', takeaway);

  return (
    <section
      ref={ref}
      data-slot="chart-frame"
      data-state={state}
      aria-labelledby={titleId}
      className={cn(
        'group/chart relative flex flex-col gap-4 rounded-card bg-surface',
        // resting: border OR shadow, never both (§4.2). Border-only at rest.
        'border border-border-subtle',
        padding === 'hero' ? 'p-8' : 'p-6',
        className,
      )}
      {...rest}
    >
      {/* Header — title cluster + actions/toggle */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {overline ? (
            <p className="mb-1 font-fw-sans text-eyebrow uppercase text-text-tertiary">
              {overline}
            </p>
          ) : null}
          <h3 id={titleId} className="truncate font-fw-sans text-h3 text-text-primary">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 font-fw-sans text-caption font-normal text-text-tertiary">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          {hasTable ? (
            <ViewToggle
              showTable={showTable}
              onToggle={() => setShowTable((v) => !v)}
            />
          ) : null}
        </div>
      </header>

      {/* Body — the chart, the table fallback, or a state surface */}
      <div className="relative">
        {state === 'loading' ? (
          <ChartSkeleton height={height} />
        ) : state !== 'ready' ? (
          <ChartStateSurface
            height={height}
            label={stateMessage ?? DEFAULT_COPY[state]}
          />
        ) : showTable && tableData ? (
          <ChartTable data={tableData} height={height} />
        ) : (
          <div
            role="img"
            aria-label={label}
            style={{ height }}
            className="relative w-full"
          >
            {/* The inner chart is decorative for SR (the table is the readout). */}
            <div aria-hidden className="absolute inset-0">
              {children}
            </div>
          </div>
        )}
      </div>
    </section>
  );
});

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                              */
/* -------------------------------------------------------------------------- */

function ViewToggle({ showTable, onToggle }: { showTable: boolean; onToggle: () => void }) {
  return (
    // Raw <button> is intentional: this is a self-contained Fairway DS primitive
    // that owns its warm styling + full hover/focus-visible/active contract. It
    // must NOT couple to the legacy @/components/ui/button (different visual
    // language, additive-only brief).
    // eslint-disable-next-line helm/no-raw-button
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={showTable}
      data-slot="chart-view-toggle"
      className={cn(
        'inline-flex h-7 min-w-[24px] items-center gap-1.5 rounded-fw-sm px-2.5',
        'font-fw-sans text-caption font-medium',
        'text-text-secondary',
        'transition-colors duration-[180ms] ease-[cubic-bezier(0.22,0.61,0.36,1)]',
        'hover:bg-inset hover:text-text-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'active:translate-y-[0.5px]',
        showTable && 'bg-inset text-text-primary',
      )}
    >
      {showTable ? 'View chart' : 'View as table'}
    </button>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  // Shape-matched shimmer (no spinner) reserving final layout (§7.3).
  return (
    <div
      style={{ height }}
      className="flex w-full items-end gap-2 overflow-hidden rounded-fw-md bg-inset/40 p-3"
      aria-hidden
    >
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 animate-pulse rounded-fw-sm bg-inset motion-reduce:animate-none"
          style={{ height: `${30 + ((i * 37) % 60)}%` }}
        />
      ))}
    </div>
  );
}

function ChartStateSurface({ height, label }: { height: number; label: string }) {
  return (
    <div
      style={{ height }}
      role="status"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-1.5 rounded-fw-md',
        'border border-dashed border-border-subtle bg-inset/30 px-6 text-center',
      )}
    >
      <span className="font-fw-sans text-body-sm font-medium text-text-secondary">{label}</span>
      <span className="font-fw-sans text-caption font-normal text-text-tertiary">
        Data appears here once it&rsquo;s available.
      </span>
    </div>
  );
}

function ChartTable({ data, height }: { data: ChartTableData; height: number }) {
  return (
    <div style={{ maxHeight: height + 24 }} className="overflow-auto rounded-fw-md border border-border-subtle">
      <table className="w-full border-collapse font-fw-sans text-body-sm">
        {data.caption ? <caption className="sr-only">{data.caption}</caption> : null}
        <thead>
          <tr className="border-b border-border-strong bg-surface-tint">
            {data.columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  'px-3 py-2 font-semibold text-text-secondary',
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
            <tr key={ri} className="border-b border-border-subtle last:border-0">
              {data.columns.map((col) => (
                <td
                  key={col.key}
                  style={col.numeric ? TABULAR_NUMS : undefined}
                  className={cn(
                    'px-3 py-2 text-text-primary',
                    col.numeric ? 'text-right' : 'text-left',
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
