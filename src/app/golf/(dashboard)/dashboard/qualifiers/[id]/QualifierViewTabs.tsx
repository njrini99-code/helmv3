'use client';

import { useState } from 'react';
import { IconList, IconTarget } from '@/components/icons';
import { QualifierBracket } from '@/components/golf/qualifiers/QualifierBracket';

interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  roundsCompleted: number;
  totalScore: number;
  totalToPar: number;
  averageScore: number;
  isTied: boolean;
}

interface QualifierViewTabsProps {
  leaderboard: LeaderboardEntry[];
  numRounds?: number;
  showLiveLeaderboard?: boolean;
}

type ViewMode = 'bracket' | 'table';

export function QualifierViewTabs({ leaderboard, numRounds = 1, showLiveLeaderboard = false }: QualifierViewTabsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('bracket');

  return (
    <div>
      {/* View Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            onClick={() => setViewMode('bracket')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewMode === 'bracket'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <IconTarget size={16} />
            Bracket
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewMode === 'table'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <IconList size={16} />
            Table
          </button>
        </div>
        {showLiveLeaderboard && (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-green-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live
          </span>
        )}
      </div>

      {/* Content */}
      {!leaderboard || leaderboard.length === 0 ? (
        <p className="text-center text-slate-400 py-8">No entries yet</p>
      ) : viewMode === 'bracket' ? (
        <QualifierBracket
          leaderboard={leaderboard}
          numRounds={numRounds}
          qualifyingSpots={5}
          showCutline={true}
        />
      ) : (
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-3 pr-4 text-left text-xs font-semibold text-slate-500 uppercase">Pos</th>
                <th className="pb-3 pr-4 text-left text-xs font-semibold text-slate-500 uppercase">Player</th>
                <th className="pb-3 pr-4 text-right text-xs font-semibold text-slate-500 uppercase">Rounds</th>
                <th className="pb-3 pr-4 text-right text-xs font-semibold text-slate-500 uppercase">Total</th>
                <th className="pb-3 pr-4 text-right text-xs font-semibold text-slate-500 uppercase">To Par</th>
                <th className="pb-3 pr-4 text-right text-xs font-semibold text-slate-500 uppercase">Avg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaderboard.map((entry, index) => {
                const position = index + 1;
                const isLeader = position === 1;
                const showPosition = !entry.isTied || index === 0 || leaderboard[index - 1]!.totalScore !== entry.totalScore;

                return (
                  <tr
                    key={entry.playerId}
                    className={`hover:bg-slate-50 transition-colors ${
                      isLeader ? 'bg-green-50' : ''
                    }`}
                  >
                    <td className="py-3 pr-4 text-sm">
                      {showPosition ? (
                        <span className={isLeader ? 'font-bold text-green-600' : 'text-slate-600'}>
                          {position}
                          {entry.isTied && 'T'}
                        </span>
                      ) : (
                        <span className="text-slate-600">T</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-sm font-medium text-slate-900">
                      {entry.playerName}
                    </td>
                    <td className="py-3 pr-4 text-sm text-slate-600 text-right">
                      {entry.roundsCompleted} / {numRounds}
                    </td>
                    <td className="py-3 pr-4 text-sm font-semibold text-slate-900 text-right">
                      {entry.totalScore > 0 ? entry.totalScore : '-'}
                    </td>
                    <td className="py-3 pr-4 text-sm text-slate-600 text-right">
                      {entry.totalToPar !== 0 ? (
                        entry.totalToPar > 0 ? `+${entry.totalToPar}` :
                        entry.totalToPar === 0 ? 'E' :
                        entry.totalToPar
                      ) : '-'}
                    </td>
                    <td className="py-3 pr-4 text-sm text-slate-600 text-right">
                      {entry.averageScore > 0 ? entry.averageScore.toFixed(1) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
