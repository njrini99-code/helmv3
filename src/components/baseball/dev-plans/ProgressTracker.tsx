'use client';

import { cn } from '@/lib/utils';

interface ProgressTrackerProps {
  completed: number;
  total: number;
}

export function ProgressTracker({ completed, total }: ProgressTrackerProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-cream-100/75 p-4">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>Overall Progress</span>
        <span className="font-medium text-slate-900">{percent}%</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-200">
        <div
          className={cn('h-2 rounded-full', percent >= 70 ? 'bg-primary-600' : percent >= 40 ? 'bg-amber-500' : 'bg-slate-400')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {completed} of {total} goals completed
      </p>
    </div>
  );
}
