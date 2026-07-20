'use client';

/**
 * ============================================================================
 * TickerStrip — a labeled micro bar-chip row (mockup §.ticker)
 * ----------------------------------------------------------------------------
 * Flat equal-width columns rising from the baseline, each carrying its own
 * mono label above the bar (e.g. per-round or per-hole comparison chips).
 * `emphasis` marks the standout column (best round, current hole) in full
 * accent-500; the rest sit in a dim accent-200 wash.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { clampPct } from './logic';
import type { TickerStripProps } from './types';

export function TickerStrip({ items }: TickerStripProps) {
  return (
    <div data-slot="ticker-strip" className="mt-1 flex h-14 items-end gap-1.5">
      {items.map((item, i) => (
        <div
          key={`${item.label}-${i}`}
          className={cn(
            'relative flex-1 rounded-t-fw-sm',
            item.emphasis ? 'bg-accent-500' : 'bg-accent-200',
          )}
          style={{ height: `${Math.max(4, clampPct(item.heightPct))}%` }}
        >
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-fw-mono text-microbadge normal-case tracking-normal text-text-tertiary">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
