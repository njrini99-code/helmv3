'use client';

/**
 * StatReadout — any number that can change, rendered with reverence.
 *
 * "ODOMETER TRUTH" (spec §4.4 #3): a numeric value rolls mechanically via the
 * shared Number Flow odometer (wraps `<AnimatedNumber>`), locked to
 * `font-fw-mono tabular-nums` so digits never jitter. A string value (e.g. a
 * slash-line fragment or an em-dash placeholder) renders statically in the
 * same mono figures.
 *
 * CONTRAST LAW (founder addendum): the number carries the contrast. By default
 * a figure renders in near-black `--graphite` (`text-text-primary`, ≥7:1 on
 * paper) — never warm-gray-on-cream. `emphasis` renders it in `--team-ink`
 * green for a leader / highlighted value. A passed `className` colour wins
 * (twMerge) so a lane can tint it clay in the War Room.
 *
 * Signature accents:
 *   • `flashOnChange` → a green rule pulses under the figure when it changes
 *     (a background sync landed a value).
 *   • `pr`            → a single sodium flash marks a personal record / live
 *     threshold cross, then rests. Never a fourth chrome color.
 *
 * `prefers-reduced-motion` → the number is SET instantly (no roll) and no
 * pulse fires.
 */
import { useEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { cn } from '@/lib/utils';
import { EASE_GLIDE } from './motion';

export interface StatReadoutProps {
  /** The figure. Numbers roll on the odometer; strings render statically. */
  value: number | string;
  /** Decimal places for numeric values (ignored for strings). */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Render the figure in team-ink green (a leader / highlighted value). */
  emphasis?: boolean;
  /** Pulse a green rule under the figure whenever `value` changes. */
  flashOnChange?: boolean;
  /** Fire a single sodium flash (personal record / live threshold cross). */
  pr?: boolean;
  className?: string;
  /** Accessible label when the surrounding context does not name the figure. */
  ariaLabel?: string;
}

type Flash = { tick: number; color: 'green' | 'sodium' };

export function StatReadout({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  emphasis = false,
  flashOnChange = false,
  pr = false,
  className,
  ariaLabel,
}: StatReadoutProps) {
  const reduced = useReducedMotion() ?? false;
  const isNumber = typeof value === 'number';

  const [flash, setFlash] = useState<Flash | null>(null);
  const prevValue = useRef(value);
  const tick = useRef(0);

  // Green rule pulse on any value change (the odometer already rolls digits).
  useEffect(() => {
    if (prevValue.current !== value) {
      if (flashOnChange && !reduced) {
        tick.current += 1;
        setFlash({ tick: tick.current, color: 'green' });
      }
      prevValue.current = value;
    }
  }, [value, flashOnChange, reduced]);

  // Single sodium flash when the figure becomes a PR / live threshold cross.
  useEffect(() => {
    if (pr && !reduced) {
      tick.current += 1;
      setFlash({ tick: tick.current, color: 'sodium' });
    }
  }, [pr, reduced]);

  return (
    <span
      className={cn(
        'relative inline-flex items-baseline font-fw-mono tabular-nums',
        emphasis ? 'text-grade-plus' : 'text-text-primary',
        className,
      )}
      aria-label={ariaLabel}
    >
      {isNumber ? (
        reduced ? (
          <span>
            {prefix}
            {(value as number).toFixed(decimals)}
            {suffix}
          </span>
        ) : (
          <AnimatedNumber value={value as number} decimals={decimals} prefix={prefix} suffix={suffix} />
        )
      ) : (
        <span>
          {prefix}
          {value}
          {suffix}
        </span>
      )}

      {flash ? (
        <m.span
          key={flash.tick}
          aria-hidden
          className={cn(
            'pointer-events-none absolute -bottom-0.5 left-0 right-0 h-px origin-left',
            flash.color === 'green' ? 'bg-grade-plus' : 'bg-sodium',
          )}
          initial={{ opacity: 0.9, scaleX: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE_GLIDE }}
        />
      ) : null}
    </span>
  );
}
