'use client';

import { cn } from '@/lib/utils';

/**
 * Abstract recruiting pipeline Kanban board mockup
 */
export function PipelineMockup() {
  const stages = [
    { label: 'Watchlist', count: 12, color: 'bg-warm-200' },
    { label: 'Priority', count: 5, color: 'bg-amber-200' },
    { label: 'Offer', count: 3, color: 'bg-blue-200' },
    { label: 'Committed', count: 2, color: 'bg-primary-200' },
  ];

  return (
    <div className="flex gap-2 overflow-hidden">
      {stages.map((stage, i) => (
        <div key={i} className="flex-1 min-w-0">
          {/* Column header */}
          <div className={cn(
            "px-2 py-1 rounded-t-lg text-center",
            stage.color
          )}>
            <p className="text-[9px] font-semibold text-warm-700 truncate">{stage.label}</p>
            <p className="text-micro text-warm-500">{stage.count}</p>
          </div>

          {/* Cards */}
          <div className={cn(
            "bg-cream-100/55 backdrop-blur-xl rounded-b-lg p-1.5 space-y-1.5",
            "border border-warm-200/45 border-t-0 min-h-[80px]"
          )}>
            {Array.from({ length: Math.min(stage.count, 3) }).map((_, ci) => (
              <PipelineCard
                key={ci}
                isDragging={i === 0 && ci === 0}
              />
            ))}
            {stage.count > 3 && (
              <p className="text-[8px] text-warm-400 text-center">+{stage.count - 3} more</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PipelineCard({ isDragging }: { isDragging?: boolean }) {
  return (
    <div className={cn(
      "bg-white rounded p-1.5",
      "border border-warm-100",
      "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
      isDragging && "ring-2 ring-primary-300 shadow-md tranwarm-x-1 -tranwarm-y-1"
    )}>
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-warm-200 to-warm-300 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-1.5 w-10 bg-warm-200 rounded" />
          <div className="h-1 w-6 bg-warm-100 rounded mt-0.5" />
        </div>
      </div>
    </div>
  );
}
