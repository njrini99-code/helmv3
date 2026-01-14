'use client';

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
