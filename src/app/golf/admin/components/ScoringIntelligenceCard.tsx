'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminBarChart } from './AdminChart';
import { IconTarget, IconTrophy, IconTrendingUp } from '@/components/icons';

interface Props {
  scoring: AdminDashboardData['scoring'];
}

export function ScoringIntelligenceCard({ scoring }: Props) {
  const distData = scoring.scoringDistribution.map((d) => ({
    label: d.bucket,
    value: d.count,
  }));

  return (
    <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6 transition-all duration-200 hover:bg-white/80 hover:shadow-card-hover">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 bg-white/50 rounded-lg text-warm-500">
          <IconTarget size={18} />
        </div>
        <h3 className="text-lg font-semibold text-warm-900">Scoring Intelligence</h3>
      </div>

      {/* Platform stats */}
      <div className="grid grid-cols-4 gap-2.5 mb-6">
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {scoring.platformScoringAvg?.toFixed(1) ?? '—'}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">Scoring Avg</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {scoring.platformFairwayPct != null ? `${scoring.platformFairwayPct.toFixed(0)}%` : '—'}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">FWY%</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {scoring.platformGirPct != null ? `${scoring.platformGirPct.toFixed(0)}%` : '—'}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">GIR%</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {scoring.platformPuttsPerRound?.toFixed(1) ?? '—'}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">Putts/Rd</p>
        </div>
      </div>

      {/* Scoring distribution */}
      {distData.some((d) => d.value > 0) && (
        <div className="mb-6">
          <AdminBarChart data={distData} title="Score Distribution (Completed Rounds)" color="#2563EB" height={120} />
        </div>
      )}

      {/* Top performers */}
      {scoring.topPerformers.length > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-warm-500 mb-3 flex items-center gap-1.5">
            <IconTrophy size={14} />
            Top Performers
          </h4>
          <div className="space-y-2">
            {scoring.topPerformers.slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-primary-700">{i + 1}</span>
                  </span>
                  <div className="min-w-0">
                    <span className="text-warm-700 font-medium">{p.name}</span>
                    {p.teamName && (
                      <span className="text-warm-400 text-xs ml-1.5">{p.teamName}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-warm-600 tabular-nums font-semibold">{p.scoringAvg.toFixed(1)}</span>
                  <span className="text-xs text-warm-400 tabular-nums w-12 text-right">{p.roundsPlayed} rds</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent best rounds */}
      {scoring.recentBestRounds.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-warm-500 mb-3 flex items-center gap-1.5">
            <IconTrendingUp size={14} />
            Best Recent Rounds
          </h4>
          <div className="space-y-2">
            {scoring.recentBestRounds.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <span className="text-warm-700">{r.playerName}</span>
                  {r.courseName && (
                    <span className="text-warm-400 text-xs ml-1.5">at {r.courseName}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="font-semibold text-warm-700 tabular-nums">{r.score}</span>
                  <span className={`text-xs font-medium tabular-nums px-1.5 py-0.5 rounded ${
                    r.toPar < 0 ? 'bg-red-50 text-red-600' : r.toPar === 0 ? 'bg-warm-100 text-warm-600' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {r.toPar > 0 ? `+${r.toPar}` : r.toPar === 0 ? 'E' : r.toPar}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {scoring.topPerformers.length === 0 && scoring.recentBestRounds.length === 0 && (
        <p className="text-sm text-warm-400">No scoring data available yet.</p>
      )}
    </div>
  );
}
