'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { CheckCircle, Circle, Loader2, Users } from 'lucide-react';
import { checkInBaseballPlayer, uncheckInBaseballPlayer } from '@/app/baseball/actions/calendar';

interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

interface AttendanceRecord {
  player_id: string;
  check_in_at: string | null;
  status: string;
}

interface AttendanceCheckInProps {
  eventId: string;
  teamMembers: TeamMember[];
  attendanceRecords: AttendanceRecord[];
  className?: string;
}

export function AttendanceCheckIn({
  eventId,
  teamMembers,
  attendanceRecords,
  className,
}: AttendanceCheckInProps) {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [localCheckedIn, setLocalCheckedIn] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const record of attendanceRecords) {
      if (record.check_in_at) set.add(record.player_id);
    }
    return set;
  });

  const checkedInCount = localCheckedIn.size;
  const totalCount = teamMembers.length;

  const handleToggle = useCallback(
    async (playerId: string) => {
      if (loadingIds.has(playerId)) return;

      setLoadingIds((prev) => new Set(prev).add(playerId));

      const isCurrentlyCheckedIn = localCheckedIn.has(playerId);

      // Optimistic update
      setLocalCheckedIn((prev) => {
        const next = new Set(prev);
        if (isCurrentlyCheckedIn) {
          next.delete(playerId);
        } else {
          next.add(playerId);
        }
        return next;
      });

      try {
        const result = isCurrentlyCheckedIn
          ? await uncheckInBaseballPlayer(eventId, playerId)
          : await checkInBaseballPlayer(eventId, playerId);

        if (!result.success) {
          // Revert on failure
          setLocalCheckedIn((prev) => {
            const next = new Set(prev);
            if (isCurrentlyCheckedIn) {
              next.add(playerId);
            } else {
              next.delete(playerId);
            }
            return next;
          });
        }
      } catch {
        // Revert on error
        setLocalCheckedIn((prev) => {
          const next = new Set(prev);
          if (isCurrentlyCheckedIn) {
            next.add(playerId);
          } else {
            next.delete(playerId);
          }
          return next;
        });
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(playerId);
          return next;
        });
      }
    },
    [eventId, loadingIds, localCheckedIn],
  );

  if (teamMembers.length === 0) {
    return (
      <div className={cn('p-6 text-center', className)}>
        <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No team members to check in</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">Check-In</h4>
        <span className="text-xs text-slate-500 font-medium">
          {checkedInCount}/{totalCount} present
        </span>
      </div>

      {/* Progress */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
          style={{ width: totalCount > 0 ? `${(checkedInCount / totalCount) * 100}%` : '0%' }}
        />
      </div>

      {/* Player list */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {teamMembers.map((member) => {
          const isCheckedIn = localCheckedIn.has(member.id);
          const isLoading = loadingIds.has(member.id);
          const initials = `${member.first_name[0] || ''}${member.last_name[0] || ''}`.toUpperCase();

          return (
            <button
              key={member.id}
              type="button"
              onClick={() => handleToggle(member.id)}
              disabled={isLoading}
              className={cn(
                'w-full flex items-center gap-3 p-2.5 rounded-xl transition-all duration-150',
                'hover:bg-slate-50 active:scale-[0.99]',
                isCheckedIn && 'bg-emerald-50/50',
                isLoading && 'opacity-60',
              )}
            >
              {/* Check icon */}
              <div className="flex-shrink-0">
                {isLoading ? (
                  <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                ) : isCheckedIn ? (
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300" />
                )}
              </div>

              {/* Avatar */}
              {member.avatar_url ? (
                <Image
                  src={member.avatar_url}
                  alt={`${member.first_name} ${member.last_name}`}
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                  unoptimized
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600 flex-shrink-0">
                  {initials}
                </div>
              )}

              {/* Name */}
              <span
                className={cn(
                  'text-sm font-medium',
                  isCheckedIn ? 'text-emerald-700' : 'text-slate-700',
                )}
              >
                {member.first_name} {member.last_name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
