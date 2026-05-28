'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconFile, IconCheck, IconDownload, IconClipboardList } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { AnnouncementTaskItem } from './AnnouncementTaskItem';
import { AcknowledgementTracker } from './AcknowledgementTracker';
import { getAnnouncementDetail } from '@/app/golf/actions/announcements';
import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
import { openExternalUrl } from '@/lib/utils/capacitor';
import type { GolfAnnouncementMeta, GolfAnnouncementEnriched } from '@/lib/types/golf';

// ─── Animation ────────────────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 400, damping: 30 } },
};

// ─── Urgency config ───────────────────────────────────────────────────────────

type UrgencyStyle = { dot: string; bg: string; text: string; border: string; label: string };
const urgencyConfig: Record<string, UrgencyStyle> = {
  low:    { dot: 'bg-warm-400',  bg: 'bg-warm-50',  text: 'text-warm-600',  border: 'border-warm-200', label: 'Low' },
  normal: { dot: 'bg-blue-400',  bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200', label: 'Normal' },
  high:   { dot: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'High' },
  urgent: { dot: 'bg-red-500',   bg: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-200', label: 'Urgent' },
};
const defaultUrg: UrgencyStyle = urgencyConfig['normal']!;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string, now: number): string {
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Main Export ──────────────────────────────────────────────────────────────

interface AnnouncementsPlayerViewProps {
  announcements: GolfAnnouncementMeta[];
  playerId: string;
}

export function AnnouncementsPlayerView({ announcements, playerId }: AnnouncementsPlayerViewProps) {
  const prefersReducedMotion = useReducedMotion();
  // Defer time-dependent values to client to avoid hydration mismatch
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => { setNowTs(Date.now()); }, []);

  // Sort: unread (unacknowledged or recent) first, then by date
  const sorted = [...announcements].sort((a, b) => {
    const aUnread = isUnread(a, nowTs);
    const bUnread = isUnread(b, nowTs);
    if (aUnread && !bUnread) return -1;
    if (!aUnread && bUnread) return 1;
    return 0; // preserve server order (already sorted by date)
  });

  return (
    <motion.div
      variants={containerVariants}
      initial={prefersReducedMotion ? false : "hidden"}
      animate="visible"
      className="space-y-3"
    >
      {sorted.map((ann) => (
        <motion.div key={ann.id} variants={itemVariants}>
          <PlayerAnnouncementCard announcement={ann} playerId={playerId} nowTs={nowTs} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function isUnread(ann: GolfAnnouncementMeta, now: number): boolean {
  // If requires ack and player hasn't acknowledged → unread
  if (ann.requires_acknowledgement && !ann.has_player_acknowledged) return true;
  // If no ack required but posted within 24h → treat as unread/fresh
  if (!ann.requires_acknowledgement && ann.published_at && now > 0) {
    return (now - new Date(ann.published_at).getTime()) < 24 * 3600000;
  }
  return false;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function PlayerAnnouncementCard({ announcement: ann, playerId, nowTs }: { announcement: GolfAnnouncementMeta; playerId: string; nowTs: number }) {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [detail, setDetail] = useState<GolfAnnouncementEnriched | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(!!ann.has_player_acknowledged);
  const [acknowledging, setAcknowledging] = useState(false);

  const urg = urgencyConfig[ann.urgency || 'normal'] ?? defaultUrg;
  const isNew = nowTs > 0 && ann.published_at && (nowTs - new Date(ann.published_at).getTime()) < 7 * 86400000;
  const needsAck = ann.requires_acknowledgement && !hasAcknowledged;
  const unread = needsAck || (nowTs > 0 && !ann.requires_acknowledgement && ann.published_at && (nowTs - new Date(ann.published_at).getTime()) < 24 * 3600000);

  // Count player's task progress
  const myCompletedTasks = detail?.tasks?.reduce((count, t) => {
    const myAssignment = t.assignments?.find(a => a.player_id === playerId);
    return count + (myAssignment?.status === 'completed' ? 1 : 0);
  }, 0) || 0;
  const myTotalTasks = detail?.tasks?.length || 0;

  async function handleExpand() {
    if (isExpanded) { setIsExpanded(false); return; }
    setIsExpanded(true);
    if (!detail) {
      setLoadingDetail(true);
      const result = await getAnnouncementDetail(ann.id);
      if (result.success && result.data) setDetail(result.data);
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

  return (
    <div
      className={cn(
        'group relative rounded-2xl overflow-hidden transition-all duration-200',
        'bg-white border shadow-sm',
        unread
          ? 'border-primary-200 bg-gradient-to-r from-primary-50/40 via-white to-white shadow-[0_0_0_1px_rgba(22,163,74,0.08),0_1px_3px_rgba(22,163,74,0.08)]'
          : 'border-warm-200/80 hover:shadow-md hover:border-warm-300/80'
      )}
    >
      {/* Urgency indicator bar */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl', urg.dot)} />

      {/* Unread indicator dot — top-right */}
      {unread && (
        <div className="absolute top-3.5 right-3.5 z-10">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-50" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500" />
          </span>
        </div>
      )}

      {/* Card header */}
      <Button variant="ghost"
        type="button"
        onClick={handleExpand}
        className="w-full text-left pl-5 pr-4 py-4 flex items-start gap-3"
      >
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2.5 mb-1.5">
            <h3 className={cn(
              'font-medium text-warm-900 truncate',
              unread ? 'text-body' : 'text-sm'
            )}>
              {ann.title}
            </h3>
            {needsAck && (
              <span className="flex-shrink-0 px-2 py-0.5 text-micro font-medium uppercase tracking-wider rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                Action needed
              </span>
            )}
            {!needsAck && isNew && !hasAcknowledged && (
              <span className="flex-shrink-0 px-2 py-0.5 text-micro font-medium uppercase tracking-wider rounded-full bg-primary-50 text-primary-700 border border-primary-200">
                New
              </span>
            )}
          </div>

          {/* Body preview */}
          <p className="text-sm text-warm-500 line-clamp-2 mb-3 leading-relaxed">{ann.body}</p>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Urgency pill */}
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-label font-medium uppercase tracking-wider border',
              urg.bg, urg.text, urg.border
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', urg.dot)} />
              {urg.label}
            </span>

            <span className="text-warm-300 text-xs">|</span>

            {/* Time */}
            <span className="text-xs text-warm-500 tabular-nums" suppressHydrationWarning>
              {ann.published_at && nowTs > 0 ? relativeTime(ann.published_at, nowTs) : ''}
            </span>

            {/* Docs */}
            {ann.document_count > 0 && (
              <>
                <span className="text-warm-300 text-xs">|</span>
                <span className="inline-flex items-center gap-1 text-xs text-warm-500">
                  <IconFile size={11} className="text-warm-400" />
                  {ann.document_count} doc{ann.document_count !== 1 ? 's' : ''}
                </span>
              </>
            )}

            {/* Tasks */}
            {ann.task_count > 0 && (
              <>
                <span className="text-warm-300 text-xs">|</span>
                <span className="inline-flex items-center gap-1 text-xs text-warm-500">
                  <IconClipboardList size={11} className="text-warm-400" />
                  Tasks
                </span>
              </>
            )}

            {/* Acknowledged status */}
            {hasAcknowledged && (
              <>
                <span className="text-warm-300 text-xs">|</span>
                <span className="inline-flex items-center gap-1 text-xs text-primary-600 font-medium">
                  <IconCheck size={11} />
                  Acknowledged
                </span>
              </>
            )}

            {/* Team acknowledgement progress */}
            {ann.requires_acknowledgement && ann.total_recipients > 0 && (
              <>
                <span className="text-warm-300 text-xs">|</span>
                <AcknowledgementTracker
                  acknowledgedCount={ann.acknowledged_count}
                  totalRecipients={ann.total_recipients}
                  compact
                />
              </>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
          className="flex-shrink-0 mt-1 w-7 h-7 rounded-lg flex items-center justify-center bg-warm-50 group-hover:bg-warm-100 transition-colors"
        >
          <IconChevronDown size={14} className="text-warm-500" />
        </motion.div>
      </Button>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={prefersReducedMotion ? false : ({ height: 0, opacity: 0 })}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } })}
            className="overflow-hidden"
          >
            <div className="pl-5 pr-4 pb-5 border-t border-warm-100">
              {loadingDetail ? (
                <div className="py-8 flex items-center justify-center">
                  <div className="flex items-center gap-1.5">
                    {[0, 150, 300].map((delay) => (
                      <span key={delay} className="w-1.5 h-1.5 rounded-full bg-primary-500 skeleton-shimmer" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              ) : detail ? (
                <div className="pt-4 space-y-5">
                  {/* Full body */}
                  <p className="text-sm text-warm-700 whitespace-pre-wrap leading-relaxed">{detail.body}</p>

                  {/* Documents - downloadable */}
                  {detail.documents && detail.documents.length > 0 && (
                    <div>
                      <p className="text-label font-medium text-warm-400 uppercase tracking-[0.12em] opacity-80 mb-2.5">Attachments</p>
                      <div className="space-y-1.5">
                        {detail.documents.map((d) => (
                          <Button variant="ghost"
                            type="button"
                            key={d.document_id}
                            onClick={() => {
                              const url = d.document?.file_url;
                              if (url) void openExternalUrl(url);
                            }}
                            className="w-full text-left flex items-center gap-3 px-3.5 py-3 bg-warm-50/80 rounded-xl border border-warm-200 hover:bg-warm-100 hover:border-warm-300 active:scale-[0.99] transition-all group/doc"
                          >
                            <div className="w-9 h-9 rounded-lg bg-white border border-warm-200 flex items-center justify-center flex-shrink-0 group-hover/doc:border-warm-300 transition-colors">
                              <IconFile size={15} className="text-warm-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-warm-700 truncate">{d.document?.title || 'Document'}</p>
                              <p className="text-label text-warm-400">
                                {d.document?.file_type || 'File'}
                                {d.document?.file_size ? ` \u00b7 ${(d.document.file_size / 1024).toFixed(1)} KB` : ''}
                              </p>
                            </div>
                            <IconDownload size={14} className="text-warm-300 group-hover/doc:text-primary-600 transition-colors flex-shrink-0" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tasks - interactive checkboxes */}
                  {detail.tasks && detail.tasks.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2.5">
                        <p className="text-label font-medium text-warm-400 uppercase tracking-[0.12em] opacity-80">Your Tasks</p>
                        {myTotalTasks > 0 && (
                          <span className={cn(
                            'text-xs font-medium tabular-nums',
                            myCompletedTasks === myTotalTasks ? 'text-primary-600' : 'text-warm-500'
                          )}>
                            {myCompletedTasks}/{myTotalTasks}
                          </span>
                        )}
                      </div>
                      {myTotalTasks > 0 && (
                        <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden mb-3">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              myCompletedTasks === myTotalTasks ? 'bg-primary-500' : 'bg-blue-400'
                            )}
                            style={{ width: `${myTotalTasks > 0 ? (myCompletedTasks / myTotalTasks) * 100 : 0}%` }}
                          />
                        </div>
                      )}
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
                    <div className="pt-3 border-t border-warm-100">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAcknowledge}
                        isLoading={acknowledging}
                        leftIcon={<IconCheck size={14} />}
                      >
                        Acknowledge
                      </Button>
                      <p className="text-label text-warm-400 mt-1.5">Your coach requires you to acknowledge this announcement</p>
                    </div>
                  )}

                  {ann.requires_acknowledgement && hasAcknowledged && (
                    <div className="pt-3 border-t border-warm-100 flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <IconCheck size={10} className="text-primary-600" />
                      </div>
                      <span className="text-sm font-medium text-primary-700">Acknowledged</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="py-6 text-sm text-warm-400 text-center">Failed to load details</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
