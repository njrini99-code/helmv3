'use client';

/**
 * MovementPill — renders the "↑ +6pt since 12 days ago" pill beneath the
 * insight title. Reads `metadata.movement` from the shared `EvidenceInsight`
 * shape and paints green (improvement) or amber (declining-on-bad-metric).
 *
 * Rule 4 of the Insight Delivery contract. Hides itself when no movement
 * metadata is present — parent components don't need to guard the slot.
 */
import { useMemo } from 'react';
import { m } from 'framer-motion';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { InsightMovement } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { isImprovement } from './tone-derivation';

export interface MovementPillProps {
  insight: EvidenceInsight;
  className?: string;
}

/**
 * ui-tone-3: format a movement magnitude given as a signed fraction
 * (`percent_change`, e.g. 0.12 = +12%, 3.99 = +399%). Below 100% we keep the
 * familiar "12%" wording; at/above 100% the percent reads as comical noise
 * ("↑399%"), so we switch to a multiplier ("4.0x") which is both honest and
 * compact. Returns null when there's no measurable movement.
 */
export function formatMovementMagnitude(fraction: number): string | null {
  const pct = Math.abs(Number(fraction) || 0);
  if (pct <= 0) return null;
  // At/above a full doubling, percent labels stop being readable — show the
  // multiple of the prior value instead (1.0 fraction = 2.0x the old value).
  if (pct >= 1) return `${(pct + 1).toFixed(1)}x`;
  return `${Math.round(pct * 100)}%`;
}

export function MovementPill({ insight, className }: MovementPillProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const movement = (insight.metadata?.movement ?? null) as InsightMovement | null;

  // Memoize the derived label so we don't re-build the string on every
  // animation frame of the one-shot fade-in.
  const derived = useMemo(() => {
    if (!movement) return null;
    const improvement = isImprovement(movement.direction, insight.evidence.metric);
    const arrow = movement.direction === 'up' ? '↑' : '↓';
    const pctLabel = formatMovementMagnitude(Number(movement.percent_change ?? 0));
    const delta = Math.abs(Number(movement.to ?? 0) - Number(movement.from ?? 0));
    return { improvement, arrow, pctLabel, delta };
  }, [movement, insight.evidence.metric]);

  if (!movement || !derived) return null;

  return (
    <Badge
      as={m.span}
      tone={derived.improvement ? 'primary' : 'amber'}
      size="none"
      data-testid="movement-pill"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.25, ease: 'easeOut' })}
      className={cn(
        'gap-1 px-2 py-0.5 text-eyebrow tabular-nums',
        // Preserve the original softened /60 border alpha.
        derived.improvement ? 'border-primary-200/60' : 'border-amber-200/60',
        className,
      )}
    >
      <span aria-hidden>{derived.arrow}</span>
      {derived.pctLabel ? (
        <span>{derived.pctLabel}</span>
      ) : (
        <span>{derived.delta.toFixed(1)}pt</span>
      )}
      <span className="text-warm-500">since last check</span>
    </Badge>
  );
}
