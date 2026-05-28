'use client';

import { IconChartBar } from '@/components/icons';
import { EmptyState } from '@/components/ui/empty-state';

interface RoundScore {
  roundNumber: number;
  score: number | null;
  toPar: number | null;
  date: string;
  courseName: string;
}

interface PlayerBreakdown {
  playerName: string;
  rounds: RoundScore[];
  totalScore: number;
  totalToPar: number;
}

interface QualifierRoundBreakdownProps {
  breakdown: [string, PlayerBreakdown][];
  maxRoundNumber: number;
}

function formatToPar(toPar: number | null): string {
  if (toPar === null) return '—';
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : toPar.toString();
}

function toParColor(toPar: number | null): string {
  if (toPar === null) return 'text-warm-300';
  if (toPar < 0) return 'text-primary-600';
  if (toPar > 0) return 'text-red-600';
  return 'text-warm-600';
}

export function QualifierRoundBreakdown({ breakdown, maxRoundNumber }: QualifierRoundBreakdownProps) {
  const roundColumns = Array.from({ length: maxRoundNumber }, (_, i) => i + 1);

  return (
    <div className="relative surface-matte rounded-3xl overflow-clip p-6">
      <div className="flex items-center gap-2 mb-4">
        <IconChartBar size={20} className="text-warm-500" />
        <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">Round-by-Round Scores</h2>
      </div>

      {/* Desktop table — hidden on <md, horizontally scrollable from md up */}
      <div className="hidden md:block overflow-x-auto overscroll-x-contain touch-pan-x -mx-2 px-2" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-warm-200">
              <th className="pb-3 pr-4 text-left text-xs font-medium text-warm-500 uppercase w-8">#</th>
              <th className="pb-3 pr-4 text-left text-xs font-medium text-warm-500 uppercase">Player</th>
              {roundColumns.map(n => (
                <th key={n} className="pb-3 px-2 text-center text-xs font-medium text-warm-500 uppercase whitespace-nowrap">
                  R{n}
                </th>
              ))}
              <th className="pb-3 pl-3 text-right text-xs font-medium text-warm-500 uppercase">Total</th>
              <th className="pb-3 pl-3 text-right text-xs font-medium text-warm-500 uppercase">To Par</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warm-100">
            {breakdown.map(([playerId, data], index) => {
              const position = index + 1;
              const hasRounds = data.rounds.length > 0;

              return (
                <tr
                  key={playerId}
                  className={`${
                    position === 1 && hasRounds ? 'bg-primary-50/50' : ''
                  } hover:bg-warm-50 transition-colors`}
                >
                  <td className="py-3 pr-4 text-sm">
                    <span className={`tabular-nums ${position === 1 && hasRounds ? 'font-medium text-primary-600' : 'text-warm-500'}`}>
                      {hasRounds ? position : '-'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-sm font-medium text-warm-900 whitespace-nowrap">
                    {data.playerName}
                  </td>
                  {roundColumns.map(n => {
                    const round = data.rounds.find(r => r.roundNumber === n);
                    return (
                      <td key={n} className="py-3 px-2 text-center">
                        {round ? (
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-medium text-warm-900 tabular-nums">
                              {round.score ?? '—'}
                            </span>
                            <span className={`text-xs tabular-nums ${toParColor(round.toPar)}`}>
                              {formatToPar(round.toPar)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-warm-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-3 pl-3 text-right">
                    <span className="text-body-sm font-medium text-warm-900 tabular-nums">
                      {hasRounds ? data.totalScore : '-'}
                    </span>
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <span className={`text-sm font-medium tabular-nums ${hasRounds ? toParColor(data.totalToPar) : 'text-warm-300'}`}>
                      {hasRounds ? formatToPar(data.totalToPar) : '-'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list — shown only on <md. One card per player with the
          SAME data as the desktop table: position, player name, each round's
          score + to-par, plus the Total and To-Par totals. Nothing dropped. */}
      {breakdown.length > 0 && (
        <div className="md:hidden space-y-3">
          {breakdown.map(([playerId, data], index) => {
            const position = index + 1;
            const hasRounds = data.rounds.length > 0;

            return (
              <div
                key={playerId}
                className={`rounded-2xl border border-warm-100 p-4 ${
                  position === 1 && hasRounds ? 'bg-primary-50/50' : 'bg-warm-50/40'
                }`}
              >
                {/* Header: position + name + total / to-par */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`tabular-nums text-sm ${
                        position === 1 && hasRounds ? 'font-medium text-primary-600' : 'text-warm-500'
                      }`}
                    >
                      {hasRounds ? position : '-'}
                    </span>
                    <span className="text-sm font-medium text-warm-900 truncate">
                      {data.playerName}
                    </span>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span className="text-body-sm font-medium text-warm-900 tabular-nums">
                      {hasRounds ? data.totalScore : '-'}
                    </span>
                    <span
                      className={`text-xs font-medium tabular-nums ${hasRounds ? toParColor(data.totalToPar) : 'text-warm-300'}`}
                    >
                      {hasRounds ? formatToPar(data.totalToPar) : '-'}
                    </span>
                  </div>
                </div>

                {/* Round-by-round grid */}
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {roundColumns.map((n) => {
                    const round = data.rounds.find((r) => r.roundNumber === n);
                    return (
                      <div
                        key={n}
                        className="rounded-lg bg-warm-50/60 px-2 py-1.5 text-center"
                      >
                        <span className="block text-eyebrow font-medium text-warm-400 uppercase tracking-wide">
                          R{n}
                        </span>
                        {round ? (
                          <>
                            <span className="block text-sm font-medium text-warm-900 tabular-nums">
                              {round.score ?? '—'}
                            </span>
                            <span className={`block text-xs tabular-nums ${toParColor(round.toPar)}`}>
                              {formatToPar(round.toPar)}
                            </span>
                          </>
                        ) : (
                          <span className="block text-xs text-warm-300">—</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {breakdown.length === 0 && (
        <EmptyState
          variant="minimal"
          icon={<IconChartBar size={20} />}
          description="No rounds have been submitted yet."
        />
      )}
    </div>
  );
}
