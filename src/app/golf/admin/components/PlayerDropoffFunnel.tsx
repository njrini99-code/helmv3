'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface PlayerDropoffFunnelProps {
  funnel: {
    stage: string;
    count: number;
    percentage: number;
    dropoffFromPrevious: number;
    dropoffPct: number;
  }[];
  stuckUsers: {
    stage: string;
    users: {
      id: string;
      name: string;
      email: string;
      daysSinceSignup: number;
      lastActiveAt: string | null;
    }[];
  }[];
}

export default function PlayerDropoffFunnel({
  funnel,
  stuckUsers,
}: PlayerDropoffFunnelProps) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  function toggleStage(stage: string) {
    setExpandedStage((prev) => (prev === stage ? null : stage));
  }

  function getUrgencyClass(daysSinceSignup: number): string {
    if (daysSinceSignup > 30) return 'bg-red-50/80 border-red-200/50';
    if (daysSinceSignup > 14) return 'bg-amber-50/80 border-amber-200/50';
    return 'bg-white/40 border-white/20';
  }

  function getUrgencyTextClass(daysSinceSignup: number): string {
    if (daysSinceSignup > 30) return 'text-red-600';
    if (daysSinceSignup > 14) return 'text-amber-600';
    return 'text-warm-500';
  }

  function formatLastActive(lastActiveAt: string | null): string {
    if (!lastActiveAt) return 'Never';
    const date = new Date(lastActiveAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  }

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6">
      <h2 className="text-lg font-semibold text-warm-900 mb-6">
        Player Journey Funnel
      </h2>

      {/* Funnel Bars */}
      <div className="space-y-1">
        {funnel.map((item, index) => (
          <div key={item.stage}>
            {/* Dropoff indicator between bars */}
            {index > 0 && item.dropoffFromPrevious > 0 && (
              <div className="flex items-center justify-center py-1.5">
                <span className="text-xs font-medium text-red-500">
                  ↓ {item.dropoffFromPrevious} dropped ({item.dropoffPct}%)
                </span>
              </div>
            )}

            {/* Funnel bar */}
            <div className="flex items-center gap-3">
              {/* Stage name */}
              <div className="w-36 shrink-0 text-right">
                <span className="text-sm font-medium text-warm-900">
                  {item.stage}
                </span>
              </div>

              {/* Bar container */}
              <div className="flex-1 relative">
                <div
                  className={cn(
                    'h-10 rounded-lg bg-gradient-to-r from-primary-500 to-primary-300',
                    'flex items-center justify-end pr-3 transition-all duration-500 ease-out',
                    'shadow-sm'
                  )}
                  style={{
                    width: `${Math.max(item.percentage, 4)}%`,
                  }}
                >
                  <span className="text-sm font-semibold text-white drop-shadow-sm">
                    {item.count}
                  </span>
                </div>
              </div>

              {/* Percentage badge */}
              <div className="w-16 shrink-0">
                <span
                  className={cn(
                    'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium',
                    index === 0
                      ? 'bg-primary-100 text-primary-700'
                      : 'bg-warm-100 text-warm-600'
                  )}
                >
                  {item.percentage}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stuck Users Section */}
      {stuckUsers.length > 0 && (
        <div className="mt-8 pt-6 border-t border-warm-200/50">
          <h3 className="text-sm font-semibold text-warm-900 mb-3">
            Users Stuck at Each Stage
          </h3>

          <div className="space-y-2">
            {stuckUsers.map((stageGroup) => (
              <div
                key={stageGroup.stage}
                className="border border-white/30 rounded-xl overflow-hidden"
              >
                {/* Expandable header */}
                <button
                  onClick={() => toggleStage(stageGroup.stage)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3',
                    'text-left hover:bg-white/40 transition-colors duration-200',
                    expandedStage === stageGroup.stage
                      ? 'bg-white/50'
                      : 'bg-white/20'
                  )}
                >
                  <span className="text-sm font-medium text-warm-900">
                    Stuck at {stageGroup.stage}{' '}
                    <span className="text-warm-400 font-normal">
                      ({stageGroup.users.length}{' '}
                      {stageGroup.users.length === 1 ? 'user' : 'users'})
                    </span>
                  </span>
                  <svg
                    className={cn(
                      'w-4 h-4 text-warm-400 transition-transform duration-200',
                      expandedStage === stageGroup.stage && 'rotate-180'
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* Expanded user list */}
                {expandedStage === stageGroup.stage && (
                  <div className="px-4 pb-3">
                    {stageGroup.users.length === 0 ? (
                      <p className="text-sm text-warm-400 py-2">
                        No users stuck at this stage.
                      </p>
                    ) : (
                      <div className="space-y-1.5 mt-1">
                        {/* Table header */}
                        <div className="grid grid-cols-[1fr_1.2fr_0.6fr_0.6fr] gap-2 px-3 py-1.5">
                          <span className="text-xs font-medium text-warm-400 uppercase tracking-wide">
                            Name
                          </span>
                          <span className="text-xs font-medium text-warm-400 uppercase tracking-wide">
                            Email
                          </span>
                          <span className="text-xs font-medium text-warm-400 uppercase tracking-wide">
                            Days Since Signup
                          </span>
                          <span className="text-xs font-medium text-warm-400 uppercase tracking-wide">
                            Last Active
                          </span>
                        </div>

                        {/* User rows */}
                        {stageGroup.users.map((user) => (
                          <div
                            key={user.id}
                            className={cn(
                              'grid grid-cols-[1fr_1.2fr_0.6fr_0.6fr] gap-2 px-3 py-2 rounded-lg border',
                              getUrgencyClass(user.daysSinceSignup)
                            )}
                          >
                            <span className="text-sm font-medium text-warm-900 truncate">
                              {user.name}
                            </span>
                            <span className="text-sm text-warm-500 truncate">
                              {user.email}
                            </span>
                            <span
                              className={cn(
                                'text-sm font-medium',
                                getUrgencyTextClass(user.daysSinceSignup)
                              )}
                            >
                              {user.daysSinceSignup}d
                            </span>
                            <span className="text-sm text-warm-500">
                              {formatLastActive(user.lastActiveAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
