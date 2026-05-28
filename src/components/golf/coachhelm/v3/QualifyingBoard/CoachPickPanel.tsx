'use client';

import { useState, useTransition } from 'react';
import { m } from 'framer-motion';
import {
  setQualifierCoachPick,
  removeQualifierCoachPick,
} from '@/app/golf/actions/v3/qualifying';
import type {
  QualifierSelectionState,
  SelectionCandidate,
} from '@/lib/coachhelm/v3/qualifying/types';
import { liftHover, tapPress } from '@/lib/coachhelm/v3/motion';

interface Props {
  qualifierId: string;
  candidates: SelectionCandidate[];
  slotsCoachPick: number;
  state: QualifierSelectionState;
}

function formatToPar(p: number | null): string {
  if (p === null) return '—';
  if (p === 0) return 'E';
  return p > 0 ? `+${p}` : String(p);
}

export function CoachPickPanel({ qualifierId, candidates, slotsCoachPick, state }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingPlayer, setPendingPlayer] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (slotsCoachPick === 0) return null;

  const editable = state === 'closed' || state === 'selected';

  const eligible = candidates.filter((c) => !c.is_top_score_slot);
  const picksMade = eligible.filter(
    (c) => c.selection?.selection_type === 'coach_pick',
  );
  const remaining = slotsCoachPick - picksMade.length;

  function startEdit(c: SelectionCandidate) {
    setDrafts((d) => ({ ...d, [c.player_id]: c.selection?.coach_reasoning ?? '' }));
  }

  function handleSave(playerId: string) {
    const reasoning = (drafts[playerId] ?? '').trim();
    if (reasoning.length === 0) return;
    setPendingPlayer(playerId);
    startTransition(async () => {
      await setQualifierCoachPick(qualifierId, playerId, reasoning);
      setDrafts((d) => {
        const next = { ...d };
        delete next[playerId];
        return next;
      });
      setPendingPlayer(null);
    });
  }

  function handleRemove(playerId: string) {
    setPendingPlayer(playerId);
    startTransition(async () => {
      await removeQualifierCoachPick(qualifierId, playerId);
      setPendingPlayer(null);
    });
  }

  return (
    <section className="surface-matte rounded-2xl overflow-hidden">
      <header className="px-6 py-4 surface-hairline border-b flex items-center gap-3">
        <h2 className="text-body-lg font-medium text-warm-900 tracking-[-0.012em]">
          Coach picks
        </h2>
        <span className="text-eyebrow uppercase tracking-[0.14em] text-warm-500">
          {picksMade.length} of {slotsCoachPick} chosen
          {remaining > 0 && editable && ` · ${remaining} remaining`}
        </span>
      </header>

      {!editable && (
        <p className="px-6 py-3 text-sm text-warm-500 italic surface-hairline border-b">
          Locks unlock when the qualifier reaches the <b className="font-medium not-italic text-warm-700">closed</b> state.
        </p>
      )}

      <ul role="list" className="divide-y divide-warm-200/40">
        {eligible.map((c) => {
          const isPicked = c.selection?.selection_type === 'coach_pick';
          const isEditing = drafts[c.player_id] !== undefined;
          const isPending = pendingPlayer === c.player_id;
          return (
            <li key={c.player_id} className="px-6 py-4">
              <div className="flex items-center gap-4">
                <span className="w-8 text-sm text-warm-500 tabular-nums">
                  {c.leaderboard_rank ?? '—'}
                </span>
                <span className="flex-1 text-warm-900 font-medium">
                  {c.player_first_name} {c.player_last_name}
                </span>
                <span className="w-16 text-right text-sm tabular-nums text-warm-700">
                  {formatToPar(c.total_to_par)}
                </span>
                {editable && !isPicked && !isEditing && (
                  <m.button
                    type="button"
                    onClick={() => startEdit(c)}
                    disabled={remaining <= 0}
                    whileHover={remaining <= 0 ? undefined : liftHover}
                    whileTap={remaining <= 0 ? undefined : tapPress}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition shadow-[0_6px_14px_-8px_rgba(124,58,237,0.55)]"
                  >
                    Pick
                  </m.button>
                )}
                {editable && isPicked && !isEditing && (
                  <div className="flex gap-2">
                    <m.button
                      type="button"
                      onClick={() => startEdit(c)}
                      whileHover={liftHover}
                      whileTap={tapPress}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-warm-200 text-warm-900 hover:bg-warm-300 transition"
                    >
                      Edit
                    </m.button>
                    <m.button
                      type="button"
                      onClick={() => handleRemove(c.player_id)}
                      disabled={isPending}
                      whileHover={isPending ? undefined : liftHover}
                      whileTap={isPending ? undefined : tapPress}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition"
                    >
                      Remove
                    </m.button>
                  </div>
                )}
              </div>

              {isPicked && !isEditing && c.selection?.coach_reasoning && (
                <p className="ml-12 mt-2 text-sm text-warm-700 italic">
                  &ldquo;{c.selection.coach_reasoning}&rdquo;
                </p>
              )}

              {isEditing && (
                <m.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="ml-12 mt-3 space-y-2.5"
                >
                  <textarea
                    value={drafts[c.player_id] ?? ''}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [c.player_id]: e.target.value }))
                    }
                    rows={2}
                    placeholder="Why this player? (visible to coaching staff)"
                    className="w-full px-3 py-2 text-sm border border-warm-300 rounded-lg focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 focus:outline-none transition"
                  />
                  <div className="flex gap-2">
                    <m.button
                      type="button"
                      onClick={() => handleSave(c.player_id)}
                      disabled={isPending || (drafts[c.player_id] ?? '').trim().length === 0}
                      whileHover={
                        isPending || (drafts[c.player_id] ?? '').trim().length === 0
                          ? undefined
                          : liftHover
                      }
                      whileTap={
                        isPending || (drafts[c.player_id] ?? '').trim().length === 0
                          ? undefined
                          : tapPress
                      }
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 transition shadow-[0_6px_14px_-8px_rgba(22,163,74,0.55)]"
                    >
                      {isPending ? 'Saving…' : 'Save pick'}
                    </m.button>
                    <m.button
                      type="button"
                      onClick={() =>
                        setDrafts((d) => {
                          const next = { ...d };
                          delete next[c.player_id];
                          return next;
                        })
                      }
                      whileHover={liftHover}
                      whileTap={tapPress}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-warm-100 text-warm-700 hover:bg-warm-200 transition"
                    >
                      Cancel
                    </m.button>
                  </div>
                </m.div>
              )}
            </li>
          );
        })}
        {eligible.length === 0 && (
          <li className="px-6 py-12 text-center text-sm text-warm-500 italic">
            All entries are within the top-{candidates.length - eligible.length} auto-lock.
          </li>
        )}
      </ul>
    </section>
  );
}
