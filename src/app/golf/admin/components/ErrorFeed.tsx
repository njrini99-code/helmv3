'use client';

import { useState } from 'react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { timeAgo } from './admin-utils';

interface Props {
  errorLogs: AdminDashboardData['errorLogs'];
}

const severityStyles: Record<string, { border: string; badge: string }> = {
  critical: {
    border: 'border-l-red-500',
    badge: 'bg-red-50 text-red-700',
  },
  error: {
    border: 'border-l-red-400',
    badge: 'bg-red-50/70 text-red-600',
  },
  warning: {
    border: 'border-l-amber-400',
    badge: 'bg-amber-50 text-amber-700',
  },
  info: {
    border: 'border-l-blue-400',
    badge: 'bg-blue-50 text-blue-700',
  },
};

function getSeverityStyle(severity: string): { border: string; badge: string } {
  return severityStyles[severity] ?? severityStyles['error']!;
}

type ViewMode = 'recent' | 'top';

export function ErrorFeed({ errorLogs }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('recent');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { totalErrors7d, criticalErrors7d, recentErrors, topErrors } = errorLogs;

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-red-500">
              <path
                d="M8 1C4.134 1 1 4.134 1 8s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7Zm-.5 3a.5.5 0 0 1 1 0v4a.5.5 0 0 1-1 0V4Zm.5 7.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-warm-900">Error Feed</h3>
          {totalErrors7d > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 tabular-nums">
              {totalErrors7d} total
            </span>
          )}
          {criticalErrors7d > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 tabular-nums">
              {criticalErrors7d} critical
            </span>
          )}
        </div>

        <div className="flex gap-1 bg-white/50 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('recent')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
              viewMode === 'recent' ? 'bg-white shadow-sm text-warm-800' : 'text-warm-400 hover:text-warm-600'
            )}
          >
            Recent Errors
          </button>
          <button
            onClick={() => setViewMode('top')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
              viewMode === 'top' ? 'bg-white shadow-sm text-warm-800' : 'text-warm-400 hover:text-warm-600'
            )}
          >
            Top Errors
          </button>
        </div>
      </div>

      {/* Recent Errors View */}
      {viewMode === 'recent' && (
        <>
          {recentErrors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-3">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-green-500">
                  <path
                    d="M8 1C4.134 1 1 4.134 1 8s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7Zm3.354 5.354-4 4a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L7 9.293l3.646-3.647a.5.5 0 0 1 .708.708Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-green-700">No errors in the last 7 days</p>
              <p className="text-xs text-warm-400 mt-1">Everything is running smoothly</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1 -mr-1">
              {recentErrors.map((err) => {
                const style = getSeverityStyle(err.severity);
                const isExpanded = expandedId === err.id;

                return (
                  <div
                    key={err.id}
                    className={cn(
                      'border-l-[3px] rounded-r-lg px-3 py-2.5 bg-white/50 transition-all',
                      style.border
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-warm-900 line-clamp-2 leading-snug">{err.message}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded', style.badge)}>
                            {err.severity}
                          </span>
                          {err.occurrences > 1 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warm-100 text-warm-500 tabular-nums">
                              {err.occurrences}x
                            </span>
                          )}
                          <span className="text-[11px] text-warm-400 tabular-nums">{timeAgo(err.createdAt)}</span>
                        </div>
                        {err.url && (
                          <p className="text-xs text-warm-400 truncate mt-1">{err.url}</p>
                        )}
                        {err.userEmail && (
                          <p className="text-xs text-warm-500 mt-0.5">{err.userEmail}</p>
                        )}
                      </div>
                      {err.stack && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : err.id)}
                          className="shrink-0 text-xs text-warm-400 hover:text-warm-600 transition-colors px-1.5 py-0.5 rounded hover:bg-warm-50"
                        >
                          {isExpanded ? 'Hide' : 'Stack'}
                        </button>
                      )}
                    </div>
                    {isExpanded && err.stack && (
                      <pre className="mt-2 text-xs font-mono text-warm-600 bg-warm-50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                        {err.stack}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Top Errors View */}
      {viewMode === 'top' && (
        <>
          {topErrors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mb-3">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-green-500">
                  <path
                    d="M8 1C4.134 1 1 4.134 1 8s3.134 7 7 7 7-3.134 7-7-3.134-7-7-7Zm3.354 5.354-4 4a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L7 9.293l3.646-3.647a.5.5 0 0 1 .708.708Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-green-700">No errors in the last 7 days</p>
              <p className="text-xs text-warm-400 mt-1">Everything is running smoothly</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1 -mr-1">
              {[...topErrors]
                .sort((a, b) => b.occurrences - a.occurrences)
                .map((err, i) => {
                  const style = getSeverityStyle(err.severity);

                  return (
                    <div
                      key={`top-${i}`}
                      className={cn(
                        'border-l-[3px] rounded-r-lg px-3 py-2.5 bg-white/50 transition-all',
                        style.border
                      )}
                    >
                      <p className="text-sm text-warm-900 line-clamp-2 leading-snug">{err.message}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded', style.badge)}>
                          {err.severity}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-warm-100 text-warm-600 tabular-nums">
                          {err.occurrences} occurrences
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 tabular-nums">
                          {err.affectedUsers} user{err.affectedUsers !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] text-warm-400">
                          First: {timeAgo(err.firstSeen)}
                        </span>
                        <span className="text-[11px] text-warm-400">
                          Last: {timeAgo(err.lastSeen)}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
