'use client';

/**
 * ============================================================================
 * Fairway · Roster · FairwayJoinRequests — warm-premium re-skin of the legacy
 * PendingJoinRequests (inline accordion) + JoinRequestsModal (auto-popup),
 * CONSOLIDATED into one presentation component (C6 + C7).
 * ----------------------------------------------------------------------------
 * Renders BOTH halves of the legacy join-request surface, off the SAME prop:
 *
 *   1. INLINE ACCORDION — an amber InlineNotice header that expands to a list of
 *      pending requests on warm matte Surface cards (avatar w/ deterministic
 *      colored initials, name, Class of {year}, hometown, handicap, time-ago,
 *      optional message), each with per-row Accept (green) / Reject (danger,
 *      behind an explicit confirm — never auto-fire).
 *
 *   2. AUTO-POPUP MODAL — a ModalShell that opens ONCE per session (sessionStorage
 *      key 'roster_modal_shown', mirroring RosterPageClient's guard) when there are
 *      pending requests, and auto-closes when the list drains to empty
 *      (the legacy `requests.length === 1` → onClose check, ported to an effect on
 *      the live count so it survives the optimistic remove).
 *
 * DATA: the caller fetches via getTeamJoinRequests() and passes the `requests`
 * array as a prop (presentation-only — this component does NOT fetch). The shape
 * matches the server `JoinRequestData`.
 *
 * MUTATIONS (reused VERBATIM by exact import path, return { success, error? }):
 *   · acceptJoinRequest(id)
 *   · rejectJoinRequest(id, reason?)        ← destructive: single, scoped, behind
 *                                              an explicit confirm; never auto-fired,
 *                                              never delete-then-reinsert.
 * Both are optimistic (local remove on success) + router.refresh().
 *
 * PRESENTATION-ONLY. Renders inside a `.fairway-ds` scope on a bg-canvas page.
 * Live in prod via FairwayCoachRoster → /dashboard/roster (Fairway has been the
 * only dashboard tree for 5+ weeks as of W1, 2026-07-09).
 *
 * SURFACE EXCLUSIVITY: the inline accordion and the auto-popup modal must never
 * both show the EXPANDED request list at once — the sole call site
 * (FairwayCoachRoster) passes no overrides, so the component's own defaults
 * decide this. `defaultExpanded` therefore defaults to the OPPOSITE of
 * `enableModal`: when the modal is the first-touch surface, the inline
 * accordion starts collapsed (just the amber banner); when there's no modal,
 * the accordion alone is the first-touch surface and starts expanded. Pass
 * `defaultExpanded` explicitly to override either way.
 * ========================================================================== */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  acceptJoinRequest,
  rejectJoinRequest,
  type JoinRequestData,
} from '@/app/golf/actions/teams';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { Badge } from '@/components/fairway/controls/badge';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { tintFor } from '@/components/fairway/pages/calendar/FairwayCalendarMemberRail';
import { formatShortDate } from '@/lib/golf/format-date';
import {
  IconUsers,
  IconCheck,
  IconX,
  IconClock,
  IconChevronDown,
  IconChevronUp,
} from '@/components/icons';

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------- */

