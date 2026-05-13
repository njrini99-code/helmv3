'use client';

import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton-loader';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconActivity,
  IconVideo,
  IconCheck,
  IconChart,
  IconUsers,
  IconMessage,
} from '@/components/icons';
import { formatRelativeTime } from '@/lib/utils';
import type { TeamActivity } from '@/app/baseball/actions/team-dashboard';

interface TeamActivityFeedProps {
  data: TeamActivity[];
  loading?: boolean;
}

const activityConfig: Record<TeamActivity['type'], {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  bgColor: string;
}> = {
  video_upload: {
    icon: IconVideo,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  goal_completed: {
    icon: IconCheck,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  stats_uploaded: {
    icon: IconChart,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  player_joined: {
    icon: IconUsers,
    color: 'text-primary-600',
    bgColor: 'bg-primary-50',
  },
  message: {
    icon: IconMessage,
    color: 'text-warm-600',
    bgColor: 'bg-warm-100',
  },
};

function ActivityRow({ activity }: { activity: TeamActivity }) {
  const config = activityConfig[activity.type];
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 px-5 py-3 hover:bg-warm-50/50 transition-colors">
      {activity.playerName ? (
        <Avatar 
          name={activity.playerName} 
          size="sm"
        />
      ) : (
        <div className={`w-8 h-8 rounded-full ${config.bgColor} flex items-center justify-center shrink-0`}>
          <Icon size={14} className={config.color} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-warm-900">
          {activity.playerName && (
            <span className="font-medium">{activity.playerName} </span>
          )}
          <span className="text-warm-600">{activity.description}</span>
        </p>
        <p className="text-xs text-warm-400 mt-0.5">
          {formatRelativeTime(activity.timestamp)}
        </p>
      </div>
    </div>
  );
}

export function TeamActivityFeed({ data, loading }: TeamActivityFeedProps) {
  if (loading) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <div className="px-5 py-4 border-b border-warm-100/50">
          <div className="flex items-center gap-2">
            <Skeleton variant="rectangular" width={16} height={16} className="rounded" />
            <Skeleton variant="text" width={120} height={18} />
          </div>
        </div>
        <div className="divide-y divide-warm-100/50">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton variant="circular" width={32} height={32} />
              <div className="flex-1">
                <Skeleton variant="text" width="70%" height={14} className="mb-1" />
                <Skeleton variant="text" width="40%" height={10} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />
      
      {/* Header */}
      <div className="px-5 py-4 border-b border-warm-100/50">
        <div className="flex items-center gap-2">
          <IconActivity size={16} className="text-primary-500" />
          <h3 className="font-semibold text-warm-900 tracking-tight">Recent Activity</h3>
        </div>
      </div>

      {/* Activity List */}
      <div className="divide-y divide-warm-100/50 max-h-[280px] overflow-y-auto">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4">
            <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center mb-3">
              <IconActivity size={20} className="text-warm-400" />
            </div>
            <h4 className="text-sm font-medium text-warm-900 mb-1">No activity yet</h4>
            <p className="text-xs text-warm-500 text-center max-w-[180px]">
              Team activity will appear here as players engage
            </p>
          </div>
        ) : (
          data.map(activity => (
            <ActivityRow key={activity.id} activity={activity} />
          ))
        )}
      </div>
    </div>
  );
}
