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
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { InsightMovement } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { isImprovement } from './tone-derivation';

export interface MovementPillProps {
  insight: EvidenceInsight;
  className?: string;
}

export function MovementPill({ insight, className }: MovementPillProps) {
  const prefersReducedMotion = useReducedMotion();
  const movement = (insight.metadata?.movement ?? null) as InsightMovement | null;

  // Memoize the derived label so we don't re-build the string on every
  // animation frame of the one-shot fade-in.
  const derived = useMemo(() => {
    if (!movement) return null;
    const improvement = isImprovement(movement.direction, insight.evidence.metric);
    const arrow = movement.direction === 'up' ? '↑' : '↓';
    const pct = Math.abs(Number(movement.percent_change ?? 0));
    const pctLabel = pct > 0 ? `${Math.round(pct * 100)}%` : null;
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
