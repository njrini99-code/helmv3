'use client';

/**
 * ============================================================================
 * AdoptionHeatGrid — GitHub-contributions-style feature × time density grid
 * (Utilization tab, "Adoption Terrain" spec)
 * ----------------------------------------------------------------------------
 * Rows = FEATURE_REGISTRY keys, pre-grouped into app bands (golfhelm /
 * coachhelm / baseballhelm) and tier-sorted by the caller. Columns = the
 * active window (30 days or 12 weeks, toggled client-side — both series
 * already live in the payload, so the toggle never refetches). Cell fill is
 * a discrete 6-stop sample of the shared warm cream→green sequential ramp
 * (`VIZ_SEQUENTIAL`, the same tokens PuttingHeatmap draws from), quantized on
 * a LOG scale of the row's OWN 30-day max — never a global max — so a
 * low-tier feature with a handful of users/day still shows visible texture.
 *
 * A single shared horizontal scroller carries sticky feature labels (left)
 * and a sticky per-row rail (right, 30d unique users + 7d delta) — the grid
 * itself never causes page-level horizontal scroll, and both edges stay
 * pinned while the day/week cells scroll underneath, on every breakpoint.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Segmented } from '../controls/segmented';
import { StatusPill } from '../controls/status-pill';
import { TrendChip } from './TrendChip';
import { VIZ_SEQUENTIAL } from './theme';

export interface AdoptionHeatGridCell {
  date: string;
  uniqueUsers: number;
  eventCount: number;
  topEventTypes: readonly string[];
}

export interface AdoptionHeatGridRow {
  key: string;
  label: string;
  app: 'golfhelm' | 'coachhelm' | 'baseballhelm';
  tier: 'high' | 'med' | 'low';
  days30: readonly AdoptionHeatGridCell[];
  weeks12: readonly AdoptionHeatGridCell[];
  rowMax30: number;
  rowMax12w: number;
  uniqueUsers30d: number;
  delta7dPct: number | null;
  dropoutRisk: boolean;
  quietDays: number;
}

export interface AdoptionHeatGridProps {
  rows: readonly AdoptionHeatGridRow[];
  /** Builds the row-label drill-through href, e.g. `/admin/errors?feature=<key>`. */
  rowHref: (key: string) => string;
  className?: string;
}

const APP_LABEL: Record<AdoptionHeatGridRow['app'], string> = {
  golfhelm: 'GolfHelm',
  coachhelm: 'CoachHelm',
  baseballhelm: 'BaseballHelm',
};

const TIER_DOT: Record<AdoptionHeatGridRow['tier'], string> = {
  high: 'bg-primary-500',
  med: 'bg-fw-warning',
  low: 'bg-warm-300',
};

/** Quantize value into one of VIZ_SEQUENTIAL's 6 stops on a log scale of the
 *  row's own max — value=0 always maps to stop 0 (pure cream) regardless of
 *  log math, so a genuinely quiet cell never reads as "a little bit warm". */
function stopIndex(value: number, rowMax: number): number {
  if (value <= 0 || rowMax <= 0) return 0;
  const t = Math.log1p(value) / Math.log1p(rowMax);
  const idx = Math.round(t * (VIZ_SEQUENTIAL.length - 1));
  return Math.max(1, Math.min(VIZ_SEQUENTIAL.length - 1, idx));
}

interface ActiveCell {
  rowKey: string;
  rowLabel: string;
  cell: AdoptionHeatGridCell;
  x: number;
  y: number;
}

// Popover is `w-64` (256px), centered on `x` via `-translate-x-1/2`. The grid
// scrolls horizontally under sticky rails, so a cell near the right edge of a
// narrow viewport can report an `x` close to `window.innerWidth` — clamp so
// the centered popover never renders partly off-screen.
const POPOVER_WIDTH_PX = 256;
const POPOVER_EDGE_MARGIN_PX = 8;

function clampPopoverX(x: number): number {
  if (typeof window === 'undefined') return x;
  const half = POPOVER_WIDTH_PX / 2;
  const min = half + POPOVER_EDGE_MARGIN_PX;
  const max = window.innerWidth - half - POPOVER_EDGE_MARGIN_PX;
  return Math.min(Math.max(x, min), max);
}

