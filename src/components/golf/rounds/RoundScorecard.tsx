'use client';

import { cn } from '@/lib/utils';
import type { HoleScore } from '@/lib/types/golf';

interface RoundScorecardProps {
  holeScores: HoleScore[];
}

function getScoreClass(score: number, par: number): string {
  const diff = score - par;
  if (diff <= -2) return 'bg-amber-400 text-white'; // Eagle or better
  if (diff === -1) return 'bg-red-500 text-white'; // Birdie
  if (diff === 0) return 'bg-warm-100 text-warm-900'; // Par
  if (diff === 1) return 'bg-blue-100 text-blue-700'; // Bogey
  if (diff === 2) return 'bg-blue-200 text-blue-800'; // Double
  return 'bg-blue-300 text-blue-900'; // Triple+
}

function getScoreLabel(score: number, par: number): string {
  const diff = score - par;
  if (diff <= -3) return 'Albatross';
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double';
  if (diff === 3) return 'Triple';
  return `+${diff}`;
}

export function RoundScorecard({ holeScores }: RoundScorecardProps) {
  // Split into front 9 and back 9
  const front9 = holeScores.slice(0, 9);
  const back9 = holeScores.slice(9, 18);

  // Calculate totals
  const front9Score = front9.reduce((sum, h) => sum + h.score, 0);
  const front9Par = front9.reduce((sum, h) => sum + h.par, 0);
  const front9Putts = front9.reduce((sum, h) => sum + (h.putts ?? 0), 0);

  const back9Score = back9.length > 0 ? back9.reduce((sum, h) => sum + h.score, 0) : 0;
  const back9Par = back9.length > 0 ? back9.reduce((sum, h) => sum + h.par, 0) : 0;
  const back9Putts = back9.length > 0 ? back9.reduce((sum, h) => sum + (h.putts ?? 0), 0) : 0;

  const totalScore = front9Score + back9Score;
  const totalPar = front9Par + back9Par;

  const renderHoles = (holes: HoleScore[], startHole: number) => (
    <>
      {/* Hole Numbers */}
      <tr className="bg-warm-50">
        <td className="px-2 py-1.5 text-xs font-medium text-warm-500 border-r border-border-light">Hole</td>
        {holes.map((_, index) => (
          <td key={index} className="px-2 py-1.5 text-xs font-medium text-warm-500 text-center min-w-[40px]">
            {startHole + index}
          </td>
        ))}
        <td className="px-2 py-1.5 text-xs font-medium text-warm-500 text-center border-l border-border-light bg-warm-100">
          {startHole === 1 ? 'OUT' : 'IN'}
        </td>
      </tr>

      {/* Par */}
      <tr className="bg-white">
        <td className="px-2 py-1.5 text-xs font-medium text-warm-500 border-r border-border-light">Par</td>
        {holes.map((hole, index) => (
          <td key={index} className="px-2 py-1.5 text-xs text-warm-600 text-center">
            {hole.par}
          </td>
        ))}
        <td className="px-2 py-1.5 text-xs font-medium text-warm-600 text-center border-l border-border-light bg-warm-50">
          {startHole === 1 ? front9Par : back9Par}
        </td>
      </tr>

      {/* Score */}
      <tr className="bg-white">
        <td className="px-2 py-1.5 text-xs font-medium text-warm-700 border-r border-border-light">Score</td>
        {holes.map((hole, index) => (
          <td key={index} className="px-2 py-1.5 text-center">
            <span
              className={cn(
                'inline-flex items-center justify-center w-7 h-7 text-sm font-semibold rounded-full',
                getScoreClass(hole.score, hole.par)
              )}
              title={getScoreLabel(hole.score, hole.par)}
            >
              {hole.score}
            </span>
          </td>
        ))}
        <td className="px-2 py-1.5 text-center border-l border-border-light bg-warm-50">
          <span className="text-sm font-semibold text-warm-900">
            {startHole === 1 ? front9Score : back9Score}
          </span>
        </td>
      </tr>

      {/* Putts */}
      <tr className="bg-white border-b border-border-light">
        <td className="px-2 py-1.5 text-xs font-medium text-warm-500 border-r border-border-light">Putts</td>
        {holes.map((hole, index) => (
          <td key={index} className={cn(
            'px-2 py-1.5 text-xs text-center',
            (hole.putts ?? 0) >= 3 ? 'text-red-600 font-medium' :
            hole.putts === 1 ? 'text-primary-600 font-medium' : 'text-warm-500'
          )}>
            {hole.putts ?? '-'}
          </td>
        ))}
        <td className="px-2 py-1.5 text-xs font-medium text-warm-600 text-center border-l border-border-light bg-warm-50">
          {startHole === 1 ? front9Putts : back9Putts}
        </td>
      </tr>

      {/* FIR (Fairway in Regulation) - only for par 4s and 5s */}
      <tr className="bg-white">
        <td className="px-2 py-1.5 text-xs font-medium text-warm-500 border-r border-border-light">FIR</td>
        {holes.map((hole, index) => (
          <td key={index} className="px-2 py-1.5 text-xs text-center">
            {hole.par >= 4 ? (
              hole.fairway_hit ? (
                <svg className="w-4 h-4 mx-auto text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 mx-auto text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )
            ) : (
              <span className="text-warm-300">-</span>
            )}
          </td>
        ))}
        <td className="px-2 py-1.5 text-xs text-center border-l border-border-light bg-warm-50">
          {holes.filter(h => h.par >= 4 && h.fairway_hit).length}/
          {holes.filter(h => h.par >= 4).length}
        </td>
      </tr>

      {/* GIR (Green in Regulation) */}
      <tr className="bg-white border-b-2 border-border-light">
        <td className="px-2 py-1.5 text-xs font-medium text-warm-500 border-r border-border-light">GIR</td>
        {holes.map((hole, index) => (
          <td key={index} className="px-2 py-1.5 text-xs text-center">
            {hole.green_in_regulation ? (
              <svg className="w-4 h-4 mx-auto text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 mx-auto text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </td>
        ))}
        <td className="px-2 py-1.5 text-xs text-center border-l border-border-light bg-warm-50">
          {holes.filter(h => h.green_in_regulation).length}/{holes.length}
        </td>
      </tr>
    </>
  );

  return (
    <div className="bg-white border border-border-light rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border-light">
        <h3 className="text-base font-semibold text-warm-900">Scorecard</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {/* Front 9 */}
            {front9.length > 0 && renderHoles(front9, 1)}

            {/* Back 9 */}
            {back9.length > 0 && renderHoles(back9, 10)}

            {/* Total Row */}
            {holeScores.length > 9 && (
              <tr className="bg-warm-100">
                <td className="px-2 py-2 text-sm font-semibold text-warm-900 border-r border-border-light">
                  Total
                </td>
                <td colSpan={front9.length} className="px-2 py-2 text-center">
                  <span className={cn(
                    'text-sm font-semibold',
                    totalScore <= totalPar ? 'text-primary-600' : 'text-warm-900'
                  )}>
                    {front9Score}
                  </span>
                </td>
                <td className="px-2 py-2 text-center border-l border-border-light">
                  <span className="text-lg font-bold text-warm-900">{totalScore}</span>
                  <span className="ml-1 text-sm text-warm-500">
                    ({totalScore - totalPar >= 0 ? '+' : ''}{totalScore - totalPar})
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="px-6 py-3 border-t border-border-light bg-cream-50">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center text-white text-xs">E</span>
            <span className="text-warm-500">Eagle</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs">B</span>
            <span className="text-warm-500">Birdie</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-warm-100 flex items-center justify-center text-warm-900 text-xs">P</span>
            <span className="text-warm-500">Par</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs">+1</span>
            <span className="text-warm-500">Bogey</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-200 flex items-center justify-center text-blue-800 text-xs">+2</span>
            <span className="text-warm-500">Double+</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoundScorecard;
