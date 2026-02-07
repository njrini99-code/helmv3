'use client';

import { useState, memo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';
import { IconChevronDown, IconChevronUp, IconTrendingUp, IconTrendingDown } from '@/components/icons';

// Dynamic imports for recharts - reduces initial bundle size by ~150KB
const Line = dynamic(() => import('recharts').then(mod => mod.Line), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(mod => mod.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false });
const Area = dynamic(() => import('recharts').then(mod => mod.Area), { ssr: false });
const BarChart = dynamic(() => import('recharts').then(mod => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(mod => mod.Bar), { ssr: false });
const ComposedChart = dynamic(() => import('recharts').then(mod => mod.ComposedChart), { ssr: false });

// Chart loading skeleton
function ChartSkeleton() {
  return (
    <div className="h-64 bg-slate-100/50 rounded-xl animate-pulse flex items-center justify-center">
      <span className="text-slate-400 text-sm">Loading chart...</span>
    </div>
  );
}

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

function formatDate(dateStr: string, short = false) {
  const date = new Date(dateStr);
  if (short) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function getScoreColor(toPar: number) {
  if (toPar <= -5) return 'text-emerald-700 bg-emerald-50';
  if (toPar < 0) return 'text-emerald-600 bg-emerald-50';
  if (toPar === 0) return 'text-slate-700 bg-slate-50';
  if (toPar <= 5) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

function calculateMovingAverage(data: number[], window: number): (number | null)[] {
  return data.map((_, index) => {
    if (index < window - 1) return null;
    const slice = data.slice(index - window + 1, index + 1);
    return slice.reduce((a, b) => a + b, 0) / window;
  });
}

function calculateTrend(data: number[]): { direction: 'up' | 'down' | 'stable'; percentage: number } {
  if (data.length < 2) return { direction: 'stable', percentage: 0 };

  const recentHalf = data.slice(-Math.ceil(data.length / 2));
  const olderHalf = data.slice(0, Math.floor(data.length / 2));

  if (recentHalf.length === 0 || olderHalf.length === 0) return { direction: 'stable', percentage: 0 };

  const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
  const olderAvg = olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length;

  const diff = recentAvg - olderAvg;
  const percentage = olderAvg !== 0
    ? Math.abs((diff / olderAvg) * 100)
    : 0;

  // For golf scores, lower is better
  if (diff < -1) return { direction: 'up', percentage };
  if (diff > 1) return { direction: 'down', percentage };
  return { direction: 'stable', percentage };
}

// Custom tooltip for charts
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm font-semibold" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
        </p>
      ))}
    </div>
  );
}

