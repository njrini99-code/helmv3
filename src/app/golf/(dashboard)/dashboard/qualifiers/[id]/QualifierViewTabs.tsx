'use client';

import { useState } from 'react';
import { IconList, IconTarget } from '@/components/icons';
import { QualifierBracket } from '@/components/golf/qualifiers/QualifierBracket';
import { GolfTabBar } from '@/components/golf/GolfTabBar';

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
        <GolfTabBar
          tabs={[
            { id: 'bracket' as const, label: 'Bracket', icon: <IconTarget size={16} /> },
            { id: 'table' as const, label: 'Table', icon: <IconList size={16} /> },
          ]}
          value={viewMode}
          onChange={setViewMode}
          ariaLabel="Qualifier views"
          compact
        />
        {showLiveLeaderboard && (
          <span className="inline-flex items-center gap-2 text-sm font-medium text-primary-600">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
            </span>
            Live
          </span>
        )}
      </div>

      {/* Content */}
      {!leaderboard || leaderboard.length === 0 ? (
        <p className="text-center text-warm-400 py-8">No entries yet</p>
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
              <tr className="border-b border-warm-200">
                <th className="pb-3 pr-4 text-left text-xs font-semibold text-warm-500 uppercase">Pos</th>
                <th className="pb-3 pr-4 text-left text-xs font-semibold text-warm-500 uppercase">Player</th>
                <th className="pb-3 pr-4 text-right text-xs font-semibold text-warm-500 uppercase">Rounds</th>
                <th className="pb-3 pr-4 text-right text-xs font-semibold text-warm-500 uppercase">Total</th>
                <th className="pb-3 pr-4 text-right text-xs font-semibold text-warm-500 uppercase">To Par</th>
                <th className="pb-3 pr-4 text-right text-xs font-semibold text-warm-500 uppercase">Avg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-100">
              {leaderboard.map((entry, index) => {
                const position = index + 1;
                const isLeader = position === 1;
                const showPosition = !entry.isTied || index === 0 || leaderboard[index - 1]!.totalToPar !== entry.totalToPar;

                return (
                  <tr
                    key={entry.playerId}
                    className={`hover:bg-warm-50 active:bg-warm-100 transition-colors ${
                      isLeader ? 'bg-primary-50' : ''
                    }`}
                  >
                    <td className="py-3 pr-4 text-sm">
                      {showPosition ? (
                        <span className={isLeader ? 'font-medium text-primary-600' : 'text-warm-600'}>
                          {position}
                          {entry.isTied && 'T'}
                        </span>
                      ) : (
                        <span className="text-warm-600">T</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-sm font-medium text-warm-900">
                      {entry.playerName}
                    </td>
                    <td className="py-3 pr-4 text-sm text-warm-600 text-right">
                      {entry.roundsCompleted} / {numRounds}
                    </td>
                    <td className="py-3 pr-4 text-sm font-semibold text-warm-900 text-right">
                      {entry.totalScore > 0 ? entry.totalScore : '-'}
                    </td>
                    <td className="py-3 pr-4 text-sm text-warm-600 text-right">
                      {entry.totalToPar !== 0 ? (
                        entry.totalToPar > 0 ? `+${entry.totalToPar}` :
                        entry.totalToPar === 0 ? 'E' :
                        entry.totalToPar
                      ) : '-'}
                    </td>
                    <td className="py-3 pr-4 text-sm text-warm-600 text-right">
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
