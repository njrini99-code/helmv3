'use client';

export function LiveRoundMockup() {
  return (
    <div className="relative mx-auto w-[300px]">
      {/* Phone frame */}
      <div className="relative bg-slate-900 rounded-[44px] p-3 shadow-2xl ring-1 ring-white/10">
        {/* Side button accents */}
        <div className="absolute -right-[2px] top-28 w-[3px] h-8 bg-slate-700 rounded-r-sm" />
        <div className="absolute -left-[2px] top-24 w-[3px] h-6 bg-slate-700 rounded-l-sm" />
        <div className="absolute -left-[2px] top-36 w-[3px] h-12 bg-slate-700 rounded-l-sm" />
        <div className="absolute -left-[2px] top-52 w-[3px] h-12 bg-slate-700 rounded-l-sm" />

        {/* Screen */}
        <div className="bg-warm-50 rounded-[36px] overflow-hidden">
          {/* Dynamic Island */}
          <div className="flex items-center justify-between px-7 pt-3 pb-1 bg-warm-900">
            <span className="text-[11px] text-white/70 font-medium">9:41</span>
            <div className="w-[90px] h-[28px] bg-black rounded-full" />
            <div className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M2 17h2v4H2zm4-5h2v9H6zm4-4h2v13h-2zm4-3h2v16h-2zm4-3h2v19h-2z"/></svg>
              <svg className="w-3.5 h-3.5 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>
              <svg className="w-4 h-4 text-white/70" fill="currentColor" viewBox="0 0 24 24"><path d="M17 6H7c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H7V8h10v8zm4-9v10h-1V7h1z"/></svg>
            </div>
          </div>

          {/* Scorecard Header - dark */}
          <div className="bg-warm-900">
            {/* Nav bar */}
            <div className="flex justify-between items-center px-4 py-2 border-b border-warm-700">
              <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">← Prev</span>
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">Hole 7 of 18</span>
              </div>
              <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wide">Next →</span>
            </div>

            {/* Hole buttons row */}
            <div className="flex">
              {[
                { hole: 4, par: 4, yds: 412, score: 4, color: 'text-white' },
                { hole: 5, par: 3, yds: 187, score: 2, color: 'text-emerald-400' },
                { hole: 6, par: 5, yds: 523, score: 5, color: 'text-white' },
                { hole: 7, par: 4, yds: 389, score: null, color: '', current: true },
              ].map((h) => (
                <div
                  key={h.hole}
                  className={`flex-1 py-2 px-1.5 text-center border-r border-warm-700 ${
                    h.current ? 'bg-emerald-600' : 'bg-warm-900'
                  }`}
                >
                  <div className={`text-[9px] font-semibold ${h.current ? 'text-white' : 'text-warm-300'}`}>Hole {h.hole}</div>
                  <div className={`text-[9px] ${h.current ? 'text-emerald-100' : 'text-warm-400'}`}>Par {h.par}</div>
                  <div className={`text-[9px] ${h.current ? 'text-emerald-100' : 'text-warm-500'}`}>{h.yds} yds</div>
                  <div className={`mt-0.5 text-sm font-bold ${h.current ? 'text-white' : h.color}`}>
                    {h.score ?? '-'}
                  </div>
                  {h.score !== null && !h.current && (
                    <svg className="w-2.5 h-2.5 mx-auto text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              ))}
              <div className="flex-1 py-2 px-1.5 text-center bg-warm-800">
                <div className="text-[9px] font-semibold text-amber-400">OUT</div>
                <div className="text-[9px] text-warm-400">Par 36</div>
                <div className="text-[9px] text-warm-500">3,421</div>
                <div className="mt-0.5 text-sm font-bold text-amber-400">-</div>
              </div>
            </div>
          </div>

          {/* Shot Pills */}
          <div className="bg-white py-2.5 px-3 border-b border-warm-100 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-semibold text-warm-400 uppercase tracking-wider">Shot</span>
              <div className="flex gap-1.5">
                <div className="min-w-[30px] h-7 px-2 rounded-md flex items-center justify-center text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">1</div>
                <div className="min-w-[30px] h-7 px-2 rounded-md flex items-center justify-center text-[11px] font-semibold bg-emerald-600 text-white shadow-sm">2</div>
                <div className="min-w-[30px] h-7 px-2 rounded-md flex items-center justify-center text-[11px] font-semibold bg-warm-50 text-warm-300 ring-1 ring-warm-200">3</div>
                <div className="min-w-[30px] h-7 px-2 rounded-md flex items-center justify-center text-[11px] font-semibold bg-warm-50 text-warm-300 ring-1 ring-warm-200">4</div>
                <div className="min-w-[30px] h-7 px-2 rounded-md flex items-center justify-center text-[11px] font-semibold bg-warm-50 text-warm-300 ring-1 ring-warm-200">5</div>
              </div>
            </div>
          </div>

          {/* Hole Header Card - green gradient */}
          <div className="mx-3 mt-3">
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl p-4 text-white shadow-lg shadow-emerald-950/10">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold">Hole 7</h3>
                    <span className="px-2 py-0.5 bg-white/15 backdrop-blur-sm rounded text-[10px] font-semibold uppercase tracking-wide">Par 4</span>
                  </div>
                  <p className="text-emerald-100 text-[11px] mt-1">Shot 2 · Approach · <span className="font-medium">Fairway</span></p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-200 text-[9px] font-semibold uppercase tracking-wider">Distance</p>
                  <p className="text-2xl font-bold mt-0.5">156<span className="text-sm ml-0.5 font-semibold text-emerald-100">YDS</span></p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3 bg-white/10 backdrop-blur-sm rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] text-emerald-100 font-semibold uppercase tracking-wide">Progress</span>
                  <span className="text-[9px] text-emerald-100 font-bold">60%</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full" style={{ width: '60%' }} />
                </div>
                <div className="flex justify-between mt-1.5 text-[9px] text-emerald-100">
                  <span className="flex items-center gap-1 font-medium">
                    <span className="w-1 h-1 rounded-full border border-white/60" />
                    Tee
                  </span>
                  <span className="font-bold text-[10px]">156 yds left</span>
                  <span className="flex items-center gap-1 font-medium">
                    Hole
                    <span className="w-1 h-1 rounded-full bg-white" />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Shot Result Card */}
          <div className="mx-3 mt-2.5">
            <div className="bg-white/70 backdrop-blur rounded-xl p-4 border border-warm-200/60 shadow-sm">
              <p className="text-[9px] font-bold text-warm-500 uppercase tracking-wider mb-2.5">Shot Result</p>
              <div className="grid grid-cols-3 gap-1.5">
                {['Fairway', 'Rough', 'Sand', 'Green', 'Hole', 'Other'].map((r) => (
                  <button
                    key={r}
                    className={`py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                      r === 'Green'
                        ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-950/10'
                        : 'bg-warm-100 text-warm-600'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Distance After Shot */}
          <div className="mx-3 mt-2.5">
            <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl p-4 border-2 border-emerald-200 shadow-sm">
              <p className="text-[9px] font-bold text-warm-500 uppercase tracking-wider mb-2">Distance to Hole</p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-3xl font-bold text-warm-900">12</span>
                <span className="text-sm font-semibold text-warm-400">feet</span>
              </div>
              <div className="flex gap-1.5 mt-2.5">
                {['5ft', '10ft', '15ft', '20ft'].map((d) => (
                  <button
                    key={d}
                    className={`flex-1 py-1.5 rounded-md text-[10px] font-semibold ${
                      d === '10ft' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' : 'bg-warm-100 text-warm-500'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Next Shot Button */}
          <div className="mx-3 mt-2.5 mb-4">
            <button className="w-full py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl shadow-sm shadow-emerald-950/10">
              Next Shot →
            </button>
            <div className="flex gap-2 mt-2">
              <button className="flex-1 py-2.5 bg-red-50 text-red-600 text-[11px] font-semibold rounded-lg border border-red-200">
                + Penalty
              </button>
              <button className="flex-1 py-2.5 bg-warm-100 text-warm-600 text-[11px] font-semibold rounded-lg border border-warm-200">
                Undo Last
              </button>
            </div>
          </div>

          {/* Home indicator */}
          <div className="flex justify-center pb-2">
            <div className="w-28 h-1 bg-warm-300 rounded-full" />
          </div>
        </div>
      </div>

      {/* Glow effect */}
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-56 h-20 bg-emerald-500/15 blur-3xl rounded-full" />
    </div>
  );
}
