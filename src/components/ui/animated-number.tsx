'use client';

import NumberFlow from '@number-flow/react';

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Slot-machine number transition — every digit rolls into place
 * independently, like a Tag Heuer dial. Used everywhere a hero
 * numeric updates: stat sparklines, funnel counts, Team Pulse
 * legend numbers, predicted scores. Reduced-motion users get a
 * fade swap (NumberFlow handles that internally).
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: AnimatedNumberProps) {
  return (
    <NumberFlow
      value={value}
      prefix={prefix}
      suffix={suffix}
      format={{ minimumFractionDigits: decimals, maximumFractionDigits: decimals }}
      className={className}
      transformTiming={{ duration: 700, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      spinTiming={{ duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
    />
  );
}
