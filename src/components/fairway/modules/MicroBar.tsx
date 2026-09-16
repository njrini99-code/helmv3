'use client';

/**
 * ============================================================================
 * Fairway · modules · MicroBar — a zero-centered inline bar for one signed
 * per-row stat inside a dense ledger/table row
 * ----------------------------------------------------------------------------
 * The row-level sibling to `DivergingBars` (a section's worth of rows): ONE
 * signed reading, compact enough to sit beside a score pill in a ledger row.
 * Same sunken-rail visual language as `DivergingBars`/`RailBars` — a sunken
 * track, a center zero tick, a fill growing from center toward the value's
 * side — scaled down to fit inline.
 *
 * `goodDirection` decides the fill COLOR (accent on the good side of zero,
 * warning otherwise). The SIDE is always driven by the value's own sign — a
 * negative reading fills left, a positive one fills right — regardless of
 * which direction happens to be "good" for this particular stat, so a
 * `goodDirection="high"` caller still reads naturally against the same
 * zero-centered rail.
 *
 * No animation, so nothing here needs a `prefers-reduced-motion` guard: the
 * fill is a static width, computed once from `value`/`domain` on every
 * render — there is no transition to gate.
 *
 * ADDITIVE ONLY. Rendered only when the caller has a real comparison value
 * (see FairwayRoundRow's `seasonAvgToPar` gate) — never fabricate a zero
 * baseline.
 * ========================================================================== */

import { cn } from '@/lib/utils';

export interface MicroBarProps {
  /** The signed reading (e.g. this round's score-to-par minus the player's
   *  own season average score-to-par). Zero renders a flat rail, no fill. */
  value: number;
  /** Scale ceiling — a magnitude of `domain` fills a full half-rail. */
  domain: number;
  /** Which side of zero is GOOD. `low` → a negative reading is accent
   *  (green); `high` → a positive reading is accent. */
  goodDirection: 'low' | 'high';
  /** Rail width in px. Default 40. */
  width?: number;
  /** Rail height in px. Default 6. */
  height?: number;
  /** Accessible label — the spoken takeaway (e.g. "1.2 shots better than
   *  their season average"). The visual rail is decorative/aria-hidden. */
  label: string;
  className?: string;
}

/** A small zero-centered inline bar for one signed per-row stat. */
export function MicroBar({
  value,
  domain,
  goodDirection,
  width = 40,
  height = 6,
  label,
  className,
}: MicroBarProps) {
  const safeDomain = domain > 0 ? domain : 1;
  const pct = Math.min(50, (Math.abs(value) / safeDomain) * 50);
  const isGood = goodDirection === 'low' ? value <= 0 : value >= 0;
  const onRight = value > 0;

  return (
    <span
      data-slot="micro-bar"
      role="img"
      aria-label={label}
      className={cn('relative inline-block flex-shrink-0 rounded-full bg-surface-sunken', className)}
      style={{ width, height }}
    >
      {/* center zero tick — same warm marker DivergingBars uses */}
      <span
        aria-hidden="true"
        className="absolute -top-0.5 -bottom-0.5 left-1/2 w-[1.5px] bg-warm-400"
      />
      {value !== 0 ? (
        <span
          aria-hidden="true"
          data-direction={onRight ? 'right' : 'left'}
          data-tone={isGood ? 'accent' : 'warning'}
          className={cn(
            'absolute inset-y-0 rounded-full',
            onRight ? 'left-1/2' : 'right-1/2',
            isGood ? 'bg-accent-500' : 'bg-fw-warning',
          )}
          style={{ width: `${pct}%` }}
        />
      ) : null}
    </span>
  );
}
