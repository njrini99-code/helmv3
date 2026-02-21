'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { X, Mail, Calendar, Target, Sparkles, User, Clock } from 'lucide-react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { ActivityDot } from './ActivityDot';
import { timeAgo, formatDate } from './admin-utils';

type TeamMember = AdminDashboardData['userActivity']['teams'][0]['members'][0];

interface Props {
  userId: string;
  teams: AdminDashboardData['userActivity']['teams'];
  unassigned: AdminDashboardData['userActivity']['unassigned'];
  userDirectory: AdminDashboardData['userDirectory'];
  onClose: () => void;
}

const roleColors: Record<string, string> = {
  coach: 'bg-blue-50 text-blue-700 border-blue-200',
  player: 'bg-primary-50 text-primary-700 border-primary-200',
  admin: 'bg-violet-50 text-violet-700 border-violet-200',
};

function getInitials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
      : (parts[0]?.[0] ?? '?').toUpperCase();
  }
  return (email[0] ?? '?').toUpperCase();
}

export function UserDetailPanel({ userId, teams, unassigned, userDirectory, onClose }: Props) {
  // Find user across teams and unassigned
  const { member, teamData, directoryEntry } = useMemo(() => {
    let foundMember: TeamMember | null = null;
    let foundTeam: AdminDashboardData['userActivity']['teams'][0] | null = null;

    for (const team of teams) {
      const m = team.members.find((mem) => mem.id === userId);
      if (m) {
        foundMember = m;
        foundTeam = team;
        break;
      }
    }

    const dirEntry = userDirectory.find((u) => u.id === userId) ?? null;

    return {
      member: foundMember,
      teamData: foundTeam,
      directoryEntry: dirEntry,
    };
  }, [userId, teams, userDirectory]);

  const unassignedUser = !member ? unassigned.find((u) => u.id === userId) : null;

  const name = member?.name ?? directoryEntry ? `${directoryEntry?.firstName ?? ''} ${directoryEntry?.lastName ?? ''}`.trim() : null;
  const email = member?.email ?? unassignedUser?.email ?? directoryEntry?.email ?? '';
  const role = member?.role ?? unassignedUser?.role ?? directoryEntry?.role ?? 'unknown';
  const activityStatus = member?.activityStatus ?? unassignedUser?.activityStatus ?? 'never';
  const lastSeen = member?.last_seen ?? unassignedUser?.last_seen ?? directoryEntry?.lastActiveAt ?? null;
  const createdAt = member?.created_at ?? unassignedUser?.created_at ?? directoryEntry?.createdAt ?? null;

  // Engagement score (simple heuristic)
  const engagementScore = useMemo(() => {
    if (!member) return 0;
    let score = 0;
    if (member.activityStatus === 'active_today') score += 40;
    else if (member.activityStatus === 'active_week') score += 25;
    else if (member.activityStatus === 'active_month') score += 10;
    if (member.roundsEntered > 10) score += 30;
    else if (member.roundsEntered > 3) score += 20;
    else if (member.roundsEntered > 0) score += 10;
    if (member.insightsReceived > 0) score += 15;
    if (member.roundReviews > 0) score += 15;
    return Math.min(score, 100);
  }, [member]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className={cn(
        'relative w-full max-w-md',
        'bg-[#FFFEF8] border-l border-warm-200/40',
        'shadow-2xl',
        'overflow-y-auto',
        'animate-in slide-in-from-right duration-300'
      )}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-warm-200/40 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-warm-900">User Profile</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-warm-400 hover:text-warm-700 hover:bg-warm-100/80 active:bg-warm-200 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Profile section */}
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center">
                <span className="text-xl font-bold text-primary-600">
                  {getInitials(name, email)}
                </span>
              </div>
              <div className="absolute -bottom-1 -right-1 border-2 border-[#FFFEF8] rounded-full">
                <ActivityDot status={activityStatus} size="lg" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-warm-900 truncate">{name || email.split('@')[0]}</h3>
              <p className="text-sm text-warm-500 truncate">{email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-full border',
                  roleColors[role] ?? 'bg-warm-100 text-warm-500 border-warm-200'
                )}>
                  {role}
                </span>
                {teamData && (
                  <span className="text-xs text-warm-400">{teamData.teamName}</span>
                )}
                {!teamData && unassignedUser && (
                  <span className="text-xs text-amber-500 font-medium">No Team</span>
                )}
              </div>
            </div>
          </div>

          {/* Engagement ring */}
          {member && (
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/70 border border-white/20 shadow-glass mb-6">
              <div className="relative w-16 h-16 flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-warm-100" />
                  <circle
                    cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8"
                    strokeDasharray={`${engagementScore * 2.64} 264`}
                    strokeLinecap="round"
                    className={cn(
                      engagementScore >= 60 ? 'text-primary-500' :
                      engagementScore >= 30 ? 'text-amber-500' :
                      'text-red-500'
                    )}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-warm-900 tabular-nums">{engagementScore}</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-warm-900">Engagement Score</p>
                <p className="text-xs text-warm-400 mt-0.5">
                  Based on activity, rounds, and AI usage
                </p>
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-3 rounded-xl bg-white/50 border border-white/30">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={12} className="text-warm-400" />
                <span className="text-micro text-warm-400 uppercase tracking-wider font-medium">Last Active</span>
              </div>
              <p className="text-sm font-semibold text-warm-900">{timeAgo(lastSeen)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/50 border border-white/30">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar size={12} className="text-warm-400" />
                <span className="text-micro text-warm-400 uppercase tracking-wider font-medium">Signed Up</span>
              </div>
              <p className="text-sm font-semibold text-warm-900">{formatDate(createdAt)}</p>
            </div>
            {member && (
              <>
                <div className="p-3 rounded-xl bg-white/50 border border-white/30">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Target size={12} className="text-warm-400" />
                    <span className="text-micro text-warm-400 uppercase tracking-wider font-medium">Rounds</span>
                  </div>
                  <p className="text-sm font-semibold text-warm-900 tabular-nums">{member.roundsEntered}</p>
                  {member.lastRoundDate && (
                    <p className="text-micro text-warm-400 mt-0.5">Last: {timeAgo(member.lastRoundDate)}</p>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-white/50 border border-white/30">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles size={12} className="text-warm-400" />
                    <span className="text-micro text-warm-400 uppercase tracking-wider font-medium">AI Insights</span>
                  </div>
                  <p className="text-sm font-semibold text-warm-900 tabular-nums">{member.insightsReceived}</p>
                  {member.roundReviews > 0 && (
                    <p className="text-micro text-warm-400 mt-0.5">{member.roundReviews} reviews</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Performance stats */}
          {member && member.avgScore !== null && (
            <div className="mb-6">
              <h4 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3">Performance</h4>
              <div className="p-4 rounded-xl bg-white/50 border border-white/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-warm-600">Scoring Average</span>
                  <span className="text-lg font-bold text-warm-900 tabular-nums">{member.avgScore.toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div>
            <h4 className="text-xs font-semibold text-warm-500 uppercase tracking-wider mb-3">Activity</h4>
            <div className="space-y-3">
              {member?.lastRoundDate && (
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Target size={12} className="text-primary-600" />
                  </div>
                  <div>
                    <p className="text-sm text-warm-700">Last round submitted</p>
                    <p className="text-xs text-warm-400">{formatDate(member.lastRoundDate)}</p>
                  </div>
                </div>
              )}
              {lastSeen && (
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={12} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-warm-700">Last signed in</p>
                    <p className="text-xs text-warm-400">{formatDate(lastSeen)}</p>
                  </div>
                </div>
              )}
              {createdAt && (
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-warm-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Mail size={12} className="text-warm-500" />
                  </div>
                  <div>
                    <p className="text-sm text-warm-700">Account created</p>
                    <p className="text-xs text-warm-400">{formatDate(createdAt)}</p>
                  </div>
                </div>
              )}
              {!lastSeen && !member?.lastRoundDate && (
                <div className="text-center py-4">
                  <p className="text-sm text-warm-400">No activity recorded</p>
                  <p className="text-xs text-warm-300 mt-0.5">User has never logged in</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
