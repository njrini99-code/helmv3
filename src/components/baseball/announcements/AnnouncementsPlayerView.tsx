'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconCheck } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { acknowledgeAnnouncement } from '@/app/baseball/actions/announcements';
import type { BaseballAnnouncementMeta } from '@/app/baseball/actions/announcements';
import { PaperCard, InkBadge } from '@/components/baseball/living-annual';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
};

// Dateline-rule tone (replaces the retired border-l-[3px] stripe): a short
// h-[2px] w-7 rounded-full rule above the card title, same ink per urgency.
// 'high' (warning) reads the shared pursuit ink; 'urgent' (error) reads the
// dedicated --notice-error-ink so it stays clay/oxide even inside the
// SAGE-recolored entry scopes (see InkNotice.tsx header) — never raw amber/red.
const urgencyRuleTone: Record<string, string> = {
  low: 'bg-warm-300',
  normal: 'bg-primary-400',
  high: 'bg-pursuit',
  urgent: 'bg-[color:var(--notice-error-ink)]',
};

// High-urgency-only whisper background tint (tone/4) — the one tier that
// earns a touch of ground beyond the rule + badge.
const urgencyCardTint: Partial<Record<string, string>> = {
  urgent: 'bg-[color:var(--notice-error-ink)]/[0.04]',
};

// Ink tone/variant for the urgency <InkBadge>: 'normal' reads team (green —
// primary-600 IS the canonical brand green, same value as --grade-plus).
// 'high' (warning) is pursuit/soft; 'urgent' (error) is pursuit/solid — the
// two stay visually distinct via ink intensity, never amber vs red.
const urgencyBadgeTone: Record<string, { tone: 'team' | 'pursuit' | 'neutral'; variant: 'soft' | 'solid' }> = {
  low: { tone: 'neutral', variant: 'soft' },
  normal: { tone: 'team', variant: 'soft' },
  high: { tone: 'pursuit', variant: 'soft' },
  urgent: { tone: 'pursuit', variant: 'solid' },
};

interface AnnouncementsPlayerViewProps {
  announcements: BaseballAnnouncementMeta[];
  playerId: string;
  loading?: boolean;
}

function AnnouncementSkeleton() {
  return (
    <PaperCard className="animate-pulse" grain={false}>
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <div aria-hidden className="h-[2px] w-7 rounded-full bg-warm-200" />
          <div className="h-4 bg-warm-100 rounded w-3/5" />
          <div className="h-3 bg-warm-100 rounded w-4/5" />
          <div className="h-3 bg-warm-100 rounded w-2/5" />
        </div>
        <div className="h-4 w-4 bg-warm-100 rounded flex-shrink-0 mt-1" />
      </div>
    </PaperCard>
  );
}

export function AnnouncementsPlayerView({ announcements, playerId, loading = false }: AnnouncementsPlayerViewProps) {
  const prefersReducedMotion = useReducedMotion();
  void playerId; // used for future per-player task filtering

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <AnnouncementSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
      className="space-y-3"
    >
      {announcements.map((ann) => (
        <motion.div key={ann.id} variants={itemVariants}>
          <PlayerAnnouncementCard announcement={ann} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function PlayerAnnouncementCard({ announcement: ann }: { announcement: BaseballAnnouncementMeta }) {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(!!ann.has_player_acknowledged);
  const [acknowledging, setAcknowledging] = useState(false);

  const urgencyRule = urgencyRuleTone[ann.urgency || 'normal'] ?? 'bg-primary-400';
  const urgencyTint = urgencyCardTint[ann.urgency || 'normal'];
  // Typed fallback constant (not an indexed access) so noUncheckedIndexedAccess
  // fully strips `undefined` from the union — matches the map's 'normal' entry.
  const urgencyBadge = urgencyBadgeTone[ann.urgency || 'normal'] ?? ({ tone: 'team', variant: 'soft' } as const);

  async function handleAcknowledge() {
    setAcknowledging(true);
    const result = await acknowledgeAnnouncement(ann.id);
    if (result.success) {
      setHasAcknowledged(true);
      showToast('Acknowledged', 'success');
      router.refresh();
    } else {
      showToast(result.error || 'Failed to acknowledge', 'error');
    }
    setAcknowledging(false);
  }

  const publishedDate = ann.published_at
    ? new Date(ann.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const isRecent = ann.published_at && (Date.now() - new Date(ann.published_at).getTime()) < 7 * 86400000;
  // Every targeted announcement is ack-able: show the CTA to any player who hasn't acked yet,
  // independent of whether anyone else has (tracking must be able to start from zero).
  const needsAck = !hasAcknowledged;

  return (
    <PaperCard
      className={cn(
        urgencyTint,
        needsAck && 'ring-1 ring-pursuit/25',
        'transition-shadow hover:shadow-md'
      )}
    >
      {/* Card header */}
      <Button
        variant="ghost"
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full justify-start text-left px-5 py-4 flex items-start gap-4 min-h-0 rounded-none hover:bg-warm-50/50 focus-visible:ring-inset"
      >
        <div className="flex-1 min-w-0">
          {/* Dateline rule — replaces the retired border-l-[3px] stripe;
              urgency stays distinguishable via rule tone + the InkBadge below. */}
          <span aria-hidden className={cn('mb-1.5 block h-[2px] w-7 rounded-full', urgencyRule)} />
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="text-sm font-semibold text-warm-900 truncate">{ann.title}</h3>
            {ann.is_pinned && (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-primary-50 text-primary-600 flex-shrink-0">
                Pinned
              </span>
            )}
            {isRecent && (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-warm-100 text-warm-600 flex-shrink-0">
                New
              </span>
            )}
            {needsAck && (
              <InkBadge label="Needs Acknowledgement" tone="pursuit" variant="soft" className="flex-shrink-0" />
            )}
          </div>
          <p className="text-sm text-warm-500 line-clamp-2 break-words">{ann.content}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-warm-400">{publishedDate}</span>
            <InkBadge label={ann.urgency || 'normal'} tone={urgencyBadge.tone} variant={urgencyBadge.variant} />
            {hasAcknowledged && (
              <span className="inline-flex items-center gap-1 text-xs text-primary-600 font-medium">
                <IconCheck size={10} />
                Acknowledged
              </span>
            )}
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
          className="flex-shrink-0 mt-1"
        >
          <IconChevronDown size={16} className="text-warm-400" />
        </motion.div>
      </Button>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={prefersReducedMotion ? false : ({ height: 0, opacity: 0 })}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.25 })}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 border-t border-warm-100">
              <div className="pt-4 space-y-4">
                {/* Full content */}
                <p className="text-sm text-warm-700 whitespace-pre-wrap">{ann.content}</p>

                {/* Acknowledge button — shown to any recipient who hasn't acked yet */}
                {needsAck && (
                  <div className="pt-2 border-t border-warm-100">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAcknowledge}
                      isLoading={acknowledging}
                    >
                      <IconCheck size={14} className="mr-1.5" />
                      Acknowledge
                    </Button>
                  </div>
                )}

                {hasAcknowledged && (
                  <div className="pt-2 border-t border-warm-100 flex items-center gap-2 text-primary-600">
                    <IconCheck size={16} />
                    <span className="text-sm font-medium">You acknowledged this announcement</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PaperCard>
  );
}
