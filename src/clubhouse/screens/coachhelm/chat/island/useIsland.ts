'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { buildAssistantTurn, type AskAssistantTurn } from '../../../../data/coachhelm-chat-thread';
import { haptic } from '../../../../lib/haptics';
import { ISLAND_REST_MS, ISLAND_SOLO_MS, islandModel, type IslandModel } from './model';

export interface Island {
  /** What to draw, or null when there is no island. */
  model: IslandModel | null;
  /** Its full form is open: every step, what each touched, each finished one openable. */
  open: boolean;
  /** It shows a finished turn the coach reopened from the turn's own line, not the turn at work. */
  pinned: boolean;
  /** When the live turn started working (performance.now), for the island's own clock; null when it is not live. */
  since: number | null;
  toggle: () => void;
  close: () => void;
  /** Open a turn's work from the turn's own line (a live turn's island, or a finished turn's steps). */
  openFor: (turnId: string) => void;
}

const hasAnswer = (turn: AskAssistantTurn) => turn.blocks.some((b) => b.kind !== 'proposal' && b.kind !== 'receipt' && !(b.kind === 'evidence' && b.ref)) || !!turn.note;

interface Seen {
  id: string;
  /** When this run began, less any earlier run of the same turn (a Confirm resumes its turn). */
  at: number;
  /** Steps the turn already had when this run began: a resumed run earns the island only with new work. */
  base: number;
  firstStepAt: number | null;
  endedAt: number | null;
  earned: boolean;
}

/**
 * When the activity island is on screen and in which of its two sizes (SPEC Moment 4).
 *
 * It appears for real work only: two or more steps, or one step still running after a beat. A single quick read never throws
 * up a panel and takes it away; it is said on the turn's own line instead. It opens to its full size by itself only for a big
 * job (three or more steps, or a calculation) and only while no answer text exists, so it never covers words being read; at the
 * first word it folds to one line, unless the coach opened it. When the work finishes it rests as a summary for a few seconds,
 * then leaves, unless the coach has it open; the turn's own line reopens it.
 *
 * Every step and every state comes from the turn's stored parts, which are the engine's events folded by the shared reducer.
 * The only clocks here are the two thresholds above.
 */
