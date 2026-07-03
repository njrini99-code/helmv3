'use client';

import { cn } from '@/lib/utils';
import { IconUsers } from '@/components/icons';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { Button } from '@/components/ui/button';

interface Props {
  teams: AdminDashboardData['userActivity']['teams'];
  onSelectTeam?: (teamId: string) => void;
}

const healthColors = {
  healthy: 'bg-primary-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

const healthBgColors = {
  healthy: 'bg-primary-50/50 border-primary-200/30',
  warning: 'bg-amber-50/50 border-amber-200/30',
  critical: 'bg-red-50/50 border-red-200/30',
};

export function TeamHealthCards({ teams, onSelectTeam }: Props) {
  if (teams.length === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {teams.map((team) => {
        const activePct = team.memberCount > 0
          ? Math.round((team.activeCount / team.memberCount) * 100)
          : 0;

        return (
          <Button variant="ghost"
            key={team.teamId}
            onClick={() => onSelectTeam?.(team.teamId)}
            className={cn(
              'relative text-left p-4 rounded-2xl border transition-all duration-200',
              'glass-standard shadow-glass',
              'hover:shadow-card-hover hover:bg-cream-100 active:bg-cream-100',
              'group cursor-pointer'
            )}
          >
            {/* Health dot */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={cn(
                  'w-8 h-8 rounded-xl flex items-center justify-center',
                  healthBgColors[team.healthStatus]
                )}>
                  <IconUsers size={14} className="text-warm-600" />
                </div>
                <div className="relative">
                  <div className={cn('w-2.5 h-2.5 rounded-full', healthColors[team.healthStatus])} />
                  {team.healthStatus === 'healthy' && (
                    <div className={cn(
                      'absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-50',
                      healthColors[team.healthStatus]
                    )} />
                  )}
                </div>
              </div>
            </div>

            {/* Team name */}
            <h4 className="text-sm font-semibold text-warm-900 line-clamp-1 mb-1">{team.teamName}</h4>

            {/* Stats */}
            <div className="flex items-center gap-3 text-label text-warm-400">
              <span className="tabular-nums">{team.memberCount} members</span>
              <span className="text-warm-200">·</span>
              <span className={cn(
                'tabular-nums font-medium',
                activePct > 50 ? 'text-primary-600' : activePct > 25 ? 'text-amber-600' : 'text-red-500'
              )}>
                {activePct}% active
              </span>
            </div>

            {/* Activity bar */}
            <div className="mt-3 h-1 rounded-full bg-warm-100 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  activePct > 50 ? 'bg-primary-400' : activePct > 25 ? 'bg-amber-400' : 'bg-red-400'
                )}
                style={{ width: `${Math.max(activePct, 3)}%` }}
              />
            </div>
          </Button>
        );
      })}
    </div>
  );
}
