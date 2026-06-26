'use client';

import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ShineEffect } from '@/components/ui/shine-effect';
import { Button } from '@/components/ui/button';
import {
  IconActivity,
  IconVideo,
  IconCheck,
  IconChart,
  IconUsers,
  IconMessage,
  IconAlertCircle,
  IconRefresh,
} from '@/components/icons';
import { formatRelativeTime } from '@/lib/utils';
import type { TeamActivity } from './dashboard-types';

interface TeamActivityFeedProps {
  data: TeamActivity[];
  loading?: boolean;
  /** Truthy when the dashboard hook failed. Renders the recoverable error face. */
  error?: boolean;
  /** Retry handler — typically the hook's `refetch`. */
  onRetry?: () => void;
}

/** Shared header so loading / error / empty / content read identically. */
function ActivityHeader() {
  return (
    <div className="px-5 py-4 border-b border-warm-100/50">
      <div className="flex items-center gap-2">
        <IconActivity size={16} className="text-primary-500" aria-hidden="true" />
        <h3 className="font-semibold text-warm-900 tracking-tight">Recent Activity</h3>
      </div>
    </div>
  );
}

const activityConfig: Record<TeamActivity['type'], {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  bgColor: string;
}> = {
  // Activity types read as warm-neutral by default; only a positive outcome
  // (goal completed / player joined) earns primary green. Keeps the feed on the
  // restricted accent set shared with Signals + Command Center — no separate
  // purple/blue categorical hues on the daily home.
  video_upload: {
    icon: IconVideo,
    color: 'text-warm-600',
    bgColor: 'bg-warm-100',
  },
  goal_completed: {
    icon: IconCheck,
    color: 'text-primary-600',
    bgColor: 'bg-primary-50',
  },
  stats_uploaded: {
    icon: IconChart,
    color: 'text-warm-600',
    bgColor: 'bg-warm-100',
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
          <Icon size={14} className={config.color} aria-hidden="true" />
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

export function TeamActivityFeed({ data, loading, error, onRetry }: TeamActivityFeedProps) {
  const prefersReducedMotion = useReducedMotion();

  if (loading) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <ActivityHeader />
        <div className="divide-y divide-warm-100/50">
          {[0, 1, 2, 3].map(i => (
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

  if (error) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <ActivityHeader />
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center py-10 px-4 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
            <IconAlertCircle size={22} className="text-destructive" />
          </div>
          <h4 className="text-sm font-medium text-warm-900 mb-1">Couldn&apos;t load activity</h4>
          <p className="text-xs text-warm-500 max-w-[200px] mb-3">
            This is usually temporary. Try again in a moment.
          </p>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<IconRefresh size={14} />}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />

      {/* Header */}
      <ActivityHeader />

      {/* Activity List */}
      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4">
          <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center mb-3">
            <IconActivity size={20} className="text-warm-400" aria-hidden="true" />
          </div>
          <h4 className="text-sm font-medium text-warm-900 mb-1">No activity yet</h4>
          <p className="text-xs text-warm-500 text-center max-w-[180px]">
            Team activity will appear here as players engage.
          </p>
        </div>
      ) : (
        <LazyMotion features={domAnimation} strict>
          <ul
            className="divide-y divide-warm-100/50 max-h-[280px] overflow-y-auto"
            aria-label="Recent team activity"
          >
            {data.map((activity, index) => (
              <m.li
                key={activity.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: prefersReducedMotion ? 0 : Math.min(index, 8) * 0.04, ease: [0.22, 1, 0.36, 1] }}
              >
                <ActivityRow activity={activity} />
              </m.li>
            ))}
          </ul>
        </LazyMotion>
      )}
    </div>
  );
}
