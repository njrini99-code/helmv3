import { format } from 'date-fns';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScheduleItem {
  id: string;
  time: Date;
  title: string;
  status: 'completed' | 'active' | 'upcoming';
  players?: { name: string; avatarUrl?: string }[];
}

export function TimelineSchedule({ items }: { items: ScheduleItem[] }) {
  return (
    <div className="relative">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <div key={item.id} className="relative flex gap-4">
            {/* Timeline track */}
            <div className="flex flex-col items-center">
              {/* Dot */}
              <div
                className={cn(
                  'relative z-10 w-3 h-3 rounded-full mt-1.5 flex-shrink-0',
                  item.status === 'completed' && 'bg-primary-600',
                  item.status === 'active' &&
                    'bg-primary-600 ring-4 ring-primary-100',
                  item.status === 'upcoming' &&
                    'bg-white border-2 border-primary-300'
                )}
              >
                {/* Ping animation for active */}
                {item.status === 'active' && (
                  <div className="absolute inset-0 rounded-full bg-primary-400 animate-ping opacity-75" />
                )}

                {/* Checkmark for completed */}
                {item.status === 'completed' && (
                  <Check
                    className="absolute inset-0 w-3 h-3 text-white"
                    strokeWidth={3}
                  />
                )}
              </div>

              {/* Connecting line */}
              {!isLast && (
                <div
                  className={cn(
                    'w-0.5 flex-1 my-2',
                    item.status === 'completed' ? 'bg-primary-200' : 'bg-warm-200'
                  )}
                />
              )}
            </div>

            {/* Content */}
            <div className={cn('flex-1 pb-6', isLast && 'pb-0')}>
              {/* Time label */}
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={cn(
                    'text-sm font-medium',
                    item.status === 'active'
                      ? 'text-primary-600'
                      : 'text-warm-500'
                  )}
                >
                  {format(item.time, 'h:mm a')}
                </span>
                {item.status === 'active' && (
                  <span
                    className="
                    px-2 py-0.5 rounded-full
                    bg-primary-100 text-primary-700
                    text-micro font-semibold uppercase tracking-wide
                  "
                  >
                    Now
                  </span>
                )}
              </div>

              {/* Event card (Tier 2 glass) */}
              <div
                className={cn(
                  'p-4 rounded-[14px]',
                  'bg-white/50 backdrop-blur-[8px]',
                  'border border-white/30',
                  'shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.4)]',
                  'transition-all duration-200',
                  'hover:bg-white/60 hover:border-white/40',
                  item.status === 'active' &&
                    'ring-2 ring-primary-100 border-primary-200/50'
                )}
              >
                <h4 className="font-semibold text-warm-900">{item.title}</h4>

                {/* Player avatars */}
                {item.players && item.players.length > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex -space-x-2">
                      {item.players.slice(0, 4).map((player, i) => (
                        <div
                          key={i}
                          className="
                            w-7 h-7 rounded-[8px]
                            bg-warm-100 border-2 border-white
                            flex items-center justify-center
                            text-micro font-medium text-warm-600
                            overflow-hidden
                          "
                          title={player.name}
                        >
                          {player.avatarUrl ? (
                            <img
                              src={player.avatarUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            player.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                          )}
                        </div>
                      ))}
                      {item.players.length > 4 && (
                        <div
                          className="
                          w-7 h-7 rounded-[8px]
                          bg-warm-200 border-2 border-white
                          flex items-center justify-center
                          text-micro font-medium text-warm-600
                        "
                        >
                          +{item.players.length - 4}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-warm-400">
                      {item.players.length} player
                      {item.players.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
