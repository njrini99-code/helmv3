'use client';

/**
 * AttendancePanel — roll-call UI for a calendar event. Mounts inside the
 * event drawer (EventDetailModal / MobileEventSheet).
 *
 * Coach view (canManage): the event's invitee roster with each player's RSVP
 * response, one-tap Present / Late / No-show toggles (tap the active mark
 * again to clear it), a bulk "Mark all present" action, and a running
 * X/Y-present tally. Saves are optimistic with rollback on error.
 *
 * Player view: read-only card showing the player's own recorded status.
 *
 * Persistence: marks live in golf_event_attendance.attendance_status
 * (migration 20260610080000; dual-axis with `status`, the RSVP column), so
 * Present / Late / No-show all survive reload. getAttendanceReport
 * normalizes legacy pre-migration rows server-side, making attendance_status
 * authoritative here. The tally counts Late players as present — a late
 * player IS present.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ClipboardCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { logError } from '@/lib/error-logging';
import {
  bulkCheckIn,
  getAttendanceReport,
  markAttendance,
  type AttendanceMark,
  type AttendanceRecord,
  type RsvpStatus,
} from '@/app/golf/actions/attendance';

// ----------------------------------------------------------------------------
// Types + display maps
// ----------------------------------------------------------------------------

export interface AttendancePanelProps {
  eventId: string;
  teamId: string;
  canManage: boolean;
}

interface RosterRow {
  playerId: string;
  name: string;
  jersey: number | null;
  rsvp: RsvpStatus | null;
  mark: AttendanceMark | null;
}

// Fairway tokens only — this panel renders inside the live Fairway drawer, so
// it must read as the same app (no legacy cream/primary/rose/amber/warm/glass).
const PENDING_BADGE = {
  label: 'No reply',
  className: 'bg-surface-sunken text-text-secondary ring-border-subtle',
};

const RSVP_BADGES: Record<string, { label: string; className: string }> = {
  accepted: { label: 'Going', className: 'bg-fw-success-bg text-accent-700 ring-accent-100' },
  attending: { label: 'Going', className: 'bg-fw-success-bg text-accent-700 ring-accent-100' },
  declined: { label: 'Declined', className: 'bg-fw-danger-bg text-fw-danger ring-fw-danger/20' },
  not_attending: { label: 'Declined', className: 'bg-fw-danger-bg text-fw-danger ring-fw-danger/20' },
  tentative: { label: 'Maybe', className: 'bg-fw-warning-bg text-fw-warning-ink ring-fw-warning-ring' },
  maybe: { label: 'Maybe', className: 'bg-fw-warning-bg text-fw-warning-ink ring-fw-warning-ring' },
  excused: { label: 'Excused', className: 'bg-surface-sunken text-text-secondary ring-border-subtle' },
  unexcused: { label: 'Unexcused', className: 'bg-fw-danger-bg text-fw-danger ring-fw-danger/20' },
  pending: PENDING_BADGE,
};

const MARK_OPTIONS: Array<{ value: AttendanceMark; label: string; activeClassName: string }> = [
  { value: 'present', label: 'Present', activeClassName: 'bg-accent-600 text-text-on-accent ring-accent-600' },
  { value: 'late', label: 'Late', activeClassName: 'bg-fw-warning text-warm-900 ring-fw-warning' },
  { value: 'no_show', label: 'No-show', activeClassName: 'bg-fw-danger text-text-on-accent ring-fw-danger' },
];

function rowName(record: AttendanceRecord): string {
  const name = [record.player?.first_name, record.player?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || 'Unknown player';
}

function markFromRecord(record: AttendanceRecord): AttendanceMark | null {
  // attendance_status is the first-class mark, already normalized for legacy
  // rows by getAttendanceReport — Late survives reload.
  return record.attendance_status;
}

// ----------------------------------------------------------------------------
// Panel
// ----------------------------------------------------------------------------

export function AttendancePanel({ eventId, teamId, canManage }: AttendancePanelProps) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [viewerPlayerId, setViewerPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getAttendanceReport(eventId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setRows(
            res.data.attendance.map((record) => ({
              playerId: record.player_id,
              name: rowName(record),
              jersey: record.player?.jersey_number ?? null,
              rsvp: record.status,
              mark: markFromRecord(record),
            })),
          );
          setViewerPlayerId(res.data.viewerPlayerId);
        } else {
          setLoadError(res.error ?? 'Failed to load attendance');
          logError(
            new Error(res.error ?? 'Failed to load attendance'),
            { component: 'AttendancePanel', action: 'load-attendance-report', sport: 'golf', eventId, teamId },
            'medium'
          );
        }
      })
      .catch((err) => {
        // The per-player roster is a SEPARATE query path from the drawer's
        // aggregate RSVP tally (getEventRSVP) — a thrown rejection here must
        // never leave the panel silently blank/stuck-loading while the tally
        // above it renders fine (finding #9). Without this .catch, a thrown
        // exception (vs. a `{ success: false }` result) left `loading` true
        // forever — an infinite skeleton with no honest error, indistinguishable
        // from a stuck network request.
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load attendance';
        setLoadError(message);
        logError(
          err instanceof Error ? err : new Error(message),
          { component: 'AttendancePanel', action: 'load-attendance-report', sport: 'golf', eventId, teamId },
          'medium'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadKey, teamId]);

  const presentCount = useMemo(
    () => rows.filter((r) => r.mark === 'present' || r.mark === 'late').length,
    [rows],
  );

  const setRowMark = useCallback((playerId: string, mark: AttendanceMark | null) => {
    setRows((prev) => prev.map((r) => (r.playerId === playerId ? { ...r, mark } : r)));
  }, []);

  const handleMark = useCallback(
    async (playerId: string, next: AttendanceMark) => {
      if (pendingIds.has(playerId) || bulkPending) return;
      const row = rows.find((r) => r.playerId === playerId);
      if (!row) return;

      const previousMark = row.mark;
      // Tapping the active mark again clears it.
      const target: AttendanceMark | 'clear' = previousMark === next ? 'clear' : next;

      // Optimistic update.
      setRowMark(playerId, target === 'clear' ? null : target);
      setPendingIds((prev) => new Set(prev).add(playerId));

      const res = await markAttendance(eventId, playerId, target);

      setPendingIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(playerId);
        return nextSet;
      });

      if (!res.success) {
        // Roll back just this player's mark.
        setRowMark(playerId, previousMark);
        toast.error('Could not save attendance', res.error || 'Try again in a moment.');
        logError(
          new Error(res.error || 'Failed to save attendance'),
          { component: 'AttendancePanel', action: 'mark-attendance', sport: 'golf', eventId, teamId, playerId },
          'high'
        );
      }
    },
    [bulkPending, eventId, teamId, pendingIds, rows, setRowMark],
  );

  const handleMarkAllPresent = useCallback(async () => {
    if (bulkPending || rows.length === 0) return;
    const previousMarks = new Map(rows.map((r) => [r.playerId, r.mark]));

    setBulkPending(true);
    setRows((prev) => prev.map((r) => ({ ...r, mark: 'present' as const })));

    const res = await bulkCheckIn(eventId, rows.map((r) => r.playerId));

    setBulkPending(false);
    if (!res.success) {
      setRows((prev) =>
        prev.map((r) => ({ ...r, mark: previousMarks.get(r.playerId) ?? null })),
      );
      toast.error('Could not check everyone in', res.error || 'Try again in a moment.');
      logError(
        new Error(res.error || 'Failed to bulk check in'),
        { component: 'AttendancePanel', action: 'bulk-check-in', sport: 'golf', eventId, teamId },
        'high'
      );
    }
  }, [bulkPending, eventId, teamId, rows]);

  const handleRetry = useCallback(() => setReloadKey((k) => k + 1), []);

  if (!eventId) return null;

  return (
    <section className="space-y-2" aria-label="Attendance" data-team-id={teamId}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
          <ClipboardCheck className="w-4 h-4 text-text-tertiary" />
          Attendance
          {!loading && !loadError && rows.length > 0 && (
            <span
              className="ml-0.5 px-2 py-0.5 rounded-full bg-fw-success-bg text-accent-700 ring-1 ring-accent-100 text-eyebrow font-medium tabular-nums"
              data-testid="attendance-tally"
              aria-live="polite"
            >
              {presentCount}/{rows.length} present
            </span>
          )}
        </h4>
        {canManage && !loading && !loadError && rows.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleMarkAllPresent}
            disabled={bulkPending}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium h-auto',
              'bg-fw-success-bg hover:bg-accent-100 text-accent-700 ring-1 ring-accent-100',
              'transition-colors disabled:opacity-50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            )}
          >
            {bulkPending ? (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="w-3 h-3" aria-hidden="true" />
            )}
            Mark all present
          </Button>
        )}
      </div>

      {loading ? (
        <AttendanceSkeleton />
      ) : loadError ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-surface-sunken ring-1 ring-border-subtle">
          <p className="text-xs text-text-tertiary">Couldn’t load attendance.</p>
          <Button
            type="button"
            variant="ghost"
            onClick={handleRetry}
            className="text-xs font-medium text-accent-700 hover:text-accent-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded h-auto p-0"
          >
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-text-tertiary">— No players on the list for this event.</p>
      ) : canManage ? (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <AttendanceRow
              key={row.playerId}
              row={row}
              pending={pendingIds.has(row.playerId) || bulkPending}
              onMark={handleMark}
            />
          ))}
        </ul>
      ) : (
        <PlayerSelfView
          rows={rows}
          viewerPlayerId={viewerPlayerId}
          presentCount={presentCount}
        />
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Coach row
// ----------------------------------------------------------------------------

interface AttendanceRowProps {
  row: RosterRow;
  pending: boolean;
  onMark: (playerId: string, mark: AttendanceMark) => void;
}

function AttendanceRow({ row, pending, onMark }: AttendanceRowProps) {
  const badge = RSVP_BADGES[row.rsvp ?? 'pending'] ?? PENDING_BADGE;

  return (
    <li className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface border border-border-subtle shadow-flat">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {row.name}
          {row.jersey !== null && (
            <span className="ml-1.5 text-eyebrow text-text-tertiary tabular-nums">#{row.jersey}</span>
          )}
        </p>
        <span
          className={cn(
            'inline-block mt-0.5 px-1.5 py-px rounded-full text-eyebrow ring-1',
            badge.className,
          )}
        >
          {badge.label}
        </span>
      </div>
      <div
        role="group"
        aria-label={`Attendance for ${row.name}`}
        className={cn('flex items-center gap-1', pending && 'opacity-60')}
      >
        {MARK_OPTIONS.map((option) => {
          const active = row.mark === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              aria-pressed={active}
              aria-label={`Mark ${row.name} ${option.label.toLowerCase()}`}
              disabled={pending}
              onClick={() => onMark(row.playerId, option.value)}
              className={cn(
                'px-2 py-1 rounded-full text-eyebrow ring-1 transition-colors h-auto',
                'disabled:cursor-not-allowed',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                active
                  ? option.activeClassName
                  : 'bg-surface-sunken text-text-secondary ring-border-subtle hover:bg-surface-tint',
              )}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </li>
  );
}

// ----------------------------------------------------------------------------
// Player read-only view
// ----------------------------------------------------------------------------

interface PlayerSelfViewProps {
  rows: RosterRow[];
  viewerPlayerId: string | null;
  presentCount: number;
}

function PlayerSelfView({ rows, viewerPlayerId, presentCount }: PlayerSelfViewProps) {
  const own = viewerPlayerId ? rows.find((r) => r.playerId === viewerPlayerId) : undefined;

  if (!own) {
    return (
      <p className="text-xs text-text-tertiary">— You’re not on the list for this event.</p>
    );
  }

  const statusDisplay =
    own.mark === 'present' || own.mark === 'late'
      ? { label: own.mark === 'late' ? 'Checked in (late)' : 'Checked in', className: 'text-accent-700' }
      : own.mark === 'no_show'
        ? { label: 'Marked absent', className: 'text-fw-danger' }
        : { label: '— Not recorded yet', className: 'text-text-tertiary' };

  return (
    <div className="px-3 py-2.5 rounded-xl bg-surface-sunken ring-1 ring-border-subtle space-y-0.5">
      <p className="text-eyebrow text-text-tertiary">Your attendance</p>
      <p className={cn('text-sm font-medium', statusDisplay.className)} data-testid="own-attendance-status">
        {statusDisplay.label}
      </p>
      <p className="text-eyebrow text-text-tertiary tabular-nums">
        {presentCount}/{rows.length} on the roster checked in
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Skeleton
// ----------------------------------------------------------------------------

function AttendanceSkeleton() {
  return (
    <ul className="space-y-1.5" aria-hidden="true" data-testid="attendance-skeleton">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface border border-border-subtle shadow-flat"
        >
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-28 rounded bg-surface-sunken animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-surface-sunken animate-pulse" />
          </div>
          <div className="h-6 w-32 rounded-full bg-surface-sunken animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

export default AttendancePanel;
