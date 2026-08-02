'use client';

/**
 * ============================================================================
 * Fairway · Announcements · FairwayPlayerAnnouncementCard  (ADDITIVE · GATED)
 * ----------------------------------------------------------------------------
 * The player's expandable announcement card. Collapsed it shows the title, body
 * preview, urgency pill, time-ago, doc/task hints, the player's own ack state,
 * the team ack progress, and an "Action needed" / "New" status. Expanding lazily
 * loads the full detail via the VERBATIM `getAnnouncementDetail` action and
 * reveals the full body, downloadable attachments (`openExternalUrl`), the
 * player's own tasks (interactive checkboxes via `completeAnnouncementTask`,
 * reused verbatim), and the acknowledge action (`acknowledgeAnnouncement`,
 * reused verbatim).
 *
 * Honest read/ack state: the player's ack is reflected optimistically; the team
 * progress uses real N/M counts (no fabricated denominators). Tokens ONLY.
 * ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Surface,
  StatusPill,
  Badge,
  Button,
  Skeleton,
  InlineNotice,
  fairwayToast,
  type FwStatusTone,
} from '@/components/fairway';
import {
  IconChevronDown,
  IconFile,
  IconCheck,
  IconDownload,
  IconClipboardList,
  IconCalendar,
} from '@/components/icons';
import {
  getAnnouncementDetail,
  completeAnnouncementTask,
} from '@/app/golf/actions/announcements';
import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
import { openExternalUrl } from '@/lib/utils/capacitor';
import type { GolfAnnouncementMeta, GolfAnnouncementEnriched } from '@/lib/types/golf';

/* ─── Urgency → tone + label ───────────────────────────────────────────────── */
const URGENCY: Record<string, { tone: FwStatusTone; label: string }> = {
  low: { tone: 'neutral', label: 'Low' },
  normal: { tone: 'info', label: 'Normal' },
  high: { tone: 'warning', label: 'High' },
  urgent: { tone: 'danger', label: 'Urgent' },
};
function urgencyFor(u: string | null | undefined) {
  return URGENCY[u || 'normal'] ?? URGENCY.normal!;
}

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

function DetailHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
      {children}
    </p>
  );
}

