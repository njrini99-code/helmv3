'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconFile, IconCheck, IconDownload } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AnnouncementTaskItem } from './AnnouncementTaskItem';
import { getAnnouncementDetail } from '@/app/golf/actions/announcements';
import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
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

interface AnnouncementsPlayerViewProps {
  announcements: GolfAnnouncementMeta[];
  playerId: string;
}

export function AnnouncementsPlayerView({ announcements, playerId }: AnnouncementsPlayerViewProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      {announcements.map((ann) => (
        <motion.div key={ann.id} variants={itemVariants}>
          <PlayerAnnouncementCard announcement={ann} playerId={playerId} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function PlayerAnnouncementCard({ announcement: ann, playerId }: { announcement: GolfAnnouncementMeta; playerId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [detail, setDetail] = useState<GolfAnnouncementEnriched | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(!!ann.has_player_acknowledged);
  const [acknowledging, setAcknowledging] = useState(false);

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
  const needsAck = ann.requires_acknowledgement && !hasAcknowledged;

  // Count player's task progress
  const myCompletedTasks = detail?.tasks?.reduce((count, t) => {
    const myAssignment = t.assignments?.find(a => a.player_id === playerId);
    return count + (myAssignment?.status === 'completed' ? 1 : 0);
  }, 0) || 0;
  const myTotalTasks = detail?.tasks?.length || 0;

  return (
    <div
      className={cn(
        'bg-white/70 backdrop-blur-xl border border-white/30 rounded-2xl shadow-sm overflow-hidden',
        'border-l-[3px]',
        urgencyBorder,
        needsAck && 'ring-1 ring-amber-200/50',
        'transition-all hover:shadow-md'
      )}
    >
      {/* Card header */}
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
            {needsAck && (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-600 flex-shrink-0">
                Needs Acknowledgement
              </span>
            )}
          </div>
          <p className="text-sm text-warm-500 line-clamp-2">{ann.body}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-warm-400">{publishedDate}</span>
            <span className={cn('px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider', urgencyBadge.bg, urgencyBadge.text)}>
              {ann.urgency}
            </span>
            {ann.document_count > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-warm-500">
                <IconFile size={10} />
                {ann.document_count} doc{ann.document_count !== 1 ? 's' : ''}
              </span>
            )}
            {ann.task_count > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-warm-500">
                <IconCheck size={10} />
                Tasks
              </span>
            )}
            {hasAcknowledged && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                <IconCheck size={10} />
                Acknowledged
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

                  {/* Documents - downloadable */}
                  {detail.documents && detail.documents.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-2">Attachments</p>
                      <div className="space-y-1.5">
                        {detail.documents.map((d) => (
                          <a
                            key={d.document_id}
                            href={d.document?.file_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-2.5 bg-warm-50 rounded-xl border border-warm-200 hover:bg-warm-100 hover:border-warm-300 transition-all group"
                          >
                            <div className="w-9 h-9 rounded-lg bg-white border border-warm-200 flex items-center justify-center flex-shrink-0">
                              <IconFile size={16} className="text-warm-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-warm-700 truncate">{d.document?.title || 'Document'}</p>
                              <p className="text-xs text-warm-400">
                                {d.document?.file_type || 'File'}
                                {d.document?.file_size ? ` - ${(d.document.file_size / 1024).toFixed(1)} KB` : ''}
                              </p>
                            </div>
                            <IconDownload size={14} className="text-warm-400 group-hover:text-green-600 transition-colors flex-shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tasks - interactive checkboxes */}
                  {detail.tasks && detail.tasks.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-warm-500 uppercase tracking-wider">Tasks</p>
                        {myTotalTasks > 0 && (
                          <span className={cn(
                            'text-xs font-medium tabular-nums',
                            myCompletedTasks === myTotalTasks ? 'text-green-600' : 'text-warm-500'
                          )}>
                            {myCompletedTasks}/{myTotalTasks} complete
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {detail.tasks.map((t) => {
                          const myAssignment = t.assignments?.find(a => a.player_id === playerId);
                          if (!t.task) return null;
                          return (
                            <AnnouncementTaskItem
                              key={t.task_id}
                              taskId={t.task_id}
                              title={t.task.title}
                              description={t.task.description}
                              dueDate={t.task.due_date}
                              isCompleted={myAssignment?.status === 'completed'}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Acknowledge button */}
                  {ann.requires_acknowledgement && !hasAcknowledged && (
                    <div className="pt-2 border-t border-warm-100">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAcknowledge}
                        isLoading={acknowledging}
                        leftIcon={<IconCheck size={14} />}
                      >
                        Acknowledge
                      </Button>
                    </div>
                  )}

                  {ann.requires_acknowledgement && hasAcknowledged && (
                    <div className="pt-2 border-t border-warm-100 flex items-center gap-2 text-green-600">
                      <IconCheck size={16} />
                      <span className="text-sm font-medium">You acknowledged this announcement</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="py-4 text-sm text-warm-400 text-center">Failed to load details</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
