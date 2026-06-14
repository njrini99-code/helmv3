'use client';

import { useMemo, useState } from 'react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
  /** Sort priority — lower = shown first (rounds/signups before errors) */
  sortPriority: number;
}

const VISIBLE_LIMIT = 15;

/**
 * Pattern-miner threshold-starvation events fire once per player per analyze
 * pass and overwhelm the feed. We collapse 2+ within the same UTC hour into a
 * single row showing the bucket count. The original rows remain in
 * admin_events for forensic queries.
 */
const PATTERN_MINER_PREFIX = '[pattern-miner.thresholds.starvation]';

function isPatternMinerStarvation(item: { kind: FeedItemKind; text: string; detail?: string | null }): boolean {
  if (item.kind !== 'error' && item.kind !== 'audit') return false;
  if (item.text.includes(PATTERN_MINER_PREFIX)) return true;
  if (item.detail && item.detail.includes(PATTERN_MINER_PREFIX)) return true;
  return false;
}

function hourBucketKey(iso: string): string {
  // Truncate to the hour in UTC for stable grouping irrespective of TZ.
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

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

/** Kind icons rendered as small colored dots */
function KindDot({ kind }: { kind: FeedItemKind }) {
  const color =
    kind === 'round'
      ? 'bg-primary-400'
      : kind === 'signup'
        ? 'bg-blue-400'
        : kind === 'insight'
          ? 'bg-purple-400'
          : kind === 'error'
            ? 'bg-red-300'
            : kind === 'audit'
              ? 'bg-warm-300'
              : 'bg-warm-200';
  return <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5', color)} />;
}

export function RecentActivityFeed({ activity }: RecentActivityFeedProps) {
  const [showAll, setShowAll] = useState(false);

  const allItems = useMemo(() => {
    const feed: FeedItem[] = [];

    // Round events — priority 0 (highest)
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
        sortPriority: 0,
      });
    }

    // Signup events — priority 1
    for (const s of activity.recentSignups) {
      if (!s.created_at) continue;
      feed.push({
        id: `signup-${s.id}`,
        kind: 'signup',
        text: `${s.email} signed up`,
        detail: s.role,
        timestamp: s.created_at,
        sortPriority: 1,
      });
    }

    // Insight events — priority 2
    for (const ins of activity.recentInsights) {
      if (!ins.created_at) continue;
      feed.push({
        id: `insight-${ins.id}`,
        kind: 'insight',
        text: `${ins.insights_generated ?? 0} insight${(ins.insights_generated ?? 0) !== 1 ? 's' : ''} generated`,
        detail: ins.insight_type,
        timestamp: ins.created_at,
        sortPriority: 2,
      });
    }

    // Admin / error events — priority 3 (errors) or 2 (audit)
    for (const e of activity.recentAdminEvents) {
      const isError = e.severity === 'error' || e.severity === 'critical';
      feed.push({
        id: `event-${e.id}`,
        kind: isError ? 'error' : 'audit',
        text: isError ? simplifyErrorMessage(e.title) : e.title,
        detail: e.message ? simplifyErrorMessage(e.message.slice(0, 120)) : null,
        timestamp: e.createdAt,
        sortPriority: isError ? 3 : 2,
      });
    }

    // Collapse pattern-miner threshold-starvation spam: when 2+ rows fall in
    // the same hour bucket, render ONE row with the player count. Original
    // rows stay in admin_events for debugging.
    const patternMinerBuckets = new Map<string, FeedItem[]>();
    const collapsed: FeedItem[] = [];
    for (const item of feed) {
      if (isPatternMinerStarvation(item)) {
        const key = hourBucketKey(item.timestamp);
        const bucket = patternMinerBuckets.get(key);
        if (bucket) {
          bucket.push(item);
        } else {
          patternMinerBuckets.set(key, [item]);
        }
        continue;
      }
      collapsed.push(item);
    }
    for (const [key, bucket] of patternMinerBuckets) {
      const head = bucket[0];
      if (!head) continue;
      if (bucket.length === 1) {
        collapsed.push(head);
        continue;
      }
      // Newest timestamp wins for the surfaced row; sortPriority/kind/style
      // mirror the source rows so it visually slots in with other audit lines.
      let newest: FeedItem = head;
      for (const cur of bucket) {
        if (new Date(cur.timestamp).getTime() > new Date(newest.timestamp).getTime()) {
          newest = cur;
        }
      }
      const playerCount = bucket.length;
      collapsed.push({
        id: `pattern-miner-bucket-${key}`,
        kind: 'audit',
        text: `Pattern miner produced 0 patterns for ${playerCount} players (last 1h)`,
        detail: 'pattern-miner.thresholds.starvation',
        timestamp: newest.timestamp,
        sortPriority: 2,
      });
    }
    feed.length = 0;
    feed.push(...collapsed);

    // Sort: within same day, show rounds/signups first (lower sortPriority),
    // then by timestamp descending
    feed.sort((a, b) => {
      // First group by day
      const dayA = new Date(a.timestamp).toDateString();
      const dayB = new Date(b.timestamp).toDateString();
      if (dayA !== dayB) {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      }
      // Within the same day, sort by priority first
      if (a.sortPriority !== b.sortPriority) {
        return a.sortPriority - b.sortPriority;
      }
      // Then by timestamp descending
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return feed;
  }, [activity]);

  if (allItems.length === 0) {
    return (
      <div className="glass-premium rounded-2xl p-8 text-center">
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
    <div className="glass-premium rounded-2xl p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-warm-400 mb-4">
        Recent Activity
      </h3>

      <div className="space-y-5">
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
                    'flex items-start gap-2.5 px-3 py-2 rounded-lg transition-colors',
                    item.kind === 'error' && 'opacity-50',
                    item.kind === 'signup' && 'bg-blue-50/30',
                    item.kind === 'round' && 'bg-primary-50/20',
                    item.kind === 'login' && 'opacity-40'
                  )}
                >
                  <KindDot kind={item.kind} />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm break-words',
                        item.kind === 'error' ? 'text-warm-500 text-xs' : 'text-warm-800',
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
                                ? 'text-primary-700'
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
            <Button variant="primary"
              onClick={() => setShowAll(true)}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-primary-50/60"
            >
              Show {allItems.length - VISIBLE_LIMIT} more items
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
