'use client';

import { useState, useMemo } from 'react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { User, Target, Sparkles } from 'lucide-react';
import { timeAgo } from './admin-utils';

interface Props {
  activity: AdminDashboardData['activity'];
}

type ViewMode = 'sections' | 'timeline';

interface TimelineItem {
  id: string;
  type: 'signup' | 'round' | 'insight';
  title: string;
  detail: string | null;
  timestamp: string | null;
}

const typeIcons = {
  signup: <User size={12} />,
  round: <Target size={12} />,
  insight: <Sparkles size={12} />,
};

const typeColors = {
  signup: 'bg-blue-100 text-blue-600',
  round: 'bg-primary-100 text-primary-700',
  insight: 'bg-purple-100 text-purple-600',
};

export function ActivityFeed({ activity }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    for (const u of activity.recentSignups) {
      items.push({
        id: `signup-${u.id}`,
        type: 'signup',
        title: u.email,
        detail: u.role,
        timestamp: u.created_at,
      });
    }

    for (const r of activity.recentRounds) {
      const scoreStr = r.total_score != null ? `${r.total_score}` : '';
      const parStr = r.total_to_par != null
        ? r.total_to_par > 0 ? ` (+${r.total_to_par})` : r.total_to_par === 0 ? ' (E)' : ` (${r.total_to_par})`
        : '';
      items.push({
        id: `round-${r.id}`,
        type: 'round',
        title: r.player_name,
        detail: `${scoreStr}${parStr}${r.course_name ? ` at ${r.course_name}` : ''}`,
        timestamp: r.created_at,
      });
    }

    for (const ins of activity.recentInsights) {
      items.push({
        id: `insight-${ins.id}`,
        type: 'insight',
        title: ins.insight_type || 'Insight',
        detail: ins.insights_generated != null ? `${ins.insights_generated} generated` : null,
        timestamp: ins.created_at,
      });
    }

    return items.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [activity]);

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-warm-900">Live Activity Feed</h3>
        <div className="flex gap-1 bg-white/50 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('timeline')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
              viewMode === 'timeline' ? 'bg-white shadow-sm text-warm-800' : 'text-warm-400 hover:text-warm-600'
            )}
          >
            Timeline
          </button>
          <button
            onClick={() => setViewMode('sections')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
              viewMode === 'sections' ? 'bg-white shadow-sm text-warm-800' : 'text-warm-400 hover:text-warm-600'
            )}
          >
            By Type
          </button>
        </div>
      </div>

      {viewMode === 'timeline' ? (
        <div className="space-y-0">
          {timelineItems.slice(0, 15).map((item, i) => (
            <div
              key={item.id}
              className="flex items-start gap-3 py-2 relative"
            >
              {/* Timeline line */}
              {i < Math.min(timelineItems.length, 15) - 1 && (
                <div className="absolute left-[11px] top-8 bottom-0 w-px bg-warm-100" />
              )}
              {/* Dot */}
              <div className={cn('w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 relative z-10', typeColors[item.type])}>
                {typeIcons[item.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-warm-700 font-medium truncate">{item.title}</p>
                  <span className="text-[11px] text-warm-400 shrink-0 tabular-nums">{timeAgo(item.timestamp)}</span>
                </div>
                {item.detail && (
                  <p className="text-xs text-warm-400 truncate mt-0.5">{item.detail}</p>
                )}
              </div>
            </div>
          ))}
          {timelineItems.length === 0 && (
            <p className="text-sm text-warm-400 py-4 text-center">No recent activity</p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-5">
            <h4 className="text-sm font-medium text-warm-500 mb-3 flex items-center gap-1.5">
              <User size={14} />
              Latest Signups
            </h4>
            {activity.recentSignups.length === 0 ? (
              <p className="text-sm text-warm-400">No recent signups</p>
            ) : (
              <div className="space-y-2">
                {activity.recentSignups.map((u) => (
                  <div key={u.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-primary-700">
                          {u.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="text-warm-700 truncate">{u.email}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {u.role && (
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded',
                          u.role === 'coach' ? 'bg-blue-50 text-blue-600' :
                          u.role === 'player' ? 'bg-primary-50 text-primary-700' :
                          'bg-warm-100 text-warm-500'
                        )}>
                          {u.role}
                        </span>
                      )}
                      <span className="text-xs text-warm-400">{timeAgo(u.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-5">
            <h4 className="text-sm font-medium text-warm-500 mb-3 flex items-center gap-1.5">
              <Target size={14} />
              Latest Rounds
            </h4>
            {activity.recentRounds.length === 0 ? (
              <p className="text-sm text-warm-400">No recent rounds</p>
            ) : (
              <div className="space-y-2">
                {activity.recentRounds.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <span className="text-warm-700 font-medium">{r.player_name}</span>
                      {r.course_name && (
                        <span className="text-warm-400 ml-1.5 text-xs">at {r.course_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {r.total_score != null && (
                        <span className="text-sm font-semibold text-warm-700 tabular-nums">
                          {r.total_score}
                        </span>
                      )}
                      {r.total_to_par != null && (
                        <span className={cn(
                          'text-xs font-medium tabular-nums px-1.5 py-0.5 rounded',
                          (r.total_to_par as number) < 0 ? 'bg-red-50 text-red-600' :
                          (r.total_to_par as number) === 0 ? 'bg-warm-100 text-warm-600' :
                          'bg-blue-50 text-blue-600'
                        )}>
                          {(r.total_to_par as number) > 0 ? `+${r.total_to_par}` : (r.total_to_par as number) === 0 ? 'E' : r.total_to_par}
                        </span>
                      )}
                      <span className="text-xs text-warm-400">{timeAgo(r.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-sm font-medium text-warm-500 mb-3 flex items-center gap-1.5">
              <Sparkles size={14} />
              Latest AI Insights
            </h4>
            {activity.recentInsights.length === 0 ? (
              <p className="text-sm text-warm-400">No recent insights</p>
            ) : (
              <div className="space-y-2">
                {activity.recentInsights.map((ins) => (
                  <div key={ins.id} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <span className="text-warm-700">{ins.insight_type || 'Insight'}</span>
                      {ins.insights_generated != null && (
                        <span className="text-warm-400 ml-1.5 text-xs">
                          ({ins.insights_generated} generated)
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-warm-400 shrink-0 ml-2">
                      {timeAgo(ins.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
