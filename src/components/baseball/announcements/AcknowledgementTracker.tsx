'use client';

import { cn } from '@/lib/utils';
import { IconCheck, IconClock } from '@/components/icons';

interface AcknowledgementTrackerProps {
  acknowledgedCount: number;
  totalRecipients: number;
  compact?: boolean;
}

export function AcknowledgementTracker({
  acknowledgedCount,
  totalRecipients,
  compact = false,
}: AcknowledgementTrackerProps) {
  const progress = totalRecipients > 0 ? (acknowledgedCount / totalRecipients) * 100 : 0;
  const isComplete = acknowledgedCount >= totalRecipients && totalRecipients > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="relative w-7 h-7">
          <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
            <circle
              cx="14" cy="14" r="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-slate-100"
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
        <span className="text-xs font-medium text-slate-500">
          {acknowledgedCount}/{totalRecipients}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">Acknowledgements</span>
        <span className={cn(
          'text-sm font-semibold tabular-nums',
          isComplete ? 'text-primary-600' : 'text-slate-900'
        )}>
          {acknowledgedCount}/{totalRecipients}
        </span>
      </div>

      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            isComplete ? 'bg-primary-500' : progress > 50 ? 'bg-blue-500' : 'bg-blue-400'
          )}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Inline pill showing ack progress for list cards */
export function AcknowledgementPill({ count, total }: { count: number; total: number }) {
  const isComplete = count >= total && total > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium tabular-nums',
      isComplete
        ? 'bg-primary-50 text-primary-700'
        : 'bg-slate-100 text-slate-500'
    )}>
      {isComplete ? <IconCheck size={10} /> : <IconClock size={10} />}
      {count}/{total}
    </span>
  );
}
