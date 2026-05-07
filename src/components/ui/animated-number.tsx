'use client';

import { useEffect, useRef, useState } from 'react';
import NumberFlow from '@number-flow/react';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /**
   * Stagger this card's mount-roll behind a sibling row's first card so a
   * grid of stat cards rolls up in cascade rather than all at once.
   * Pass the index in the sibling row (0, 1, 2, …). Each step adds 80ms.
   */
  staggerIndex?: number;
}

/**
 * Slot-machine number transition — every digit rolls into place
 * independently, like a Tag Heuer dial.
 *
 * Two animation moments:
 *   1. **Mount roll** — on initial render the value rolls from `0` up to
 *      its final number over ~900ms. This is what makes a freshly-loaded
 *      dashboard feel cinematic instead of static. Optional staggerIndex
 *      lets a row of stat cards cascade.
 *   2. **Update roll** — every subsequent value change spins to the new
 *      number with the same easing.
 *
 * Reduced-motion users get a fade swap on both (NumberFlow internal).
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
  staggerIndex = 0,
}: AnimatedNumberProps) {
  // On first mount we render `0`, then on the next tick (after an optional
  // stagger delay) we set the real value so NumberFlow rolls from 0 → value.
  // After that, internal value updates animate normally.
  const [displayValue, setDisplayValue] = useState(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      // First mount: roll from 0 → value after a stagger delay.
      const delay = Math.max(0, staggerIndex) * 80;
      const t = window.setTimeout(() => {
        setDisplayValue(value);
        mountedRef.current = true;
      }, delay);
      return () => window.clearTimeout(t);
    }
    // Subsequent updates: pass through immediately.
    setDisplayValue(value);
    return undefined;
  }, [value, staggerIndex]);

  return (
    <NumberFlow
      value={displayValue}
      prefix={prefix}
      suffix={suffix}
      format={{ minimumFractionDigits: decimals, maximumFractionDigits: decimals }}
      className={className}
      transformTiming={{ duration: 700, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      spinTiming={{ duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
    />
  );
}
