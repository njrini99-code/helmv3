'use client';

/**
 * ============================================================================
 * ChartTooltip — the ONE place glass appears inside a chart (§5.3 / §4.3)
 * ----------------------------------------------------------------------------
 * A warm cream-tinted Liquid Glass panel with tabular-nums rows. Two surfaces:
 *
 *  1. <ChartTooltip>      — presentational panel (use anywhere, incl. Canvas
 *                           charts driven by manual hover state).
 *  2. <RechartsTooltip>   — adapter matching Recharts' TooltipProps content
 *                           contract so it drops straight into <Tooltip content=…>.
 *
 * Restraint = premium: this is the single glass element in an otherwise matte
 * chart card. Includes the reduced-transparency fallback (collapses to opaque
 * surface) inline so it never depends on a global stylesheet.
 * ========================================================================== */

import * as React from 'react';
import { Tooltip as RechartsTooltipBase } from 'recharts';
import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from './theme';

export interface TooltipRow {
  /** series / metric label */
  label: string;
  /** formatted value (already a string so callers control precision) */
  value: React.ReactNode;
  /** swatch color (CSS color or var) — omit for no swatch */
  color?: string;
  /** render the value in mono ledger style */
  mono?: boolean;
}

export interface ChartTooltipProps {
  /** Bold header line (e.g. the x-value / category). */
  heading?: React.ReactNode;
  /** Metric rows. */
  rows: TooltipRow[];
  /** Optional footer note (e.g. "n = 40"). */
  footnote?: React.ReactNode;
  className?: string;
}

/**
 * The glass tooltip panel. Cream-tinted, ~78% (strong, for legibility over a
 * busy plot), bright specular top rim, soft float shadow. Honors
 * `prefers-reduced-transparency` via a CSS @supports-style inline fallback.
 */
export function ChartTooltip({ heading, rows, footnote, className }: ChartTooltipProps) {
  return (
    <div
      data-slot="chart-tooltip"
      role="presentation"
      className={cn(
        'pointer-events-none min-w-[9rem] max-w-[16rem] rounded-fw-md px-3 py-2.5',
        // warm cream Liquid Glass (strong tint for legibility over plots)
        'border border-white/55 shadow-raise backdrop-blur-[16px] backdrop-saturate-150',
        'bg-[rgb(255_254_250_/_0.82)]',
        // reduced-transparency: collapse to opaque surface + soft shadow
        'motion-reduce:backdrop-blur-0 supports-[not(backdrop-filter:blur(0))]:bg-surface',
        className,
      )}
      style={{
        boxShadow:
          'inset 0 1px 0 0 rgb(255 255 255 / 0.65), var(--fw-shadow-raise)',
      }}
    >
      {heading ? (
        <div className="mb-1.5 font-fw-sans text-caption font-semibold text-text-primary">
          {heading}
        </div>
      ) : null}
      <ul className="flex flex-col gap-1">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 font-fw-sans text-caption font-normal text-text-secondary">
              {row.color ? (
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
              ) : null}
              <span className="truncate">{row.label}</span>
            </span>
            <span
              style={TABULAR_NUMS}
              className={cn(
                'shrink-0 text-caption font-semibold text-text-primary',
                row.mono ? 'font-fw-mono' : 'font-fw-sans',
              )}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>
      {footnote ? (
        <div className="mt-1.5 border-t border-border-subtle pt-1.5 font-fw-sans text-eyebrow normal-case tracking-normal text-text-tertiary">
          {footnote}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Recharts adapter                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Minimal structural type for the slice of Recharts' tooltip payload we read.
 * (Avoids importing Recharts' generic `TooltipProps` types, which churn across
 * v3 minor releases — this is the stable runtime shape.)
 */
export interface RechartsTooltipPayloadItem {
  name?: string | number;
  value?: string | number;
  color?: string;
  dataKey?: string | number;
  unit?: string;
  payload?: Record<string, unknown>;
}

/**
 * Formatting hooks for the Recharts adapter. Kept separate from Recharts' own
 * props so spreading the chart's render-prop payload never clashes.
 */
export interface RechartsTooltipOptions {
  /** Per-row value formatter (defaults to identity). */
  valueFormatter?: (value: number | string, item: RechartsTooltipPayloadItem) => React.ReactNode;
  /** Override the heading (defaults to `label`). */
  headingFormatter?: (label: string | number | undefined) => React.ReactNode;
  /** Footnote derived from the hovered datum. */
  footnote?: (payload: ReadonlyArray<RechartsTooltipPayloadItem>) => React.ReactNode;
}

/** The runtime-stable subset of Recharts' tooltip render-prop argument. */
export interface RechartsTooltipProps extends RechartsTooltipOptions {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<RechartsTooltipPayloadItem>;
}

/**
 * The exact shape Recharts hands a `content` render function. We declare it
 * locally (rather than importing Recharts' internal `TooltipContentProps`,
 * whose path churns) so the factory's return type is assignable to Recharts'
 * `ContentType` without any Recharts type import. `payload` is read-only and
 * widely-typed so Recharts' `ReadonlyArray<any>` payload assigns into it.
 */
export interface ChartTooltipRenderProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<RechartsTooltipPayloadItem>;
}

/**
 * Internal render of the glass tooltip from a (structurally-typed) Recharts
 * payload + formatting options. Returns null unless active, so it never
 * flashes an empty glass panel.
 */
export function RechartsTooltip({
  active,
  label,
  payload,
  valueFormatter,
  headingFormatter,
  footnote,
}: RechartsTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const rows: TooltipRow[] = payload.map((item) => ({
    label: String(item.name ?? item.dataKey ?? ''),
    color: item.color,
    value:
      item.value === undefined
        ? '—'
        : valueFormatter
          ? valueFormatter(item.value, item)
          : item.value,
  }));

  return (
    <ChartTooltip
      heading={headingFormatter ? headingFormatter(label) : label}
      rows={rows}
      footnote={footnote ? footnote(payload) : undefined}
    />
  );
}

/**
 * Factory producing a Recharts `<Tooltip content={…}>` render function. The
 * returned function is GENERIC over the incoming props `P`, so it unifies with
 * whatever render-prop argument Recharts hands it at the call site (Recharts'
 * `TooltipContentProps` is a superset of the `active` / `label` / `payload`
 * slice we read). This keeps call sites `content={makeChartTooltip({ … })}` —
 * no prop-spread conflicts, no `any`, no Recharts type imports to churn on.
 */
type RechartsTooltipContent = NonNullable<
  React.ComponentProps<typeof RechartsTooltipBase>['content']
>;

export function makeChartTooltip(
  options: RechartsTooltipOptions = {},
): RechartsTooltipContent {
  const Content = (props: ChartTooltipRenderProps): React.ReactNode => (
    <RechartsTooltip
      active={props.active}
      label={props.label}
      payload={props.payload}
      {...options}
    />
  );
  // Recharts 3.8 narrowed the `content` prop to ContentType<ValueType, NameType>;
  // our renderer reads only the active/label/payload slice, so bridge the types.
  return Content as unknown as RechartsTooltipContent;
}
