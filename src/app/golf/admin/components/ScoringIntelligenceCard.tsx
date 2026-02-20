'use client';

import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { cn } from '@/lib/utils';
import { Target, Trophy, TrendingUp } from 'lucide-react';

interface Props {
  scoring: AdminDashboardData['scoring'];
}

const bucketColors: Record<string, string> = {
  'Under 70': '#16A34A',
  '70-74': '#22C55E',
  '75-79': '#3B82F6',
  '80-84': '#F59E0B',
  '85-89': '#F97316',
  '90+': '#EF4444',
};

const medalIcons = ['\ud83e\udd47', '\ud83e\udd48', '\ud83e\udd49'];

export function ScoringIntelligenceCard({ scoring }: Props) {
  const distData = scoring.scoringDistribution;
  const maxDist = Math.max(...distData.map((d) => d.count), 1);
  const totalDist = distData.reduce((s, d) => s + d.count, 0);

  return (
    <div className="glass-standard rounded-2xl p-6 transition-all duration-200 hover:bg-white/80 active:bg-white/90 hover:shadow-card-hover">
      <div className="flex items-center gap-2 mb-5">
        <div className="p-2 bg-white/50 rounded-lg text-warm-500">
          <Target size={18} />
        </div>
        <h3 className="text-lg font-semibold text-warm-900">Scoring Intelligence</h3>
      </div>

      {/* Platform stats */}
      <div className="grid grid-cols-4 gap-2.5 mb-6">
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {scoring.platformScoringAvg?.toFixed(1) ?? '\u2014'}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">Scoring Avg</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {scoring.platformFairwayPct != null ? `${scoring.platformFairwayPct.toFixed(0)}%` : '\u2014'}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">FWY%</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {scoring.platformGirPct != null ? `${scoring.platformGirPct.toFixed(0)}%` : '\u2014'}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">GIR%</p>
        </div>
        <div className="bg-white/50 rounded-xl p-3 text-center">
          <p className="text-xl font-semibold text-warm-900 tabular-nums">
            {scoring.platformPuttsPerRound?.toFixed(1) ?? '\u2014'}
          </p>
          <p className="text-[10px] text-warm-500 mt-0.5">Putts/Rd</p>
        </div>
      </div>

      {/* Color-coded scoring distribution */}
      {distData.some((d) => d.count > 0) && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-warm-500 mb-3">Score Distribution</h4>
          <div className="space-y-2">
            {distData.map((d) => {
              const pct = totalDist > 0 ? (d.count / totalDist) * 100 : 0;
              const color = bucketColors[d.bucket] ?? '#9CA3AF';
              return (
                <div key={d.bucket} className="flex items-center gap-3">
                  <span className="text-xs text-warm-500 w-16 shrink-0 text-right tabular-nums">{d.bucket}</span>
                  <div className="flex-1 h-6 bg-warm-50 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                      style={{
                        width: `${Math.max((d.count / maxDist) * 100, d.count > 0 ? 8 : 0)}%`,
                        backgroundImage: `linear-gradient(to right, ${color}cc, ${color})`,
                      }}
                    >
                      {d.count > 0 && (
                        <span className="text-[10px] font-medium text-white drop-shadow-sm tabular-nums">
                          {d.count}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-warm-400 w-10 text-right tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top performers with medal icons */}
      {scoring.topPerformers.length > 0 && (
        <div className="mb-5">
          <h4 className="text-sm font-medium text-warm-500 mb-3 flex items-center gap-1.5">
            <Trophy size={14} />
            Top Performers
          </h4>
          <div className="space-y-2">
            {scoring.topPerformers.slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  {i < 3 ? (
                    <span className="w-5 h-5 flex items-center justify-center shrink-0 text-sm">
                      {medalIcons[i]}
                    </span>
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-warm-100 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-warm-500">{i + 1}</span>
                    </span>
                  )}
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
            <TrendingUp size={14} />
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
                  <span className={cn(
                    'text-xs font-medium tabular-nums px-1.5 py-0.5 rounded',
                    r.toPar < 0 ? 'bg-red-50 text-red-600' : r.toPar === 0 ? 'bg-warm-100 text-warm-600' : 'bg-blue-50 text-blue-600'
                  )}>
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
