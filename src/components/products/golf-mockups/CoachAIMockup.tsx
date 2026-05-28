'use client';

import { cn } from '@/lib/utils';

export function CoachAIMockup() {
  const insights = [
    {
      type: 'alert',
      title: 'Putting decline detected',
      desc: 'Jake M. averaging 34 putts last 3 rounds',
      action: 'Schedule drill session',
      color: 'amber'
    },
    {
      type: 'opportunity',
      title: 'Qualifying spot available',
      desc: 'Chris P. moved to 4th - one spot from lineup',
      action: 'Review performance',
      color: 'emerald'
    },
    {
      type: 'insight',
      title: 'Course strategy needed',
      desc: 'Team struggling on par 5s at Augusta',
      action: 'View course analysis',
      color: 'blue'
    }
  ];

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* AI Badge */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <span className="font-semibold text-warm-900">CoachHelm AI</span>
        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
          3 new
        </span>
      </div>

      {/* Stacked insight cards */}
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <div
            key={i}
            className={cn(
              "relative bg-white rounded-xl p-4 shadow-lg border transition-transform hover:scale-[1.02]",
              insight.color === 'amber' && "border-amber-200",
              insight.color === 'emerald' && "border-emerald-200",
              insight.color === 'blue' && "border-blue-200"
            )}
            style={{
              transform: `translateX(${i * 4}px)`,
              zIndex: 3 - i
            }}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                insight.color === 'amber' && "bg-amber-100 text-amber-600",
                insight.color === 'emerald' && "bg-emerald-100 text-emerald-600",
                insight.color === 'blue' && "bg-blue-100 text-blue-600"
              )}>
                {insight.type === 'alert' && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                )}
                {insight.type === 'opportunity' && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23,6 13.5,15.5 8.5,10.5 1,18" />
                    <polyline points="17,6 23,6 23,12" />
                  </svg>
                )}
                {insight.type === 'insight' && (
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-warm-900 text-sm">{insight.title}</h4>
                <p className="text-xs text-warm-500 mt-0.5">{insight.desc}</p>
                <button className={cn(
                  "mt-2 text-xs font-medium",
                  insight.color === 'amber' && "text-amber-600",
                  insight.color === 'emerald' && "text-emerald-600",
                  insight.color === 'blue' && "text-blue-600"
                )}>
                  {insight.action} →
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Glow backdrop */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-2/3 h-12 bg-emerald-400/10 blur-2xl rounded-full" />
    </div>
  );
}
