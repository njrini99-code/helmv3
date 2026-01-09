'use client';

import { cn } from '@/lib/utils';

interface ScorecardHole {
  hole_number: number;
  score: number | null;
  par: number | null;
}

interface ReviewScorecardProps {
  holes: ScorecardHole[]; // From round.holes
}

export function ReviewScorecard({ holes }: ReviewScorecardProps) {
  const frontNine = holes.slice(0, 9);
  const backNine = holes.slice(9, 18);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
      style={{ animation: 'fadeInUp 0.5s ease-out 0.2s both' }}
    >
      <div className="p-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Scorecard</h3>
      </div>

      <div className="overflow-x-auto">
        {/* Front nine */}
        <div className="p-4">
          <div className="text-xs font-medium text-slate-500 mb-2">Front Nine</div>
          <div className="flex gap-1">
            {frontNine.map((hole, index) => (
              <HoleChip key={hole.hole_number} hole={hole} delay={index * 35} />
            ))}
            <div className="flex items-center justify-center w-10 h-10 bg-slate-100 rounded-lg text-sm font-semibold text-slate-700">
              {frontNine.reduce((sum, h) => sum + (h.score || 0), 0)}
            </div>
          </div>
        </div>

        {/* Back nine */}
        {backNine.length > 0 && (
          <div className="p-4 pt-0">
            <div className="text-xs font-medium text-slate-500 mb-2">Back Nine</div>
            <div className="flex gap-1">
              {backNine.map((hole, index) => (
                <HoleChip key={hole.hole_number} hole={hole} delay={(index + 9) * 35} />
              ))}
              <div className="flex items-center justify-center w-10 h-10 bg-slate-100 rounded-lg text-sm font-semibold text-slate-700">
                {backNine.reduce((sum, h) => sum + (h.score || 0), 0)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HoleChip({ hole, delay }: { hole: ScorecardHole; delay: number }) {
  const scoreDiff = (hole.score || 0) - (hole.par || 4);

  const colors = {
    eagle: 'bg-purple-500 text-white',
    birdie: 'bg-green-500 text-white',
    par: 'bg-slate-100 text-slate-700',
    bogey: 'bg-amber-100 text-amber-700',
    double: 'bg-red-100 text-red-700',
    triple: 'bg-red-200 text-red-800',
  };

  let colorKey: keyof typeof colors = 'par';
  if (scoreDiff <= -2) colorKey = 'eagle';
  else if (scoreDiff === -1) colorKey = 'birdie';
  else if (scoreDiff === 0) colorKey = 'par';
  else if (scoreDiff === 1) colorKey = 'bogey';
  else if (scoreDiff === 2) colorKey = 'double';
  else colorKey = 'triple';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center w-10 h-10 rounded-lg text-sm font-semibold transition-transform hover:scale-105',
        colors[colorKey]
      )}
      style={{
        animation: `scoreReveal 0.3s ease-out ${delay}ms both`,
      }}
      title={`Hole ${hole.hole_number}: Par ${hole.par}`}
    >
      {hole.score}
    </div>
  );
}
