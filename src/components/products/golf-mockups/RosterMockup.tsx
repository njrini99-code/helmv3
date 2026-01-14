'use client';

import { cn } from '@/lib/utils';

/**
 * Abstract roster mockup showing stacked player avatars with status badges
 */
export function RosterMockup() {
  return (
    <div className="space-y-2">
      {/* Player rows */}
      <PlayerRow name="wide" status="active" />
      <PlayerRow name="medium" status="active" />
      <PlayerRow name="short" status="injured" />
    </div>
  );
}

function PlayerRow({ name, status }: { name: 'wide' | 'medium' | 'short'; status: 'active' | 'injured' }) {
  const widths = { wide: 'w-20', medium: 'w-16', short: 'w-12' };

  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-lg",
      "bg-white/45 backdrop-blur-xl border border-white/30",
      "shadow-[0_1px_2px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.5)]"
    )}>
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex-shrink-0" />

      {/* Name placeholder */}
      <div className={cn("h-2 bg-slate-200 rounded", widths[name])} />

      {/* Status badge */}
      <div className={cn(
        "ml-auto px-1.5 py-0.5 rounded text-[9px] font-medium",
        status === 'active'
          ? "bg-emerald-100 text-emerald-700"
          : "bg-amber-100 text-amber-700"
      )}>
        {status === 'active' ? 'Active' : 'INJ'}
      </div>
    </div>
  );
}
