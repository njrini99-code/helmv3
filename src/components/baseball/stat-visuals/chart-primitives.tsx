'use client';

// =============================================================================
// src/components/baseball/stat-visuals/chart-primitives.tsx
//
// Small SVG render primitives shared by the V10 baseball stat-visual charts:
// a responsive plot wrapper, axes/gridlines, a labeled (not color-only) legend,
// pitch-type tabs, and a context-split filter. Cream/green GolfHelm look; reuses
// warm/primary tokens VERBATIM. Owned by the stat-visuals packet.
//
// These are deliberately NOT the chart frame — charts sit inside the Foundations
// <StatVisualFrame>; these primitives render the chart BODY.
// =============================================================================

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { BaseballDataContext } from '@/lib/types/baseball-stat-events';

// -----------------------------------------------------------------------------
// Responsive plot — measures its container so SVG charts fill the frame body.
// -----------------------------------------------------------------------------

export function useMeasuredWidth(fallback = 560): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(fallback);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export const PLOT_MARGIN = { top: 12, right: 16, bottom: 32, left: 40 } as const;

// -----------------------------------------------------------------------------
// Axis lines + ticks
// -----------------------------------------------------------------------------

export function AxisX({
  y,
  x0,
  x1,
  ticks,
  format,
  label,
}: {
  y: number;
  x0: number;
  x1: number;
  ticks: { value: number; pos: number }[];
  format: (v: number) => string;
  label?: string;
}) {
  return (
    <g>
      <line x1={x0} y1={y} x2={x1} y2={y} stroke="var(--color-warm-300, #d6d3d1)" strokeWidth={1} />
      {ticks.map((t) => (
        <g key={t.value}>
          <line x1={t.pos} y1={y} x2={t.pos} y2={y + 4} stroke="var(--color-warm-300, #d6d3d1)" />
          <text
            x={t.pos}
            y={y + 16}
            textAnchor="middle"
            className="fill-warm-500 text-[10px] tabular-nums"
          >
            {format(t.value)}
          </text>
        </g>
      ))}
      {label ? (
        <text x={(x0 + x1) / 2} y={y + 30} textAnchor="middle" className="fill-warm-400 text-[10px] font-medium uppercase tracking-wide">
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function AxisY({
  x,
  y0,
  y1,
  ticks,
  format,
  label,
}: {
  x: number;
  y0: number;
  y1: number;
  ticks: { value: number; pos: number }[];
  format: (v: number) => string;
  label?: string;
}) {
  return (
    <g>
      <line x1={x} y1={y0} x2={x} y2={y1} stroke="var(--color-warm-300, #d6d3d1)" strokeWidth={1} />
      {ticks.map((t) => (
        <g key={t.value}>
          <line x1={x - 4} y1={t.pos} x2={x} y2={t.pos} stroke="var(--color-warm-300, #d6d3d1)" />
          <text
            x={x - 8}
            y={t.pos + 3}
            textAnchor="end"
            className="fill-warm-500 text-[10px] tabular-nums"
          >
            {format(t.value)}
          </text>
        </g>
      ))}
      {label ? (
        <text
          x={12}
          y={(y0 + y1) / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${(y0 + y1) / 2})`}
          className="fill-warm-400 text-[10px] font-medium uppercase tracking-wide"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** Compute up to `count` evenly-spaced ticks for a [d0,d1] domain. */
export function makeTicks(
  d0: number,
  d1: number,
  scale: (v: number) => number,
  count = 5,
): { value: number; pos: number }[] {
  const step = (d1 - d0) / (count - 1 || 1);
  return Array.from({ length: count }, (_, i) => {
    const value = d0 + step * i;
    return { value, pos: scale(value) };
  });
}

// -----------------------------------------------------------------------------
// Legend (always labeled — never color-only, per a11y rules)
// -----------------------------------------------------------------------------

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  /** optional glyph hint for shape-by-context (not relying on color alone). */
  shape?: 'circle' | 'square' | 'triangle' | 'diamond';
}

export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5', className)}>
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-1.5 text-xs text-warm-600">
          <LegendGlyph color={it.color} shape={it.shape ?? 'circle'} />
          <span>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function LegendGlyph({
  color,
  shape = 'circle',
  size = 10,
}: {
  color: string;
  shape?: 'circle' | 'square' | 'triangle' | 'diamond';
  size?: number;
}) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden focusable="false">
      {shape === 'circle' && <circle cx={s / 2} cy={s / 2} r={s / 2 - 0.5} fill={color} />}
      {shape === 'square' && <rect x={1} y={1} width={s - 2} height={s - 2} rx={1.5} fill={color} />}
      {shape === 'triangle' && (
        <polygon points={`${s / 2},1 ${s - 1},${s - 1} 1,${s - 1}`} fill={color} />
      )}
      {shape === 'diamond' && (
        <polygon points={`${s / 2},1 ${s - 1},${s / 2} ${s / 2},${s - 1} 1,${s / 2}`} fill={color} />
      )}
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Pitch-type tabs (and generic tab strip) — keyboard reachable, URL-free local.
// -----------------------------------------------------------------------------

export function TabStrip<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'sm',
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap rounded-xl border border-warm-200 bg-cream-50 p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          // Raw <button> is intentional: a tab inside a role="tablist" chart
          // toolbar owns its own active/hover/focus contract (same precedent as
          // the Foundations StatVisualFrame ViewToggle) — @/components/ui/button
          // would import a different visual language into a tight chart toolbar.
          // eslint-disable-next-line helm/no-raw-button
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-40',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active ? 'bg-primary-600 text-white shadow-sm' : 'text-warm-600 hover:bg-warm-100',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Context split filter — official / scrimmage / practice / sensor (NEVER merged
// unlabeled, per the zip non-negotiable). Renders the available contexts only.
// -----------------------------------------------------------------------------

const CONTEXT_SHORT: Record<BaseballDataContext, string> = {
  official_game: 'Official',
  scrimmage: 'Scrimmage',
  practice: 'Practice',
  bullpen: 'Bullpen',
  cage: 'Cage',
  showcase: 'Showcase',
  sensor: 'Sensor',
  video: 'Video',
  lift: 'Lift',
  readiness: 'Readiness',
  manual: 'Manual',
};

export function ContextSplitFilter({
  available,
  value,
  onChange,
}: {
  available: BaseballDataContext[];
  /** null = "All (labeled blend)". */
  value: BaseballDataContext | null;
  onChange: (v: BaseballDataContext | null) => void;
}) {
  if (available.length <= 1) return null;
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-warm-200 bg-cream-50 p-0.5" role="group" aria-label="Data context">
      {/* Raw <button> intentional: segmented chart-toolbar control, same
          precedent as the Foundations frame ViewToggle / TabStrip above. */}
      {/* eslint-disable-next-line helm/no-raw-button */}
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={cn(
          'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
          value === null ? 'bg-primary-600 text-white shadow-sm' : 'text-warm-600 hover:bg-warm-100',
        )}
      >
        All
      </button>
      {available.map((ctx) => (
        // eslint-disable-next-line helm/no-raw-button
        <button
          key={ctx}
          type="button"
          aria-pressed={value === ctx}
          onClick={() => onChange(ctx)}
          className={cn(
            'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
            value === ctx ? 'bg-primary-600 text-white shadow-sm' : 'text-warm-600 hover:bg-warm-100',
          )}
        >
          {CONTEXT_SHORT[ctx]}
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Bullet bar — target-vs-actual (used by paired-bullet + count-ladder charts)
// -----------------------------------------------------------------------------

export function BulletBar({
  value,
  max,
  tone = 'primary',
  height = 8,
  trackClassName,
}: {
  /** 0..max; null renders an empty track (never a fake full/zero bar). */
  value: number | null;
  max: number;
  tone?: 'primary' | 'amber' | 'warm';
  height?: number;
  trackClassName?: string;
}) {
  const pctFill = value === null || max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  const fillClass =
    tone === 'amber' ? 'bg-amber-500' : tone === 'warm' ? 'bg-warm-400' : 'bg-primary-600';
  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-full bg-warm-100', trackClassName)}
      style={{ height }}
      role="img"
      aria-label={value === null ? 'No data' : `${Math.round(pctFill * 100)} percent of target`}
    >
      {value !== null ? (
        <div className={cn('h-full rounded-full', fillClass)} style={{ width: `${pctFill * 100}%` }} />
      ) : null}
    </div>
  );
}
