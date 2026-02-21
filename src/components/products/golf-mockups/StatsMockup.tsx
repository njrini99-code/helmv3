'use client';

import { cn } from '@/lib/utils';

/**
 * Abstract statistics mockup with sparkline and stat badges
 */
export function StatsMockup() {
  return (
    <div className="space-y-3">
      {/* Mini sparkline chart */}
      <div className={cn(
        "bg-white/45 backdrop-blur-xl rounded-lg p-2",
        "border border-white/30"
      )}>
        <svg className="w-full h-8" viewBox="0 0 100 32">
          <polyline
            points="0,24 15,20 30,16 45,22 60,14 75,18 90,10 100,12"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="100" cy="12" r="3" fill="#22c55e" />
        </svg>
      </div>

      {/* Stat badges row */}
      <div className="flex gap-2">
        <StatBadge label="GIR" value="72%" trend="up" />
        <StatBadge label="Putts" value="1.8" trend="down" />
        <StatBadge label="FIR" value="65%" trend="up" />
      </div>
    </div>
  );
}

function StatBadge({ label, value, trend }: { label: string; value: string; trend: 'up' | 'down' }) {
  return (
    <div className={cn(
      "flex-1 bg-white/45 backdrop-blur-xl rounded-md px-2 py-1.5",
      "border border-white/30 text-center"
    )}>
      <p className="text-[9px] text-slate-500 uppercase tracking-wide">{label}</p>
      <div className="flex items-center justify-center gap-1 mt-0.5">
        <p className="text-sm font-semibold text-slate-900">{value}</p>
        <span className={cn(
          "text-micro",
          trend === 'up' ? "text-emerald-600" : "text-amber-600"
        )}>
          {trend === 'up' ? '↑' : '↓'}
        </span>
      </div>
    </div>
  );
}
