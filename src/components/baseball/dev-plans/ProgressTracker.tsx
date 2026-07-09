'use client';

// =============================================================================
// ProgressTracker — the plan-level "overall progress" bar, migrated onto "The
// Living Annual" tokens (Lane 1 · THE PRESSBOX, green ink). The legacy
// mid-progress fill (`bg-amber-500`) is replaced with lane-ink green at every
// tier — urgency/progress is communicated by fill width, not an amber "warning"
// color (spec §4.2 rule 2).
// =============================================================================

import { cn } from '@/lib/utils';

interface ProgressTrackerProps {
  completed: number;
  total: number;
}

export function ProgressTracker({ completed, total }: ProgressTrackerProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-fw-md border border-[color:var(--hairline)] bg-[color:var(--paper-canvas)] p-4">
      <div className="flex items-center justify-between font-annual text-body-sm text-text-secondary">
        <span>Overall Progress</span>
        <span className="font-medium text-text-primary">{percent}%</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-[color:var(--hairline)]">
        <div
          className={cn('h-2 rounded-full bg-grade-plus', percent === 0 && 'bg-[color:var(--hairline)]')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 font-annual text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
        {completed} of {total} goals completed
      </p>
    </div>
  );
}
