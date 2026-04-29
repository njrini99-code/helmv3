'use client';

import { cn } from '@/lib/utils';
import { Check, Circle } from 'lucide-react';

/**
 * Abstract development plan mockup
 */
export function DevPlanMockup() {
  return (
    <div className={cn(
      "bg-cream-100/55 backdrop-blur-xl rounded-lg p-2",
      "border border-warm-200/45 space-y-2"
    )}>
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold text-slate-600">Hitting Program</span>
        <span className="text-micro text-primary-600 font-semibold">67%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full w-2/3 bg-primary-500 rounded-full" />
      </div>

      {/* Goal items */}
      <div className="space-y-1.5 pt-1">
        <GoalItem label="Exit Velocity 90+" completed />
        <GoalItem label="Launch Angle 12-18°" completed />
        <GoalItem label="Barrel Rate 40%+" />
      </div>
    </div>
  );
}

function GoalItem({ label, completed }: { label: string; completed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0",
        completed
          ? "bg-primary-100 text-primary-600"
          : "bg-slate-100 text-slate-300"
      )}>
        {completed ? (
          <Check className="w-2.5 h-2.5" strokeWidth={3} />
        ) : (
          <Circle className="w-2.5 h-2.5" strokeWidth={2} />
        )}
      </div>
      <span className={cn(
        "text-micro",
        completed ? "text-slate-500 line-through" : "text-slate-700"
      )}>
        {label}
      </span>
    </div>
  );
}
