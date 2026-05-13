'use client';

import { cn } from '@/lib/utils';

/**
 * Abstract qualifier bracket mockup
 */
export function BracketMockup() {
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      {/* Round 1 */}
      <div className="space-y-2">
        <BracketSlot position={1} active />
        <BracketSlot position={2} />
        <BracketSlot position={3} />
      </div>

      {/* Connector lines */}
      <svg className="w-6 h-16 flex-shrink-0" viewBox="0 0 24 64">
        <path d="M 0 16 L 12 16 L 12 32" stroke="#e2e8f0" strokeWidth="2" fill="none" />
        <path d="M 0 48 L 12 48 L 12 32 L 24 32" stroke="#e2e8f0" strokeWidth="2" fill="none" />
      </svg>

      {/* Final */}
      <div className="flex items-center gap-1">
        <div className={cn(
          "w-6 h-6 rounded bg-primary-100 border-2 border-primary-500",
          "flex items-center justify-center"
        )}>
          <span className="text-micro font-bold text-primary-700">1</span>
        </div>
        <div className="w-3 h-4">
          <div className="w-0.5 h-3 bg-primary-500 mx-auto" />
          <div className="w-2 h-1 bg-primary-500 rounded-t" />
        </div>
      </div>
    </div>
  );
}

function BracketSlot({ position, active }: { position: number; active?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-1.5 py-1 rounded",
      "bg-cream-100/55 border",
      active ? "border-primary-300 bg-primary-50/50" : "border-warm-200/45"
    )}>
      <span className={cn(
        "text-micro font-semibold",
        active ? "text-primary-700" : "text-warm-400"
      )}>
        {position}
      </span>
      <div className="w-4 h-4 rounded-full bg-warm-200" />
      <div className={cn("h-1.5 w-8 rounded", active ? "bg-primary-200" : "bg-warm-200")} />
    </div>
  );
}