export interface FairwayJoinRequestsProps {
  /**
   * Pending join requests, fetched by the caller via getTeamJoinRequests()
   * (`result.data`). Presentation-only — this component does not fetch.
   */
  requests: JoinRequestData[];
  /**
   * Render the auto-popup ModalShell (once per session). Defaults to `true` so
   * the roster page gets the legacy pop-up behavior. Set `false` to render ONLY
   * the inline accordion (e.g. embedding inside another surface).
   */
  enableModal?: boolean;
  /**
   * Start the inline accordion expanded. Defaults to `!enableModal` — i.e.
   * collapsed when the auto-popup modal is the first-touch surface (so the
   * page never shows the same pending-request list expanded AND in a modal
   * simultaneously), or expanded when there's no modal (the accordion alone
   * is then the first-touch surface, matching legacy behavior). Pass an
   * explicit value to override.
   */
  defaultExpanded?: boolean;
  /**
   * sessionStorage key guarding the one-per-session modal pop. Defaults to
   * 'roster_modal_shown' (matches the legacy RosterPageClient guard so the
   * re-skin shares the same session gate during the flagged rollout).
   */
  sessionKey?: string;
  className?: string;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function playerName(player?: JoinRequestData['player']): string {
  if (!player) return 'Player';
  return `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';
}

/** Time-ago string (verbatim logic from the legacy formatDate). */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  // Beyond a week, drop the relative form for the product's editorial short
  // date ("Jan 5") instead of a bare toLocaleDateString() locale default.
  return formatShortDate(date);
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatHandicap(handicap: number): string {
  return handicap < 0 ? `+${Math.abs(handicap)}` : String(handicap);
}

/* ---------------------------------------------------------------------------
 * RequestAvatar — deterministic colored initials (no photo URL on join requests)
 * ------------------------------------------------------------------------- */

function RequestAvatar({ seed, name, size = 'md' }: { seed: string; name: string; size?: 'md' | 'lg' }) {
  const tint = tintFor(seed);
  const dim = size === 'lg' ? 'h-12 w-12 text-[16px]' : 'h-10 w-10 text-[14px]';
  return (
    <span
      data-slot="fw-join-avatar"
      aria-hidden="true"
      className={cn(
        'inline-flex flex-shrink-0 select-none items-center justify-center rounded-full',
        'font-fw-sans font-semibold uppercase ring-1 ring-inset ring-border-subtle',
        dim,
      )}
      style={{ backgroundColor: tint.bg, color: tint.text }}
    >
      {initialsFromName(name)}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * useJoinRequestActions — shared optimistic accept/reject wiring. The reject is
 * destructive, so callers gate it behind an explicit confirm before calling.
 * ------------------------------------------------------------------------- */

function useJoinRequestActions(
  requests: JoinRequestData[],
  setLocal: React.Dispatch<React.SetStateAction<JoinRequestData[]>>,
) {
  const router = useRouter();
  const [processingId, setProcessingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleAccept = React.useCallback(
    async (requestId: string) => {
      setProcessingId(requestId);
      setError(null);

      const name = playerName(requests.find((r) => r.id === requestId)?.player);

      const result = await acceptJoinRequest(requestId);

      if (!result.success) {
        const msg = result.error ?? 'Failed to accept request';
        setError(msg);
        fairwayToast.error('Failed to accept request', { description: msg });
        setProcessingId(null);
        return;
      }

      fairwayToast.success('Player accepted', {
        description: `${name} has been added to your team.`,
      });
      // Optimistic: remove from local state (no destructive bulk write).
      setLocal((prev) => prev.filter((r) => r.id !== requestId));
      setProcessingId(null);
      // Refresh to surface the new player in the roster.
      router.refresh();
    },
    [requests, setLocal, router],
  );

  const handleReject = React.useCallback(
    async (requestId: string) => {
      setProcessingId(requestId);
      setError(null);

      const name = playerName(requests.find((r) => r.id === requestId)?.player);

      const result = await rejectJoinRequest(requestId);

      if (!result.success) {
        const msg = result.error ?? 'Failed to decline request';
        setError(msg);
        fairwayToast.error('Failed to decline request', { description: msg });
        setProcessingId(null);
        return;
      }

      fairwayToast.success('Request declined', {
        description: `${name}'s join request has been declined.`,
      });
      setLocal((prev) => prev.filter((r) => r.id !== requestId));
      setProcessingId(null);
    },
    [requests, setLocal],
  );

  return { processingId, error, handleAccept, handleReject };
}

/* ---------------------------------------------------------------------------
 * RequestRow — one request on a warm matte Surface card. Used by BOTH the inline
 * accordion and the modal (compact vs roomy via `layout`).
 * ------------------------------------------------------------------------- */

