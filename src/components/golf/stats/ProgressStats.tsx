'use client';

import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

interface RoundData {
  id: string;
  round_date: string;
  course_name: string;
  total_score: number;
  total_to_par: number;
}

interface ProgressStatsProps {
  stats: GolfStats;
  rounds: RoundData[];
}

function TrendLine({ data, label, color = 'emerald' }: { data: number[]; label: string; color?: string }) {
  if (data.length === 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1 || 1)) * 100;
    const y = 100 - ((value - min) / range) * 80;
    return `${x},${y}`;
  }).join(' ');

  const colorClasses = {
    emerald: { bg: 'bg-emerald-50', line: 'stroke-emerald-600', dot: 'fill-emerald-600', text: 'text-emerald-700' },
    blue: { bg: 'bg-blue-50', line: 'stroke-blue-600', dot: 'fill-blue-600', text: 'text-blue-700' },
    purple: { bg: 'bg-purple-50', line: 'stroke-purple-600', dot: 'fill-purple-600', text: 'text-purple-700' },
    amber: { bg: 'bg-amber-50', line: 'stroke-amber-600', dot: 'fill-amber-600', text: 'text-amber-700' },
  };

  const colors = colorClasses[color as keyof typeof colorClasses] || colorClasses.emerald;

  return (
    <div className={`rounded-xl border border-slate-200 p-4 ${colors.bg}`}>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{label}</h3>
      <div className="relative h-32 bg-white rounded-lg p-2">
        <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
          <polyline
            points={points}
            fill="none"
            className={colors.line}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {data.map((value, index) => {
            const x = (index / (data.length - 1 || 1)) * 100;
            const y = 100 - ((value - min) / range) * 80;
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="2"
                className={colors.dot}
              />
            );
          })}
        </svg>
      </div>
      <div className="flex justify-between mt-2 text-xs text-slate-500">
        <span>Oldest</span>
        <span className={`font-semibold ${colors.text}`}>
          Latest: {data[data.length - 1]?.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function ScoreDistributionChart({ stats }: { stats: GolfStats }) {
  const total = stats.totalEagles + stats.totalBirdies + stats.totalPars + stats.totalBogeys + stats.totalDoublePlus;
  if (total === 0) return null;

  const distribution = [
    { label: 'Eagles', count: stats.totalEagles, color: 'bg-yellow-500', pct: (stats.totalEagles / total) * 100 },
    { label: 'Birdies', count: stats.totalBirdies, color: 'bg-emerald-500', pct: (stats.totalBirdies / total) * 100 },
    { label: 'Pars', count: stats.totalPars, color: 'bg-slate-400', pct: (stats.totalPars / total) * 100 },
    { label: 'Bogeys', count: stats.totalBogeys, color: 'bg-orange-500', pct: (stats.totalBogeys / total) * 100 },
    { label: 'Double+', count: stats.totalDoublePlus, color: 'bg-red-500', pct: (stats.totalDoublePlus / total) * 100 },
  ].filter(d => d.count > 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Score Distribution</h3>

      {/* Horizontal Bar */}
      <div className="h-12 bg-slate-100 rounded-lg overflow-hidden flex mb-4">
        {distribution.map((d, i) => (
          <div
            key={i}
            className={`${d.color} flex items-center justify-center text-white text-xs font-bold`}
            style={{ width: `${d.pct}%` }}
          >
            {d.pct >= 8 && d.count}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {distribution.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-sm ${d.color}`}></div>
            <div className="text-xs">
              <span className="font-semibold text-slate-700">{d.count}</span>
              <span className="text-slate-500 ml-1">{d.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentRounds({ rounds }: { rounds: RoundData[] }) {
  const recentRounds = rounds.slice(0, 5);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const getScoreColor = (toPar: number) => {
    if (toPar <= -5) return 'text-emerald-700 bg-emerald-50';
    if (toPar < 0) return 'text-emerald-600 bg-emerald-50';
    if (toPar === 0) return 'text-slate-700 bg-slate-50';
    if (toPar <= 5) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">Recent Rounds</h3>
      <div className="space-y-2">
        {recentRounds.map((round, i) => (
          <div key={round.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{round.course_name}</p>
              <p className="text-xs text-slate-500">{formatDate(round.round_date)}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-lg font-bold text-slate-900">{round.total_score}</p>
              </div>
              <div className={`px-2.5 py-1 rounded-md text-sm font-semibold ${getScoreColor(round.total_to_par)}`}>
                {round.total_to_par === 0 ? 'E' : round.total_to_par > 0 ? `+${round.total_to_par}` : round.total_to_par}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressMetrics({ stats }: { stats: GolfStats }) {
  const metrics = [
    { label: 'Avg Score', value: stats.scoringAverage?.toFixed(1) || '-', subtext: 'per round' },
    { label: 'Best Round', value: stats.bestRound?.toString() || '-', subtext: 'career low' },
    { label: 'GIR %', value: stats.girPercentage?.toFixed(0) || '-', subtext: 'hit greens' },
    { label: 'Putts/Round', value: stats.puttsPerRound?.toFixed(1) || '-', subtext: 'average' },
    { label: 'Fairway %', value: stats.fairwayPercentage?.toFixed(0) || '-', subtext: 'accuracy' },
    { label: 'Scrambling', value: stats.scramblingPercentage?.toFixed(0) || '-', subtext: 'save %' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
      {metrics.map((m, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{m.value}</p>
          <p className="text-xs font-medium text-slate-700 mt-1">{m.label}</p>
          <p className="text-xs text-slate-400">{m.subtext}</p>
        </div>
      ))}
    </div>
  );
}

export default function ProgressStats({ stats, rounds }: ProgressStatsProps) {
  // Calculate trend data from rounds (last 10 rounds)
  const recentRounds = [...rounds].reverse().slice(-10);
  const scoreTrend = recentRounds.map(r => r.total_score);

  return (
    <div className="space-y-6">
      {/* Quick Metrics */}
      <ProgressMetrics stats={stats} />

      {/* Recent Rounds */}
      {rounds.length > 0 && <RecentRounds rounds={rounds} />}

      {/* Score Distribution */}
      <ScoreDistributionChart stats={stats} />

      {/* Trend Charts */}
      {scoreTrend.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TrendLine data={scoreTrend} label="Scoring Trend (Last 10 Rounds)" color="emerald" />
        </div>
      )}

      {/* Improvement Insights */}
      {stats.roundsPlayed >= 3 && (
        <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl border-2 border-emerald-200 p-6">
          <h3 className="text-lg font-semibold text-emerald-900 mb-2">📈 Keep It Up!</h3>
          <p className="text-sm text-emerald-700">
            You've played {stats.roundsPlayed} rounds. Your best score is {stats.bestRound} and you're averaging {stats.scoringAverage?.toFixed(1)}.
            {stats.totalBirdies > 0 && ` You've made ${stats.totalBirdies} birdies so far!`}
          </p>
        </div>
      )}

      {/* Empty State */}
      {stats.roundsPlayed < 3 && (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-500">Play more rounds to see trend visualizations</p>
        </div>
      )}
    </div>
  );
}
