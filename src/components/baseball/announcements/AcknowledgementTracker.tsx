'use client';

import { cn } from '@/lib/utils';
import { IconCheck, IconClock } from '@/components/icons';

/** Inline pill showing ack progress for list cards */
export function AcknowledgementPill({ count, total }: { count: number; total: number }) {
  const isComplete = count >= total && total > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium tabular-nums',
      isComplete
        ? 'bg-primary-50 text-primary-700'
        : 'bg-warm-100 text-warm-500'
    )}>
      {isComplete ? <IconCheck size={10} /> : <IconClock size={10} />}
      {count}/{total}
    </span>
  );
}
