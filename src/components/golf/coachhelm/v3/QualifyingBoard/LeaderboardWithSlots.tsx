'use client';

import { m, useReducedMotion } from 'framer-motion';
import type { SelectionCandidate } from '@/lib/coachhelm/v3/qualifying/types';
import {
  enterVariants,
  enterTransition,
  stagger,
} from '@/lib/coachhelm/v3/motion';

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
  const prefersReducedMotion = useReducedMotion();
  const ranked = [...candidates].sort((a, b) => {
    if (a.leaderboard_rank === null && b.leaderboard_rank === null) return 0;
    if (a.leaderboard_rank === null) return 1;
    if (b.leaderboard_rank === null) return -1;
    return a.leaderboard_rank - b.leaderboard_rank;
  });

  return (
    <section className="surface-matte rounded-2xl overflow-hidden">
      <header className="px-6 py-4 surface-hairline border-b flex items-center gap-3">
        <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">
          Leaderboard
        </h2>
        <span className="text-eyebrow uppercase tracking-[0.14em] text-warm-500">
          Top {topNCount} auto-lock
        </span>
      </header>
      <ul className="divide-y divide-warm-200/40">
        {ranked.map((c, i) => {
          const locked = c.is_top_score_slot;
          const picked = c.selection?.selection_type === 'coach_pick';
          return (
            <m.li
              key={c.player_id}
              variants={enterVariants}
              initial="hidden"
              animate="visible"
              transition={prefersReducedMotion ? { duration: 0 } : ({ ...enterTransition, delay: stagger(i) })}
              className={`flex items-center gap-4 px-6 py-3 transition-colors ${
                locked
                  ? 'bg-gradient-to-r from-emerald-50/40 via-emerald-50/20 to-transparent'
                  : 'hover:bg-warm-50/50'
              }`}
            >
              <span
                className={`w-8 text-sm tabular-nums ${
                  locked ? 'text-emerald-700 font-medium' : 'text-warm-500'
                }`}
              >
                {c.leaderboard_rank ?? '—'}
              </span>
              <span className="flex-1 text-warm-900 font-medium tracking-[-0.005em]">
                {c.player_first_name} {c.player_last_name}
              </span>
              <span className="w-14 text-right text-sm tabular-nums text-warm-500">
                {c.rounds_completed}r
              </span>
              <span className="w-16 text-right text-sm tabular-nums text-warm-900 font-medium">
                {formatToPar(c.total_to_par)}
              </span>
              <span className="w-32 text-right text-xs">
                {locked ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" />
                    Locked
                  </span>
                ) : picked ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-800 font-medium">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                    Coach pick
                  </span>
                ) : (
                  <span className="text-warm-400">—</span>
                )}
              </span>
            </m.li>
          );
        })}
        {ranked.length === 0 && (
          <li className="px-6 py-12 text-center text-sm text-warm-500 italic">
            No entries yet.
          </li>
        )}
      </ul>
    </section>
  );
}
