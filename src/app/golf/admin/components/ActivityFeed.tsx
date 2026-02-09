'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { IconUser, IconTarget, IconSparkles } from '@/components/icons';

interface Props {
  activity: AdminDashboardData['activity'];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ActivityFeed({ activity }: Props) {
  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <h3 className="text-lg font-semibold text-warm-900 mb-5">Live Activity Feed</h3>

      {/* Recent signups */}
      <div className="mb-5">
        <h4 className="text-sm font-medium text-warm-500 mb-3 flex items-center gap-1.5">
          <IconUser size={14} />
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

      {/* Recent rounds */}
      <div className="mb-5">
        <h4 className="text-sm font-medium text-warm-500 mb-3 flex items-center gap-1.5">
          <IconTarget size={14} />
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
                  {r.round_type && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-warm-100 text-warm-500">
                      {r.round_type}
                    </span>
                  )}
                  <span className="text-xs text-warm-400">{timeAgo(r.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent insights */}
      <div>
        <h4 className="text-sm font-medium text-warm-500 mb-3 flex items-center gap-1.5">
          <IconSparkles size={14} />
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
    </div>
  );
}
