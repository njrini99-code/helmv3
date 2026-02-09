'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconTrash, IconFile, IconCheck, IconUsers, IconClock } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { AcknowledgementPill } from './AcknowledgementTracker';
import { deleteAnnouncement, getAnnouncementDetail } from '@/app/golf/actions/announcements';
import type { GolfAnnouncementMeta, GolfAnnouncementEnriched } from '@/lib/types/golf';

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
  normal: 'border-l-blue-400',
  high: 'border-l-amber-400',
  urgent: 'border-l-red-400',
};

const urgencyBadgeColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-warm-100', text: 'text-warm-600' },
  normal: { bg: 'bg-blue-50', text: 'text-blue-600' },
  high: { bg: 'bg-amber-50', text: 'text-amber-600' },
  urgent: { bg: 'bg-red-50', text: 'text-red-600' },
};

interface AnnouncementsCoachViewProps {
  announcements: GolfAnnouncementMeta[];
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

function CoachAnnouncementCard({ announcement: ann }: { announcement: GolfAnnouncementMeta }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [detail, setDetail] = useState<GolfAnnouncementEnriched | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const urgencyBorder = urgencyBorderColors[ann.urgency || 'normal'];
  const urgencyBadge = urgencyBadgeColors[ann.urgency || 'normal'] ?? { bg: 'bg-blue-50', text: 'text-blue-600' };

  async function handleExpand() {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }
    setIsExpanded(true);
    if (!detail) {
      setLoadingDetail(true);
      const result = await getAnnouncementDetail(ann.id);
      if (result.success && result.data) {
        setDetail(result.data);
      }
      setLoadingDetail(false);
    }
  }

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
          'bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-sm overflow-hidden',
          'border-l-[3px]',
          urgencyBorder,
          'transition-all hover:shadow-md'
        )}
      >
        {/* Card header - always visible */}
        <button
          type="button"
          onClick={handleExpand}
          className="w-full text-left px-5 py-4 flex items-start gap-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-warm-900 truncate">{ann.title}</h3>
              {isRecent && (
                <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-600 flex-shrink-0">
                  New
                </span>
              )}
            </div>
            <p className="text-sm text-warm-500 line-clamp-2">{ann.body}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-warm-400">{publishedDate}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider', urgencyBadge.bg, urgencyBadge.text)}>
                {ann.urgency}
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
              {ann.requires_acknowledgement && (
                <AcknowledgementPill count={ann.acknowledged_count} total={ann.total_recipients} />
              )}
              {ann.document_count > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-warm-500">
                  <IconFile size={10} />
                  {ann.document_count} doc{ann.document_count !== 1 ? 's' : ''}
                </span>
              )}
              {ann.task_count > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-warm-500">
                  <IconCheck size={10} />
                  {ann.completed_task_count}/{ann.task_count} tasks
                </span>
              )}
            </div>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 mt-1"
          >
            <IconChevronDown size={16} className="text-warm-400" />
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
              <div className="px-5 pb-4 border-t border-warm-100">
                {loadingDetail ? (
                  <div className="py-6 flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-2 border-green-600 border-t-transparent rounded-full" />
                  </div>
                ) : detail ? (
                  <div className="pt-4 space-y-4">
                    {/* Full body */}
                    <p className="text-sm text-warm-700 whitespace-pre-wrap">{detail.body}</p>

                    {/* Documents */}
                    {detail.documents && detail.documents.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">Attachments</p>
                        <div className="flex flex-wrap gap-2">
                          {detail.documents.map((d) => (
                            <a
                              key={d.document_id}
                              href={d.document?.file_url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-1.5 bg-warm-50 rounded-lg border border-warm-200 hover:bg-warm-100 transition-colors"
                            >
                              <IconFile size={14} className="text-warm-400" />
                              <span className="text-xs font-medium text-warm-700">{d.document?.title || 'Document'}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tasks with player assignments */}
                    {detail.tasks && detail.tasks.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">Tasks</p>
                        <div className="space-y-2">
                          {detail.tasks.map((t) => {
                            const completed = t.assignments?.filter(a => a.status === 'completed').length || 0;
                            const total = t.assignments?.length || 0;
                            return (
                              <div key={t.task_id} className="p-3 bg-warm-50 rounded-lg border border-warm-200/60">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-warm-900">{t.task?.title || 'Task'}</span>
                                  <span className={cn(
                                    'text-xs font-medium tabular-nums',
                                    completed === total && total > 0 ? 'text-green-600' : 'text-warm-500'
                                  )}>
                                    {completed}/{total} done
                                  </span>
                                </div>
                                {t.task?.description && (
                                  <p className="text-xs text-warm-500 mb-2">{t.task.description}</p>
                                )}
                                {/* Per-player status */}
                                {t.assignments && t.assignments.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {t.assignments.map((a) => (
                                      <span
                                        key={a.player_id}
                                        className={cn(
                                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium',
                                          a.status === 'completed'
                                            ? 'bg-green-50 text-green-700'
                                            : 'bg-warm-100 text-warm-500'
                                        )}
                                      >
                                        {a.status === 'completed' ? <IconCheck size={10} /> : <IconClock size={10} />}
                                        {a.player?.first_name || ''} {a.player?.last_name?.charAt(0) || ''}.
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Acknowledgements detail */}
                    {detail.requires_acknowledgement && (
                      <div>
                        <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">
                          Acknowledgements ({detail.acknowledged_count}/{detail.total_recipients})
                        </p>
                        <div className="h-2 bg-warm-100 rounded-full overflow-hidden mb-2">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              detail.acknowledged_count >= detail.total_recipients ? 'bg-green-500' : 'bg-blue-400'
                            )}
                            style={{ width: `${detail.total_recipients > 0 ? (detail.acknowledged_count / detail.total_recipients) * 100 : 0}%` }}
                          />
                        </div>
                        {detail.acknowledgements && detail.acknowledgements.length > 0 && (
                          <div className="space-y-1">
                            {detail.acknowledgements.map((ack) => {
                              const taskAssignmentPlayers = detail.tasks?.flatMap(t => t.assignments || []) || [];
                              const player = taskAssignmentPlayers.find(a => a.player_id === ack.player_id)?.player;
                              return (
                                <div key={ack.id} className="flex items-center gap-2 py-1 px-2">
                                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center">
                                    <IconCheck size={8} className="text-green-600" />
                                  </div>
                                  <span className="text-xs text-warm-600 flex-1">
                                    {player ? `${player.first_name || ''} ${player.last_name || ''}` : 'Player'}
                                  </span>
                                  <span className="text-xs text-warm-400">
                                    {new Date(ack.acknowledged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delete action */}
                    <div className="pt-2 border-t border-warm-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(true)}
                        leftIcon={<IconTrash size={14} />}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        Delete Announcement
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="py-4 text-sm text-warm-400 text-center">Failed to load details</p>
                )}
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
        description="This will permanently delete the announcement and all associated tasks and acknowledgements. This cannot be undone."
        confirmText="Delete"
        variant="danger"
        isLoading={deleting}
      />
    </>
  );
}
