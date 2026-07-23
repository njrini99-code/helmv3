'use client';

/**
 * ============================================================================
 * TickerStrip — a labeled micro bar-chip row (mockup §.ticker)
 * ----------------------------------------------------------------------------
 * Flat equal-width columns rising from the baseline, each carrying its own
 * mono label above the bar (e.g. per-round or per-hole comparison chips).
 * `emphasis` marks the standout column (best round, current hole) in full
 * accent-500; the rest sit in a dim accent-200 wash.
 *
 * Entrance: each chip slides/fades up from the baseline on mount, staggered
 * left→right. This can carry as many items as there are holes (18), so —
 * like `Filmstrip` — it uses a compressed, capped stagger step rather than
 * the canonical 70ms one to stay inside the <600ms motion budget.
 * ========================================================================== */

import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { cn } from '@/lib/utils';
import { clampPct } from './logic';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import type { TickerStripProps } from './types';

// See Filmstrip.tsx for the same reasoning — a wide row of siblings needs a
// tighter step than the canonical 70ms one to keep the whole reveal fast.
const TICKER_STAGGER_STEP = 0.02;
const TICKER_STAGGER_CAP = 12;
function tickerStagger(i: number): number {
  return Math.min(i, TICKER_STAGGER_CAP) * TICKER_STAGGER_STEP;
}

export function TickerStrip({ items }: TickerStripProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  return (
    <LazyMotion features={loadFeatures}>
      <div data-slot="ticker-strip" className="mt-1 flex h-14 items-end gap-1.5">
        {items.map((item, i) => (
          <m.div
            key={`${item.label}-${i}`}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.short, delay: tickerStagger(i), ease: EASE_CINEMATIC }}
            className={cn(
              'relative flex-1 rounded-t-fw-sm',
              item.emphasis ? 'bg-accent-500' : 'bg-accent-200',
            )}
            style={{ height: `${Math.max(4, clampPct(item.heightPct))}%` }}
          >
            <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap font-fw-mono text-microbadge normal-case tracking-normal text-text-tertiary">
              {item.label}
            </span>
          </m.div>
        ))}
      </div>
    </LazyMotion>
  );
}
