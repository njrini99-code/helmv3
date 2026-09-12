'use client';

/**
 * ============================================================================
 * RoundField: every round in view as a mark on a shared date axis
 * (docs/design/fairway-facelift/screens/rounds-library.v3.md)
 * ----------------------------------------------------------------------------
 * The Rounds Library's one stage instrument: position by date, height and
 * color by score-to-par, size by round type (a qualifier/tournament gets the
 * bigger dot), with the scoped average drawn as a dashed line. Page-local —
 * no registered primitive plots per-ROUND events on a real date axis with a
 * benchmark line (`ScoreField` plots per-*player* rows; `Ribbon`/`TrendChart`
 * are one continuous series with no per-mark type/size distinction).
 *
 * Geometry is percentage-based (no SVG scaling, no per-breakpoint JS number):
 * `dateFraction`/`scoreFieldTicks` are reused verbatim from `ScoreField`, and
 * mark travel is a fixed 40% of the container's own height, so only the CSS
 * height class changes at the `md` breakpoint — never a JS pixel figure.
 * ========================================================================== */

import Link from 'next/link';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { dateFraction, scoreFieldTicks } from '@/components/fairway/modules';
import { cn } from '@/lib/utils';
import { EASE_CINEMATIC, DURATION, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { formatSignedDecimal } from './rounds-library-logic';
import type { RoundFieldMark } from './rounds-library-logic';

const MARK_TRAVEL_PCT = 40;
const SAME_DAY_NUDGE_PX = 4;
const STAGGER_STEP = 0.012;
const STAGGER_CAP = 16;

/** `top` for a baseline-relative offset: no minimum clamp — a mark at
 *  `toPar = 0` sits exactly on the baseline, a fixed-diameter dot needs no
 *  minimum nub to stay visible the way a bar does. */
function offsetTop(toPar: number, cap: number): string {
  if (toPar === 0) return '50%';
  const pct = Math.min(1, Math.abs(toPar) / cap) * MARK_TRAVEL_PCT;
  return `calc(50% ${toPar < 0 ? '-' : '+'} ${pct}%)`;
}

export interface RoundFieldProps {
  marks: ReadonlyArray<RoundFieldMark>;
  domain: { start: string; end: string };
  cap: number;
  /** The scoped average to-par, or `null`/`undefined` to hide the line
   *  entirely (the caller's own `toParCount >= 3` honesty gate). */
  averageToPar?: number | null;
  ariaLabel?: string;
  className?: string;
}

export function RoundField({
  marks,
  domain,
  cap,
  averageToPar = null,
  ariaLabel = 'Every round in view, plotted by date',
  className,
}: RoundFieldProps) {
  const reduced = useReducedMotionGuard();
  const ticks = scoreFieldTicks(domain);
  const byDay = new Map<string, number>();

  return (
    <LazyMotion features={loadFeatures}>
      <div className={cn('flex min-w-0 flex-col', className)}>
        <div role="img" aria-label={ariaLabel} data-slot="round-field" className="relative h-[168px] md:h-[208px]">
          <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-border-strong" />
          {averageToPar != null ? (
            <span
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-dashed border-accent-300"
              style={{ top: offsetTop(averageToPar, cap) }}
            >
              <span className="absolute right-0 -top-4 whitespace-nowrap font-fw-mono text-eyebrow font-normal leading-none text-accent-700">
                Season avg {formatSignedDecimal(averageToPar)}
              </span>
            </span>
          ) : null}
          {marks.map((mark, index) => {
            const seen = byDay.get(mark.date) ?? 0;
            byDay.set(mark.date, seen + 1);
            const x = dateFraction(mark.date, domain);
            const size = mark.isMajor ? 8 : 5;
            const color =
              mark.toPar < 0 ? 'bg-accent-500' : mark.toPar > 0 ? 'bg-fw-warning' : 'bg-text-tertiary/70';
            return (
              <Link
                key={mark.id}
                href={mark.href}
                title={mark.label}
                aria-label={mark.label}
                style={{ left: `calc(${x}% + ${seen * SAME_DAY_NUDGE_PX}px)`, top: offsetTop(mark.toPar, cap) }}
                className="absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50"
              >
                <m.span
                  aria-hidden="true"
                  initial={reduced ? false : { scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: DURATION.short, delay: Math.min(index, STAGGER_CAP) * STAGGER_STEP, ease: EASE_CINEMATIC }}
                  style={{ width: size, height: size }}
                  className={cn('block rounded-full', color)}
                />
              </Link>
            );
          })}
        </div>
        <div aria-hidden="true" className="relative mt-1 h-5">
          {ticks.map((tick) => (
            <span key={tick.key} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${tick.x}%` }}>
              <span className="block h-1.5 w-px bg-border-strong" />
              {tick.label ? (
                <span className="mt-0.5 whitespace-nowrap font-fw-mono text-eyebrow font-normal leading-none tabular-nums text-text-tertiary">
                  {tick.label}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      </div>
    </LazyMotion>
  );
}
