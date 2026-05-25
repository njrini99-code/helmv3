/**
 * CounterfactualLine — W17 secondary line under StandingBar / insight cards.
 *
 * Master plan Part X discipline:
 *   - Always lighter weight than the headline.
 *   - Auto-suppressed below 0.3 strokes/round (handled in compute()).
 *   - Renders nothing when the projection is suppressed.
 */

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
    <p
      data-testid="counterfactual-line"
      className={`${sizeClasses} text-warm-500 italic mt-1 ${className ?? ''}`}
    >
      {text}
    </p>
  );
}
