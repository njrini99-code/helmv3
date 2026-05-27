'use client';

import { cn } from '@/lib/utils';

/**
 * GolfHelm Feature Mockups - Varied visual treatments
 * Each mockup showcases a different product feature with unique styling
 */

// ============================================
// 1. LIVE ROUND TRACKING - Full Phone Style
// ============================================
export function LiveRoundMockup() {
  return (
    <div className="relative mx-auto w-[280px]">
      {/* Phone frame — 19.5:9 aspect ratio */}
      <div className="relative bg-warm-900 rounded-[40px] p-[10px] shadow-2xl ring-1 ring-white/10">
        {/* Side buttons */}
        <div className="absolute -right-[2px] top-24 w-[3px] h-7 bg-warm-700 rounded-r-sm" />
        <div className="absolute -left-[2px] top-20 w-[3px] h-5 bg-warm-700 rounded-l-sm" />
        <div className="absolute -left-[2px] top-32 w-[3px] h-10 bg-warm-700 rounded-l-sm" />
        <div className="absolute -left-[2px] top-46 w-[3px] h-10 bg-warm-700 rounded-l-sm" />

        {/* Screen — fixed height for realistic phone proportions */}
        <div className="bg-warm-50 rounded-[32px] overflow-hidden h-[572px] flex flex-col">
          {/* Dynamic Island + Status bar */}
          <div className="flex items-center justify-between px-6 pt-2.5 pb-1 bg-warm-900 shrink-0">
            <span className="text-[10px] text-white/70 font-medium">9:41</span>
            <div className="w-[80px] h-[24px] bg-black rounded-full" />
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M2 17h2v4H2zm4-5h2v9H6zm4-4h2v13h-2zm4-3h2v16h-2zm4-3h2v19h-2z"/></svg>
              <svg className="w-3 h-3 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
              <svg className="w-3.5 h-3.5 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M17 6H7c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H7V8h10v8zm4-9v10h-1V7h1z"/></svg>
            </div>
          </div>

          {/* Scorecard Header */}
          <div className="bg-warm-900 shrink-0">
            <div className="flex justify-between items-center px-3 py-1.5 border-b border-warm-700">
              <span className="text-[9px] font-semibold text-white/50 uppercase tracking-wide">← Prev</span>
              <div className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wide">Hole 7 of 18</span>
              </div>
              <span className="text-[9px] font-semibold text-white/50 uppercase tracking-wide">Next →</span>
            </div>
            <div className="flex">
              {[
                { hole: 5, par: 3, score: 2, color: 'text-emerald-400' },
                { hole: 6, par: 5, score: 5, color: 'text-white' },
                { hole: 7, par: 4, score: null, color: '', current: true },
                { hole: 8, par: 3, score: null, color: '' },
              ].map((h) => (
                <div key={h.hole} className={`flex-1 py-1.5 px-1 text-center border-r border-warm-700 ${h.current ? 'bg-emerald-600' : ''}`}>
                  <div className={`text-[8px] font-semibold ${h.current ? 'text-white' : 'text-warm-400'}`}>{h.hole}</div>
                  <div className={`text-[8px] ${h.current ? 'text-emerald-100' : 'text-warm-500'}`}>P{h.par}</div>
                  <div className={`text-xs font-bold ${h.current ? 'text-white' : h.score !== null ? h.color : 'text-warm-600'}`}>{h.score ?? '-'}</div>
                </div>
              ))}
              <div className="flex-1 py-1.5 px-1 text-center bg-warm-800">
                <div className="text-[8px] font-semibold text-amber-400">OUT</div>
                <div className="text-[8px] text-warm-500">P36</div>
                <div className="text-xs font-bold text-amber-400">-</div>
              </div>
            </div>
          </div>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-hidden">
            {/* Shot Pills */}
            <div className="bg-white py-2 px-3 border-b border-warm-100 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-semibold text-warm-400 uppercase tracking-wider shrink-0">Shot</span>
                <div className="flex gap-1">
                  <div className="w-7 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">1</div>
                  <div className="w-7 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold bg-emerald-600 text-white shadow-sm">2</div>
                  <div className="w-7 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold bg-warm-50 text-warm-300 ring-1 ring-warm-200">3</div>
                  <div className="w-7 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold bg-warm-50 text-warm-300 ring-1 ring-warm-200">4</div>
                  <div className="w-7 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold bg-warm-50 text-warm-300 ring-1 ring-warm-200">5</div>
                  <div className="w-7 h-6 rounded-md flex items-center justify-center text-[10px] font-semibold bg-warm-50 text-warm-300 ring-1 ring-warm-200">6</div>
                </div>
              </div>
            </div>

            {/* Hole Header Card */}
            <div className="mx-2.5 mt-2.5">
              <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-3.5 text-white shadow-md">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold">Hole 7</h3>
                      <span className="px-1.5 py-0.5 bg-white/15 rounded text-[9px] font-semibold uppercase">Par 4</span>
                    </div>
                    <p className="text-emerald-100 text-[10px] mt-0.5">Shot 2 · Approach · <span className="font-medium">Fairway</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-200 text-[8px] font-semibold uppercase tracking-wider">Distance</p>
                    <p className="text-xl font-bold">156<span className="text-xs ml-0.5 text-emerald-100">YDS</span></p>
                  </div>
                </div>
                <div className="mt-2.5 bg-white/10 rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] text-emerald-100 font-semibold uppercase">Progress</span>
                    <span className="text-[8px] text-emerald-100 font-bold">60%</span>
                  </div>
                  <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full" style={{ width: '60%' }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[8px] text-emerald-100">
                    <span>Tee</span>
                    <span className="font-bold">156 yds left</span>
                    <span>Hole</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Shot Result */}
            <div className="mx-2.5 mt-2">
              <div className="bg-cream-100/75 backdrop-blur rounded-xl p-3 border border-warm-200/60 shadow-sm">
                <p className="text-[8px] font-bold text-warm-500 uppercase tracking-wider mb-2">Shot Result</p>
                <div className="grid grid-cols-3 gap-1">
                  {['Fairway', 'Rough', 'Sand', 'Green', 'Hole', 'Other'].map((r) => (
                    <button key={r} className={`py-1.5 rounded-lg text-[10px] font-semibold ${r === 'Green' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-warm-100 text-warm-600'}`}>{r}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Distance */}
            <div className="mx-2.5 mt-2">
              <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-3 border-2 border-emerald-200">
                <p className="text-[8px] font-bold text-warm-500 uppercase tracking-wider mb-1.5">Distance to Hole</p>
                <div className="flex items-baseline justify-center gap-0.5">
                  <span className="text-2xl font-bold text-warm-900">12</span>
                  <span className="text-xs font-semibold text-warm-400">feet</span>
                </div>
                <div className="flex gap-1 mt-2">
                  {['5ft', '10ft', '15ft', '20ft', '30ft'].map((d) => (
                    <button key={d} className={`flex-1 py-1 rounded text-[9px] font-semibold ${d === '10ft' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' : 'bg-warm-100 text-warm-500'}`}>{d}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Next Shot Button */}
            <div className="mx-2.5 mt-2">
              <button className="w-full py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-xl shadow-sm">Next Shot →</button>
            </div>
          </div>

          {/* Home indicator */}
          <div className="flex justify-center py-2 shrink-0">
            <div className="w-24 h-1 bg-warm-300 rounded-full" />
          </div>
        </div>
      </div>

      {/* Glow */}
      <div className="absolute -bottom-8 left-1/2 -tranwarm-x-1/2 w-48 h-16 bg-emerald-500/15 blur-3xl rounded-full" />
    </div>
  );
}

// ============================================
// 2. QUALIFIER LEADERBOARD - Premium Glass Style
// ============================================
export function QualifierMockup() {
  const players = [
    { rank: 1, name: 'Jake Morrison', score: -4, rounds: '68 · 70', avg: '69.0', trend: 'up' },
    { rank: 2, name: 'Chris Palmer', score: -3, rounds: '69 · 70', avg: '69.5', trend: 'up' },
    { rank: 3, name: 'Mike Torres', score: -2, rounds: '71 · 69', avg: '70.0', trend: 'down' },
    { rank: 4, name: 'Ryan Chen', score: -1, rounds: '70 · 71', avg: '70.5', trend: 'same' },
    { rank: 5, name: 'David Kim', score: 0, rounds: '72 · 70', avg: '71.0', trend: 'up' },
    { rank: 6, name: 'Sam Williams', score: 1, rounds: '73 · 70', avg: '71.5', trend: 'down' },
  ];

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Header card — dark premium */}
      <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-900 rounded-2xl p-6 mb-5 shadow-2xl ring-1 ring-emerald-700/50 overflow-hidden relative">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '20px 20px' }} />

        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-emerald-300/80 text-xs font-semibold uppercase tracking-widest">Spring Qualifier</p>
            <h3 className="text-2xl font-bold text-white mt-1.5 tracking-tight">Round 2 of 3</h3>
            <p className="text-emerald-200/60 text-sm mt-1">Augusta National GC</p>
          </div>
          <div className="w-12 h-12 bg-emerald-700/40 backdrop-blur-sm rounded-xl flex items-center justify-center ring-1 ring-emerald-500/20">
            <svg className="w-6 h-6 text-emerald-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
        </div>

        {/* Stats row */}
        <div className="relative mt-5 flex gap-3">
          {[
            { label: 'Rounds', value: '36 holes' },
            { label: 'Players', value: '12' },
            { label: 'Spots', value: '5' },
          ].map((s) => (
            <div key={s.label} className="flex-1 bg-emerald-700/30 backdrop-blur-sm rounded-lg px-3 py-2 ring-1 ring-emerald-500/10">
              <p className="text-emerald-300/60 text-[10px] font-semibold uppercase tracking-wide">{s.label}</p>
              <p className="text-white text-sm font-bold mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-cream-100/82 backdrop-blur-xl rounded-2xl shadow-xl overflow-hidden border border-warm-200/60 ring-1 ring-black/[0.02]">
        <div className="px-5 py-3.5 border-b border-warm-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-warm-900 tracking-tight">Leaderboard</span>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-200/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <span className="text-xs text-warm-400 font-medium">Top 5 qualify</span>
        </div>

        <div>
          {players.map((player, _i) => {
            const isQualifying = player.rank <= 5;
            const isCutline = player.rank === 5;
            const isFirst = player.rank === 1;

            return (
              <div key={player.rank}>
                <div className={cn(
                  "flex items-center gap-3 px-5 py-3 transition-colors",
                  isFirst ? "bg-gradient-to-r from-amber-50/80 to-yellow-50/40" :
                  isQualifying ? "bg-emerald-50/30" :
                  "bg-warm-50/40"
                )}>
                  {/* Rank */}
                  <div className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                    isFirst ? "bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-sm shadow-amber-200" :
                    player.rank === 2 ? "bg-warm-200 text-warm-600" :
                    player.rank === 3 ? "bg-amber-100 text-amber-700" :
                    isQualifying ? "bg-emerald-100 text-emerald-700" :
                    "bg-warm-100 text-warm-400"
                  )}>
                    {player.rank}
                  </div>

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-semibold text-sm truncate",
                      !isQualifying ? "text-warm-400" : "text-warm-900"
                    )}>
                      {player.name}
                    </p>
                    <p className={cn("text-[11px]", !isQualifying ? "text-warm-300" : "text-warm-400")}>
                      {player.rounds}
                    </p>
                  </div>

                  {/* Trend */}
                  <div className="shrink-0">
                    {player.trend === 'up' && (
                      <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                        <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 15l7-7 7 7" /></svg>
                      </span>
                    )}
                    {player.trend === 'down' && (
                      <span className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center">
                        <svg className="w-3 h-3 text-red-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
                      </span>
                    )}
                    {player.trend === 'same' && (
                      <span className="w-5 h-5 rounded-full bg-warm-100 flex items-center justify-center">
                        <svg className="w-3 h-3 text-warm-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
                      </span>
                    )}
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0 w-10">
                    <p className={cn(
                      "text-base font-bold tabular-nums",
                      player.score < 0 ? "text-emerald-600" :
                      player.score === 0 ? "text-warm-600" :
                      "text-warm-400"
                    )}>
                      {player.score < 0 ? player.score : player.score === 0 ? 'E' : `+${player.score}`}
                    </p>
                  </div>
                </div>

                {/* Cutline */}
                {isCutline && (
                  <div className="flex items-center gap-3 px-5 py-1.5">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent" />
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest shrink-0">Cutline</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Glow */}
      <div className="absolute -bottom-6 left-1/2 -tranwarm-x-1/2 w-3/4 h-12 bg-emerald-500/10 blur-2xl rounded-full" />
    </div>
  );
}

// ============================================
// 3. STATS DASHBOARD - Chart/Graph Style
// ============================================
export function StatsMockup() {
  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="bg-white rounded-2xl shadow-xl border border-warm-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-warm-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-warm-900">Performance Trends</h3>
            <p className="text-xs text-warm-500">Last 30 days</p>
          </div>
          <select className="text-xs bg-warm-100 border-0 rounded-lg px-3 py-1.5 text-warm-600">
            <option>All Players</option>
          </select>
        </div>

        {/* Chart area */}
        <div className="p-5">
          {/* Mini chart visualization */}
          <div className="relative h-40 mb-6">
            {/* Y-axis labels */}
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-xs text-warm-400 pr-3">
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
            <div className="text-center p-3 bg-warm-50 rounded-xl">
              <p className="text-2xl font-bold text-warm-900">72.4</p>
              <p className="text-xs text-warm-500">Avg Score</p>
              <p className="text-xs text-emerald-600 font-medium">-1.2 ↓</p>
            </div>
            <div className="text-center p-3 bg-emerald-50 rounded-xl">
              <p className="text-2xl font-bold text-emerald-600">68%</p>
              <p className="text-xs text-warm-500">GIR</p>
              <p className="text-xs text-emerald-600 font-medium">+4% ↑</p>
            </div>
            <div className="text-center p-3 bg-warm-50 rounded-xl">
              <p className="text-2xl font-bold text-warm-900">31.2</p>
              <p className="text-xs text-warm-500">Putts/Rd</p>
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

      {/* Glow */}
      <div className="absolute -bottom-8 left-1/2 -tranwarm-x-1/2 w-2/3 h-12 bg-emerald-500/10 blur-2xl rounded-full" />
    </div>
  );
}
