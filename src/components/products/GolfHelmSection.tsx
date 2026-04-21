'use client';

import Image from 'next/image';
import { m } from 'framer-motion';
import { LiveRoundMockup, QualifierMockup, StatsMockup } from './golf-mockups';

/**
 * GolfHelm Product Section - Multi-Feature Showcase
 * Clean, professional design without vibe-coded patterns
 */
export function GolfHelmSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const }
    }
  };

  return (
    <section
      id="golfhelm"
      className="relative py-14 sm:py-20 md:py-28 overflow-hidden scroll-mt-20 bg-[#F5F0E8]"
    >
      <m.div
        className="relative max-w-5xl mx-auto px-5 sm:px-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
      >
        {/* Hero Intro */}
        <m.div variants={itemVariants} className="text-center max-w-2xl mx-auto mb-12 sm:mb-16 md:mb-20">
          <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 mb-5 sm:mb-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 relative">
              <Image
                src="/anim/helm-golf-icon.png"
                alt="GolfHelm"
                fill
                className="object-contain"
                sizes="96px"
              />
            </div>
            <span className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">GolfHelm</span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 leading-[1.1] tracking-tight mb-4 sm:mb-5">
            Track every shot.
            <br />
            <span className="text-emerald-600">Develop every player.</span>
          </h2>

          <p className="text-base sm:text-lg text-slate-600 mb-6 sm:mb-8 leading-relaxed">
            Complete team management system with comprehensive round tracking. Everything you need to build a winning program!
          </p>

        </m.div>

        {/* Feature 1: Live Round Tracking */}
        <m.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center mb-14 sm:mb-20 md:mb-28"
        >
          <div className="order-2 lg:order-1">
            <LiveRoundMockup />
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-medium text-emerald-600 uppercase tracking-wide mb-3">
              Live Tracking
            </p>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 tracking-tight">
              Every shot, captured in real-time
            </h3>
            <p className="text-slate-600 mb-5 leading-relaxed">
              Players log shots from their phones during rounds. Coaches see live updates,
              hole-by-hole scores, and club selection data as it happens.
            </p>
            <ul className="space-y-2">
              {['Shot-by-shot tracking', 'Club selection & distances', 'GIR, putts, penalties', 'Works offline'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </m.div>

        {/* Feature 2: Qualifiers */}
        <m.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center mb-14 sm:mb-20 md:mb-28"
        >
          <div>
            <p className="text-sm font-medium text-amber-600 uppercase tracking-wide mb-3">
              Qualifiers
            </p>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 tracking-tight">
              Run qualifiers like the pros
            </h3>
            <p className="text-slate-600 mb-5 leading-relaxed">
              Set up multi-round qualifiers with automatic scoring, live leaderboards,
              and transparent lineup selection. No more spreadsheet chaos.
            </p>
            <ul className="space-y-2">
              {['Multi-round events', 'Automatic leaderboards', 'Tiebreaker rules', 'Travel team selection'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <QualifierMockup />
          </div>
        </m.div>

        {/* Feature 3: Stats & Analytics */}
        <m.div
          variants={itemVariants}
          className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center mb-14 sm:mb-20 md:mb-28"
        >
          <div className="order-2 lg:order-1">
            <StatsMockup />
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-sm font-medium text-blue-600 uppercase tracking-wide mb-3">
              Analytics
            </p>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 tracking-tight">
              See the trends that matter
            </h3>
            <p className="text-slate-600 mb-5 leading-relaxed">
              Track team and individual performance over time. Spot improvements,
              identify weaknesses, and make data-driven coaching decisions.
            </p>
            <ul className="space-y-2">
              {['Scoring trends', 'GIR & putting stats', 'Player comparisons', 'Season progress'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-slate-600 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </m.div>

        {/* Feature 4: CoachHelm AI */}
        <m.div variants={itemVariants} className="relative">
          <div className="bg-gradient-to-b from-[#0c0c10] via-[#0e0f14] to-[#0a0a0e] rounded-2xl p-5 sm:p-8 md:p-12 overflow-hidden relative">
            {/* Subtle dot grid */}
            <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
            {/* Soft warm glow top center — static radial gradient (no blur) */}
            <div
              className="absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 60%)' }}
            />

            <div className="relative">
              {/* Header — centered */}
              <div className="text-center mb-8 sm:mb-12">
                <div className="flex flex-col items-center gap-4 mb-6">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 relative">
                    <Image src="/anim/helm-coach-icon.png" alt="CoachHelm" fill className="object-contain" sizes="80px" />
                  </div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.06] text-white/80 text-base font-bold rounded-xl ring-1 ring-white/[0.08]">
                    Coach<span className="text-emerald-400">Helm</span>&nbsp;AI
                  </div>
                </div>
                <h3 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
                  Your personal golf intelligence
                </h3>
                <p className="text-white/35 text-lg max-w-xl mx-auto leading-relaxed">
                  Smarter practice. Lower scores. AI that understands every shot.
                </p>
              </div>

              {/* Feature cards grid */}
              <div className="grid md:grid-cols-3 gap-4 mb-8">
                {/* Round Review Card */}
                <div className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-5 ring-1 ring-white/[0.08] hover:ring-white/15 transition-all group">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/20">
                      <svg className="w-4.5 h-4.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                    <h4 className="text-white font-semibold text-sm">AI Round Review</h4>
                  </div>
                  {/* Mini round review mockup */}
                  <div className="bg-black/30 rounded-lg p-3.5 mb-3">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[10px] text-white/40 font-medium">Pebble Beach GL</span>
                      <span className="text-lg font-bold text-white">72 <span className="text-xs text-white/40 font-normal">Even</span></span>
                    </div>
                    {/* Mini scorecard */}
                    <div className="flex gap-0.5 mb-3">
                      {[4,3,4,5,3,5,3,4,4].map((s, i) => {
                        const pars = [4,4,3,5,4,4,3,5,4];
                        const diff = s - pars[i]!;
                        return (
                          <div key={i} className={`flex-1 h-5 rounded text-[8px] font-bold flex items-center justify-center ${
                            diff < 0 ? 'bg-emerald-500/30 text-emerald-300' :
                            diff === 0 ? 'bg-white/10 text-white/50' :
                            'bg-amber-500/20 text-amber-300'
                          }`}>{s}</div>
                        );
                      })}
                    </div>
                    <div className="bg-white/[0.04] rounded-md p-2 ring-1 ring-white/[0.06]">
                      <p className="text-[10px] text-white/50 font-medium leading-relaxed">
                        Short game improved 18% this round. Approach shots within 120yds averaged 12ft from pin.
                      </p>
                    </div>
                  </div>
                  {/* Stats row */}
                  <div className="flex gap-2">
                    {[
                      { label: 'Short Game', value: '+18%', color: 'text-emerald-400' },
                      { label: 'Proximity', value: '12 ft', color: 'text-white' },
                      { label: 'FIR', value: '71%', color: 'text-emerald-400' },
                    ].map((s) => (
                      <div key={s.label} className="flex-1 bg-black/20 rounded-md px-2 py-1.5 text-center">
                        <p className={`text-xs font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-[9px] text-white/30 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Team Trends Card */}
                <div className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-5 ring-1 ring-white/[0.08] hover:ring-white/15 transition-all group">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/20">
                      <svg className="w-4.5 h-4.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <polyline points="23,6 13.5,15.5 8.5,10.5 1,18" />
                        <polyline points="17,6 23,6 23,12" />
                      </svg>
                    </div>
                    <h4 className="text-white font-semibold text-sm">Team Trends</h4>
                  </div>
                  {/* Mini trend chart */}
                  <div className="bg-black/30 rounded-lg p-3.5 mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-white/40 font-medium">Team Avg (Last 7 rounds)</span>
                      <span className="text-xs font-bold text-emerald-400">+1.8 ↓</span>
                    </div>
                    {/* Sparkline bars */}
                    <div className="flex items-end gap-1 h-16">
                      {[78, 76, 77, 74, 75, 73, 72].map((v, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                          <div
                            className={`w-full rounded-sm ${i === 6 ? 'bg-emerald-500' : 'bg-emerald-500/30'}`}
                            style={{ height: `${((80 - v) / 10) * 100}%`, minHeight: '12%' }}
                          />
                          <span className="text-[7px] text-white/25">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Trend indicators */}
                  <div className="space-y-1.5">
                    {[
                      { label: '5 members improving', icon: '↑', color: 'text-emerald-400 bg-emerald-500/10' },
                      { label: '2 declining', icon: '↓', color: 'text-red-400 bg-red-500/10' },
                      { label: '1 stable', icon: '—', color: 'text-white/40 bg-white/5' },
                    ].map((t) => (
                      <div key={t.label} className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${t.color}`}>{t.icon}</span>
                        <span className="text-[11px] text-white/50">{t.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Strengths & Weaknesses Card */}
                <div className="bg-white/[0.06] backdrop-blur-sm rounded-xl p-5 ring-1 ring-white/[0.08] hover:ring-white/15 transition-all group">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/20">
                      <svg className="w-4.5 h-4.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                        <line x1="9" y1="9" x2="9.01" y2="9" />
                        <line x1="15" y1="9" x2="15.01" y2="9" />
                      </svg>
                    </div>
                    <h4 className="text-white font-semibold text-sm">Strengths & Weaknesses</h4>
                  </div>
                  {/* Strokes gained breakdown */}
                  <div className="bg-black/30 rounded-lg p-3.5 mb-3">
                    <p className="text-[10px] text-white/40 font-medium mb-3">Strokes Gained vs Field</p>
                    <div className="space-y-2">
                      {[
                        { label: 'SG: Approach', value: '+1.3', pct: 65, positive: true },
                        { label: 'Scrambling %', value: '+1.1', pct: 55, positive: true },
                        { label: 'Doubles+/Rnd', value: '+2.0', pct: 75, positive: true },
                      ].map((s) => (
                        <div key={s.label}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] text-white/50">{s.label}</span>
                            <span className="text-[10px] font-bold text-emerald-400">{s.value}</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${s.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="h-px bg-white/5 my-3" />
                    <p className="text-[9px] text-red-400/60 font-semibold uppercase tracking-wider mb-2">Areas to Improve</p>
                    <div className="space-y-2">
                      {[
                        { label: 'SG: Putting', value: '-2.0', pct: 70, positive: false },
                        { label: 'Three-putts', value: '-1.4', pct: 50, positive: false },
                      ].map((s) => (
                        <div key={s.label}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] text-white/50">{s.label}</span>
                            <span className="text-[10px] font-bold text-red-400">{s.value}</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500/50 rounded-full" style={{ width: `${s.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-white/30 leading-relaxed">AI-identified from your strokes gained data across 14 rounds.</p>
                </div>
              </div>

              {/* Bottom tagline */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
                <p className="text-white/25 text-xs font-semibold uppercase tracking-widest">Powered by AI</p>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
              </div>
            </div>
          </div>
        </m.div>
      </m.div>
    </section>
  );
}
