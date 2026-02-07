'use client';

import { useState } from 'react';
import { IconTrophy, IconAward, IconTarget, IconChevronDown, IconChevronUp } from '@/components/icons';
import { cn } from '@/lib/utils';

interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  roundsCompleted: number;
  totalScore: number;
  totalToPar: number;
  averageScore: number;
  isTied: boolean;
}

interface QualifierBracketProps {
  leaderboard: LeaderboardEntry[];
  numRounds: number;
  qualifyingSpots?: number;
  showCutline?: boolean;
  cutlinePosition?: number;
}

function getPositionIcon(position: number) {
  if (position === 1) return <IconTrophy size={16} className="text-yellow-500" />;
  if (position === 2) return <IconAward size={16} className="text-slate-400" />;
  if (position === 3) return <IconAward size={16} className="text-amber-600" />;
  return null;
}

function getPositionStyles(position: number, isAboveCutline: boolean, isOnBubble: boolean) {
  if (position === 1) {
    return {
      card: 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200/50 shadow-md',
      ring: 'ring-2 ring-yellow-400/30',
      name: 'text-yellow-700',
      score: 'text-yellow-700',
    };
  }
  if (position === 2) {
    return {
      card: 'bg-gradient-to-r from-slate-50 to-slate-100/50 border-slate-200/50',
      ring: 'ring-2 ring-slate-300/30',
      name: 'text-slate-700',
      score: 'text-slate-600',
    };
  }
  if (position === 3) {
    return {
      card: 'bg-gradient-to-r from-amber-50/50 to-orange-50/50 border-amber-200/50',
      ring: 'ring-2 ring-amber-300/30',
      name: 'text-amber-700',
      score: 'text-amber-600',
    };
  }
  if (isOnBubble) {
    return {
      card: 'bg-gradient-to-r from-amber-50/30 to-orange-50/30 border-amber-200/30 border-dashed',
      ring: '',
      name: 'text-amber-600',
      score: 'text-amber-600',
    };
  }
  if (isAboveCutline) {
    return {
      card: 'bg-white/70 border-green-200/50',
      ring: '',
      name: 'text-slate-900',
      score: 'text-green-600',
    };
  }
  return {
    card: 'bg-slate-50/50 border-slate-200/50',
    ring: '',
    name: 'text-slate-500',
    score: 'text-slate-500',
  };
}

function PlayerBracketCard({
  entry,
  position,
  numRounds,
  isAboveCutline,
  isOnBubble,
  animationDelay,
}: {
  entry: LeaderboardEntry;
  position: number;
  numRounds: number;
  isAboveCutline: boolean;
  isOnBubble: boolean;
  animationDelay: number;
}) {
  const styles = getPositionStyles(position, isAboveCutline, isOnBubble);
  const progressPercent = (entry.roundsCompleted / numRounds) * 100;

  return (
    <div
      className={cn(
        'relative flex items-center gap-4 px-4 py-3 rounded-xl border transition-all duration-300',
        'hover:shadow-md hover:-translate-y-0.5',
        styles.card,
        styles.ring
      )}
      style={{
        animation: 'slideInFromLeft 0.4s ease-out forwards',
        animationDelay: `${animationDelay}ms`,
        opacity: 0,
      }}
    >
      {/* Position */}
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/80 shadow-sm">
        {getPositionIcon(position) || (
          <span className={cn('text-sm font-bold', isAboveCutline ? 'text-slate-700' : 'text-slate-400')}>
            {position}
            {entry.isTied && <span className="text-xs">T</span>}
          </span>
        )}
      </div>

      {/* Player Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn('font-semibold truncate', styles.name)}>
            {entry.playerName}
          </p>
          {isOnBubble && (
            <span className="px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded">
              BUBBLE
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                isAboveCutline ? 'bg-green-500' : 'bg-slate-300'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 tabular-nums">
            {entry.roundsCompleted}/{numRounds}
          </span>
        </div>
      </div>

      {/* Score */}
      <div className="text-right">
        <p className={cn('text-lg font-bold tabular-nums', styles.score)}>
          {entry.totalScore > 0 ? entry.totalScore : '-'}
        </p>
        <p className="text-xs text-slate-400">
          {entry.totalToPar !== 0 ? (
            entry.totalToPar > 0 ? `+${entry.totalToPar}` : entry.totalToPar
          ) : 'E'}
        </p>
      </div>
    </div>
  );
}

export function QualifierBracket({
  leaderboard,
  numRounds,
  qualifyingSpots = 5,
  showCutline = true,
  cutlinePosition,
}: QualifierBracketProps) {
  const [showAll, setShowAll] = useState(false);

  if (leaderboard.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <IconTarget size={28} className="text-slate-400" />
        </div>
        <p className="text-slate-500">No entries yet</p>
      </div>
    );
  }

  const effectiveCutline = cutlinePosition || qualifyingSpots;
  const displayCount = showAll ? leaderboard.length : Math.min(effectiveCutline + 3, leaderboard.length);
  const displayEntries = leaderboard.slice(0, displayCount);

  // Find bubble zone (within 3 strokes of cutline)
  const cutlineEntry = leaderboard[effectiveCutline - 1];
  const cutlineScore = cutlineEntry?.totalScore || 0;

  return (
    <div className="space-y-2">
      {/* Header Stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-slate-600">Qualifying ({effectiveCutline} spots)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-400 border-2 border-dashed border-amber-500" />
            <span className="text-slate-600">Bubble Zone</span>
          </span>
        </div>
        {leaderboard.length > effectiveCutline + 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium"
          >
            {showAll ? (
              <>Show Less <IconChevronUp size={14} /></>
            ) : (
              <>Show All ({leaderboard.length}) <IconChevronDown size={14} /></>
            )}
          </button>
        )}
      </div>

      {/* Bracket Cards */}
      <div className="space-y-2">
        {displayEntries.map((entry, index) => {
          const position = index + 1;
          const isAboveCutline = position <= effectiveCutline;
          const isOnBubble = !isAboveCutline &&
            cutlineScore > 0 &&
            entry.totalScore > 0 &&
            entry.totalScore - cutlineScore <= 3;

          const showCutlineMarker = showCutline && position === effectiveCutline && index < leaderboard.length - 1;

          return (
            <div key={entry.playerId}>
              <PlayerBracketCard
                entry={entry}
                position={position}
                numRounds={numRounds}
                isAboveCutline={isAboveCutline}
                isOnBubble={isOnBubble}
                animationDelay={index * 50}
              />

              {/* Cutline Marker */}
              {showCutlineMarker && (
                <div className="relative my-3">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-red-400 to-transparent" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 bg-red-50 rounded-full">
                    <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                      Cutline
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-slate-100">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-green-50 rounded-xl">
            <p className="text-2xl font-bold text-green-600">
              {leaderboard.filter((_, i) => i < effectiveCutline).length}
            </p>
            <p className="text-xs text-slate-500 mt-1">Qualifying</p>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl">
            <p className="text-2xl font-bold text-amber-600">
              {leaderboard.filter((entry, i) => {
                if (i < effectiveCutline) return false;
                return cutlineScore > 0 && entry.totalScore > 0 && entry.totalScore - cutlineScore <= 3;
              }).length}
            </p>
            <p className="text-xs text-slate-500 mt-1">On Bubble</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <p className="text-2xl font-bold text-slate-600">
              {leaderboard.length}
            </p>
            <p className="text-xs text-slate-500 mt-1">Total Players</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideInFromLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

export default QualifierBracket;
