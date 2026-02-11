'use client';

import { useMemo } from 'react';
import type { HoleConfig } from '@/lib/types/golf-course';

interface HoleScore {
  holeNumber: number;
  score: number | null;
  putts: number | null;
  fairwayHit: boolean | null;
  greenInRegulation: boolean | null;
}

interface LiveScorecardProps {
  holes: HoleConfig[];
  scores: HoleScore[];
  currentHole: number;
  onHoleSelect: (holeNumber: number) => void;
  compact?: boolean;
}

export function LiveScorecard({
  holes,
  scores,
  currentHole,
  onHoleSelect,
  compact = false
}: LiveScorecardProps) {
  // Calculate live stats
  const stats = useMemo(() => {
    const completedScores = scores.filter(s => s.score !== null);

    const totalScore = completedScores.reduce((sum, s) => sum + (s.score || 0), 0);
    const totalPar = holes
      .filter(h => scores.find(s => s.holeNumber === h.holeNumber && s.score !== null))
      .reduce((sum, h) => sum + h.par, 0);
    const toPar = totalScore - totalPar;

    const totalPutts = completedScores.reduce((sum, s) => sum + (s.putts || 0), 0);

    const fairwayOpps = scores.filter(s => {
      const hole = holes.find(h => h.holeNumber === s.holeNumber);
      return hole && hole.par >= 4 && s.score !== null;
    });
    const fairwaysHit = fairwayOpps.filter(s => s.fairwayHit === true).length;

    const girHoles = completedScores.filter(s => s.greenInRegulation === true).length;

    // Score distribution
    const birdies = completedScores.filter(s => {
      const hole = holes.find(h => h.holeNumber === s.holeNumber);
      return hole && (s.score || 0) === hole.par - 1;
    }).length;

    const pars = completedScores.filter(s => {
      const hole = holes.find(h => h.holeNumber === s.holeNumber);
      return hole && s.score === hole.par;
    }).length;

    const bogeys = completedScores.filter(s => {
      const hole = holes.find(h => h.holeNumber === s.holeNumber);
      return hole && (s.score || 0) === hole.par + 1;
    }).length;

    return {
      holesPlayed: completedScores.length,
      totalScore,
      toPar,
      putts: totalPutts,
      fairways: `${fairwaysHit}/${fairwayOpps.length}`,
      gir: girHoles,
      birdies,
      pars,
      bogeys,
    };
  }, [holes, scores]);

  const frontNine = holes.slice(0, 9);
  const backNine = holes.slice(9, 18);

  function getScoreColor(holeNumber: number): string {
    const score = scores.find(s => s.holeNumber === holeNumber);
    const hole = holes.find(h => h.holeNumber === holeNumber);

    if (!score?.score || !hole) return '';

    const diff = score.score - hole.par;
    if (diff <= -2) return 'bg-yellow-400 text-yellow-900'; // Eagle+
    if (diff === -1) return 'bg-red-500 text-white'; // Birdie
    if (diff === 0) return 'bg-green-500 text-white'; // Par
    if (diff === 1) return 'bg-warm-300 text-warm-800'; // Bogey
    return 'bg-warm-500 text-white'; // Double+
  }

  if (compact) {
    return (
      <div className="relative glass-standard rounded-xl overflow-hidden p-3">
        {/* Shine effect */}
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
          aria-hidden="true"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          }}
        />
        {/* Compact Stats Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-center">
            <div className={`text-2xl font-bold ${stats.toPar > 0 ? 'text-red-600' : stats.toPar < 0 ? 'text-green-600' : 'text-warm-900'}`}>
              {stats.toPar > 0 ? `+${stats.toPar}` : stats.toPar}
            </div>
            <div className="text-xs text-warm-500">TO PAR</div>
          </div>
          <div className="h-8 w-px bg-warm-200" aria-hidden="true" />
          <div className="text-center">
            <div className="text-lg font-bold text-warm-900">{stats.totalScore}</div>
            <div className="text-xs text-warm-500">{stats.holesPlayed} HOLES</div>
          </div>
          <div className="h-8 w-px bg-warm-200" aria-hidden="true" />
          <div className="text-center">
            <div className="text-lg font-bold text-warm-900">{stats.putts}</div>
            <div className="text-xs text-warm-500">PUTTS</div>
          </div>
          <div className="h-8 w-px bg-warm-200" aria-hidden="true" />
          <div className="text-center">
            <div className="text-lg font-bold text-warm-900">{stats.gir}</div>
            <div className="text-xs text-warm-500">GIR</div>
          </div>
        </div>

        {/* Mini Hole Grid */}
        <div className="pills-scroll pb-1">
          {holes.map(hole => {
            const score = scores.find(s => s.holeNumber === hole.holeNumber);
            const isCurrentHole = hole.holeNumber === currentHole;

            return (
              <button
                key={hole.holeNumber}
                onClick={() => onHoleSelect(hole.holeNumber)}
                aria-label={`Hole ${hole.holeNumber}${score?.score ? `, score ${score.score}` : ''}`}
                aria-current={isCurrentHole ? 'true' : undefined}
                className={`flex-shrink-0 w-8 h-8 rounded-lg text-xs font-bold
                  flex items-center justify-center transition-all
                  ${isCurrentHole ? 'ring-2 ring-green-500 ring-offset-1' : ''}
                  ${score?.score ? getScoreColor(hole.holeNumber) : 'bg-warm-100 text-warm-400'}
                `}
              >
                {score?.score || hole.holeNumber}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Full scorecard view
  return (
    <div className="relative glass-standard rounded-2xl overflow-hidden">
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />
      {/* Live Stats Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 p-4">
        <div className="grid grid-cols-5 gap-2 text-center text-white">
          <div>
            <div className={`text-3xl font-bold ${stats.toPar !== 0 ? '' : 'text-green-200'}`}>
              {stats.toPar > 0 ? `+${stats.toPar}` : stats.toPar === 0 ? 'E' : stats.toPar}
            </div>
            <div className="text-xs text-green-200 uppercase">To Par</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.totalScore}</div>
            <div className="text-xs text-green-200 uppercase">Score</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.putts}</div>
            <div className="text-xs text-green-200 uppercase">Putts</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.fairways}</div>
            <div className="text-xs text-green-200 uppercase">FW</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.gir}</div>
            <div className="text-xs text-green-200 uppercase">GIR</div>
          </div>
        </div>
      </div>

      {/* Score Distribution */}
      <div className="flex border-b border-warm-200" role="group" aria-label="Score distribution">
        <div className="flex-1 py-2 text-center border-r border-warm-200">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full
                         bg-red-500 text-white text-xs font-bold mr-1" aria-hidden="true">
            {stats.birdies}
          </span>
          <span className="text-xs text-warm-500">{stats.birdies} Birdie{stats.birdies !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex-1 py-2 text-center border-r border-warm-200">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full
                         bg-green-500 text-white text-xs font-bold mr-1" aria-hidden="true">
            {stats.pars}
          </span>
          <span className="text-xs text-warm-500">{stats.pars} Par{stats.pars !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex-1 py-2 text-center">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full
                         bg-warm-300 text-warm-700 text-xs font-bold mr-1" aria-hidden="true">
            {stats.bogeys}
          </span>
          <span className="text-xs text-warm-500">{stats.bogeys} Bogey{stats.bogeys !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Front Nine */}
      <div className="p-2">
        <div className="text-xs font-semibold text-warm-500 uppercase mb-1 px-1">Front 9</div>
        <div className="grid grid-cols-9 gap-1">
          {frontNine.map(hole => {
            const score = scores.find(s => s.holeNumber === hole.holeNumber);
            const isCurrentHole = hole.holeNumber === currentHole;

            return (
              <button
                key={hole.holeNumber}
                onClick={() => onHoleSelect(hole.holeNumber)}
                aria-label={`Hole ${hole.holeNumber}, par ${hole.par}${score?.score ? `, score ${score.score}` : ''}`}
                aria-current={isCurrentHole ? 'true' : undefined}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center
                  text-xs transition-all
                  ${isCurrentHole ? 'ring-2 ring-green-500' : ''}
                  ${score?.score ? getScoreColor(hole.holeNumber) : 'bg-warm-50 hover:bg-warm-100'}
                `}
              >
                <span className="font-bold">{score?.score || '-'}</span>
                <span className={`text-xs ${score?.score ? 'opacity-75' : 'text-warm-400'}`}>
                  {hole.holeNumber}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Back Nine - only show for 18-hole rounds */}
      {backNine.length > 0 && (
        <div className="p-2 border-t border-warm-100">
          <div className="text-xs font-semibold text-warm-500 uppercase mb-1 px-1">Back 9</div>
          <div className="grid grid-cols-9 gap-1">
            {backNine.map(hole => {
              const score = scores.find(s => s.holeNumber === hole.holeNumber);
              const isCurrentHole = hole.holeNumber === currentHole;

              return (
                <button
                  key={hole.holeNumber}
                  onClick={() => onHoleSelect(hole.holeNumber)}
                  aria-label={`Hole ${hole.holeNumber}, par ${hole.par}${score?.score ? `, score ${score.score}` : ''}`}
                  aria-current={isCurrentHole ? 'true' : undefined}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center
                    text-xs transition-all
                    ${isCurrentHole ? 'ring-2 ring-green-500' : ''}
                    ${score?.score ? getScoreColor(hole.holeNumber) : 'bg-warm-50 hover:bg-warm-100'}
                  `}
                >
                  <span className="font-bold">{score?.score || '-'}</span>
                  <span className={`text-xs ${score?.score ? 'opacity-75' : 'text-warm-400'}`}>
                    {hole.holeNumber}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
