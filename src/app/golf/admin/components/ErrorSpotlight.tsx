'use client';

import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { timeAgo } from './admin-utils';

interface Props {
  errorDetection: AdminDashboardData['errorDetection'];
  errorLogs: AdminDashboardData['errorLogs'];
}

export function ErrorSpotlight({ errorDetection, errorLogs }: Props) {
  const { allClear, errors24h, errors7d, unresolvedErrors, userExperienceIssues } = errorDetection;

  return (
    <div className={cn(
      'bg-white/70 backdrop-blur-xl',
      'border border-white/20 rounded-2xl',
      'shadow-glass',
      'p-5 md:p-6',
      'h-full'
    )}>
      <div className="flex items-center gap-2 mb-4">
        <div className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center',
          allClear ? 'bg-primary-50' : 'bg-red-50'
        )}>
          {allClear ? (
            <CheckCircle2 size={16} className="text-primary-600" />
          ) : (
            <AlertTriangle size={16} className="text-red-600" />
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-warm-900">Error Spotlight</h3>
          <p className="text-xs text-warm-400">Last 7 days</p>
        </div>
      </div>

      {allClear ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary-50 flex items-center justify-center mb-3">
            <CheckCircle2 size={24} className="text-primary-500" />
          </div>
          <p className="text-sm font-medium text-primary-700">All Clear</p>
          <p className="text-xs text-warm-400 mt-1">No errors detected in the last 7 days</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/50 rounded-xl p-3 text-center border border-white/30">
              <p className={cn(
                'text-xl font-bold tabular-nums',
                errors24h > 0 ? 'text-red-600' : 'text-warm-900'
              )}>{errors24h}</p>
              <p className="text-[10px] text-warm-400 uppercase tracking-wider mt-0.5">24h</p>
            </div>
            <div className="bg-white/50 rounded-xl p-3 text-center border border-white/30">
              <p className={cn(
                'text-xl font-bold tabular-nums',
                errors7d > 5 ? 'text-amber-600' : 'text-warm-900'
              )}>{errors7d}</p>
              <p className="text-[10px] text-warm-400 uppercase tracking-wider mt-0.5">7 days</p>
            </div>
            <div className="bg-white/50 rounded-xl p-3 text-center border border-white/30">
              <p className={cn(
                'text-xl font-bold tabular-nums',
                unresolvedErrors > 0 ? 'text-red-600' : 'text-warm-900'
              )}>{unresolvedErrors}</p>
              <p className="text-[10px] text-warm-400 uppercase tracking-wider mt-0.5">Unresolved</p>
            </div>
          </div>

          {/* UX Impact */}
          {(userExperienceIssues.chunkLoadErrors > 0 || userExperienceIssues.frameworkWarnings > 0 || userExperienceIssues.serverErrors > 0) && (
            <div>
              <p className="text-[10px] text-warm-400 uppercase tracking-wider font-medium mb-2">UX Impact</p>
              <div className="space-y-1">
                {userExperienceIssues.frameworkWarnings > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-amber-50/50">
                    <span className="text-xs text-warm-600">Framework Warnings</span>
                    <span className="text-xs font-semibold text-amber-600 tabular-nums">{userExperienceIssues.frameworkWarnings}</span>
                  </div>
                )}
                {userExperienceIssues.chunkLoadErrors > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-red-50/50">
                    <span className="text-xs text-warm-600">Chunk Load Errors</span>
                    <span className="text-xs font-semibold text-red-600 tabular-nums">{userExperienceIssues.chunkLoadErrors}</span>
                  </div>
                )}
                {userExperienceIssues.serverErrors > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-red-50/50">
                    <span className="text-xs text-warm-600">Server Errors</span>
                    <span className="text-xs font-semibold text-red-600 tabular-nums">{userExperienceIssues.serverErrors}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Top errors */}
          {errorLogs.topErrors.length > 0 && (
            <div>
              <p className="text-[10px] text-warm-400 uppercase tracking-wider font-medium mb-2">Top Errors</p>
              <div className="space-y-1.5">
                {errorLogs.topErrors.slice(0, 3).map((err, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-warm-50/50 transition-colors">
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0',
                      err.severity === 'critical' ? 'bg-red-500' : err.severity === 'warning' ? 'bg-amber-500' : 'bg-warm-300'
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-warm-700 line-clamp-1">{err.message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-warm-400 tabular-nums">{err.occurrences}×</span>
                        <Clock size={10} className="text-warm-300" />
                        <span className="text-[10px] text-warm-400">{timeAgo(err.lastSeen)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
