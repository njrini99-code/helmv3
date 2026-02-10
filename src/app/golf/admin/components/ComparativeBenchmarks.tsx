'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ComparativeBenchmarksProps {
  teamComparisons: {
    id: string;
    name: string;
    playerCount: number;
    avgScore: number | null;
    avgFairwayPct: number | null;
    avgGirPct: number | null;
    avgPuttsPerRound: number | null;
    roundsThisMonth: number;
    improvementTrend: number | null;
  }[];
  playerTrends: {
    id: string;
    name: string;
    teamName: string | null;
    scoringHistory: { month: string; avg: number }[];
    currentAvg: number | null;
    previousAvg: number | null;
    improvement: number | null;
  }[];
  aiCorrelation: {
    playersWithAI: number;
    playersWithoutAI: number;
    avgScoreWithAI: number | null;
    avgScoreWithoutAI: number | null;
    avgImprovementWithAI: number | null;
    avgImprovementWithoutAI: number | null;
  };
}

type SortColumn =
  | 'name'
  | 'playerCount'
  | 'avgScore'
  | 'avgFairwayPct'
  | 'avgGirPct'
  | 'avgPuttsPerRound'
  | 'roundsThisMonth'
  | 'improvementTrend';

function bestValueIndices(
  teams: ComparativeBenchmarksProps['teamComparisons'],
  key: keyof ComparativeBenchmarksProps['teamComparisons'][number],
  mode: 'low' | 'high'
): Set<number> {
  const result = new Set<number>();
  let best: number | null = null;
  for (let i = 0; i < teams.length; i++) {
    const val = teams[i]![key];
    if (typeof val !== 'number' || val === null) continue;
    if (best === null) {
      best = val;
      result.clear();
      result.add(i);
    } else if (mode === 'low' && val < best) {
      best = val;
      result.clear();
      result.add(i);
    } else if (mode === 'high' && val > best) {
      best = val;
      result.clear();
      result.add(i);
    } else if (val === best) {
      result.add(i);
    }
  }
  return result;
}