export function AdoptionHeatGrid({ rows, rowHref, className }: AdoptionHeatGridProps) {
  const [windowMode, setWindowMode] = React.useState<'30d' | '12w'>('30d');
  const [active, setActive] = React.useState<ActiveCell | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!active) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      const insideGrid = containerRef.current?.contains(target) ?? false;
      const insidePopover = popoverRef.current?.contains(target) ?? false;
      if (!insideGrid && !insidePopover) setActive(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setActive(null);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [active]);

  let lastApp: AdoptionHeatGridRow['app'] | null = null;

  return (
    <div className={cn('relative', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-caption uppercase tracking-widest text-warm-500">
          {windowMode === '30d' ? 'Last 30 days' : 'Last 12 weeks'}
        </p>
        <Segmented
          aria-label="Adoption grid window"
          size="sm"
          value={windowMode}
          onValueChange={(v) => setWindowMode(v)}
          options={[
            { value: '30d', label: '30d' },
            { value: '12w', label: '12w' },
          ]}
        />
      </div>

      <div ref={containerRef} className="relative overflow-x-auto rounded-fw-md border border-warm-200">
        <div className="min-w-max">
          {rows.map((row) => {
            const showBandHeader = row.app !== lastApp;
            lastApp = row.app;
            const bandCount = rows.filter((r) => r.app === row.app).length;
            const cells = windowMode === '30d' ? row.days30 : row.weeks12;
            const rowMax = windowMode === '30d' ? row.rowMax30 : row.rowMax12w;

            return (
              <React.Fragment key={row.key}>
                {showBandHeader ? (
                  <div className="sticky left-0 z-20 flex w-fit min-w-full items-center gap-2 border-b border-warm-200 bg-cream-100 px-3 py-1.5">
                    <span className="text-eyebrow uppercase text-warm-500">{APP_LABEL[row.app]}</span>
                    <span className="font-fw-mono text-caption tabular-nums text-warm-400">{bandCount} features</span>
                  </div>
                ) : null}
                <div className="flex items-stretch border-b border-warm-100 last:border-0">
                  <div className="sticky left-0 z-10 flex w-40 shrink-0 items-center gap-1.5 border-r border-warm-200 bg-cream-50 px-2.5 py-1.5">
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TIER_DOT[row.tier])} aria-hidden />
                    <Link
                      href={rowHref(row.key)}
                      className="min-w-0 truncate text-body-sm text-warm-800 underline-offset-2 hover:text-primary-700 hover:underline"
                      title={row.label}
                    >
                      {row.label}
                    </Link>
                    {row.dropoutRisk ? (
                      <span
                        className="ml-auto inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-fw-warning"
                        title={`High-tier feature quiet ${row.quietDays}d — dropout risk`}
                        aria-label={`Dropout risk — quiet ${row.quietDays} days`}
                      />
                    ) : null}
                  </div>

                  <div className="flex items-center gap-[3px] px-2 py-1.5">
                    {cells.map((cell, i) => {
                      const idx = stopIndex(cell.uniqueUsers, rowMax);
                      const isDropoutCell =
                        row.dropoutRisk && i >= cells.length - Math.min(row.quietDays, cells.length);
                      return (
                        // eslint-disable-next-line helm/no-raw-button -- one of up to 84 cells per row (85 rows) in a dense contributions-style grid; <Button>'s fixed min-height/padding would blow the grid apart
                        <button
                          key={cell.date}
                          type="button"
                          className={cn(
                            'h-4 w-4 shrink-0 rounded-sm transition-transform hover:scale-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500',
                            isDropoutCell && cell.uniqueUsers === 0 ? 'ring-1 ring-inset ring-fw-warning' : null,
                          )}
                          style={{ backgroundColor: VIZ_SEQUENTIAL[idx] }}
                          title={`${cell.date} — ${cell.uniqueUsers} user${cell.uniqueUsers === 1 ? '' : 's'}, ${cell.eventCount} event${cell.eventCount === 1 ? '' : 's'}${cell.topEventTypes.length > 0 ? ` (${cell.topEventTypes.join(', ')})` : ''}`}
                          onClick={(e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setActive({
                              rowKey: row.key,
                              rowLabel: row.label,
                              cell,
                              x: clampPopoverX(rect.left + rect.width / 2),
                              y: rect.bottom,
                            });
                          }}
                          aria-label={`${row.label}, ${cell.date}: ${cell.uniqueUsers} unique users, ${cell.eventCount} events`}
                        />
                      );
                    })}
                  </div>

                  <div className="sticky right-0 z-10 ml-auto flex w-28 shrink-0 flex-col items-end justify-center gap-0.5 border-l border-warm-200 bg-cream-50 px-2.5 py-1">
                    <span className="font-fw-mono text-body-sm tabular-nums text-warm-900">{row.uniqueUsers30d}</span>
                    {row.delta7dPct === null ? (
                      <span className="text-caption text-warm-400">—</span>
                    ) : (
                      <TrendChip
                        delta={row.delta7dPct}
                        label={`${row.delta7dPct > 0 ? '+' : ''}${row.delta7dPct}%`}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {active ? (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`${active.rowLabel}, ${active.cell.date} detail`}
          className="fixed z-50 w-64 -translate-x-1/2 rounded-fw-md border border-warm-300 bg-cream-50 p-3 shadow-lg"
          style={{ left: active.x, top: active.y + 6 }}
        >
          <p className="text-body-sm font-medium text-warm-900">{active.rowLabel}</p>
          <p className="text-caption text-warm-500">{active.cell.date}</p>
          <div className="mt-2 flex items-center gap-3">
            <div>
              <p className="text-eyebrow uppercase text-warm-500">Users</p>
              <p className="font-fw-mono text-body tabular-nums text-warm-900">{active.cell.uniqueUsers}</p>
            </div>
            <div>
              <p className="text-eyebrow uppercase text-warm-500">Events</p>
              <p className="font-fw-mono text-body tabular-nums text-warm-900">{active.cell.eventCount}</p>
            </div>
          </div>
          {active.cell.topEventTypes.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {active.cell.topEventTypes.map((et) => (
                <StatusPill key={et} tone="neutral" size="sm" dot={false}>
                  {et}
                </StatusPill>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
