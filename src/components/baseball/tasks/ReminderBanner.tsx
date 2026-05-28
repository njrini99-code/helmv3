'use client';

import { IconClock } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ReminderBannerProps {
  overdueCount: number;
  onViewOverdue: () => void;
  className?: string;
}

export function ReminderBanner({ overdueCount, onViewOverdue, className }: ReminderBannerProps) {
  if (overdueCount <= 0) return null;

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100',
      className
    )}>
      <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
        <IconClock size={16} className="text-red-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800">
          {overdueCount} overdue task{overdueCount !== 1 ? 's' : ''} need{overdueCount === 1 ? 's' : ''} attention
        </p>
        <p className="text-xs text-red-600 mt-0.5">
          Review and update tasks that are past their due date
        </p>
      </div>
      <Button variant="danger"
        onClick={onViewOverdue}
        className="text-xs font-medium text-red-700 hover:text-red-800 px-2 py-1 rounded-md hover:bg-red-100 transition-colors flex-shrink-0"
      >
        View
      </Button>
    </div>
  );
}
