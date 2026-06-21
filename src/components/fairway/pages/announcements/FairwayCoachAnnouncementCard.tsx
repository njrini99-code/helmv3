'use client';

/**
 * ============================================================================
 * Fairway · Announcements · FairwayCoachAnnouncementCard  (ADDITIVE · GATED)
 * ----------------------------------------------------------------------------
 * The coach's expandable announcement card. Collapsed it shows the title, body
 * preview, urgency pill, time-ago, recipients, ack progress (avatars + N/M),
 * doc + task counts. Expanding lazily loads the full detail via the VERBATIM
 * `getAnnouncementDetail` action and reveals the full body, attachments
 * (opened with `openExternalUrl`), tasks with per-player completion,
 * acknowledgements list with avatars + progress, and the delete action (behind
 * a Fairway confirm modal — reuses `deleteAnnouncement` verbatim).
 *
 * Urgency low/normal/high/urgent → FwStatusTone neutral/info/warning/danger.
 * Honest emptiness: em-dash, never fabricated denominators. Tokens ONLY.
 * ========================================================================== */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Surface,
  StatusPill,
  Button,
  Avatar,
  AvatarGroup,
  ModalShell,
  Skeleton,
  InlineNotice,
  fairwayToast,
  type FwStatusTone,
} from '@/components/fairway';
import {
  IconChevronDown,
  IconTrash,
  IconFile,
  IconCheck,
  IconUsers,
  IconClock,
  IconClipboardList,
} from '@/components/icons';
import { deleteAnnouncement, getAnnouncementDetail } from '@/app/golf/actions/announcements';
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

/* ─── Relative time (deferred to client) ───────────────────────────────────── */
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

function fullName(first: string | null | undefined, last: string | null | undefined): string {
  return `${first || ''} ${last || ''}`.trim();
}

/* ─── Quiet uppercase section overline (inside expanded detail) ────────────── */
function DetailHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
      {children}
    </p>
  );
}

/* ─── Slim progress track ──────────────────────────────────────────────────── */
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

