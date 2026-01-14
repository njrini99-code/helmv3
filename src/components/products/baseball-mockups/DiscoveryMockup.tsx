'use client';

import { cn } from '@/lib/utils';

/**
 * Abstract player discovery filter panel mockup
 */
export function DiscoveryMockup() {
  return (
    <div className="space-y-2">
      {/* Filter dropdowns */}
      <div className="flex gap-1.5">
        <FilterPill label="2026" active />
        <FilterPill label="SS/2B" />
        <FilterPill label="TX" />
      </div>

      {/* Player cards preview */}
      <div className="space-y-1.5">
        <DiscoveryPlayerCard featured />
        <DiscoveryPlayerCard />
      </div>
    </div>
  );
}

function FilterPill({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className={cn(
      "px-2 py-0.5 rounded text-[9px] font-medium",
      active
        ? "bg-primary-100 text-primary-700 border border-primary-200"
        : "bg-white/60 text-slate-600 border border-white/40"
    )}>
      {label}
    </div>
  );
}

function DiscoveryPlayerCard({ featured }: { featured?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-lg",
      "bg-white/45 backdrop-blur-xl border border-white/30",
      featured && "ring-1 ring-primary-200"
    )}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <div className="h-2 w-14 bg-slate-200 rounded" />
          {featured && (
            <span className="text-[8px] text-primary-600 font-semibold">TOP</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[8px] text-slate-500">SS</span>
          <span className="text-[8px] text-slate-500">2026</span>
          <span className="text-[8px] text-primary-600 font-semibold">89 mph</span>
        </div>
      </div>
      <div className="w-6 h-6 rounded bg-primary-50 flex items-center justify-center">
        <span className="text-[10px] text-primary-600">+</span>
      </div>
    </div>
  );
}
