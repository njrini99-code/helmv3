'use client';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';

interface PremiumRoundHeaderProps {
  playerName: string;
  playerAvatarUrl?: string | null;
  courseName: string | null;
  courseCity: string | null;
  courseState: string | null;
  roundDate: string;
  roundType: string | null;
  totalScore: number | null;
  scoreToPar: number | null;
  totalPutts: number | null;
  totalFairwaysHit: number | null;
  totalFairways: number | null;
  totalGir: number | null;
  totalGirPossible: number | null;
  frontNine: number | null;
  backNine: number | null;
  courseRating: number | null;
  courseSlope: number | null;
  teesPlayed: string | null;
  notes: string | null;
}

export function PremiumRoundHeader({
  playerName,
  playerAvatarUrl,
  courseName,
  courseCity,
  courseState,
  roundDate,
  roundType,
  totalScore,
  scoreToPar,
  totalPutts,
  totalFairwaysHit,
  totalFairways,
  totalGir,
  totalGirPossible,
  frontNine,
  backNine,
  courseRating,
  courseSlope,
  teesPlayed,
  notes,
}: PremiumRoundHeaderProps) {
  const scoreDisplay = scoreToPar === null || scoreToPar === undefined
    ? '--'
    : scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;

  const scoreColor = scoreToPar === null || scoreToPar === undefined
    ? 'text-warm-600'
    : scoreToPar < 0 ? 'text-emerald-600' : scoreToPar > 0 ? 'text-red-600' : 'text-warm-600';

  const formattedDate = new Date(roundDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card variant="glass" padding="none" className="overflow-hidden">
        <div className="p-6 sm:p-8">
          {/* Player info + score */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar
                src={playerAvatarUrl}
                name={playerName}
                size="xl"
              />
              <div>
                <h2 className="text-xl font-semibold text-warm-900">{playerName}</h2>
                <p className="text-sm text-warm-500 mt-0.5">{formattedDate}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-medium text-warm-700">{courseName}</span>
                  {courseCity && courseState && (
                    <span className="text-xs text-warm-400">{courseCity}, {courseState}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {roundType && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-warm-100 text-warm-600 capitalize">
                      {roundType.replace(/_/g, ' ')}
                    </span>
                  )}
                  {courseRating && (
                    <span className="text-xs text-warm-400">Rating: {courseRating}</span>
                  )}
                  {courseSlope && (
                    <span className="text-xs text-warm-400">Slope: {courseSlope}</span>
                  )}
                  {teesPlayed && (
                    <span className="text-xs text-warm-400">Tees: {teesPlayed}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Score display */}
            <div className="text-right flex-shrink-0">
              <div className="text-5xl font-bold text-warm-900 tabular-nums">
                {totalScore ?? '--'}
              </div>
              <div className={cn('text-xl font-semibold', scoreColor)}>
                {scoreDisplay}
              </div>
              {frontNine !== null && backNine !== null && (
                <p className="text-xs text-warm-400 mt-1 tabular-nums">
                  {frontNine} / {backNine}
                </p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-6 pt-6 border-t border-warm-200/60 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-warm-400 font-medium">Putts</p>
              <p className="text-xl font-semibold text-warm-900 tabular-nums">{totalPutts ?? '--'}</p>
            </div>
            <div>
              <p className="text-xs text-warm-400 font-medium">Fairways</p>
              <p className="text-xl font-semibold text-warm-900 tabular-nums">
                {totalFairwaysHit !== null && totalFairways
                  ? `${totalFairwaysHit}/${totalFairways}`
                  : '--'}
              </p>
              {totalFairwaysHit !== null && totalFairways && totalFairways > 0 && (
                <p className="text-xs text-warm-400">{Math.round((totalFairwaysHit / totalFairways) * 100)}%</p>
              )}
            </div>
            <div>
              <p className="text-xs text-warm-400 font-medium">Greens</p>
              <p className="text-xl font-semibold text-warm-900 tabular-nums">
                {totalGir !== null && totalGirPossible
                  ? `${totalGir}/${totalGirPossible}`
                  : '--'}
              </p>
              {totalGir !== null && totalGirPossible && totalGirPossible > 0 && (
                <p className="text-xs text-warm-400">{Math.round((totalGir / totalGirPossible) * 100)}%</p>
              )}
            </div>
            <div>
              <p className="text-xs text-warm-400 font-medium">Front / Back</p>
              <p className="text-xl font-semibold text-warm-900 tabular-nums">
                {frontNine ?? '--'} / {backNine ?? '--'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Notes */}
      {notes && (
        <Card variant="glass">
          <div className="p-5">
            <p className="text-sm font-medium text-warm-700 mb-2">Round Notes</p>
            <p className="text-sm text-warm-600">{notes}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
