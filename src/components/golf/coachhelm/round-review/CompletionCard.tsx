'use client';

import { cn } from '@/lib/utils';
import { RoundReview } from '@/lib/coachhelm/types';

interface CompletionCardProps {
  review: RoundReview;
}

export function CompletionCard({ review }: CompletionCardProps) {
  const scoreToPar = review.roundScoreToPar;
  const avgChange = review.scoringAvgAfter && review.scoringAvgBefore
    ? review.scoringAvgAfter - review.scoringAvgBefore
    : null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6"
      style={{ animation: 'fadeInUp 0.5s ease-out' }}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="white" />
          </pattern>
          <rect width="100" height="100" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative">
        {/* Score */}
        <div className="text-center mb-4">
          <div className="text-sm text-slate-400 mb-1">Round Complete</div>
          <div className="flex items-center justify-center gap-3">
            <span className="text-5xl font-bold">{review.roundScore}</span>
            <span className={cn(
              'text-2xl font-semibold px-3 py-1 rounded-lg',
              scoreToPar < 0 && 'bg-green-500/20 text-green-400',
              scoreToPar === 0 && 'bg-slate-500/20 text-slate-300',
              scoreToPar > 0 && 'bg-red-500/20 text-red-400',
            )}>
              {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex justify-center gap-8 pt-4 border-t border-white/10">
          {/* Scoring average */}
          {review.scoringAvgAfter && (
            <div className="text-center">
              <div className="text-xs text-slate-400 mb-1">Scoring Avg</div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-semibold">{review.scoringAvgAfter.toFixed(1)}</span>
                {avgChange !== null && avgChange !== 0 && (
                  <span className={cn(
                    'text-xs font-medium',
                    avgChange < 0 ? 'text-green-400' : 'text-red-400'
                  )}>
                    {avgChange > 0 ? '+' : ''}{avgChange.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Front/Back */}
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-1">Front / Back</div>
            <div className="text-lg font-semibold">
              {review.roundStats.frontNine} / {review.roundStats.backNine}
            </div>
          </div>

          {/* Birdies */}
          <div className="text-center">
            <div className="text-xs text-slate-400 mb-1">Birdies</div>
            <div className="text-lg font-semibold text-green-400">
              {review.roundStats.birdies}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
