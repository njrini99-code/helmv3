'use client';

import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ActivityItem {
  id: string;
  type: 'message' | 'round' | 'event' | 'milestone';
  title: string;
  description?: string;
  timestamp: Date;
  avatarUrl?: string;
  avatarFallback?: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  maxItems?: number;
  title?: string;
  viewAllHref?: string;
}

const typeDotColors = {
  message: 'bg-blue-500',
  round: 'bg-primary-500',
  event: 'bg-amber-500',
  milestone: 'bg-purple-500',
};

export function ActivityFeed({
  items,
  maxItems = 5,
  title = 'Recent Activity',
  viewAllHref,
}: ActivityFeedProps) {
  const router = useRouter();
  const displayItems = items.slice(0, maxItems);

  return (
    <div
      className="
      bg-white/70 backdrop-blur-[12px]
      border border-white/40
      rounded-[20px]
      shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.6)]
      overflow-hidden
    "
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/30">
        <h3 className="font-semibold text-warm-900">{title}</h3>
      </div>

      {/* Items */}
      <div className="divide-y divide-white/20">
        {displayItems.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-warm-400">No recent activity</p>
          </div>
        ) : (
          displayItems.map((item) => (
            <div
              key={item.id}
              className="
                px-5 py-4
                hover:bg-white/30
                transition-colors duration-200
                cursor-pointer
              "
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div
                    className="
                    w-10 h-10 rounded-[10px]
                    bg-warm-100
                    flex items-center justify-center
                    text-warm-500 font-medium text-sm
                    overflow-hidden
                  "
                  >
                    {item.avatarUrl ? (
                      <img
                        src={item.avatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      item.avatarFallback || item.type[0]?.toUpperCase() || '?'
                    )}
                  </div>

                  {/* Type indicator dot */}
                  <div
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5',
                      'w-3.5 h-3.5 rounded-full',
                      'border-2 border-white',
                      typeDotColors[item.type]
                    )}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-warm-900 line-clamp-1">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-sm text-warm-500 line-clamp-1 mt-0.5">
                      {item.description}
                    </p>
                  )}
                  <p className="text-xs text-warm-400 mt-1">
                    {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* View All Link */}
      {items.length > maxItems && viewAllHref && (
        <div className="px-5 py-3 border-t border-white/30 bg-white/20">
          <button
            className="
            text-sm font-medium text-primary-600
            hover:text-primary-700
            transition-colors duration-200
          "
            onClick={() => router.push(viewAllHref)}
          >
            View all activity →
          </button>
        </div>
      )}
    </div>
  );
}
