'use client';

import { useMemo, useState } from 'react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';

interface RecentActivityFeedProps {
  activity: AdminDashboardData['activity'];
}

type FeedItemKind = 'round' | 'error' | 'login' | 'signup' | 'insight' | 'audit';

interface FeedItem {
  id: string;
  kind: FeedItemKind;
  text: string;
  detail?: string | null;
  timestamp: string;
  /** For round items: to-par value for color coding */
  toPar?: number | null;
  /** For round items: raw score for bold display */
  score?: number | null;
}

const VISIBLE_LIMIT = 15;

function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Simplify React/Next.js minified error messages to something human-readable */
function simplifyErrorMessage(text: string): string {
  // Strip minified React errors
  if (text.includes('Minified React error')) {
    const match = text.match(/Minified React error #(\d+)/);
    return match ? `React error #${match[1]}` : 'React runtime error';
  }
  // Strip long stack traces
  if (text.length > 100) {
    return text.slice(0, 100) + '\u2026';
  }
  return text;
}

export function RecentActivityFeed({ activity }: RecentActivityFeedProps) {
  const [showAll, setShowAll] = useState(false);

  const allItems = useMemo(() => {
    const feed: FeedItem[] = [];

    // Round events
    for (const r of activity.recentRounds) {
      if (!r.created_at) continue;
      const toPar =
        r.total_to_par != null
          ? r.total_to_par === 0
            ? 'E'
            : r.total_to_par > 0
              ? `+${r.total_to_par}`
              : String(r.total_to_par)
          : null;
      const scoreStr = r.total_score != null ? String(r.total_score) : 'in progress';
      const courseStr = r.course_name ? ` at ${r.course_name}` : '';
      feed.push({
        id: `round-${r.id}`,
        kind: 'round',
        text: `${r.player_name} shot ${scoreStr}${toPar ? ` (${toPar})` : ''}${courseStr}`,
        timestamp: r.created_at,
        toPar: r.total_to_par,
        score: r.total_score,
      });
    }

    // Signup events
    for (const s of activity.recentSignups) {
      if (!s.created_at) continue;
      feed.push({
        id: `signup-${s.id}`,
        kind: 'signup',
        text: `${s.email} signed up`,
        detail: s.role,
        timestamp: s.created_at,
      });
    }

    // Error / admin events
    for (const e of activity.recentAdminEvents) {
      const isError = e.severity === 'error' || e.severity === 'critical';
      feed.push({
        id: `event-${e.id}`,
        kind: isError ? 'error' : 'audit',
        text: isError ? simplifyErrorMessage(e.title) : e.title,
        detail: e.message ? simplifyErrorMessage(e.message.slice(0, 120)) : null,
        timestamp: e.createdAt,
      });
    }

    // Insight events
    for (const ins of activity.recentInsights) {
      if (!ins.created_at) continue;
      feed.push({
        id: `insight-${ins.id}`,
        kind: 'insight',
        text: `${ins.insights_generated ?? 0} insight${(ins.insights_generated ?? 0) !== 1 ? 's' : ''} generated`,
        detail: ins.insight_type,
        timestamp: ins.created_at,
      });
    }

    // Sort by timestamp descending
    feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return feed;
  }, [activity]);

  if (allItems.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-warm-400">No recent activity</p>
      </div>
    );
  }

  const hasMore = allItems.length > VISIBLE_LIMIT;
  const items = showAll ? allItems : allItems.slice(0, VISIBLE_LIMIT);

  // Group by day
  const grouped = new Map<string, FeedItem[]>();
  for (const item of items) {
    const dayKey = getDayLabel(item.timestamp);
    const existing = grouped.get(dayKey);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(dayKey, [item]);
    }
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([day, dayItems]) => (
        <div key={day}>
          {/* Date header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-warm-200/60" />
            <span className="text-xs font-medium text-warm-400 px-2 py-0.5 rounded-full bg-warm-100/60">
              {day}
            </span>
            <div className="flex-1 h-px bg-warm-200/60" />
          </div>

          {/* Items */}
          <div className="space-y-1">
            {dayItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-start justify-between gap-3 px-3 py-2 rounded-lg',
                  item.kind === 'error' && 'bg-red-50/40',
                  item.kind === 'signup' && 'text-green-800',
                  item.kind === 'login' && 'opacity-60'
                )}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm break-words',
                      item.kind === 'error' ? 'text-red-800' : 'text-warm-800',
                      item.kind === 'login' && 'text-warm-400 text-xs'
                    )}
                  >
                    {item.kind === 'round' && item.score != null ? (
                      <>
                        {item.text.split(String(item.score))[0]}
                        <span
                          className={cn(
                            'font-bold',
                            item.toPar != null && item.toPar < 0
                              ? 'text-green-700'
                              : item.toPar != null && item.toPar > 0
                                ? 'text-amber-700'
                                : 'text-warm-900'
                          )}
                        >
                          {item.score}
                        </span>
                        {item.text.split(String(item.score)).slice(1).join(String(item.score))}
                      </>
                    ) : (
                      item.text
                    )}
                  </p>
                  {item.detail && (
                    <p className="text-xs text-warm-400 mt-0.5 truncate">{item.detail}</p>
                  )}
                </div>
                <span className="text-xs text-warm-400 whitespace-nowrap flex-shrink-0 tabular-nums pt-0.5">
                  {timeAgo(item.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Show more link */}
      {hasMore && !showAll && (
        <div className="text-center pt-1">
          <button
            onClick={() => setShowAll(true)}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-primary-50/60"
          >
            Show {allItems.length - VISIBLE_LIMIT} more items
          </button>
        </div>
      )}
    </div>
  );
}