function ProgressTrack({ pct, complete }: { pct: number; complete: boolean }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
      <div
        className={cn('h-full rounded-full transition-all duration-500', complete ? 'bg-fw-success' : 'bg-accent-400')}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

/** Whether the announcement is unread for this player (drives the sort + accent). */
export function isUnreadForPlayer(ann: GolfAnnouncementMeta, now: number): boolean {
  if (ann.requires_acknowledgement && !ann.has_player_acknowledged) return true;
  if (!ann.requires_acknowledgement && ann.published_at && now > 0) {
    return now - new Date(ann.published_at).getTime() < 24 * 3600000;
  }
  return false;
}

/* ─── Interactive task item ─────────────────────────────────────────────────
 * Controlled by the parent card: `completed` reflects the lifted detail state so
 * the card's "Your tasks N/M" counter + ProgressTrack update in lock-step with
 * the checkbox (P272). The parent owns the optimistic patch + the
 * completeAnnouncementTask round-trip (and the revert on failure). */
function FairwayTaskItem({
  title,
  description,
  dueDate,
  completed,
  pending,
  onComplete,
}: {
  title: string;
  description: string | null;
  dueDate: string | null;
  completed: boolean;
  pending: boolean;
  onComplete: () => void;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const isOverdue = now && dueDate && !completed && new Date(dueDate) < now;

  function toggle() {
    if (completed || pending) return;
    onComplete();
  }

  return (
    // eslint-disable-next-line helm/no-raw-button -- custom checklist row (checkbox + title + due date); not a pill CTA
    <button
      type="button"
      onClick={toggle}
      disabled={completed || pending}
      aria-pressed={completed}
      className={cn(
        'flex w-full items-start gap-3 rounded-fw-md border p-3 text-left transition-colors duration-fast',
        completed
          ? 'border-accent-200 bg-fw-success-bg'
          : 'cursor-pointer border-border-subtle bg-surface hover:border-border-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-fw-sm border-2 transition-colors',
          completed ? 'border-accent-500 bg-accent-700 text-text-on-accent' : 'border-border-strong',
        )}
        aria-hidden
      >
        {completed && <IconCheck size={12} />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block font-fw-sans text-body-sm font-medium',
            completed ? 'text-accent-700 line-through' : 'text-text-primary',
          )}
        >
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block font-fw-sans text-caption text-text-tertiary">{description}</span>
        )}
        {dueDate && (
          <span
            className={cn(
              'mt-1 inline-flex items-center gap-1 font-fw-sans text-caption font-medium',
              isOverdue ? 'text-fw-danger-ink' : completed ? 'text-accent-600' : 'text-text-tertiary',
            )}
            suppressHydrationWarning
          >
            <IconCalendar size={11} />
            {isOverdue ? 'Overdue · ' : ''}
            {new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </span>
    </button>
  );
}

/* ─── Card ──────────────────────────────────────────────────────────────────── */
export function FairwayPlayerAnnouncementCard({
  announcement: ann,
  playerId,
  nowTs,
}: {
  announcement: GolfAnnouncementMeta;
  playerId: string;
  nowTs: number;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<GolfAnnouncementEnriched | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(!!ann.has_player_acknowledged);
  const [acknowledging, setAcknowledging] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());

  const urg = urgencyFor(ann.urgency);
  const isNew = nowTs > 0 && ann.published_at && nowTs - new Date(ann.published_at).getTime() < 7 * 86400000;
  const needsAck = ann.requires_acknowledgement && !hasAcknowledged;
  const unread =
    needsAck ||
    (nowTs > 0 &&
      !ann.requires_acknowledgement &&
      !!ann.published_at &&
      nowTs - new Date(ann.published_at).getTime() < 24 * 3600000);

  // Player's own task progress (from the loaded detail).
  const myCompletedTasks =
    detail?.tasks?.reduce((count, t) => {
      const mine = t.assignments?.find((a) => a.player_id === playerId);
      return count + (mine?.status === 'completed' ? 1 : 0);
    }, 0) || 0;
  const myTotalTasks = detail?.tasks?.length || 0;

  async function handleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail) {
      setLoadingDetail(true);
      setDetailError(false);
      const result = await getAnnouncementDetail(ann.id);
      if (result.success && result.data) setDetail(result.data);
      else setDetailError(true);
      setLoadingDetail(false);
    }
  }

  async function handleAcknowledge() {
    setAcknowledging(true);
    const result = await acknowledgeAnnouncement(ann.id);
    if (result.success) {
      setHasAcknowledged(true);
      fairwayToast.success('Acknowledged');
      router.refresh();
    } else {
      fairwayToast.danger(result.error || 'Failed to acknowledge');
    }
    setAcknowledging(false);
  }

  /** Patch this player's assignment for `taskId` to the given status in detail.
   * Lifting the completion into `detail` keeps the "Your tasks N/M" counter +
   * ProgressTrack in lock-step with the per-item checkbox (P272). */
  function patchTaskStatus(taskId: string, status: 'completed' | 'pending') {
    setDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.task_id === taskId
            ? {
                ...t,
                assignments: t.assignments.map((a) =>
                  a.player_id === playerId
                    ? { ...a, status, completed_at: status === 'completed' ? new Date().toISOString() : null }
                    : a,
                ),
              }
            : t,
        ),
      };
    });
  }

  async function handleCompleteTask(taskId: string) {
    if (pendingTaskIds.has(taskId)) return;
    setPendingTaskIds((prev) => new Set(prev).add(taskId));
    patchTaskStatus(taskId, 'completed'); // optimistic — counter + bar move now

    const result = await completeAnnouncementTask(taskId);
    if (!result.success) {
      patchTaskStatus(taskId, 'pending'); // revert on failure
      fairwayToast.danger(result.error || 'Failed to complete task');
    }
    setPendingTaskIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }

  return (
    <Surface
      elevation={unread ? 'shadow' : 'border'}
      padding="none"
      className={cn('overflow-hidden', unread && 'ring-1 ring-accent-200/60')}
    >
      {/* eslint-disable-next-line helm/no-raw-button -- borderless full-bleed disclosure toggle; the Fairway Button carries a pill surface that can't host this card-header layout */}
      <button
        type="button"
        onClick={handleExpand}
        aria-expanded={expanded}
        aria-controls={`announcement-detail-${ann.id}`}
        className={cn(
          'flex w-full items-start gap-3 px-5 py-4 text-left',
          'transition-colors duration-fast hover:bg-surface-sunken/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-inset',
        )}
      >
        <div className="min-w-0 flex-1">
          {/* Title + status */}
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate font-fw-sans text-body font-medium text-text-primary">
              {ann.title}
            </h3>
            {needsAck ? (
              <Badge tone="warning" size="sm">
                Action needed
              </Badge>
            ) : isNew && !hasAcknowledged ? (
              <Badge tone="accent" size="sm">
                New
              </Badge>
            ) : null}
          </div>

          {/* Body preview */}
          <p className="mb-3 line-clamp-2 font-fw-sans text-body-sm leading-relaxed text-text-tertiary">
            {ann.body}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 font-fw-sans text-caption text-text-tertiary">
            <StatusPill tone={urg.tone} size="sm">
              {urg.label}
            </StatusPill>

            {ann.published_at && nowTs > 0 && (
              <span className="tabular-nums" suppressHydrationWarning>
                {relativeTime(ann.published_at, nowTs)}
              </span>
            )}

            {ann.document_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <IconFile size={12} className="text-text-tertiary" />
                <span className="tabular-nums">{ann.document_count}</span> doc
                {ann.document_count !== 1 ? 's' : ''}
              </span>
            )}

            {ann.task_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <IconClipboardList size={12} className="text-text-tertiary" />
                Tasks
              </span>
            )}

            {hasAcknowledged && (
              <span className="inline-flex items-center gap-1 font-medium text-accent-700">
                <IconCheck size={12} />
                Acknowledged
              </span>
            )}

            {/* Honest team ack progress — only when there's a real denominator. */}
            {ann.requires_acknowledgement && ann.total_recipients > 0 && (
              <span className="font-fw-mono tabular-nums text-text-tertiary">
                {ann.acknowledged_count}/{ann.total_recipients} ack
              </span>
            )}
          </div>
        </div>

        <span
          className={cn(
            'mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-fw-sm bg-surface-sunken text-text-tertiary',
            'transition-transform duration-medium',
            expanded && 'rotate-180',
          )}
          aria-hidden
        >
          <IconChevronDown size={14} />
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div
          id={`announcement-detail-${ann.id}`}
          role="region"
          aria-label={`Details for ${ann.title}`}
          className="border-t border-border-subtle px-5 pb-5 pt-4"
        >
          {loadingDetail ? (
            <div
              role="status"
              aria-busy="true"
              aria-live="polite"
              className="flex flex-col gap-3"
            >
              <span className="sr-only">Loading announcement details…</span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : detailError || !detail ? (
            <InlineNotice tone="warning" title="Couldn't load details">
              We couldn't load this announcement's details. Try expanding it again.
            </InlineNotice>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Full body */}
              <p className="whitespace-pre-wrap font-fw-sans text-body-sm leading-relaxed text-text-secondary">
                {detail.body}
              </p>

              {/* Attachments — downloadable */}
              {detail.documents && detail.documents.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <DetailHeading>Attachments</DetailHeading>
                  <div className="flex flex-col gap-1.5">
                    {detail.documents.map((d) => {
                      const url = d.document?.file_url;
                      return (
                        // eslint-disable-next-line helm/no-raw-button -- downloadable attachment row (icon tile + meta + download glyph); not a pill CTA
                        <button
                          key={d.document_id}
                          type="button"
                          disabled={!url}
                          onClick={() => {
                            if (url) void openExternalUrl(url);
                          }}
                          className={cn(
                            'group/doc flex w-full items-center gap-3 rounded-fw-md border border-border-subtle bg-surface px-3.5 py-3 text-left',
                            'transition-colors duration-fast',
                            url
                              ? 'hover:border-border-strong hover:bg-surface-sunken'
                              : 'cursor-not-allowed opacity-50',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                          )}
                        >
                          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-fw-sm bg-surface-sunken text-text-tertiary">
                            <IconFile size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-fw-sans text-body-sm font-medium text-text-secondary">
                              {d.document?.title || 'Document'}
                            </span>
                            <span className="block font-fw-sans text-caption text-text-tertiary">
                              {d.document?.file_type || 'File'}
                              {d.document?.file_size
                                ? ` · ${(d.document.file_size / 1024).toFixed(1)} KB`
                                : ''}
                            </span>
                          </span>
                          {url && (
                            <IconDownload
                              size={15}
                              className="flex-shrink-0 text-text-tertiary transition-colors group-hover/doc:text-accent-600"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Your tasks — interactive */}
              {detail.tasks && detail.tasks.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <DetailHeading>Your tasks</DetailHeading>
                    {myTotalTasks > 0 && (
                      <span
                        className={cn(
                          'font-fw-mono text-caption tabular-nums',
                          myCompletedTasks === myTotalTasks ? 'text-accent-700' : 'text-text-tertiary',
                        )}
                      >
                        {myCompletedTasks}/{myTotalTasks}
                      </span>
                    )}
                  </div>
                  {myTotalTasks > 0 && (
                    <ProgressTrack
                      pct={(myCompletedTasks / myTotalTasks) * 100}
                      complete={myCompletedTasks === myTotalTasks}
                    />
                  )}
                  <div className="flex flex-col gap-2">
                    {detail.tasks.map((t) => {
                      const mine = t.assignments?.find((a) => a.player_id === playerId);
                      if (!t.task) return null;
                      return (
                        <FairwayTaskItem
                          key={t.task_id}
                          title={t.task.title}
                          description={t.task.description}
                          dueDate={t.task.due_date}
                          completed={mine?.status === 'completed'}
                          pending={pendingTaskIds.has(t.task_id)}
                          onComplete={() => handleCompleteTask(t.task_id)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Acknowledge action */}
              {ann.requires_acknowledgement && !hasAcknowledged && (
                <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
                  <Button
                    variant="primary"
                    size="sm"
                    busy={acknowledging}
                    leftIcon={<IconCheck size={14} />}
                    onClick={handleAcknowledge}
                    className="self-start"
                  >
                    Acknowledge
                  </Button>
                  <p className="font-fw-sans text-caption text-text-tertiary">
                    Your coach requires you to acknowledge this announcement.
                  </p>
                </div>
              )}

              {ann.requires_acknowledgement && hasAcknowledged && (
                <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-fw-success-bg text-accent-700">
                    <IconCheck size={11} />
                  </span>
                  <span className="font-fw-sans text-body-sm font-medium text-accent-700">Acknowledged</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Surface>
  );
}