export default function ComparativeBenchmarks({
  teamComparisons,
  playerTrends,
  aiCorrelation,
}: ComparativeBenchmarksProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('avgScore');
  const [sortAsc, setSortAsc] = useState(true);

  // Sort teams
  const sortedTeams = [...teamComparisons].sort((a, b) => {
    const aVal = a[sortColumn];
    const bVal = b[sortColumn];
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortAsc ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  // Best value sets for highlighting
  const bestScore = bestValueIndices(sortedTeams, 'avgScore', 'low');
  const bestFw = bestValueIndices(sortedTeams, 'avgFairwayPct', 'high');
  const bestGir = bestValueIndices(sortedTeams, 'avgGirPct', 'high');
  const bestPutts = bestValueIndices(sortedTeams, 'avgPuttsPerRound', 'low');
  const bestRounds = bestValueIndices(sortedTeams, 'roundsThisMonth', 'high');
  const bestTrend = bestValueIndices(sortedTeams, 'improvementTrend', 'high');

  // Most improved players: only those with negative improvement (lower score = better)
  const improvedPlayers = playerTrends
    .filter((p) => p.improvement !== null && p.improvement < 0)
    .sort((a, b) => (a.improvement ?? 0) - (b.improvement ?? 0))
    .slice(0, 10);

  // AI correlation helpers
  const aiScoreDiff =
    aiCorrelation.avgScoreWithAI !== null && aiCorrelation.avgScoreWithoutAI !== null
      ? aiCorrelation.avgScoreWithoutAI - aiCorrelation.avgScoreWithAI
      : null;
  const aiImproveDiff =
    aiCorrelation.avgImprovementWithAI !== null &&
    aiCorrelation.avgImprovementWithoutAI !== null
      ? aiCorrelation.avgImprovementWithAI - aiCorrelation.avgImprovementWithoutAI
      : null;

  function handleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortColumn(col);
      setSortAsc(true);
    }
  }

  function sortIndicator(col: SortColumn) {
    if (sortColumn !== col) return null;
    return <span className="ml-1 text-warm-400">{sortAsc ? '↑' : '↓'}</span>;
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Team Comparison Table */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6">
        <h2 className="text-xl font-semibold text-warm-900 mb-4">Team Benchmarks</h2>
        {sortedTeams.length === 0 ? (
          <p className="text-sm text-warm-500">No team data available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200 text-left">
                  {(
                    [
                      ['name', 'Team'],
                      ['playerCount', 'Players'],
                      ['avgScore', 'Avg Score'],
                      ['avgFairwayPct', 'FW%'],
                      ['avgGirPct', 'GIR%'],
                      ['avgPuttsPerRound', 'Putts'],
                      ['roundsThisMonth', 'Rounds/Mo'],
                      ['improvementTrend', 'Trend'],
                    ] as [SortColumn, string][]
                  ).map(([col, label]) => (
                    <th
                      key={col}
                      className="pb-3 pr-4 font-medium text-warm-500 cursor-pointer select-none whitespace-nowrap hover:text-warm-700 transition-colors"
                      onClick={() => handleSort(col)}
                    >
                      {label}
                      {sortIndicator(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map((team, idx) => (
                  <tr
                    key={team.id}
                    className="border-b border-warm-100 last:border-0 hover:bg-white/40 transition-colors"
                  >
                    <td className="py-3 pr-4 font-medium text-warm-900">{team.name}</td>
                    <td className="py-3 pr-4 text-warm-500">{team.playerCount}</td>
                    <td
                      className={cn(
                        'py-3 pr-4',
                        bestScore.has(idx)
                          ? 'font-bold text-green-600'
                          : 'text-warm-900'
                      )}
                    >
                      {team.avgScore !== null ? team.avgScore.toFixed(1) : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-3 pr-4',
                        bestFw.has(idx) ? 'font-bold text-green-600' : 'text-warm-900'
                      )}
                    >
                      {team.avgFairwayPct !== null
                        ? `${team.avgFairwayPct.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-3 pr-4',
                        bestGir.has(idx) ? 'font-bold text-green-600' : 'text-warm-900'
                      )}
                    >
                      {team.avgGirPct !== null
                        ? `${team.avgGirPct.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-3 pr-4',
                        bestPutts.has(idx)
                          ? 'font-bold text-green-600'
                          : 'text-warm-900'
                      )}
                    >
                      {team.avgPuttsPerRound !== null
                        ? team.avgPuttsPerRound.toFixed(1)
                        : '—'}
                    </td>
                    <td
                      className={cn(
                        'py-3 pr-4',
                        bestRounds.has(idx)
                          ? 'font-bold text-green-600'
                          : 'text-warm-500'
                      )}
                    >
                      {team.roundsThisMonth}
                    </td>
                    <td className="py-3 pr-4">
                      {team.improvementTrend !== null ? (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-sm font-medium',
                            team.improvementTrend > 0
                              ? 'text-green-600'
                              : team.improvementTrend < 0
                                ? 'text-red-500'
                                : 'text-warm-400'
                          )}
                        >
                          {team.improvementTrend > 0 ? (
                            <>
                              <span>↓</span>
                              <span>{team.improvementTrend.toFixed(1)}</span>
                            </>
                          ) : team.improvementTrend < 0 ? (
                            <>
                              <span>↑</span>
                              <span>{Math.abs(team.improvementTrend).toFixed(1)}</span>
                            </>
                          ) : (
                            <span>—</span>
                          )}
                          {bestTrend.has(idx) && team.improvementTrend > 0 && (
                            <span className="ml-1 text-xs text-green-500">Best</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-warm-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 2: Most Improved Players */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6">
        <h2 className="text-xl font-semibold text-warm-900 mb-4">
          Most Improved Players (3mo)
        </h2>
        {improvedPlayers.length === 0 ? (
          <p className="text-sm text-warm-500">
            No improvement data available yet. Players need at least 2 months of scoring
            history.
          </p>
        ) : (
          <div className="space-y-3">
            {improvedPlayers.map((player, idx) => (
              <div
                key={player.id}
                className="flex items-center justify-between py-3 px-4 rounded-xl bg-white/40 hover:bg-white/60 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-warm-400 w-6 text-right">
                    {idx + 1}.
                  </span>
                  <div>
                    <p className="text-sm font-medium text-warm-900">{player.name}</p>
                    {player.teamName && (
                      <p className="text-xs text-warm-500">{player.teamName}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-warm-400">Previous</p>
                    <p className="text-sm text-warm-500">
                      {player.previousAvg !== null ? player.previousAvg.toFixed(1) : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-warm-400">Current</p>
                    <p className="text-sm font-medium text-warm-900">
                      {player.currentAvg !== null ? player.currentAvg.toFixed(1) : '—'}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                    ↓ {Math.abs(player.improvement!).toFixed(1)} strokes
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: AI Insight Correlation */}
      <div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-6">
        <h2 className="text-xl font-semibold text-warm-900 mb-4">CoachHelm AI Impact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* With AI */}
          <div className="rounded-xl bg-white/50 border border-white/30 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <h3 className="text-sm font-semibold text-warm-900">With AI</h3>
              <span className="text-xs text-warm-400">
                {aiCorrelation.playersWithAI} players
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-warm-500">Avg Score</p>
                <p
                  className={cn(
                    'text-2xl font-semibold',
                    aiScoreDiff !== null && aiScoreDiff > 0
                      ? 'text-green-600'
                      : 'text-warm-900'
                  )}
                >
                  {aiCorrelation.avgScoreWithAI !== null
                    ? aiCorrelation.avgScoreWithAI.toFixed(1)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-warm-500">Avg Improvement</p>
                <p
                  className={cn(
                    'text-lg font-medium',
                    aiImproveDiff !== null && aiImproveDiff > 0
                      ? 'text-green-600'
                      : 'text-warm-900'
                  )}
                >
                  {aiCorrelation.avgImprovementWithAI !== null
                    ? `${aiCorrelation.avgImprovementWithAI > 0 ? '+' : ''}${aiCorrelation.avgImprovementWithAI.toFixed(1)} strokes`
                    : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Without AI */}
          <div className="rounded-xl bg-white/50 border border-white/30 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-2 w-2 rounded-full bg-warm-300" />
              <h3 className="text-sm font-semibold text-warm-900">Without AI</h3>
              <span className="text-xs text-warm-400">
                {aiCorrelation.playersWithoutAI} players
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-warm-500">Avg Score</p>
                <p className="text-2xl font-semibold text-warm-900">
                  {aiCorrelation.avgScoreWithoutAI !== null
                    ? aiCorrelation.avgScoreWithoutAI.toFixed(1)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-warm-500">Avg Improvement</p>
                <p className="text-lg font-medium text-warm-900">
                  {aiCorrelation.avgImprovementWithoutAI !== null
                    ? `${aiCorrelation.avgImprovementWithoutAI > 0 ? '+' : ''}${aiCorrelation.avgImprovementWithoutAI.toFixed(1)} strokes`
                    : '—'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Difference summary */}
        {aiScoreDiff !== null && (
          <div className="mt-4 rounded-xl bg-white/40 border border-white/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-warm-500">Scoring Difference</span>
              <span
                className={cn(
                  'text-sm font-semibold',
                  aiScoreDiff > 0 ? 'text-green-600' : 'text-warm-900'
                )}
              >
                {aiScoreDiff > 0
                  ? `AI group scores ${aiScoreDiff.toFixed(1)} strokes lower`
                  : aiScoreDiff < 0
                    ? `Non-AI group scores ${Math.abs(aiScoreDiff).toFixed(1)} strokes lower`
                    : 'No difference'}
              </span>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-warm-400 italic">
          Correlation does not imply causation
        </p>
      </div>
    </div>
  );
}
