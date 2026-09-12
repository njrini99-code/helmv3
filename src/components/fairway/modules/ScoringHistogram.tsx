'use client';

/**
 * ============================================================================
 * ScoringHistogram — five-bucket scoring distribution (round-review.v2.md R2)
 * ----------------------------------------------------------------------------
 * Replaces the plain "Mix: 1 birdie · 9 pars…" text line in `ReviewHero`'s
 * dark green panel. Five horizontal bars, one per scoring bucket (eagle
 * through double-or-worse), width = count / the round's largest bucket.
 * Every bucket renders — including a real zero-count bar — once there is
 * at least one scored hole; the caller (`buildScoringHistogram`) gates the
 * WHOLE chart on the round's total scored holes being zero, the SAME gate
 * `buildMixLine` already used, never a per-bucket skip, so the shape of the
 * round's scoring reads honestly rather than only showing buckets that
 * happened to fire.
 *
 * Single-consumer, hardcoded for the dark green hero panel — mirrors
 * `GradeDots`'s on-green color handling (the rail is the same translucent
 * `oklch(1 0 0 / 0.14)` overlay, never `bg-surface-sunken`/`bg-white/N`,
 * which don't contrast reliably against the fixed `accent-800/900` panel
 * background). This primitive has exactly one call site today and the
 * spec's own prop contract carries no on-cream toggle, so it does not
 * invent a variant nobody asked for; a future cream consumer adds that.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import type { ScoringHistogramProps } from './types';

/** Off/rail state on the dark green panel — same convention as GradeDots'
 *  own `OFF_ON_GREEN`. */
const RAIL_ON_GREEN = 'oklch(1 0 0 / 0.14)';
/** "Even" (par) fill — a denser translucent-white step than the rail so a
 *  real, nonzero par bar still reads as filled rather than an unlit rail. */
const EVEN_FILL_ON_GREEN = 'oklch(1 0 0 / 0.34)';

const TONE_BAR_CLASS: Record<'good' | 'even' | 'over', string> = {
  good: 'bg-accent-400',
  even: '',
  over: 'bg-fw-warning',
};

export function ScoringHistogram({ buckets }: ScoringHistogramProps) {
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  return (
    <div data-slot="scoring-histogram" className="mt-4 grid gap-1">
      {buckets.map((b) => {
        const pct = Math.min(100, (b.count / max) * 100);
        return (
          <div key={b.label} className="grid grid-cols-[46px_1fr_18px] items-center gap-2">
            <span className="truncate font-fw-sans text-caption text-ink-on-deep-soft">{b.label}</span>
            <span className="relative block h-[6px] rounded-full" style={{ background: RAIL_ON_GREEN }}>
              {b.count > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn('absolute inset-y-0 left-0 rounded-full', TONE_BAR_CLASS[b.tone])}
                  style={{
                    width: `${pct}%`,
                    background: b.tone === 'even' ? EVEN_FILL_ON_GREEN : undefined,
                  }}
                />
              ) : null}
            </span>
            <span className="text-right font-fw-mono text-caption tabular-nums text-ink-on-deep">
              {b.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
