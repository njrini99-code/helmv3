'use client';

import { cn } from '@/lib/utils';

/**
 * Abstract shot tracking mockup showing a stylized golf hole with shot path
 * Uses placeholder/skeleton style matching DashboardMockup
 */
export function ShotTrackingMockup() {
  return (
    <div className="relative w-full h-full min-h-[200px] rounded-xl overflow-hidden bg-gradient-to-br from-emerald-50 to-green-100">
      {/* Course illustration */}
      <div className="absolute inset-0">
        {/* Fairway */}
        <div className="absolute left-8 top-1/2 -translate-y-1/2 w-[60%] h-24 bg-emerald-200/60 rounded-full blur-sm" />

        {/* Green */}
        <div className="absolute right-12 top-1/2 -translate-y-1/2 w-20 h-20 bg-emerald-300/80 rounded-full" />

        {/* Flag */}
        <div className="absolute right-[70px] top-[38%]">
          <div className="w-0.5 h-8 bg-slate-600" />
          <div className="absolute top-0 left-0.5 w-4 h-3 bg-red-500 rounded-r-sm" />
        </div>

        {/* Tee box */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-300/60 rounded" />
      </div>

      {/* Shot path - animated dots */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 120">
        <path
          d="M 30 60 Q 100 20 150 55 Q 200 90 260 58"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
          strokeDasharray="6 4"
          className="animate-pulse"
        />
        {/* Shot markers */}
        <circle cx="30" cy="60" r="4" fill="#22c55e" />
        <circle cx="150" cy="55" r="4" fill="#22c55e" />
        <circle cx="260" cy="58" r="4" fill="#f97316" />
      </svg>

      {/* Shot data cards */}
      <div className="absolute top-3 left-3 flex gap-2">
        <ShotDataBadge label="Drive" value="285y" />
        <ShotDataBadge label="Approach" value="145y" />
      </div>

      {/* Club selector mockup */}
      <div className="absolute bottom-3 left-3 right-3">
        <div className={cn(
          "bg-white/60 backdrop-blur-xl rounded-lg p-2",
          "border border-white/40",
          "shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.5)]"
        )}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center">
              <div className="w-1 h-4 bg-slate-400 rounded-full" />
            </div>
            <div className="flex-1">
              <div className="h-2 w-12 bg-slate-300 rounded" />
              <div className="h-1.5 w-8 bg-slate-200 rounded mt-1" />
            </div>
            <div className="flex gap-1">
              {['#22c55e', '#f97316', '#ef4444'].map((color, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShotDataBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(
      "bg-white/70 backdrop-blur-xl rounded-md px-2 py-1",
      "border border-white/40",
      "shadow-[0_1px_2px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.5)]"
    )}>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-xs font-semibold text-slate-900">{value}</p>
    </div>
  );
}
