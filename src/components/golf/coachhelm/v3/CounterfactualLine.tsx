'use client';

/**
 * CounterfactualLine — W17 secondary line under StandingBar / insight cards.
 *
 * Master plan Part X discipline:
 *   - Always lighter weight than the headline.
 *   - Auto-suppressed below 0.3 strokes/round (handled in compute()).
 *   - Renders nothing when the projection is suppressed.
 *
 * Tier 4 polish (v3 feature audit feature #3): the line fades in 150ms
 * AFTER the parent insight headline lands, so the eye reads the headline
 * first and then the projection arrives like a quiet aside. Uses a 300ms
 * opacity tween via Framer Motion's `m.p`. Framer Motion 12 honors
 * `prefers-reduced-motion` automatically.
 */

import { m } from 'framer-motion';
import {
  computeCounterfactual,
  formatCounterfactualLine,
  type ComputeCounterfactualInput,
} from '@/lib/coachhelm/v3/counterfactual/compute';

export interface CounterfactualLineProps extends ComputeCounterfactualInput {
  /** Visual size — matches StandingBar size variants. */
  size?: 'inline' | 'card' | 'hero';
  className?: string;
}

export function CounterfactualLine({
  size = 'card',
  className,
  ...input
}: CounterfactualLineProps) {
  const projection = computeCounterfactual(input);
  const text = formatCounterfactualLine(projection);
  if (!text) return null;

  const sizeClasses =
    size === 'inline' ? 'text-[10px]' :
    size === 'hero'   ? 'text-sm' :
                        'text-xs';

  return (
    <m.p
      data-testid="counterfactual-line"
      className={`${sizeClasses} text-warm-500 italic mt-1 ${className ?? ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      {text}
    </m.p>
  );
}
