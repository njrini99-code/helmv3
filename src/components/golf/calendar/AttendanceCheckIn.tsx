'use client';

/**
 * Attendance Check-In Component
 *
 * Mobile workstation for coaches at events:
 * - Sticky header with progress bar
 * - Progress animation (fills as players marked)
 * - Quick actions (Mark All Present/Absent)
 * - Player list with large tap targets
 * - Integrates with AbsenceReasonSheet
 * - Real-time attendance count
 *
 * Optimized for on-the-go mobile check-in at events.
 */

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { PlayerAttendanceRow } from './PlayerAttendanceRow';
import { AbsenceReasonSheet, type AbsenceData } from './AbsenceReasonSheet';
import { Users, CheckCircle, XCircle, Clock } from 'lucide-react';
import '@/styles/calendar-tokens.css';

export interface AttendancePlayer {
  id: string;
  name: string;
  avatar_url?: string | null;
  rsvp_status?: 'confirmed' | 'maybe' | 'declined' | 'pending';
  attendance?: {
    status: 'present' | 'absent' | 'excused' | null;
    reason?: string;
    notes?: string;
    marked_at?: string;
  };
}

export interface AttendanceCheckInProps {
  eventTitle: string;
  players: AttendancePlayer[];
  onMarkAttendance: (
    playerId: string,
    status: 'present' | 'absent' | 'excused',
    data?: AbsenceData
  ) => Promise<void>;
  onComplete?: () => void;
  className?: string;
}

export function AttendanceCheckIn({
  eventTitle,
  players,
  onMarkAttendance,
  onComplete,
  className,
}: AttendanceCheckInProps) {
  const [selectedAbsentPlayer, setSelectedAbsentPlayer] = useState<AttendancePlayer | null>(
    null
  );
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Calculate stats
  const stats = useMemo(() => {
    const total = players.length;
    const present = players.filter((p) => p.attendance?.status === 'present').length;
    const absent = players.filter(
      (p) => p.attendance?.status === 'absent' || p.attendance?.status === 'excused'
    ).length;
    const remaining = total - present - absent;
    const percentage = total > 0 ? ((present + absent) / total) * 100 : 0;

    return { total, present, absent, remaining, percentage };
  }, [players]);

  async function handleMarkPresent(player: AttendancePlayer) {
    setProcessingId(player.id);
    try {
      await onMarkAttendance(player.id, 'present');
    } finally {
      setProcessingId(null);
    }
  }

  async function handleMarkAbsent(player: AttendancePlayer) {
    // Open absence reason sheet
    setSelectedAbsentPlayer(player);
  }

  async function handleAbsenceSubmit(data: AbsenceData) {
    if (!selectedAbsentPlayer) return;

    setProcessingId(selectedAbsentPlayer.id);
    try {
      await onMarkAttendance(
        selectedAbsentPlayer.id,
        data.isExcused ? 'excused' : 'absent',
        data
      );
      setSelectedAbsentPlayer(null);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleMarkAllPresent() {
    for (const player of players) {
      if (!player.attendance?.status) {
        await onMarkAttendance(player.id, 'present');
      }
    }
  }

  async function handleMarkAllAbsent() {
    for (const player of players) {
      if (!player.attendance?.status) {
        await onMarkAttendance(player.id, 'absent', {
          reason: 'Not present at check-in',
          isExcused: false,
        });
      }
    }
  }

  // Group players: unmarked first, then present, then absent
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const aStatus = a.attendance?.status;
      const bStatus = b.attendance?.status;

      if (!aStatus && bStatus) return -1;
      if (aStatus && !bStatus) return 1;
      if (aStatus === 'present' && bStatus !== 'present') return 1;
      if (aStatus !== 'present' && bStatus === 'present') return -1;

      return 0;
    });
  }, [players]);

  const isComplete = stats.remaining === 0;

  return (
    <>
      <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm', className)}>
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 rounded-t-2xl">
          <div className="p-5">
            {/* Event title */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{eventTitle}</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Check in {stats.total} player{stats.total !== 1 ? 's' : ''}
                </p>
              </div>

              {/* Complete button (when done) */}
              {isComplete && onComplete && (
                <button
                  onClick={onComplete}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Complete
                </button>
              )}
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">
                  Progress: {stats.present + stats.absent} / {stats.total}
                </span>
                <span className="text-slate-500 tabular-nums">{Math.round(stats.percentage)}%</span>
              </div>

              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-600 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${stats.percentage}%` }}
                />
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span className="font-medium text-slate-700">{stats.present} present</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <XCircle className="w-4 h-4 text-rose-500" />
                  <span className="font-medium text-slate-700">{stats.absent} absent</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="font-medium text-slate-600">{stats.remaining} remaining</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick actions (if players remaining) */}
          {stats.remaining > 0 && (
            <div className="px-5 pb-4 flex gap-2">
              <button
                onClick={handleMarkAllPresent}
                className="flex-1 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-medium rounded-lg border border-emerald-200 transition-colors"
              >
                Mark All Present
              </button>
              <button
                onClick={handleMarkAllAbsent}
                className="flex-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-medium rounded-lg border border-rose-200 transition-colors"
              >
                Mark All Absent
              </button>
            </div>
          )}
        </div>

        {/* Player list */}
        <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
          {sortedPlayers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No players to check in</p>
            </div>
          ) : (
            <>
              {sortedPlayers.map((player) => (
                <PlayerAttendanceRow
                  key={player.id}
                  player={player}
                  attendance={player.attendance?.status || null}
                  onMarkPresent={() => handleMarkPresent(player)}
                  onMarkAbsent={() => handleMarkAbsent(player)}
                  disabled={processingId === player.id}
                />
              ))}
            </>
          )}
        </div>

        {/* Completion message */}
        {isComplete && (
          <div className="p-5 border-t border-slate-200 bg-emerald-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="font-semibold text-emerald-900">All players checked in</p>
                <p className="text-sm text-emerald-700 mt-0.5">
                  {stats.present} present, {stats.absent} absent
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Absence reason sheet */}
      <AbsenceReasonSheet
        open={selectedAbsentPlayer !== null}
        onClose={() => setSelectedAbsentPlayer(null)}
        onSubmit={handleAbsenceSubmit}
        playerName={selectedAbsentPlayer?.name || ''}
      />
    </>
  );
}

/**
 * Compact Attendance Summary (for event cards)
 */
export function CompactAttendanceSummary({
  present,
  absent,
  total,
  className,
}: {
  present: number;
  absent: number;
  total: number;
  className?: string;
}) {
  const remaining = total - present - absent;
  const percentage = total > 0 ? ((present + absent) / total) * 100 : 0;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span className="font-medium text-slate-700">{present}</span>
        </div>
        <div className="flex items-center gap-1">
          <XCircle className="w-3.5 h-3.5 text-rose-500" />
          <span className="font-medium text-slate-700">{absent}</span>
        </div>
        {remaining > 0 && (
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-600">{remaining}</span>
          </div>
        )}
      </div>

      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-600 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