function RequestRow({
  request,
  processingId,
  onAccept,
  onReject,
  layout,
}: {
  request: JoinRequestData;
  processingId: string | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  layout: 'inline' | 'modal';
}) {
  const reduced = useReducedMotion() ?? false;
  const name = playerName(request.player);
  const busy = processingId === request.id;
  const handicap = request.player?.handicap;
  const hasHandicap = handicap !== null && handicap !== undefined;
  const hometown = request.player?.hometown;
  const state = request.player?.state;

  // Destructive reject — explicit two-step confirm rendered INLINE (a calm
  // Fairway prompt, never the off-brand native window.confirm). rejectJoinRequest
  // fires only on the second, explicit "Decline" click, so it can never
  // auto-fire. Rendered inline (not a nested dialog) so it works identically in
  // the inline accordion and inside the auto-popup ModalShell without stacking.
  const [confirming, setConfirming] = React.useState(false);

  const declineConfirm = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="font-fw-sans text-caption text-text-secondary">
        Decline {name}? This can&rsquo;t be undone.
      </span>
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      <Button
        variant="danger"
        size="sm"
        busy={busy}
        disabled={busy}
        leftIcon={busy ? undefined : <IconX size={15} />}
        onClick={() => {
          onReject(request.id);
          setConfirming(false);
        }}
      >
        Decline
      </Button>
    </div>
  );

  return (
    <motion.div
      layout
      initial={reduced ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 8 }}
    >
      <Surface
        elevation="border"
        padding={layout === 'modal' ? 'md' : 'sm'}
        className={cn(layout === 'modal' && 'bg-surface-sunken')}
      >
        <div className="flex items-start gap-4">
          <RequestAvatar seed={request.player_id} name={name} size={layout === 'modal' ? 'lg' : 'md'} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h4 className="truncate font-fw-sans text-body font-semibold text-text-primary">
                {name}
              </h4>
              {request.player?.graduation_year ? (
                <Badge tone="neutral" size="sm">
                  Class of {request.player.graduation_year}
                </Badge>
              ) : null}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-fw-sans text-caption text-text-secondary">
              {hometown && state ? (
                <span>
                  {hometown}, {state}
                </span>
              ) : null}
              {hasHandicap ? (
                <span>
                  Handicap{' '}
                  <span className="font-fw-mono tabular-nums text-text-primary">
                    {formatHandicap(handicap)}
                  </span>
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 text-text-tertiary">
                <IconClock size={13} aria-hidden />
                {layout === 'modal' ? `Requested ${formatDate(request.created_at)}` : formatDate(request.created_at)}
              </span>
            </div>

            {request.message ? (
              <div className="mt-2 rounded-fw-md bg-surface-sunken px-3 py-2">
                <p className="font-fw-sans text-body-sm italic text-text-secondary">
                  &ldquo;{request.message}&rdquo;
                </p>
              </div>
            ) : null}

            {layout === 'modal' ? (
              confirming ? (
                <div className="mt-3">{declineConfirm}</div>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    busy={busy}
                    disabled={busy}
                    leftIcon={busy ? undefined : <IconCheck size={15} />}
                    onClick={() => onAccept(request.id)}
                    className="flex-1"
                  >
                    Accept
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    leftIcon={<IconX size={15} />}
                    onClick={() => setConfirming(true)}
                  >
                    Decline
                  </Button>
                </div>
              )
            ) : null}
          </div>

          {layout === 'inline' ? (
            confirming ? (
              <div className="flex-shrink-0">{declineConfirm}</div>
            ) : (
              <div className="flex flex-shrink-0 items-center gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  aria-label={`Decline ${name}`}
                  leftIcon={<IconX size={15} />}
                  onClick={() => setConfirming(true)}
                >
                  Decline
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  busy={busy}
                  disabled={busy}
                  leftIcon={busy ? undefined : <IconCheck size={15} />}
                  onClick={() => onAccept(request.id)}
                >
                  Accept
                </Button>
              </div>
            )
          ) : null}
        </div>
      </Surface>
    </motion.div>
  );
}

/* ---------------------------------------------------------------------------
 * InlineAccordion (C6) — amber InlineNotice header → expandable request list
 * ------------------------------------------------------------------------- */

