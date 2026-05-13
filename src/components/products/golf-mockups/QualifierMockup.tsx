'use client';

import { cn } from '@/lib/utils';

export function QualifierMockup() {
  const players = [
    { rank: 1, name: 'Jake Morrison', score: -4, rounds: '68-70', trend: 'up' },
    { rank: 2, name: 'Chris Palmer', score: -3, rounds: '69-70', trend: 'up' },
    { rank: 3, name: 'Mike Torres', score: -2, rounds: '71-69', trend: 'down' },
    { rank: 4, name: 'Ryan Chen', score: -1, rounds: '70-71', trend: 'same' },
    { rank: 5, name: 'David Kim', score: 'E', rounds: '72-70', trend: 'up' },
  ];

  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* Header card */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 mb-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-100 text-sm font-medium">SPRING QUALIFIER</p>
            <h3 className="text-2xl font-bold text-white">Round 2 of 3</h3>
          </div>
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-4 text-sm text-white/80">
          <span>📍 Augusta National</span>
          <span>•</span>
          <span>36 holes</span>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-warm-200">
        <div className="px-4 py-3 border-b border-warm-100 flex items-center justify-between">
          <span className="font-semibold text-warm-900">Leaderboard</span>
          <span className="text-xs text-warm-500">Top 5 qualify</span>
        </div>
        <div className="divide-y divide-warm-100">
          {players.map((player, i) => (
            <div
              key={player.rank}
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition-colors",
                i < 5 ? "bg-emerald-50/50" : ""
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                player.rank === 1 ? "bg-amber-400 text-white" :
                player.rank === 2 ? "bg-warm-300 text-warm-700" :
                player.rank === 3 ? "bg-amber-700 text-white" :
                "bg-warm-100 text-warm-600"
              )}>
                {player.rank}
              </div>
              <div className="flex-1">
                <p className="font-medium text-warm-900">{player.name}</p>
                <p className="text-xs text-warm-500">{player.rounds}</p>
              </div>
              <div className="text-right">
                <p className={cn(
                  "font-semibold",
                  typeof player.score === 'number' && player.score < 0 ? "text-emerald-600" : "text-warm-900"
                )}>
                  {typeof player.score === 'number' && player.score < 0 ? player.score : player.score}
                </p>
                {player.trend === 'up' && <span className="text-xs text-emerald-500">↑</span>}
                {player.trend === 'down' && <span className="text-xs text-red-500">↓</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Decorative element */}
      <div className="absolute -bottom-4 left-1/2 -tranwarm-x-1/2 w-3/4 h-8 bg-amber-500/10 blur-xl rounded-full" />
    </div>
  );
}
