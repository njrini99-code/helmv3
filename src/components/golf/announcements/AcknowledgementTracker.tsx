'use client';

import { cn } from '@/lib/utils';
import { IconCheck, IconClock } from '@/components/icons';

interface AcknowledgementTrackerProps {
  acknowledgedCount: number;
  totalRecipients: number;
  acknowledgements?: Array<{
    player_id: string;
    acknowledged_at: string;
  }>;
  playerNames?: Record<string, string>;
  compact?: boolean;
}

export function AcknowledgementTracker({
  acknowledgedCount,
  totalRecipients,
  acknowledgements,
  playerNames,
  compact = false,
}: AcknowledgementTrackerProps) {
  const progress = totalRecipients > 0 ? (acknowledgedCount / totalRecipients) * 100 : 0;
  const isComplete = acknowledgedCount >= totalRecipients && totalRecipients > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {/* Mini progress ring */}
        <div className="relative w-7 h-7">
          <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
            <circle
              cx="14" cy="14" r="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-warm-100"
            />
            <circle
              cx="14" cy="14" r="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray={`${progress * 0.691} 100`}
              strokeLinecap="round"
              className={isComplete ? 'text-primary-500' : 'text-blue-500'}
            />
          </svg>
          {isComplete && (
            <div className="absolute inset-0 flex items-center justify-center">
              <IconCheck size={10} className="text-primary-600" />
            </div>
          )}
        </div>
        <span className="text-xs font-medium text-warm-500">
          {acknowledgedCount}/{totalRecipients}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-warm-700">Acknowledgements</span>
        <span className={cn(
          'text-sm font-semibold tabular-nums',
          isComplete ? 'text-primary-600' : 'text-warm-900'
        )}>
          {acknowledgedCount}/{totalRecipients}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-warm-100 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            isComplete ? 'bg-primary-500' : progress > 50 ? 'bg-blue-500' : 'bg-blue-400'
          )}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>

      {/* Player list */}
      {acknowledgements && playerNames && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {acknowledgements.map((ack) => (
            <div key={ack.player_id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <IconCheck size={10} className="text-primary-600" />
              </div>
              <span className="text-sm text-warm-700 flex-1 truncate">
                {playerNames[ack.player_id] || 'Unknown Player'}
              </span>
              <span className="text-xs text-warm-400 flex-shrink-0" suppressHydrationWarning>
                {new Date(ack.acknowledged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}