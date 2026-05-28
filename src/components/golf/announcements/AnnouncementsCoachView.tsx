'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconTrash, IconFile, IconCheck, IconUsers, IconClock, IconClipboardList } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/sonner';
import { deleteAnnouncement, getAnnouncementDetail } from '@/app/golf/actions/announcements';
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

// ─── Card ─────────────────────────────────────────────────────────────────────

function CoachAnnouncementCard({ announcement: ann }: { announcement: GolfAnnouncementMeta }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [detail, setDetail] = useState<GolfAnnouncementEnriched | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Defer time-dependent values to client to avoid hydration mismatch
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => { setNowTs(Date.now()); }, []);

  const urg = urgencyConfig[ann.urgency || 'normal'] ?? defaultUrg;
  const isRecent = nowTs > 0 && ann.published_at && (nowTs - new Date(ann.published_at).getTime()) < 24 * 3600000;
  const isNew = nowTs > 0 && ann.published_at && (nowTs - new Date(ann.published_at).getTime()) < 7 * 86400000;
  const ackProgress = ann.total_recipients > 0
    ? Math.round((ann.acknowledged_count / ann.total_recipients) * 100)
    : 0;

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

  return (
    <>
      <div
        className={cn(
          'group relative rounded-2xl overflow-hidden transition-all duration-200',
          'bg-white border border-warm-200/80 shadow-sm',
          'hover:shadow-md hover:border-warm-300/80',
          isRecent && 'ring-1 ring-primary-200/40 bg-primary-50/20'
        )}
      >
        {/* Urgency indicator bar */}
        <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl', urg.dot)} />

        {/* Card header */}
        <Button variant="ghost"
          type="button"
          onClick={handleExpand}
          className="w-full text-left pl-5 pr-4 py-4 flex items-start gap-3"
        >
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2.5 mb-1.5">
              {isNew && (
                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
              )}
              <h3 className={cn(
                'font-medium text-warm-900 truncate',
                isNew ? 'text-body' : 'text-sm'
              )}>
                {ann.title}
              </h3>
            </div>

            {/* Body preview */}
            <p className="text-sm text-warm-500 line-clamp-1 mb-3">{ann.body}</p>

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

              <span className="text-warm-300 text-xs">|</span>

              {/* Recipients */}
              <span className="inline-flex items-center gap-1 text-xs text-warm-500">
                <IconUsers size={11} className="text-warm-400" />
                {ann.recipient_count > 0 ? `${ann.recipient_count} players` : 'All team'}
              </span>

              {/* Ack progress with avatar stack */}
              {ann.requires_acknowledgement && (
                <>
                  <span className="text-warm-300 text-xs">|</span>
                  <span className="inline-flex items-center gap-1.5">
                    {/* Avatar stack */}
                    {ann.acknowledged_players && ann.acknowledged_players.length > 0 && (
                      <span className="inline-flex -space-x-1.5">
                        {ann.acknowledged_players.slice(0, 5).map((p) => (
                          <span
                            key={p.player_id}
                            className="w-5 h-5 rounded-full border-[1.5px] border-white flex items-center justify-center flex-shrink-0 overflow-hidden bg-primary-100"
                            title={`${p.first_name || ''} ${p.last_name || ''}`}
                          >
                            {p.avatar_url ? (
                              <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-eyebrow font-medium text-primary-700 leading-none">
                                {(p.first_name?.[0] || '')}{(p.last_name?.[0] || '')}
                              </span>
                            )}
                          </span>
                        ))}
                        {ann.acknowledged_count > 5 && (
                          <span className="w-5 h-5 rounded-full border-[1.5px] border-white flex items-center justify-center flex-shrink-0 bg-warm-100">
                            <span className="text-eyebrow font-medium text-warm-500 leading-none">+{ann.acknowledged_count - 5}</span>
                          </span>
                        )}
                      </span>
                    )}
                    <span className={cn(
                      'text-xs font-medium tabular-nums',
                      ackProgress === 100 ? 'text-primary-600' : 'text-warm-500'
                    )}>
                      {ann.acknowledged_count}/{ann.total_recipients}
                    </span>
                  </span>
                </>
              )}

              {/* Docs */}
              {ann.document_count > 0 && (
                <>
                  <span className="text-warm-300 text-xs">|</span>
                  <span className="inline-flex items-center gap-1 text-xs text-warm-500">
                    <IconFile size={11} className="text-warm-400" />
                    {ann.document_count}
                  </span>
                </>
              )}

              {/* Tasks */}
              {ann.task_count > 0 && (
                <>
                  <span className="text-warm-300 text-xs">|</span>
                  <span className={cn(
                    'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
                    ann.completed_task_count === ann.task_count && ann.task_count > 0
                      ? 'text-primary-600'
                      : 'text-warm-500'
                  )}>
                    <IconClipboardList size={11} className={ann.completed_task_count === ann.task_count && ann.task_count > 0 ? 'text-primary-500' : 'text-warm-400'} />
                    {ann.completed_task_count}/{ann.task_count}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Expand chevron */}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 mt-1 w-7 h-7 rounded-lg flex items-center justify-center bg-warm-50 group-hover:bg-warm-100 transition-colors"
          >
            <IconChevronDown size={14} className="text-warm-500" />
          </motion.div>
        </Button>

        {/* Expanded detail */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: { type: 'spring', stiffness: 500, damping: 30 }, opacity: { duration: 0.2 } }}
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

                    {/* Documents */}
                    {detail.documents && detail.documents.length > 0 && (
                      <div>
                        <p className="text-label font-medium text-warm-400 uppercase tracking-[0.12em] opacity-80 mb-2.5">Attachments</p>
                        <div className="flex flex-wrap gap-2">
                          {detail.documents.map((d) => (
                            <Button variant="ghost"
                              type="button"
                              key={d.document_id}
                              onClick={() => {
                                const url = d.document?.file_url;
                                if (url) void openExternalUrl(url);
                              }}
                              className="flex items-center gap-2 px-3 py-2 bg-warm-50 rounded-xl border border-warm-200 hover:bg-warm-100 hover:border-warm-300 active:scale-[0.98] transition-all"
                            >
                              <div className="w-7 h-7 rounded-lg bg-white border border-warm-200 flex items-center justify-center">
                                <IconFile size={13} className="text-warm-400" />
                              </div>
                              <span className="text-xs font-medium text-warm-700">{d.document?.title || 'Document'}</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tasks with player assignments */}
                    {detail.tasks && detail.tasks.length > 0 && (
                      <div>
                        <p className="text-label font-medium text-warm-400 uppercase tracking-[0.12em] opacity-80 mb-2.5">Tasks</p>
                        <div className="space-y-2">
                          {detail.tasks.map((t) => {
                            const completed = t.assignments?.filter(a => a.status === 'completed').length || 0;
                            const total = t.assignments?.length || 0;
                            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                            return (
                              <div key={t.task_id} className="p-3.5 bg-warm-50/80 rounded-xl border border-warm-200/35">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-sm font-medium text-warm-900">{t.task?.title || 'Task'}</span>
                                  <span className={cn(
                                    'text-xs font-medium tabular-nums',
                                    pct === 100 ? 'text-primary-600' : 'text-warm-500'
                                  )}>
                                    {completed}/{total}
                                  </span>
                                </div>
                                {t.task?.description && (
                                  <p className="text-xs text-warm-500 mb-2.5">{t.task.description}</p>
                                )}
                                {/* Progress bar */}
                                {total > 0 && (
                                  <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden mb-2.5">
                                    <div
                                      className={cn(
                                        'h-full rounded-full transition-all duration-500',
                                        pct === 100 ? 'bg-primary-500' : 'bg-blue-400'
                                      )}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                )}
                                {/* Per-player status */}
                                {t.assignments && t.assignments.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {t.assignments.map((a) => (
                                      <span
                                        key={a.player_id}
                                        className={cn(
                                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-label font-medium',
                                          a.status === 'completed'
                                            ? 'bg-primary-50 text-primary-700'
                                            : 'bg-warm-100 text-warm-500'
                                        )}
                                      >
                                        {a.status === 'completed' ? <IconCheck size={9} /> : <IconClock size={9} />}
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
                        <div className="flex items-center justify-between mb-2.5">
                          <p className="text-label font-medium text-warm-400 uppercase tracking-[0.12em] opacity-80">Acknowledgements</p>
                          <span className={cn(
                            'text-xs font-medium tabular-nums',
                            detail.acknowledged_count >= detail.total_recipients ? 'text-primary-600' : 'text-warm-600'
                          )}>
                            {detail.acknowledged_count}/{detail.total_recipients}
                          </span>
                        </div>
                        <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden mb-3">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              detail.acknowledged_count >= detail.total_recipients ? 'bg-primary-500' : 'bg-blue-400'
                            )}
                            style={{ width: `${detail.total_recipients > 0 ? (detail.acknowledged_count / detail.total_recipients) * 100 : 0}%` }}
                          />
                        </div>
                        {detail.acknowledgements && detail.acknowledgements.length > 0 && (
                          <div className="space-y-0.5">
                            {detail.acknowledgements.map((ack) => {
                              const player = ack.player;
                              const initials = `${player?.first_name?.[0] || ''}${player?.last_name?.[0] || ''}`;
                              return (
                                <div key={ack.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-warm-50 transition-colors">
                                  {/* Avatar */}
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-primary-100 border border-primary-200/50">
                                    {player?.avatar_url ? (
                                      <img src={player.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="text-eyebrow font-medium text-primary-700 leading-none">{initials}</span>
                                    )}
                                  </div>
                                  <span className="text-xs text-warm-700 font-medium flex-1">
                                    {player ? `${player.first_name || ''} ${player.last_name || ''}` : 'Player'}
                                  </span>
                                  <span className="text-label text-warm-400 tabular-nums" suppressHydrationWarning>
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
                    <div className="pt-3 border-t border-warm-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(true)}
                        leftIcon={<IconTrash size={13} />}
                        className="text-sf-red hover:text-sf-red hover:bg-sf-red/5 transition-colors"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="py-6 text-sm text-warm-400 text-center">Failed to load details</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Announcement"
        message="This will permanently delete the announcement and all associated tasks and acknowledgements. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleting}
      />
    </>
  );
}
