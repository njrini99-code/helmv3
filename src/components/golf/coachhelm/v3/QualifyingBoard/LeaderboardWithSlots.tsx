import type { SelectionCandidate } from '@/lib/coachhelm/v3/qualifying/types';

interface Props {
  candidates: SelectionCandidate[];
  topNCount: number;
}

function formatToPar(p: number | null): string {
  if (p === null) return '—';
  if (p === 0) return 'E';
  return p > 0 ? `+${p}` : String(p);
}

export function LeaderboardWithSlots({ candidates, topNCount }: Props) {
  const ranked = [...candidates].sort((a, b) => {
    if (a.leaderboard_rank === null && b.leaderboard_rank === null) return 0;
    if (a.leaderboard_rank === null) return 1;
    if (b.leaderboard_rank === null) return -1;
    return a.leaderboard_rank - b.leaderboard_rank;
  });

  return (
    <section className="surface-matte rounded-2xl overflow-hidden">
      <header className="px-6 py-4 border-b border-warm-200/60 flex items-center gap-3">
        <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">
          Leaderboard
        </h2>
        <span className="text-sm text-warm-500">
          Top {topNCount} auto-lock
        </span>
      </header>
      <ul role="list" className="divide-y divide-warm-200/60">
        {ranked.map((c) => {
          const locked = c.is_top_score_slot;
          const picked = c.selection?.selection_type === 'coach_pick';
          return (
            <li
              key={c.player_id}
              className={`flex items-center gap-4 px-6 py-3 ${
                locked ? 'bg-emerald-50/30' : ''
              }`}
            >
              <span className="w-8 text-sm text-warm-500 tabular-nums">
                {c.leaderboard_rank ?? '—'}
              </span>
              <span className="flex-1 text-warm-900 font-medium">
                {c.player_first_name} {c.player_last_name}
              </span>
              <span className="w-14 text-right text-sm tabular-nums text-warm-700">
                {c.rounds_completed}r
              </span>
              <span className="w-16 text-right text-sm tabular-nums text-warm-900 font-medium">
                {formatToPar(c.total_to_par)}
              </span>
              <span className="w-32 text-right text-xs">
                {locked ? (
                  <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                    Top {topNCount} LOCKED
                  </span>
                ) : picked ? (
                  <span className="px-2 py-1 rounded-full bg-violet-100 text-violet-800 font-medium">
                    Coach pick
                  </span>
                ) : (
                  <span className="text-warm-400">—</span>
                )}
              </span>
            </li>
          );
        })}
        {ranked.length === 0 && (
          <li className="px-6 py-12 text-center text-sm text-warm-500">
            No entries yet.
          </li>
        )}
      </ul>
    </section>
  );
}