function InlineAccordion({
  requests,
  processingId,
  error,
  onAccept,
  onReject,
  defaultExpanded,
  className,
}: {
  requests: JoinRequestData[];
  processingId: string | null;
  error: string | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  defaultExpanded: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const count = requests.length;
  const listId = React.useId();

  return (
    <div className={cn('font-fw-sans', className)}>
      <InlineNotice
        tone="warning"
        icon={null}
        title={
          <span className="flex items-center gap-2">
            <IconUsers size={16} aria-hidden />
            Pending join requests
          </span>
        }
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={listId}
            rightIcon={expanded ? <IconChevronUp size={15} aria-hidden /> : <IconChevronDown size={15} aria-hidden />}
          >
            {expanded ? 'Collapse' : 'Review'}
          </Button>
        }
      >
        <span className="inline-flex items-center gap-2">
          {count} {count === 1 ? 'player' : 'players'} waiting for approval
          <Badge tone="warning" size="sm" numeric>
            {count}
          </Badge>
        </span>
      </InlineNotice>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={listId}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { height: { type: 'spring', stiffness: 500, damping: 36 }, opacity: { duration: 0.2 } }
            }
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-3 pt-3">
              {error ? (
                <InlineNotice tone="danger" title="Something went wrong">
                  {error}
                </InlineNotice>
              ) : null}

              <AnimatePresence initial={false} mode="popLayout">
                {requests.map((request) => (
                  <RequestRow
                    key={request.id}
                    request={request}
                    processingId={processingId}
                    onAccept={onAccept}
                    onReject={onReject}
                    layout="inline"
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * RequestsModal (C7) — auto-popup ModalShell, once per session, auto-closes empty
 * ------------------------------------------------------------------------- */

function RequestsModal({
  open,
  onOpenChange,
  requests,
  processingId,
  error,
  onAccept,
  onReject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requests: JoinRequestData[];
  processingId: string | null;
  error: string | null;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const count = requests.length;

  return (
    <ModalShell
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Join requests"
      description={`${count} player${count === 1 ? '' : 's'} waiting`}
    >
      <ModalShell.Body>
        <div className="space-y-3">
          {error ? (
            <InlineNotice tone="danger" title="Something went wrong">
              {error}
            </InlineNotice>
          ) : null}

          <AnimatePresence initial={false} mode="popLayout">
            {requests.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                processingId={processingId}
                onAccept={onAccept}
                onReject={onReject}
                layout="modal"
              />
            ))}
          </AnimatePresence>
        </div>
      </ModalShell.Body>

      <ModalShell.Footer>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Review later
        </Button>
      </ModalShell.Footer>
    </ModalShell>
  );
}

/* ---------------------------------------------------------------------------
 * FairwayJoinRequests — the consolidated surface
 * ------------------------------------------------------------------------- */

export function FairwayJoinRequests({
  requests,
  enableModal = true,
  defaultExpanded,
  sessionKey = 'roster_modal_shown',
  className,
}: FairwayJoinRequestsProps) {
  // See SURFACE EXCLUSIVITY note above: an explicit `defaultExpanded` always
  // wins; otherwise collapse the accordion when the modal owns first-touch.
  const effectiveDefaultExpanded = defaultExpanded ?? !enableModal;

  // Local mirror of the prop so accept/reject can optimistically remove rows.
  // Re-sync when the caller refetches and passes a new array.
  const [local, setLocal] = React.useState<JoinRequestData[]>(requests);
  React.useEffect(() => {
    setLocal(requests);
  }, [requests]);

  const { processingId, error, handleAccept, handleReject } = useJoinRequestActions(local, setLocal);

  const [modalOpen, setModalOpen] = React.useState(false);

  // AUTO-POPUP — once per session, only when there are pending requests on mount
  // (mirrors RosterPageClient's sessionStorage guard). Runs once.
  React.useEffect(() => {
    if (!enableModal) return;
    if (requests.length === 0) return;
    if (typeof window === 'undefined') return;
    try {
      const alreadyShown = window.sessionStorage.getItem(sessionKey);
      if (!alreadyShown) {
        setModalOpen(true);
        window.sessionStorage.setItem(sessionKey, 'true');
      }
    } catch {
      // sessionStorage can throw in private mode — fail open (no modal).
    }
    // Intentionally mount-only: the legacy guard checks once per page visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AUTO-CLOSE — when the list drains to empty (legacy `requests.length === 1`
  // → onClose, ported to an effect on the live count so it survives optimistic
  // removes and an external refetch alike).
  React.useEffect(() => {
    if (modalOpen && local.length === 0) {
      setModalOpen(false);
    }
  }, [modalOpen, local.length]);

  // Nothing pending → render nothing (matches legacy null-render).
  if (local.length === 0) return null;

  return (
    <>
      <InlineAccordion
        requests={local}
        processingId={processingId}
        error={error}
        onAccept={handleAccept}
        onReject={handleReject}
        defaultExpanded={effectiveDefaultExpanded}
        className={className}
      />

      {enableModal ? (
        <RequestsModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          requests={local}
          processingId={processingId}
          error={error}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      ) : null}
    </>
  );
}

export default FairwayJoinRequests;
