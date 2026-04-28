'use client';

import { useEffect, useRef } from 'react';
import { m, useSpring, useTransform, useInView } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function AnimatedNumber({ 
  value, 
  decimals = 0, 
  prefix = '', 
  suffix = '',
  className 
}: AnimatedNumberProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  const spring = useSpring(0, {
    mass: 0.8,
    stiffness: 75,
    damping: 15
  });

  const display = useTransform(spring, (current) =>
    `${prefix}${current.toFixed(decimals)}${suffix}`
  );

  // Track value changes so the spring follows live data, not just the
  // first-paint value. Previous behavior gated the .set() call behind a
  // one-shot `hasAnimated` flag — fine for marketing pages, fatal for an
  // admin dashboard whose KPIs update from a placeholder 0 to a real
  // number once the data fetch resolves: the spring stuck at 0 forever.
  useEffect(() => {
    if (isInView) {
      spring.set(value);
    }
  }, [isInView, value, spring]);

  const finalDisplay = `${prefix}${value.toFixed(decimals)}${suffix}`;

  return (
    <>
      <m.span ref={ref} className={className} aria-hidden="true">
        {display}
      </m.span>
      <span className="sr-only">{finalDisplay}</span>
    </>
  );
}
