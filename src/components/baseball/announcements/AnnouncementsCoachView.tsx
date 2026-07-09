'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconTrash, IconUsers, IconClock } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/sonner';
import { AcknowledgementPill } from './AcknowledgementTracker';
import { deleteAnnouncement } from '@/app/baseball/actions/announcements';
import type { BaseballAnnouncementMeta } from '@/app/baseball/actions/announcements';
import { PaperCard } from '@/components/baseball/living-annual';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
};

const urgencyBorderColors: Record<string, string> = {
  low: 'border-l-warm-300',
  normal: 'border-l-primary-400',
  high: 'border-l-amber-400',
  urgent: 'border-l-red-400',
};

const urgencyBadgeColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-warm-100', text: 'text-warm-600' },
  normal: { bg: 'bg-primary-50', text: 'text-primary-600' },
  high: { bg: 'bg-amber-50', text: 'text-amber-600' },
  urgent: { bg: 'bg-red-50', text: 'text-red-600' },
};

interface AnnouncementsCoachViewProps {
  announcements: BaseballAnnouncementMeta[];
  loading?: boolean;
  /** Called after a successful delete so the parent can refetch the list. */
  onDeleted?: () => void;
}

function AnnouncementSkeleton() {
  return (
    <PaperCard className="border-l-[3px] border-l-warm-200 animate-pulse" grain={false}>
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 bg-warm-100 rounded w-3/5" />
          <div className="h-3 bg-warm-100 rounded w-4/5" />
          <div className="h-3 bg-warm-100 rounded w-2/5" />
        </div>
        <div className="h-4 w-4 bg-warm-100 rounded flex-shrink-0 mt-1" />
      </div>
    </PaperCard>
  );
}

export function AnnouncementsCoachView({ announcements, loading = false, onDeleted }: AnnouncementsCoachViewProps) {
  const prefersReducedMotion = useReducedMotion();

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
          <CoachAnnouncementCard announcement={ann} onDeleted={onDeleted} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function CoachAnnouncementCard({ announcement: ann, onDeleted }: { announcement: BaseballAnnouncementMeta; onDeleted?: () => void }) {
  const prefersReducedMotion = useReducedMotion();
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const urgencyBorder = urgencyBorderColors[ann.urgency || 'normal'];
  const urgencyBadge = urgencyBadgeColors[ann.urgency || 'normal'] ?? { bg: 'bg-primary-50', text: 'text-primary-600' };

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteAnnouncement(ann.id);
    if (result.success) {
      showToast('Announcement deleted', 'success');
      setShowDeleteConfirm(false);
      onDeleted?.();
    } else {
      showToast(result.error || 'Failed to delete', 'error');
    }
    setDeleting(false);
  }

  const publishedDate = ann.published_at
    ? new Date(ann.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const isRecent = ann.published_at && (Date.now() - new Date(ann.published_at).getTime()) < 7 * 86400000;

  return (
    <>
      <PaperCard
        className={cn(
          'border-l-[3px]',
          urgencyBorder,
          'transition-shadow hover:shadow-md'
        )}
      >
        {/* Card header - always visible */}
        <Button
          variant="ghost"
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="w-full justify-start text-left px-5 py-4 flex items-start gap-4 min-h-0 rounded-none hover:bg-warm-50/50 focus-visible:ring-inset"
        >
          <div className="flex-1 min-w-0">
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
            </div>
            <p className="text-sm text-warm-500 line-clamp-2 break-words">{ann.content}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-warm-400">{publishedDate}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider', urgencyBadge.bg, urgencyBadge.text)}>
                {ann.urgency || 'normal'}
              </span>
              {ann.recipient_count > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-warm-500">
                  <IconUsers size={10} />
                  {ann.recipient_count} players
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-warm-500">
                  <IconUsers size={10} />
                  All team
                </span>
              )}
              {ann.total_recipients > 0 && (
                <AcknowledgementPill count={ann.acknowledged_count} total={ann.total_recipients} />
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

                  {/* Acknowledgements progress — render 0/N for fresh posts, not just once acks exist */}
                  {ann.total_recipients > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">
                        Acknowledgements ({ann.acknowledged_count}/{ann.total_recipients})
                      </p>
                      <div className="h-2 bg-warm-100 rounded-full overflow-hidden mb-2">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            ann.acknowledged_count >= ann.total_recipients ? 'bg-primary-500' : 'bg-blue-400'
                          )}
                          style={{ width: `${ann.total_recipients > 0 ? (ann.acknowledged_count / ann.total_recipients) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-warm-400">
                        {ann.acknowledged_count >= ann.total_recipients && ann.total_recipients > 0
                          ? 'All players have acknowledged'
                          : `${ann.total_recipients - ann.acknowledged_count} player${ann.total_recipients - ann.acknowledged_count !== 1 ? 's' : ''} remaining`}
                      </p>
                    </div>
                  )}

                  {/* Recipient info */}
                  <div className="flex items-center gap-2 text-xs text-warm-400">
                    <IconClock size={12} />
                    <span>
                      {ann.recipient_count > 0
                        ? `Sent to ${ann.recipient_count} specific player${ann.recipient_count !== 1 ? 's' : ''}`
                        : 'Sent to all team members'}
                    </span>
                  </div>

                  {/* Delete action */}
                  <div className="pt-2 border-t border-warm-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors active:bg-red-100"
                    >
                      <IconTrash size={14} className="mr-1.5" />
                      Delete Announcement
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PaperCard>

      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Announcement"
        description="This will permanently delete the announcement and all associated acknowledgements. This cannot be undone."
        confirmText="Delete"
        variant="danger"
        isLoading={deleting}
      />
    </>
  );
}
