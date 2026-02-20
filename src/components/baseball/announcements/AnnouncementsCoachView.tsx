'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconTrash, IconUsers, IconClock } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { AcknowledgementPill } from './AcknowledgementTracker';
import { deleteAnnouncement } from '@/app/baseball/actions/announcements';
import type { BaseballAnnouncementMeta } from '@/app/baseball/actions/announcements';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
};

const urgencyBorderColors: Record<string, string> = {
  low: 'border-l-slate-300',
  normal: 'border-l-green-400',
  high: 'border-l-amber-400',
  urgent: 'border-l-red-400',
};

const urgencyBadgeColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-slate-100', text: 'text-slate-600' },
  normal: { bg: 'bg-green-50', text: 'text-green-600' },
  high: { bg: 'bg-amber-50', text: 'text-amber-600' },
  urgent: { bg: 'bg-red-50', text: 'text-red-600' },
};

interface AnnouncementsCoachViewProps {
  announcements: BaseballAnnouncementMeta[];
}

export function AnnouncementsCoachView({ announcements }: AnnouncementsCoachViewProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      {announcements.map((ann) => (
        <motion.div key={ann.id} variants={itemVariants}>
          <CoachAnnouncementCard announcement={ann} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function CoachAnnouncementCard({ announcement: ann }: { announcement: BaseballAnnouncementMeta }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const urgencyBorder = urgencyBorderColors[ann.urgency || 'normal'];
  const urgencyBadge = urgencyBadgeColors[ann.urgency || 'normal'] ?? { bg: 'bg-green-50', text: 'text-green-600' };

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteAnnouncement(ann.id);
    if (result.success) {
      showToast('Announcement deleted', 'success');
      setShowDeleteConfirm(false);
      router.refresh();
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
      <div
        className={cn(
          'glass-standard rounded-2xl overflow-hidden',
          'border-l-[3px]',
          urgencyBorder,
          'transition-all hover:shadow-md'
        )}
      >
        {/* Card header - always visible */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left px-5 py-4 flex items-start gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-slate-900 truncate">{ann.title}</h3>
              {isRecent && (
                <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-600 flex-shrink-0">
                  New
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 line-clamp-2">{ann.body}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-slate-400">{publishedDate}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider', urgencyBadge.bg, urgencyBadge.text)}>
                {ann.urgency || 'normal'}
              </span>
              {ann.recipient_count > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <IconUsers size={10} />
                  {ann.recipient_count} players
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <IconUsers size={10} />
                  All team
                </span>
              )}
              {ann.requires_acknowledgement && (
                <AcknowledgementPill count={ann.acknowledged_count} total={ann.total_recipients} />
              )}
            </div>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 mt-1"
          >
            <IconChevronDown size={16} className="text-slate-400" />
          </motion.div>
        </button>

        {/* Expanded detail */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-4 border-t border-slate-100">
                <div className="pt-4 space-y-4">
                  {/* Full body */}
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{ann.body}</p>

                  {/* Acknowledgements progress */}
                  {ann.requires_acknowledgement && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Acknowledgements ({ann.acknowledged_count}/{ann.total_recipients})
                      </p>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            ann.acknowledged_count >= ann.total_recipients ? 'bg-green-500' : 'bg-blue-400'
                          )}
                          style={{ width: `${ann.total_recipients > 0 ? (ann.acknowledged_count / ann.total_recipients) * 100 : 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400">
                        {ann.acknowledged_count >= ann.total_recipients && ann.total_recipients > 0
                          ? 'All players have acknowledged'
                          : `${ann.total_recipients - ann.acknowledged_count} player${ann.total_recipients - ann.acknowledged_count !== 1 ? 's' : ''} remaining`}
                      </p>
                    </div>
                  )}

                  {/* Recipient info */}
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <IconClock size={12} />
                    <span>
                      {ann.recipient_count > 0
                        ? `Sent to ${ann.recipient_count} specific player${ann.recipient_count !== 1 ? 's' : ''}`
                        : 'Sent to all team members'}
                    </span>
                  </div>

                  {/* Delete action */}
                  <div className="pt-2 border-t border-slate-100">
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
      </div>

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