export function useIsland({ messages, busy, ended = false }: { messages: UIMessage[]; busy: boolean; /** The last turn failed or was stopped. */ ended?: boolean }): Island {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const last = messages[messages.length - 1];
  const lastAssistant = last?.role === 'assistant' ? last : null;
  const turn = useMemo(() => (lastAssistant ? buildAssistantTurn(lastAssistant, { isLast: true, busy }) : null), [lastAssistant, busy]);
  const live = busy && !!turn;
  const steps = turn?.steps.length ?? 0;

  // When this browser saw the turn work, and when it saw it stop: the solo threshold, the clock and the rest.
  const seen = useRef<Seen | null>(null);
  const now = typeof performance === 'undefined' ? 0 : performance.now();
  if (turn && seen.current?.id !== turn.id) seen.current = live ? { id: turn.id, at: now, base: 0, firstStepAt: null, endedAt: null, earned: false } : null;
  const s = turn && seen.current?.id === turn.id ? seen.current : null;
  if (s && live && s.endedAt !== null) {
    // The same turn runs again (the coach confirmed its card): the clock carries on and only new steps count as work.
    s.at = now - (s.endedAt - s.at);
    s.base = steps;
    s.firstStepAt = null;
    s.endedAt = null;
    s.earned = false;
  }
  if (s && steps > s.base && s.firstStepAt === null) s.firstStepAt = now;
  if (s && !live && s.endedAt === null) s.endedAt = now;

  // The coach's own choices: a finished turn they reopened, and whether they opened or folded the island (null: the island decides).
  const [pinned, setPinned] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ turnId: string; open: boolean } | null>(null);

  // A new run takes the island: a finished turn the coach had reopened steps aside.
  useEffect(() => {
    if (busy) setPinned(null);
  }, [busy]);

  const waitingForCoach = !!turn && !live && turn.blocks.some((b) => b.kind === 'proposal' && (b.view.status === 'live' || b.view.status === 'preparing'));
  const seconds = s && s.endedAt !== null ? (s.endedAt - s.at) / 1000 : turn?.durationMs != null ? turn.durationMs / 1000 : null;

  // Real work only: two steps, or one that is still running after a beat.
  const fresh = s ? steps - s.base : 0;
  const soloDue = s?.firstStepAt != null ? s.firstStepAt + ISLAND_SOLO_MS : null;
  const newest = turn?.steps[steps - 1];
  if (s && live && !s.earned && (fresh >= 2 || (fresh === 1 && soloDue !== null && now >= soloDue && newest?.state !== 'done' && newest?.state !== 'failed'))) s.earned = true;
  const resting = !!s && !live && s.endedAt !== null && now - s.endedAt < ISLAND_REST_MS;
  const heldOpen = !!turn && chosen?.turnId === turn.id && chosen.open;
  const autoShown = !!turn && !!s && s.earned && (live || resting || heldOpen);

  // A reopened turn, in its resolved form.
  const pinnedTurn = useMemo(() => {
    if (!pinned) return null;
    const m = messages.find((x) => x.id === pinned && x.role === 'assistant');
    return m ? buildAssistantTurn(m, { isLast: false, busy: false }) : null;
  }, [pinned, messages]);

  const waitSolo = live && !!s && !s.earned && soloDue !== null;
  const restEnds = s && !live && s.endedAt !== null && resting ? s.endedAt + ISLAND_REST_MS : null;
  useEffect(() => {
    // Wake for the next threshold: the solo beat, or the end of the rest.
    const due = waitSolo && soloDue !== null ? soloDue : restEnds;
    if (due === null) return;
    const t = setTimeout(tick, Math.max(0, due - performance.now()) + 8);
    return () => clearTimeout(t);
  }, [waitSolo, soloDue, restEnds]);

  const isPinned = !!pinnedTurn && !(live && autoShown) && pinnedTurn.id !== (autoShown ? turn?.id : null);
  const shownTurn = isPinned ? pinnedTurn : autoShown ? turn : null;
  const model = shownTurn
    ? isPinned
      ? islandModel(shownTurn, { live: false, hasText: true, waitingForCoach: false, seconds: shownTurn.durationMs != null ? shownTurn.durationMs / 1000 : shownTurn.id === s?.id ? seconds : null, ended: false })
      : islandModel(shownTurn, { live, hasText: hasAnswer(shownTurn), waitingForCoach, seconds, ended: ended && !live })
    : null;
  // The island opens by itself only for a big job and only while nothing is under it; the coach's own choice outranks that.
  const auto = !!model && !isPinned && model.live && model.wide && !!turn && !hasAnswer(turn);
  const open = !!model && (isPinned ? true : chosen?.turnId === model.turnId ? chosen.open : auto);
  const turnId = model?.turnId ?? null;

  const toggle = useCallback(() => {
    if (!turnId) return;
    haptic('select');
    if (isPinned) setPinned(null);
    else setChosen({ turnId, open: !open });
  }, [turnId, isPinned, open]);
  const close = useCallback(() => {
    setPinned(null);
    if (turnId) setChosen({ turnId, open: false });
  }, [turnId]);
  const shownLive = autoShown ? (turn?.id ?? null) : null;
  const openFor = useCallback(
    (id: string) => {
      haptic('select');
      if (shownLive === id) setChosen((c) => ({ turnId: id, open: !(c?.turnId === id ? c.open : false) }));
      else setPinned((p) => (p === id ? null : id));
    },
    [shownLive],
  );

  return { model, open, pinned: isPinned, since: model?.live && s ? s.at : null, toggle, close, openFor };
}
