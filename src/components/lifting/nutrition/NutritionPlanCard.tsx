'use client';

// =============================================================================
// src/components/lifting/nutrition/NutritionPlanCard.tsx
//
// Helm Lifting Lab — player-facing nutrition plan card.
//
// Features:
//   - Renders a PlayerNutritionPlanCard (plan + assignment + signedUrl)
//   - Document plans: download button (signed URL)
//   - Link plans: open in new tab
//   - Note plans: in-card collapsible text
//   - Acknowledge CTA (one-tap, idempotent)
//   - Subtle framer-motion entrance; haptic feedback on acknowledge
//   - Honest loading and acknowledged states
// =============================================================================

import { useState, useTransition } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  IconFileText,
  IconLink,
  IconNote,
  IconDownload,
  IconExternalLink,
  IconCheck,
  IconCheckCircle2,
  IconChevronDown,
  IconChevronUp,
} from '@/components/icons';
import { haptic } from '@/lib/lifting/haptics';
import { acknowledgeNutritionPlan } from '@/app/lifting/actions/nutrition';
import type { PlayerNutritionPlanCard } from '@/app/lifting/actions/nutrition';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  card: PlayerNutritionPlanCard;
  orgId: string;
  /** Called after a successful acknowledge so the parent can refresh. */
  onAcknowledged?: (assignmentId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_TYPE_ICON = {
  document: <IconFileText size={18} className="text-primary-500" />,
  link:     <IconLink size={18} className="text-blue-500" />,
  note:     <IconNote size={18} className="text-amber-500" />,
} as const;

const PLAN_TYPE_LABEL = {
  document: 'Nutrition document',
  link:     'Nutrition link',
  note:     'Nutrition plan',
} as const;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NutritionPlanCard({ card, orgId, onAcknowledged }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [acknowledged, setAcknowledged] = useState(card.assignment.acknowledged_at !== null);
  const [noteExpanded, setNoteExpanded] = useState(false);

  const { plan, assignment, signedUrl } = card;
  const typeLabel = PLAN_TYPE_LABEL[plan.plan_type];
  const typeIcon = PLAN_TYPE_ICON[plan.plan_type];

  function handleAcknowledge() {
    if (acknowledged || isPending) return;
    startTransition(async () => {
      haptic('tap');
      const result = await acknowledgeNutritionPlan({ orgId, assignmentId: assignment.id });
      if (!result.success) {
        toast.error(result.error ?? 'Could not acknowledge plan.');
        return;
      }
      haptic('success');
      setAcknowledged(true);
      toast.success('Marked as seen.');
      onAcknowledged?.(assignment.id);
    });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card
        variant="overlay"
        glow={acknowledged ? 'none' : 'subtle'}
        padding="none"
        className="overflow-hidden"
      >
        {/* Top accent bar */}
        <div
          className={`h-0.5 w-full ${acknowledged ? 'bg-primary-200' : 'bg-gradient-to-r from-primary-400 to-primary-300'}`}
        />

        <CardContent className="p-5">
          {/* Header row */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">{typeIcon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-warm-400">
                  {typeLabel}
                </p>
                {acknowledged && (
                  <span className="flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600">
                    <IconCheckCircle2 size={11} />
                    Seen
                  </span>
                )}
              </div>
              <h3 className="mt-0.5 font-semibold text-warm-900 leading-snug">{plan.title}</h3>
              {plan.description && (
                <p className="mt-1 text-sm text-warm-500 line-clamp-2">{plan.description}</p>
              )}
            </div>
          </div>

          {/* Assignment meta */}
          <p className="mt-3 pl-7 text-xs text-warm-400">
            Added {plan.published_at ? formatDate(plan.published_at) : formatDate(plan.created_at)}
          </p>

          {/* Type-specific content */}
          <div className="mt-4 pl-7 space-y-3">
            {/* Document: download button */}
            {plan.plan_type === 'document' && signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={plan.file_name ?? undefined}
                className={[
                  'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium',
                  'border-primary-200 bg-primary-50 text-primary-700',
                  'transition-all duration-150 hover:bg-primary-100 hover:border-primary-300',
                  'active:scale-[0.98]',
                ].join(' ')}
              >
                <IconDownload size={14} />
                {plan.file_name ? `Download ${plan.file_name}` : 'Download plan'}
              </a>
            )}

            {/* Document but URL expired or missing */}
            {plan.plan_type === 'document' && !signedUrl && (
              <p className="text-xs text-warm-400 italic">
                Download link is unavailable — ask your coach to re-share.
              </p>
            )}

            {/* Link: open external */}
            {plan.plan_type === 'link' && plan.external_url && (
              <a
                href={plan.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className={[
                  'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium',
                  'border-blue-200 bg-blue-50 text-blue-700',
                  'transition-all duration-150 hover:bg-blue-100 hover:border-blue-300',
                  'active:scale-[0.98]',
                ].join(' ')}
              >
                <IconExternalLink size={14} />
                Open plan
              </a>
            )}

            {/* Note: collapsible text */}
            {plan.plan_type === 'note' && plan.description && (
              <div className="rounded-xl border border-warm-200 bg-white/70 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setNoteExpanded((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-warm-700 hover:bg-warm-50/50 transition-colors"
                >
                  <span>View plan details</span>
                  {noteExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                </button>
                {noteExpanded && (
                  <motion.div
                    initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-warm-100 px-4 py-3">
                      <p className="whitespace-pre-wrap text-sm text-warm-700 leading-relaxed">
                        {plan.description}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* Acknowledge CTA */}
          <div className="mt-5 pl-7">
            {acknowledged ? (
              <div className="flex items-center gap-2 text-sm text-primary-600 font-medium">
                <IconCheck size={15} />
                <span>You've seen this plan</span>
                {assignment.acknowledged_at && (
                  <span className="text-xs text-warm-400 font-normal">
                    · {formatDate(assignment.acknowledged_at)}
                  </span>
                )}
              </div>
            ) : (
              <Button
                size="sm"
                onClick={handleAcknowledge}
                disabled={isPending}
                className="gap-2"
              >
                {isPending ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Saving…
                  </>
                ) : (
                  <>
                    <IconCheck size={14} />
                    Mark as seen
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton export for loading states
// ---------------------------------------------------------------------------

export function NutritionPlanCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-warm-200 bg-white">
      <div className="h-0.5 w-full bg-warm-100" />
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-4.5 w-4.5 rounded bg-warm-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-warm-100" />
            <div className="h-4 w-48 rounded bg-warm-100" />
            <div className="h-3 w-64 rounded bg-warm-100" />
          </div>
        </div>
        <div className="mt-4 pl-7">
          <div className="h-9 w-36 rounded-xl bg-warm-100" />
        </div>
        <div className="mt-4 pl-7">
          <div className="h-8 w-28 rounded-xl bg-warm-100" />
        </div>
      </div>
    </div>
  );
}
