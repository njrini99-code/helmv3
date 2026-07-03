'use client';

import { useState } from 'react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { timeAgo } from './admin-utils';
import { Button } from '@/components/ui/button';

interface Props {
  auditLog: AdminDashboardData['auditLog'];
  loginSecurity: AdminDashboardData['loginSecurity'];
}

type AuditFilter = 'all' | 'admin';

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <path
        d="M8 1.5L2.5 3.5V7.5C2.5 10.82 4.86 13.88 8 14.5C11.14 13.88 13.5 10.82 13.5 7.5V3.5L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <rect
        x="3.5"
        y="7"
        width="9"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5 7V5C5 3.34 6.34 2 8 2C9.66 2 11 3.34 11 5V7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 text-primary-500"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5.5 8L7 9.5L10.5 6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DiffSection({ oldData, newData }: { oldData: Record<string, unknown> | null; newData: Record<string, unknown> | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!oldData && !newData) return null;

  const allKeys = new Set<string>([
    ...Object.keys(oldData ?? {}),
    ...Object.keys(newData ?? {}),
  ]);

  if (allKeys.size === 0) return null;

  return (
    <div className="mt-1.5">
      <Button variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className="text-label text-warm-400 hover:text-warm-600 transition-colors flex items-center gap-1"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={cn('transition-transform', expanded && 'rotate-90')}
        >
          <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
        {expanded ? 'Hide' : 'Show'} changes
      </Button>
      {expanded && (
        <div className="mt-1.5 bg-warm-50/50 rounded-lg p-2 text-label font-mono space-y-0.5 max-h-[120px] overflow-y-auto">
          {[...allKeys].map((key) => {
            const oldVal = oldData?.[key];
            const newVal = newData?.[key];
            const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
            if (!changed) return null;
            return (
              <div key={key} className="flex flex-col">
                <span className="text-warm-500 font-medium">{key}:</span>
                {oldVal !== undefined && (
                  <span className="text-red-400 pl-2">- {JSON.stringify(oldVal)}</span>
                )}
                {newVal !== undefined && (
                  <span className="text-primary-500 pl-2">+ {JSON.stringify(newVal)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const ADMIN_KEYWORDS = ['admin', 'delete', 'update'];

export function AuditFeed({ auditLog, loginSecurity }: Props) {
  const [filter, setFilter] = useState<AuditFilter>('all');

  const filteredEvents = filter === 'all'
    ? auditLog.recentEvents
    : auditLog.recentEvents.filter((e) =>
        ADMIN_KEYWORDS.some((kw) => e.action.toLowerCase().includes(kw))
      );

  return (
    <div className="space-y-6">
      {/* Section 1: Audit Log */}
      <div className="glass-standard rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
              <ShieldIcon />
            </div>
            <h3 className="text-lg font-semibold text-warm-900">Audit Log</h3>
            <span className="text-xs font-medium bg-warm-100 text-warm-600 px-2 py-0.5 rounded-full tabular-nums">
              {auditLog.totalEvents7d} events (7d)
            </span>
          </div>
          <div className="flex gap-1 glass-subtle rounded-lg p-0.5">
            <Button variant="ghost"
              onClick={() => setFilter('all')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                filter === 'all'
                  ? 'bg-cream-50 shadow-sm text-warm-800'
                  : 'text-warm-400 hover:text-warm-600'
              )}
            >
              All
            </Button>
            <Button variant="ghost"
              onClick={() => setFilter('admin')}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                filter === 'admin'
                  ? 'bg-cream-50 shadow-sm text-warm-800'
                  : 'text-warm-400 hover:text-warm-600'
              )}
            >
              Admin Actions
            </Button>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-warm-400">No audit events recorded yet</p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto space-y-0 pr-1 -mr-1">
            {filteredEvents.map((event, i) => (
              <div
                key={event.id}
                className="flex items-start gap-3 py-2.5 relative"
              >
                {/* Timeline connector */}
                {i < filteredEvents.length - 1 && (
                  <div className="absolute left-[11px] top-10 bottom-0 w-px bg-warm-100" />
                )}
                {/* Dot */}
                <div className="w-[22px] h-[22px] rounded-full bg-warm-100 flex items-center justify-center shrink-0 relative z-10">
                  <div className="w-2 h-2 rounded-full bg-warm-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-warm-700 truncate">
                      {event.userEmail ?? 'System'}
                    </p>
                    <span className="text-xs text-warm-400 shrink-0 tabular-nums">
                      {timeAgo(event.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-warm-500 mt-0.5">
                    performed{' '}
                    <span className="font-medium text-warm-600">
                      {formatAction(event.action)}
                    </span>
                    {event.tableName && (
                      <>
                        {' '}on{' '}
                        <span className="font-mono text-xs bg-warm-50 px-1 py-0.5 rounded text-warm-500">
                          {event.tableName}
                        </span>
                      </>
                    )}
                  </p>
                  <DiffSection oldData={event.oldData} newData={event.newData} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Login Security */}
      <div className="glass-standard rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
            <LockIcon />
          </div>
          <h3 className="text-lg font-semibold text-warm-900">Login Security</h3>
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center gap-1.5 bg-warm-50 rounded-full px-3 py-1.5">
            <span className="text-xs text-warm-500">Failed logins (7d)</span>
            <span className={cn(
              'text-xs font-semibold tabular-nums',
              loginSecurity.failedLogins7d > 0 ? 'text-amber-600' : 'text-warm-600'
            )}>
              {loginSecurity.failedLogins7d}
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-warm-50 rounded-full px-3 py-1.5">
            <span className="text-xs text-warm-500">Locked accounts</span>
            <span className={cn(
              'text-xs font-semibold tabular-nums',
              loginSecurity.lockedAccounts > 0 ? 'text-red-600' : 'text-warm-600'
            )}>
              {loginSecurity.lockedAccounts}
            </span>
          </div>
        </div>

        {loginSecurity.recentAttempts.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-6">
            <CheckCircleIcon />
            <p className="text-sm text-primary-600 font-medium">No suspicious login activity</p>
          </div>
        ) : (
          <div className="space-y-2">
            {loginSecurity.recentAttempts.map((attempt) => {
              const isLocked = attempt.lockedUntil && new Date(attempt.lockedUntil) > new Date();
              return (
                <div
                  key={attempt.email}
                  className="flex items-center justify-between py-2 border-b border-warm-50 last:border-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-red-500">
                        {attempt.email.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-warm-700 font-medium truncate">
                        {attempt.email}
                      </p>
                      <p className="text-xs text-warm-400">
                        {attempt.failedAttempts} failed attempt{attempt.failedAttempts !== 1 ? 's' : ''}
                        {attempt.lastAttempt && (
                          <> &middot; last {timeAgo(attempt.lastAttempt)}</>
                        )}
                      </p>
                    </div>
                  </div>
                  {isLocked && (
                    <span className="text-label font-medium bg-red-100 text-red-600 px-2 py-0.5 rounded-full shrink-0 ml-2">
                      Locked
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
