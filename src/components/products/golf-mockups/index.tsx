'use client';

import { cn } from '@/lib/utils';

/**
 * GolfHelm Feature Mockups - Varied visual treatments
 * Each mockup showcases a different product feature with unique styling
 */

// ============================================
// 1. LIVE ROUND TRACKING - Phone/Mobile Style
// ============================================
export function LiveRoundMockup() {
  return (
    <div className="relative mx-auto w-[280px]">
      {/* Phone frame */}
      <div className="relative bg-slate-900 rounded-[40px] p-3 shadow-2xl">
        {/* Screen */}
        <div className="bg-gradient-to-br from-[#0a1628] to-[#1a2744] rounded-[32px] overflow-hidden">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 py-2 text-white/60 text-xs">
            <span>9:41</span>
            <div className="w-20 h-6 bg-black rounded-full" /> {/* Notch */}
            <span>100%</span>
          </div>

          {/* App content */}
          <div className="px-4 pb-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-white">
                <p className="text-xs text-emerald-400 font-medium">LIVE ROUND</p>
                <h3 className="text-lg font-semibold">Pebble Beach</h3>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">Recording</span>
              </div>
            </div>

            {/* Score card */}
            <div className="bg-white/10 backdrop-blur rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/60 text-sm">Current Score</span>
                <span className="text-2xl font-bold text-emerald-400">-2</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-semibold text-white">7</p>
                  <p className="text-xs text-white/50">Hole</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-white">34</p>
                  <p className="text-xs text-white/50">Thru 6</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-white">12</p>
                  <p className="text-xs text-white/50">Putts</p>
                </div>
              </div>
            </div>

            {/* Last shot */}
            <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl p-3">
              <p className="text-xs text-emerald-400 font-medium mb-1">LAST SHOT</p>
              <div className="flex items-center justify-between">
                <div className="text-white">
                  <span className="text-lg font-semibold">7 Iron</span>
                  <span className="text-white/50 ml-2">→ 156 yds</span>
                </div>
                <span className="px-2 py-1 bg-emerald-500 text-white text-xs font-medium rounded-full">
                  GIR ✓
                </span>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mt-4">
              <button className="flex-1 py-3 bg-emerald-500 text-white text-sm font-semibold rounded-xl">
                Log Shot
              </button>
              <button className="px-4 py-3 bg-white/10 text-white rounded-xl">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Glow effect */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-48 h-16 bg-emerald-500/20 blur-2xl rounded-full" />
    </div>
  );
}

// ============================================
// 2. QUALIFIER LEADERBOARD - Card Stack Style
// ============================================
export function QualifierMockup() {
  const players = [
    { rank: 1, name: 'Jake Morrison', score: -4, rounds: '68-70', trend: 'up' },
    { rank: 2, name: 'Chris Palmer', score: -3, rounds: '69-70', trend: 'up' },
    { rank: 3, name: 'Mike Torres', score: -2, rounds: '71-69', trend: 'down' },
    { rank: 4, name: 'Ryan Chen', score: -1, rounds: '70-71', trend: 'same' },
    { rank: 5, name: 'David Kim', score: 'E', rounds: '72-70', trend: 'up' },
  ];

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Header card */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 mb-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-100 text-sm font-medium">SPRING QUALIFIER</p>
            <h3 className="text-2xl font-bold text-white">Round 2 of 3</h3>
          </div>
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4 text-sm text-white/80">
          <span>📍 Augusta National</span>
          <span>•</span>
          <span>36 holes</span>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="font-semibold text-slate-900">Leaderboard</span>
          <span className="text-xs text-slate-500">Top 5 qualify</span>
        </div>
        <div className="divide-y divide-slate-100">
          {players.map((player, i) => (
            <div
              key={player.rank}
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition-colors",
                i < 5 ? "bg-emerald-50/50" : ""
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                player.rank === 1 ? "bg-amber-400 text-white" :
                player.rank === 2 ? "bg-slate-300 text-slate-700" :
                player.rank === 3 ? "bg-amber-700 text-white" :
                "bg-slate-100 text-slate-600"
              )}>
                {player.rank}
              </div>
              <div className="flex-1">
                <p className="font-medium text-slate-900">{player.name}</p>
                <p className="text-xs text-slate-500">{player.rounds}</p>
              </div>
              <div className="text-right">
                <p className={cn(
                  "font-semibold",
                  typeof player.score === 'number' && player.score < 0 ? "text-emerald-600" : "text-slate-900"
                )}>
                  {typeof player.score === 'number' && player.score < 0 ? player.score : player.score}
                </p>
                {player.trend === 'up' && <span className="text-xs text-emerald-500">↑</span>}
                {player.trend === 'down' && <span className="text-xs text-red-500">↓</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Decorative element */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-amber-500/10 blur-xl rounded-full" />
    </div>
  );
}

// ============================================
// 3. STATS DASHBOARD - Chart/Graph Style
// ============================================
export function StatsMockup() {
  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Performance Trends</h3>
            <p className="text-xs text-slate-500">Last 30 days</p>
          </div>
          <select className="text-xs bg-slate-100 border-0 rounded-lg px-3 py-1.5 text-slate-600">
            <option>All Players</option>
          </select>
        </div>

        {/* Chart area */}
        <div className="p-5">
          {/* Mini chart visualization */}
          <div className="relative h-40 mb-6">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-slate-400 pr-3">
              <span>80</span>
              <span>75</span>
              <span>70</span>
            </div>
            {/* Chart bars */}
            <div className="ml-8 h-full flex items-end gap-2">
              {[75, 78, 72, 74, 76, 71, 73, 72, 70, 74, 72, 71].map((val, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-emerald-500 to-emerald-400"
                  style={{ height: `${((80 - val) / 10) * 100}%`, minHeight: '20%' }}
                />
              ))}
            </div>
            {/* Trend line overlay */}
            <svg className="absolute inset-0 ml-8" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path
                d="M0,50 Q25,60 50,40 T100,35"
                fill="none"
                stroke="#16A34A"
                strokeWidth="2"
                strokeDasharray="4 2"
                opacity="0.5"
              />
            </svg>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-slate-50 rounded-xl">
              <p className="text-2xl font-bold text-slate-900">72.4</p>
              <p className="text-xs text-slate-500">Avg Score</p>
              <p className="text-xs text-emerald-600 font-medium">-1.2 ↓</p>
            </div>
            <div className="text-center p-3 bg-emerald-50 rounded-xl">
              <p className="text-2xl font-bold text-emerald-600">68%</p>
              <p className="text-xs text-slate-500">GIR</p>
              <p className="text-xs text-emerald-600 font-medium">+4% ↑</p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-xl">
              <p className="text-2xl font-bold text-slate-900">31.2</p>
              <p className="text-xs text-slate-500">Putts/Rd</p>
              <p className="text-xs text-emerald-600 font-medium">-0.8 ↓</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 4. COACHHELM AI - Floating Cards Style
// ============================================
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
        <span className="font-semibold text-slate-900">CoachHelm AI</span>
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
                <h4 className="font-medium text-slate-900 text-sm">{insight.title}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{insight.desc}</p>
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

      {/* Glow */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-2/3 h-12 bg-emerald-500/10 blur-2xl rounded-full" />
    </div>
  );
}