export function FairwayCoachAnnouncementCard({ announcement: ann }: { announcement: GolfAnnouncementMeta }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<GolfAnnouncementEnriched | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Defer time-dependent values to client (avoid hydration mismatch).
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => setNowTs(Date.now()), []);

  const urg = urgencyFor(ann.urgency);
  const isRecent = nowTs > 0 && ann.published_at && nowTs - new Date(ann.published_at).getTime() < 24 * 3600000;
  const ackComplete = ann.total_recipients > 0 && ann.acknowledged_count >= ann.total_recipients;

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

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteAnnouncement(ann.id);
    if (result.success) {
      fairwayToast.success('Announcement deleted');
      setConfirmOpen(false);
      router.refresh();
    } else {
      fairwayToast.danger(result.error || 'Failed to delete');
    }
    setDeleting(false);
  }

  return (
    <Surface
      elevation={isRecent ? 'shadow' : 'border'}
      padding="none"
      className={cn('overflow-hidden', isRecent && 'ring-1 ring-accent-200/60')}
    >
      {/* ── Collapsed header (toggle) ──────────────────────────────────────── */}
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
          {/* Title */}
          <div className="mb-1 flex items-center gap-2">
            {isRecent && (
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-accent-500" aria-hidden />
            )}
            <h3 className="truncate font-fw-sans text-body font-medium text-text-primary">
              {ann.title}
            </h3>
          </div>

          {/* Body preview */}
          <p className="mb-3 line-clamp-1 font-fw-sans text-body-sm text-text-tertiary">{ann.body}</p>

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

            <span className="inline-flex items-center gap-1">
              <IconUsers size={12} className="text-text-tertiary" />
              {ann.recipient_count > 0 ? `${ann.recipient_count} players` : 'All team'}
            </span>

            {/* Ack progress + avatar stack — honest: only with a real
                denominator, else an em-dash (P273), matching the task counter. */}
            {ann.requires_acknowledgement && (
              <span className="inline-flex items-center gap-1.5">
                {ann.acknowledged_players && ann.acknowledged_players.length > 0 && (
                  <AvatarGroup size="xs" max={5}>
                    {ann.acknowledged_players.map((p) => (
                      <Avatar
                        key={p.player_id}
                        size="xs"
                        src={p.avatar_url}
                        name={fullName(p.first_name, p.last_name) || undefined}
                      />
                    ))}
                  </AvatarGroup>
                )}
                <span
                  className={cn(
                    'font-fw-mono tabular-nums',
                    ackComplete ? 'text-accent-700' : 'text-text-tertiary',
                  )}
                >
                  {ann.total_recipients > 0
                    ? `${ann.acknowledged_count}/${ann.total_recipients}`
                    : '—'}
                </span>
              </span>
            )}

            {/* Docs */}
            {ann.document_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <IconFile size={12} className="text-text-tertiary" />
                <span className="tabular-nums">{ann.document_count}</span>
              </span>
            )}

            {/* Tasks */}
            {ann.task_count > 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 font-fw-mono tabular-nums',
                  ann.completed_task_count === ann.task_count ? 'text-accent-700' : 'text-text-tertiary',
                )}
              >
                <IconClipboardList size={12} />
                {ann.completed_task_count}/{ann.task_count}
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

      {/* ── Expanded detail ────────────────────────────────────────────────── */}
      {expanded && (
        <div
          id={`announcement-detail-${ann.id}`}
          role="region"
          aria-label={`Details for ${ann.title}`}
          className="border-t border-border-subtle px-5 pb-5 pt-4"
        >
          {loadingDetail ? (
            <div className="flex flex-col gap-3">
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

              {/* Attachments */}
              {detail.documents && detail.documents.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <DetailHeading>Attachments</DetailHeading>
                  <div className="flex flex-wrap gap-2">
                    {detail.documents.map((d) => {
                      const url = d.document?.file_url;
                      return (
                        // eslint-disable-next-line helm/no-raw-button -- custom attachment chip (icon tile + label); not a pill CTA
                        <button
                          key={d.document_id}
                          type="button"
                          disabled={!url}
                          onClick={() => {
                            if (url) void openExternalUrl(url);
                          }}
                          className={cn(
                            'flex items-center gap-2 rounded-fw-md border border-border-subtle bg-surface px-3 py-2',
                            'transition-colors duration-fast',
                            url
                              ? 'hover:border-border-strong hover:bg-surface-sunken'
                              : 'cursor-not-allowed opacity-50',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                          )}
                        >
                          <span className="grid h-7 w-7 place-items-center rounded-fw-sm bg-surface-sunken text-text-tertiary">
                            <IconFile size={13} />
                          </span>
                          <span className="font-fw-sans text-body-sm font-medium text-text-secondary">
                            {d.document?.title || 'Document'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tasks with per-player completion */}
              {detail.tasks && detail.tasks.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <DetailHeading>Tasks</DetailHeading>
                  <div className="flex flex-col gap-2">
                    {detail.tasks.map((t) => {
                      const completed = t.assignments?.filter((a) => a.status === 'completed').length || 0;
                      const total = t.assignments?.length || 0;
                      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                      const allDone = total > 0 && completed === total;
                      return (
                        <div
                          key={t.task_id}
                          className="rounded-fw-md border border-border-subtle bg-surface-sunken p-3.5"
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                              {t.task?.title || 'Task'}
                            </span>
                            <span
                              className={cn(
                                'flex-shrink-0 font-fw-mono text-caption tabular-nums',
                                allDone ? 'text-accent-700' : 'text-text-tertiary',
                              )}
                            >
                              {/* Honest: no denominator → em-dash, never a fake 0. */}
                              {total > 0 ? `${completed}/${total}` : '—'}
                            </span>
                          </div>
                          {t.task?.description && (
                            <p className="mb-2.5 font-fw-sans text-caption text-text-tertiary">
                              {t.task.description}
                            </p>
                          )}
                          {total > 0 && (
                            <div className="mb-2.5">
                              <ProgressTrack pct={pct} complete={allDone} />
                            </div>
                          )}
                          {t.assignments && t.assignments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {t.assignments.map((a) => (
                                <span
                                  key={a.id}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-fw-sans text-caption font-medium',
                                    a.status === 'completed'
                                      ? 'bg-fw-success-bg text-accent-700'
                                      : 'bg-surface text-text-tertiary',
                                  )}
                                >
                                  {a.status === 'completed' ? <IconCheck size={10} /> : <IconClock size={10} />}
                                  {a.player?.first_name || ''} {a.player?.last_name?.charAt(0) || ''}
                                  {a.player?.last_name ? '.' : ''}
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

              {/* Acknowledgements */}
              {detail.requires_acknowledgement && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <DetailHeading>Acknowledgements</DetailHeading>
                    <span
                      className={cn(
                        'font-fw-mono text-caption tabular-nums',
                        detail.total_recipients > 0 &&
                          detail.acknowledged_count >= detail.total_recipients
                          ? 'text-accent-700'
                          : 'text-text-secondary',
                      )}
                    >
                      {/* Honest: no recipients → em-dash, never a fake 0/0 (P273). */}
                      {detail.total_recipients > 0
                        ? `${detail.acknowledged_count}/${detail.total_recipients}`
                        : '—'}
                    </span>
                  </div>
                  <ProgressTrack
                    pct={
                      detail.total_recipients > 0
                        ? (detail.acknowledged_count / detail.total_recipients) * 100
                        : 0
                    }
                    complete={
                      detail.total_recipients > 0 &&
                      detail.acknowledged_count >= detail.total_recipients
                    }
                  />
                  {detail.acknowledgements && detail.acknowledgements.length > 0 && (
                    <div className="flex flex-col gap-0.5">
                      {detail.acknowledgements.map((ack) => {
                        const name = fullName(ack.player?.first_name, ack.player?.last_name);
                        return (
                          <div
                            key={ack.id}
                            className="flex items-center gap-2.5 rounded-fw-sm px-2 py-1.5 transition-colors hover:bg-surface-sunken"
                          >
                            <Avatar size="xs" src={ack.player?.avatar_url} name={name || undefined} />
                            <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm font-medium text-text-secondary">
                              {name || 'Player'}
                            </span>
                            <span
                              className="flex-shrink-0 font-fw-sans text-caption tabular-nums text-text-tertiary"
                              suppressHydrationWarning
                            >
                              {new Date(ack.acknowledged_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Delete */}
              <div className="border-t border-border-subtle pt-3">
                <Button
                  variant="danger"
                  size="sm"
                  leftIcon={<IconTrash size={14} />}
                  onClick={() => setConfirmOpen(true)}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Delete confirm ─────────────────────────────────────────────────── */}
      <ModalShell
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!deleting) setConfirmOpen(next);
        }}
        size="sm"
        title="Delete announcement"
        description="This permanently deletes the announcement and all associated tasks and acknowledgements. This can't be undone."
        hideClose={deleting}
      >
        <ModalShell.Footer>
          <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" busy={deleting} leftIcon={<IconTrash size={14} />} onClick={handleDelete}>
            Delete
          </Button>
        </ModalShell.Footer>
      </ModalShell>
    </Surface>
  );
}

export default FairwayCoachAnnouncementCard;
