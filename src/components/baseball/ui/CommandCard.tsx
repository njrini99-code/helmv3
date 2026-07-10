'use client';

/**
 * CommandCard — the primary signal/alert unit for BaseballHelm.
 *
 * Mirrors the InsightCard accent-bar pattern from GolfHelm while using the
 * baseball-local motion primitives from @/lib/baseball/motion.
 *
 * Five tones: ready | watch | urgent | info | complete
 * Each tone gets a 4px left accent strip, matching the w-1 left-border
 * convention used in InsightCard (golf coachhelm accentBar).
 *
 * Spec: §5.4 of the BaseballHelm UI/UX Architecture master plan.
 */

import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { hoverLift } from '@/lib/baseball/motion';
import type { BaseballCapabilityMap, BaseballCapability } from '@/lib/baseball/capabilities';

// ---------------------------------------------------------------------------
// Types — exported for consumer composability
// ---------------------------------------------------------------------------

export type CommandCardTone = 'ready' | 'watch' | 'urgent' | 'info' | 'complete';

export interface CardAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /**
   * When CommandCard receives a `capabilities` prop, actions with a
   * `requiredCapability` set are hidden unless the caller's capability map
   * grants that cap. Actions without a `requiredCapability` are always shown.
   */
  requiredCapability?: BaseballCapability;
}

export interface CommandCardProps {
  tone: CommandCardTone;
  eyebrow?: string;
  title: string;
  description?: string;
  /** Accepts EvidencePill nodes or any inline React content. */
  evidence?: React.ReactNode[];
  actions?: CardAction[];
  meta?: React.ReactNode;
  /**
   * Resolved capability map for the current caller (coach staff row).
   * When provided, action buttons whose `requiredCapability` the caller
   * does not hold are hidden. Player-role callers supply an all-false map,
   * which hides every gated action.
   */
  capabilities?: BaseballCapabilityMap;
  className?: string;
}

// ---------------------------------------------------------------------------
// Tone → accent class map
// Ink doctrine (2026-07-09 sweep): ready→primary-500, watch→pursuit/60,
// urgent→pursuit (full clay), info→blue-400, complete→primary-300 —
// urgency reads as clay intensity, never raw amber/red.
// ---------------------------------------------------------------------------

const ACCENT_CLASS: Record<CommandCardTone, string> = {
  ready:    'bg-primary-500',
  watch:    'bg-pursuit/60',
  urgent:   'bg-pursuit',
  info:     'bg-blue-400',
  complete: 'bg-primary-300',
};

// ---------------------------------------------------------------------------
// CommandCard
// ---------------------------------------------------------------------------

export function CommandCard({
  tone,
  eyebrow,
  title,
  description,
  evidence,
  actions,
  meta,
  capabilities,
  className,
}: CommandCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const accentClass = ACCENT_CLASS[tone];

  // Filter actions: if the action declares a requiredCapability and a
  // capabilities map is present, hide actions the caller does not hold.
  const visibleActions = (actions ?? []).filter((a) => {
    if (!a.requiredCapability) return true;
    if (!capabilities) return true;
    return capabilities[a.requiredCapability] === true;
  });

  const hasActions = visibleActions.length > 0;

  return (
    <m.div
      // Entrance animation — skipped entirely when prefers-reduced-motion.
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
      // hoverLift returns undefined under reduced motion (no gesture at all).
      whileHover={hoverLift(prefersReducedMotion, { scale: 1, y: -2 })}
      style={{ display: 'block' }}
    >
      <Card
        variant="overlay"
        padding="none"
        className={cn('relative overflow-hidden', className)}
      >
        {/* Tone accent strip — 4px left bar, full height */}
        <span
          aria-hidden
          className={cn(
            'absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl',
            accentClass,
          )}
        />

        {/* Card body — indented to clear the accent strip */}
        <div className="pl-5 pr-5 py-5 md:py-6 md:pr-6">
          {/* Eyebrow */}
          {eyebrow && (
            <p className="text-eyebrow uppercase tracking-[0.06em] font-semibold text-warm-400 mb-1">
              {eyebrow}
            </p>
          )}

          {/* Title */}
          <h3 className="text-h3 font-semibold text-warm-900 leading-snug">
            {title}
          </h3>

          {/* Description */}
          {description && (
            <p className="text-sm text-warm-600 mt-1.5 leading-relaxed">
              {description}
            </p>
          )}

          {/* Evidence pills row */}
          {Array.isArray(evidence) && evidence.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {evidence.map((node, i) => (
                // Evidence nodes (EvidencePill etc.) supply their own key via props;
                // use positional index as a stable fallback for opaque ReactNode slots.
                <span key={i}>{node}</span>
              ))}
            </div>
          )}

          {/* Actions row — only rendered when visible (capability-filtered) actions exist */}
          {hasActions && (
            <div className="flex flex-wrap gap-2 mt-3">
              {visibleActions.map((action) => (
                <Button
                  key={action.label}
                  variant="ghost"
                  size="sm"
                  disabled={action.disabled}
                  onClick={action.onClick}
                  className="min-h-[44px]"
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          {/* Meta slot — arbitrary footer content (timestamps, badges, etc.) */}
          {meta && (
            <div className="mt-3">
              {meta}
            </div>
          )}
        </div>
      </Card>
    </m.div>
  );
}
