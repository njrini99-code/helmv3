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

const PENDING_BADGE = { label: 'No reply', className: 'bg-warm-100 text-warm-600 ring-warm-200' };

const RSVP_BADGES: Record<string, { label: string; className: string }> = {
  accepted: { label: 'Going', className: 'bg-primary-50 text-primary-700 ring-primary-100' },
  attending: { label: 'Going', className: 'bg-primary-50 text-primary-700 ring-primary-100' },
  declined: { label: 'Declined', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
  not_attending: { label: 'Declined', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
  tentative: { label: 'Maybe', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
  maybe: { label: 'Maybe', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
  excused: { label: 'Excused', className: 'bg-warm-100 text-warm-600 ring-warm-200' },
  unexcused: { label: 'Unexcused', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
  pending: PENDING_BADGE,
};

const MARK_OPTIONS: Array<{ value: AttendanceMark; label: string; activeClassName: string }> = [
  { value: 'present', label: 'Present', activeClassName: 'bg-primary-600 text-white ring-primary-600' },
  { value: 'late', label: 'Late', activeClassName: 'bg-amber-500 text-white ring-amber-500' },
  { value: 'no_show', label: 'No-show', activeClassName: 'bg-rose-600 text-white ring-rose-600' },
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
    getAttendanceReport(eventId).then((res) => {
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
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadKey]);

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
      }
    },
    [bulkPending, eventId, pendingIds, rows, setRowMark],
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
    }
  }, [bulkPending, eventId, rows]);

  const handleRetry = useCallback(() => setReloadKey((k) => k + 1), []);

  if (!eventId) return null;

  return (
    <section className="space-y-2" aria-label="Attendance" data-team-id={teamId}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-medium text-warm-900">
          <ClipboardCheck className="w-4 h-4 text-warm-500" />
          Attendance
          {!loading && !loadError && rows.length > 0 && (
            <span
              className="ml-0.5 px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 ring-1 ring-primary-100 text-eyebrow font-medium tabular-nums"
              data-testid="attendance-tally"
              aria-live="polite"
            >
              {presentCount}/{rows.length} present
            </span>
          )}
        </h4>
        {canManage && !loading && !loadError && rows.length > 0 && (
          <button
            type="button"
            onClick={handleMarkAllPresent}
            disabled={bulkPending}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
              'bg-primary-50 hover:bg-primary-100 text-primary-700 ring-1 ring-primary-100',
              'transition-colors disabled:opacity-50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
            )}
          >
            {bulkPending ? (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="w-3 h-3" aria-hidden="true" />
            )}
            Mark all present
          </button>
        )}
      </div>

      {loading ? (
        <AttendanceSkeleton />
      ) : loadError ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-cream-100/75 ring-1 ring-warm-200/60">
          <p className="text-xs text-warm-500">Couldn’t load attendance.</p>
          <button
            type="button"
            onClick={handleRetry}
            className="text-xs font-medium text-primary-700 hover:text-primary-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded"
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-warm-500">— No players on the list for this event.</p>
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
    <li className="flex items-center gap-2.5 px-3 py-2 rounded-xl glass-standard ring-1 ring-warm-200/60">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-warm-900 truncate">
          {row.name}
          {row.jersey !== null && (
            <span className="ml-1.5 text-eyebrow text-warm-400 tabular-nums">#{row.jersey}</span>
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
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              aria-label={`Mark ${row.name} ${option.label.toLowerCase()}`}
              disabled={pending}
              onClick={() => onMark(row.playerId, option.value)}
              className={cn(
                'px-2 py-1 rounded-full text-eyebrow ring-1 transition-colors',
                'disabled:cursor-not-allowed',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                active
                  ? option.activeClassName
                  : 'bg-cream-50 text-warm-600 ring-warm-200 hover:bg-warm-50',
              )}
            >
              {option.label}
            </button>
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
      <p className="text-xs text-warm-500">— You’re not on the list for this event.</p>
    );
  }

  const statusDisplay =
    own.mark === 'present' || own.mark === 'late'
      ? { label: own.mark === 'late' ? 'Checked in (late)' : 'Checked in', className: 'text-primary-700' }
      : own.mark === 'no_show'
        ? { label: 'Marked absent', className: 'text-rose-700' }
        : { label: '— Not recorded yet', className: 'text-warm-500' };

  return (
    <div className="px-3 py-2.5 rounded-xl bg-cream-100/75 ring-1 ring-warm-200/60 space-y-0.5">
      <p className="text-eyebrow text-warm-500">Your attendance</p>
      <p className={cn('text-sm font-medium', statusDisplay.className)} data-testid="own-attendance-status">
        {statusDisplay.label}
      </p>
      <p className="text-eyebrow text-warm-400 tabular-nums">
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
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-cream-100/75 ring-1 ring-warm-200/60"
        >
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-28 rounded bg-warm-200/60 animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-warm-200/50 animate-pulse" />
          </div>
          <div className="h-6 w-32 rounded-full bg-warm-200/50 animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

export default AttendancePanel;