const ScoringTrendChart = memo(function ScoringTrendChart({ rounds }: { rounds: RoundData[] }) {
  const [showMovingAvg, setShowMovingAvg] = useState(true);

  if (rounds.length < 2) return null;

  const sortedRounds = [...rounds].reverse(); // Oldest to newest
  const scores = sortedRounds.map(r => r.total_score);
  const movingAvg = calculateMovingAverage(scores, 3);

  const chartData = sortedRounds.map((round, index) => ({
    date: formatDate(round.round_date, true),
    fullDate: formatDate(round.round_date),
    course: round.course_name,
    score: round.total_score,
    toPar: round.total_to_par,
    movingAvg: movingAvg[index],
  }));

  const trend = calculateTrend(scores);

  return (
    <div className="relative glass-standard rounded-2xl overflow-hidden p-6">
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />

      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Scoring Trend</h3>
          <p className="text-sm text-slate-500 mt-0.5">Last {rounds.length} rounds</p>
        </div>
        <div className="flex items-center gap-2">
          {trend.direction !== 'stable' && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              trend.direction === 'up' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {trend.direction === 'up' ? (
                <IconTrendingDown size={14} />
              ) : (
                <IconTrendingUp size={14} />
              )}
              {trend.percentage.toFixed(1)}%
            </div>
          )}
          <button
            onClick={() => setShowMovingAvg(!showMovingAvg)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showMovingAvg ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            3-Round Avg
          </button>
        </div>
      </div>

      <Suspense fallback={<ChartSkeleton />}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                domain={['dataMin - 2', 'dataMax + 2']}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#16a34a"
                strokeWidth={2}
                fill="url(#scoreGradient)"
                name="Score"
                dot={{ fill: '#16a34a', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
              />
              {showMovingAvg && (
                <Line
                  type="monotone"
                  dataKey="movingAvg"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="3-Round Avg"
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Suspense>
    </div>
  );
});

const ScoreDistributionChart = memo(function ScoreDistributionChart({ stats }: { stats: GolfStats }) {
  const total = stats.totalEagles + stats.totalBirdies + stats.totalPars + stats.totalBogeys + stats.totalDoublePlus;
  if (total === 0) return null;

  const distribution = [
    { label: 'Eagles', count: stats.totalEagles, color: '#eab308', pct: (stats.totalEagles / total) * 100 },
    { label: 'Birdies', count: stats.totalBirdies, color: '#16a34a', pct: (stats.totalBirdies / total) * 100 },
    { label: 'Pars', count: stats.totalPars, color: '#64748b', pct: (stats.totalPars / total) * 100 },
    { label: 'Bogeys', count: stats.totalBogeys, color: '#f97316', pct: (stats.totalBogeys / total) * 100 },
    { label: 'Double+', count: stats.totalDoublePlus, color: '#dc2626', pct: (stats.totalDoublePlus / total) * 100 },
  ].filter(d => d.count > 0);

  const chartData = distribution.map(d => ({
    name: d.label,
    value: d.count,
    pct: d.pct,
    fill: d.color,
  }));

  return (
    <div className="relative glass-standard rounded-2xl overflow-hidden p-6">
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />
      <h3 className="text-base font-semibold text-slate-900 mb-4">Score Distribution</h3>

      <Suspense fallback={<ChartSkeleton />}>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12, fill: '#374151', fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                formatter={(value, _name, props) => {
                  const payload = props?.payload as { pct: number } | undefined;
                  return [
                    `${value} (${payload?.pct?.toFixed(1) ?? 0}%)`,
                    'Count'
                  ];
                }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Suspense>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-4 pt-4 border-t border-slate-100">
        {distribution.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="text-sm">
              <span className="font-semibold text-slate-700">{d.count}</span>
              <span className="text-slate-500 ml-1">{d.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

const RecentRounds = memo(function RecentRounds({ rounds }: { rounds: RoundData[] }) {
  const [expanded, setExpanded] = useState(false);
  const displayRounds = expanded ? rounds : rounds.slice(0, 5);

  return (
    <div className="relative glass-standard rounded-2xl overflow-hidden p-6">
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-900">Recent Rounds</h3>
        {rounds.length > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium transition-colors"
          >
            {expanded ? (
              <>Show Less <IconChevronUp size={16} /></>
            ) : (
              <>Show All ({rounds.length}) <IconChevronDown size={16} /></>
            )}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {displayRounds.map((round, index) => (
          <div
            key={round.id}
            className="flex items-center justify-between p-3 bg-slate-50/80 rounded-xl hover:bg-slate-100/80 transition-colors"
            style={{ animation: `fadeIn 0.3s ease-out forwards`, animationDelay: `${index * 50}ms` }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{round.course_name}</p>
              <p className="text-xs text-slate-500">{formatDate(round.round_date)}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-lg font-bold text-slate-900">{round.total_score}</p>
              </div>
              <div className={`px-2.5 py-1 rounded-lg text-sm font-semibold ${getScoreColor(round.total_to_par)}`}>
                {round.total_to_par === 0 ? 'E' : round.total_to_par > 0 ? `+${round.total_to_par}` : round.total_to_par}
              </div>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
});

const ProgressMetrics = memo(function ProgressMetrics({ stats }: { stats: GolfStats }) {
  const metrics = [
    { label: 'Avg Score', value: stats.scoringAverage?.toFixed(1) || '-', subtext: 'per round', color: 'text-green-600' },
    { label: 'Best Round', value: stats.bestRound?.toString() || '-', subtext: 'career low', color: 'text-emerald-600' },
    { label: 'GIR %', value: stats.girPercentage ? `${stats.girPercentage.toFixed(0)}%` : '-', subtext: 'hit greens', color: 'text-blue-600' },
    { label: 'Putts/Round', value: stats.puttsPerRound?.toFixed(1) || '-', subtext: 'average', color: 'text-purple-600' },
    { label: 'Fairway %', value: stats.fairwayPercentage ? `${stats.fairwayPercentage.toFixed(0)}%` : '-', subtext: 'accuracy', color: 'text-amber-600' },
    { label: 'Scrambling', value: stats.scramblingPercentage ? `${stats.scramblingPercentage.toFixed(0)}%` : '-', subtext: 'save %', color: 'text-rose-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {metrics.map((m, i) => (
        <div
          key={i}
          className="relative glass-standard rounded-xl overflow-hidden p-4 text-center transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
          style={{ animation: `scaleIn 0.3s ease-out forwards`, animationDelay: `${i * 50}ms` }}
        >
          <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
          />
          <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
          <p className="text-xs font-medium text-slate-700 mt-1">{m.label}</p>
          <p className="text-xs text-slate-400">{m.subtext}</p>
        </div>
      ))}

      <style jsx>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
});

const RoundComparisonTable = memo(function RoundComparisonTable({ rounds }: { rounds: RoundData[] }) {
  const [sortBy, setSortBy] = useState<'date' | 'score'>('date');
  const [sortAsc, setSortAsc] = useState(false);

  if (rounds.length < 2) return null;

  const sortedRounds = [...rounds].sort((a, b) => {
    if (sortBy === 'date') {
      const diff = new Date(b.round_date).getTime() - new Date(a.round_date).getTime();
      return sortAsc ? -diff : diff;
    }
    const diff = a.total_score - b.total_score;
    return sortAsc ? diff : -diff;
  });

  const handleSort = (column: 'date' | 'score') => {
    if (sortBy === column) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(column);
      setSortAsc(column === 'score'); // Default ascending for score (lower is better)
    }
  };

  return (
    <div className="relative glass-standard rounded-2xl overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />
      <div className="p-6 pb-4">
        <h3 className="text-base font-semibold text-slate-900">Round Comparison</h3>
        <p className="text-sm text-slate-500 mt-0.5">Click column headers to sort</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/50">
              <th
                className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-1">
                  Date
                  {sortBy === 'date' && (sortAsc ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />)}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Course
              </th>
              <th
                className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700"
                onClick={() => handleSort('score')}
              >
                <div className="flex items-center justify-center gap-1">
                  Score
                  {sortBy === 'score' && (sortAsc ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />)}
                </div>
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                To Par
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRounds.slice(0, 10).map((round) => (
              <tr key={round.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-3 text-sm text-slate-600">
                  {formatDate(round.round_date)}
                </td>
                <td className="px-6 py-3 text-sm font-medium text-slate-900">
                  {round.course_name}
                </td>
                <td className="px-6 py-3 text-center">
                  <span className="text-lg font-bold text-slate-900">{round.total_score}</span>
                </td>
                <td className="px-6 py-3 text-center">
                  <span className={`inline-flex px-2.5 py-1 rounded-lg text-sm font-semibold ${getScoreColor(round.total_to_par)}`}>
                    {round.total_to_par === 0 ? 'E' : round.total_to_par > 0 ? `+${round.total_to_par}` : round.total_to_par}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

// Putting Make % by Distance Chart
const PuttMakeChart = memo(function PuttMakeChart({ stats }: { stats: GolfStats }) {
  const data = [
    { distance: '0-3ft', pct: stats.puttMakePct0_3 ?? 0, fill: '#16a34a' },
    { distance: '3-5ft', pct: stats.puttMakePct3_5 ?? 0, fill: '#22c55e' },
    { distance: '5-10ft', pct: stats.puttMakePct5_10 ?? 0, fill: '#fbbf24' },
    { distance: '10-15ft', pct: stats.puttMakePct10_15 ?? 0, fill: '#f97316' },
    { distance: '15-20ft', pct: stats.puttMakePct15_20 ?? 0, fill: '#ef4444' },
    { distance: '20-25ft', pct: stats.puttMakePct20_25 ?? 0, fill: '#dc2626' },
    { distance: '25-30ft', pct: stats.puttMakePct25_30 ?? 0, fill: '#b91c1c' },
    { distance: '30-35ft', pct: stats.puttMakePct30_35 ?? 0, fill: '#991b1b' },
    { distance: '35+ft', pct: stats.puttMakePct35Plus ?? 0, fill: '#7f1d1d' },
  ].filter(d => d.pct > 0);

  if (data.length === 0) return null;

  return (
    <div className="relative glass-standard rounded-2xl overflow-hidden p-6">
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />
      <h3 className="text-base font-semibold text-slate-900 mb-4">Putt Make % by Distance</h3>

      <Suspense fallback={<ChartSkeleton />}>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="distance"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                formatter={(value) => [`${(value as number).toFixed(1)}%`, 'Make Rate']}
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              />
              <Bar dataKey="pct" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Suspense>

      <div className="text-xs text-slate-500 text-center mt-3">
        Distance buckets show make percentage from first putt
      </div>
    </div>
  );
});

// GIR by Par Type Chart
const GirByParChart = memo(function GirByParChart({ stats }: { stats: GolfStats }) {
  const data = [
    { par: 'Par 3', pct: stats.girPctPar3 ?? 0, fill: '#16a34a' },
    { par: 'Par 4', pct: stats.girPctPar4 ?? 0, fill: '#3b82f6' },
    { par: 'Par 5', pct: stats.girPctPar5 ?? 0, fill: '#8b5cf6' },
  ].filter(d => d.pct > 0);

  if (data.length === 0) return null;

  return (
    <div className="relative glass-standard rounded-2xl overflow-hidden p-6">
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />
      <h3 className="text-base font-semibold text-slate-900 mb-4">GIR % by Hole Type</h3>

      <Suspense fallback={<ChartSkeleton />}>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="par"
                tick={{ fontSize: 12, fill: '#374151', fontWeight: 500 }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                formatter={(value) => [`${(value as number).toFixed(1)}%`, 'GIR Rate']}
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              />
              <Bar dataKey="pct" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Suspense>

      <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-slate-100">
        <div className="text-center">
          <div className="text-lg font-bold text-slate-900">{stats.girPercentage?.toFixed(1) ?? '--'}%</div>
          <div className="text-xs text-slate-500">Overall GIR</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-slate-900">{stats.girPerRound?.toFixed(1) ?? '--'}</div>
          <div className="text-xs text-slate-500">GIR/Round</div>
        </div>
      </div>
    </div>
  );
});

// Strokes Gained Breakdown Chart
const StrokesGainedChart = memo(function StrokesGainedChart({ stats }: { stats: GolfStats }) {
  const data = [
    {
      category: 'Tee',
      value: stats.sgTeePerRound ?? 0,
      fill: stats.sgTeePerRound && stats.sgTeePerRound >= 0 ? '#16a34a' : '#ef4444'
    },
    {
      category: 'Approach',
      value: stats.sgApproachPerRound ?? 0,
      fill: stats.sgApproachPerRound && stats.sgApproachPerRound >= 0 ? '#16a34a' : '#ef4444'
    },
    {
      category: 'Around Green',
      value: stats.sgAroundGreenPerRound ?? 0,
      fill: stats.sgAroundGreenPerRound && stats.sgAroundGreenPerRound >= 0 ? '#16a34a' : '#ef4444'
    },
    {
      category: 'Putting',
      value: stats.sgPuttingPerRound ?? 0,
      fill: stats.sgPuttingPerRound && stats.sgPuttingPerRound >= 0 ? '#16a34a' : '#ef4444'
    },
  ];

  // Check if we have any non-zero data
  const hasData = data.some(d => d.value !== 0);
  if (!hasData) return null;

  return (
    <div className="relative glass-standard rounded-2xl overflow-hidden p-6">
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Strokes Gained (per Round)</h3>
          <p className="text-sm text-slate-500 mt-0.5">vs PGA Tour baseline</p>
        </div>
        <div className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
          (stats.sgTotalPerRound ?? 0) >= 0
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {(stats.sgTotalPerRound ?? 0) >= 0 ? '+' : ''}{stats.sgTotalPerRound?.toFixed(2) ?? '0.00'}
        </div>
      </div>

      <Suspense fallback={<ChartSkeleton />}>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
                domain={['dataMin - 0.5', 'dataMax + 0.5']}
              />
              <YAxis
                type="category"
                dataKey="category"
                tick={{ fontSize: 12, fill: '#374151', fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                formatter={(value) => {
                  const num = value as number;
                  return [
                    `${num >= 0 ? '+' : ''}${num.toFixed(2)}`,
                    'SG/Round'
                  ];
                }}
                contentStyle={{
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Suspense>

      <div className="text-xs text-slate-500 text-center mt-3">
        Positive = gaining strokes vs tour avg | Negative = losing strokes
      </div>
    </div>
  );
});

// Key Stats Trend Chart (GIR%, Fairway%, Putts shown if we had round-by-round data)
const KeyStatsSummary = memo(function KeyStatsSummary({ stats }: { stats: GolfStats }) {
  const statCards = [
    {
      label: 'Fairway %',
      value: stats.fairwayPercentage,
      target: 60,
      color: 'green',
      format: (v: number) => `${v.toFixed(0)}%`
    },
    {
      label: 'GIR %',
      value: stats.girPercentage,
      target: 50,
      color: 'blue',
      format: (v: number) => `${v.toFixed(0)}%`
    },
    {
      label: 'Putts/Round',
      value: stats.puttsPerRound,
      target: 32,
      color: 'purple',
      invertTarget: true, // lower is better
      format: (v: number) => v.toFixed(1)
    },
    {
      label: 'Scrambling',
      value: stats.scramblingPercentage,
      target: 50,
      color: 'amber',
      format: (v: number) => `${v.toFixed(0)}%`
    },
  ];

  const getColorClasses = (color: string, isAboveTarget: boolean) => {
    if (!isAboveTarget) return 'bg-slate-100 text-slate-600';
    switch (color) {
      case 'green': return 'bg-green-100 text-green-700';
      case 'blue': return 'bg-blue-100 text-blue-700';
      case 'purple': return 'bg-purple-100 text-purple-700';
      case 'amber': return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="relative glass-standard rounded-2xl overflow-hidden p-6">
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
      />
      <h3 className="text-base font-semibold text-slate-900 mb-4">Key Performance Indicators</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, i) => {
          const isAboveTarget = stat.value !== null && (
            stat.invertTarget
              ? stat.value <= stat.target
              : stat.value >= stat.target
          );

          return (
            <div key={i} className="text-center">
              <div className={`inline-flex px-3 py-1 rounded-full text-xs font-medium mb-2 ${getColorClasses(stat.color, isAboveTarget)}`}>
                {isAboveTarget ? 'On Target' : 'Improving'}
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {stat.value !== null ? stat.format(stat.value) : '--'}
              </div>
              <div className="text-sm text-slate-500">{stat.label}</div>
              <div className="text-xs text-slate-400 mt-1">
                Target: {stat.invertTarget ? '<' : '>'}{stat.target}{stat.label.includes('%') ? '%' : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const InsightCard = memo(function InsightCard({ stats }: { stats: GolfStats }) {
  if (stats.roundsPlayed < 3) return null;

  const insights: { label: string; detail: string; type: 'strength' | 'opportunity' }[] = [];

  // Strengths
  if (stats.birdiesPerRound && stats.birdiesPerRound >= 2) {
    insights.push({
      label: 'Birdie Rate',
      detail: `${stats.birdiesPerRound.toFixed(1)} per round`,
      type: 'strength',
    });
  }

  if (stats.girPercentage && stats.girPercentage >= 50) {
    insights.push({
      label: 'Approach',
      detail: `${stats.girPercentage.toFixed(0)}% greens in regulation`,
      type: 'strength',
    });
  } else if (stats.girPercentage && stats.girPercentage < 40) {
    insights.push({
      label: 'Approach',
      detail: `GIR at ${stats.girPercentage.toFixed(0)}% — focus area`,
      type: 'opportunity',
    });
  }

  if (stats.puttsPerRound && stats.puttsPerRound <= 30) {
    insights.push({
      label: 'Putting',
      detail: `${stats.puttsPerRound.toFixed(1)} putts per round`,
      type: 'strength',
    });
  } else if (stats.puttsPerRound && stats.puttsPerRound > 34) {
    insights.push({
      label: 'Putting',
      detail: `${stats.puttsPerRound.toFixed(1)} putts/round — focus area`,
      type: 'opportunity',
    });
  }

  if (stats.scramblingPercentage && stats.scramblingPercentage >= 50) {
    insights.push({
      label: 'Scrambling',
      detail: `${stats.scramblingPercentage.toFixed(0)}% save rate`,
      type: 'strength',
    });
  }

  if (stats.longestNo3PuttStreak && stats.longestNo3PuttStreak >= 18) {
    insights.push({
      label: 'Consistency',
      detail: `${stats.longestNo3PuttStreak}-hole streak without 3-putting`,
      type: 'strength',
    });
  }

  if (insights.length === 0) return null;

  const strengths = insights.filter(i => i.type === 'strength');
  const opportunities = insights.filter(i => i.type === 'opportunity');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Key Takeaways
      </h3>
      <div className="space-y-4">
        {strengths.length > 0 && (
          <div>
            <div className="text-xs font-medium text-green-600 uppercase tracking-wider mb-2">Strengths</div>
            <div className="space-y-2">
              {strengths.map((insight, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-green-50/60 border border-green-100/80">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800">{insight.label}</span>
                    <span className="text-sm text-slate-500 ml-1.5">{insight.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {opportunities.length > 0 && (
          <div>
            <div className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-2">Opportunities</div>
            <div className="space-y-2">
              {opportunities.map((insight, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-amber-50/60 border border-amber-100/80">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800">{insight.label}</span>
                    <span className="text-sm text-slate-500 ml-1.5">{insight.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default memo(function ProgressStats({ stats, rounds }: ProgressStatsProps) {
  return (
    <div className="space-y-6">
      {/* Quick Metrics */}
      <ProgressMetrics stats={stats} />

      {/* Scoring Trend Chart */}
      <ScoringTrendChart rounds={rounds} />

      {/* Key Performance Indicators */}
      <KeyStatsSummary stats={stats} />

      {/* Charts Grid - Responsive 2-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GIR by Par Type */}
        <GirByParChart stats={stats} />

        {/* Putt Make % by Distance */}
        <PuttMakeChart stats={stats} />
      </div>

      {/* Strokes Gained Chart */}
      <StrokesGainedChart stats={stats} />

      {/* Score Distribution */}
      <ScoreDistributionChart stats={stats} />

      {/* Recent Rounds */}
      {rounds.length > 0 && <RecentRounds rounds={rounds} />}

      {/* Round Comparison Table */}
      <RoundComparisonTable rounds={rounds} />

      {/* Performance Insights */}
      <InsightCard stats={stats} />

      {/* Empty State */}
      {stats.roundsPlayed < 3 && (
        <div className="relative text-center py-12 glass-standard rounded-2xl overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }}
          />
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">&#128200;</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">More Data Needed</h3>
          <p className="text-slate-500 max-w-sm mx-auto">
            Play more rounds to unlock detailed trend visualizations and insights
          </p>
        </div>
      )}
    </div>
  );
});
