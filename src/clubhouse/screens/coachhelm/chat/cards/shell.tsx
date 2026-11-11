'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { ChatCardRevision } from '@/lib/coachhelm/v3/chat/engine/protocol';
import type { AskProposalView } from '../../../../data/coachhelm-chat-thread';
import { ApproveAll, type BatchPhase, type WaitingCard } from './ApproveAll';
import { cardCopy } from './catalog';

/**
 * What the thread keeps for its task cards, so the cards' built behaviours reach the server (CAPABILITIES 0.8 and 0.9):
 * the server's word on an edit, which cards have an edit form open, where each write stands, and the one batch a coach
 * approved together. The thread owns where the cards sit; this owns only that state, and makes no request itself.
 */

/** Where a card's write stands, as its receipt row reports it. */
export type WritePhase = 'held' | 'saved' | 'undone' | 'failed';

const stored = (r: ActionReceipt | null): WritePhase | null => (!r ? null : r.status === 'held' ? 'held' : r.status === 'failed' ? 'failed' : r.status === 'cancelled' ? 'undone' : 'saved');
/** A card's key as the server knows it: its approval id, which is its ledger key. */
const idOf = (v: AskProposalView): string => v.approvalId ?? v.key;
const isWaiting = (v: AskProposalView): boolean => v.status === 'live' && !!v.approvalId && !v.receipt;

export interface CardShell {
  /** The server's answer to the last edit of a card, while the thread is live. */
  revisionOf: (view: AskProposalView) => ChatCardRevision | null;
  /** A card's edit form opened or closed. */
  onEditOpen: (key: string, open: boolean) => void;
  /** A card's write changed state. Call it before handing the same to whoever else listens. */
  onPhase: (key: string, phase: WritePhase) => void;
  /** Rises when the card is undone with its batch. */
  undoSignalOf: (view: AskProposalView) => number;
  /** The bar for a turn's cards, when there are several to decide or a batch of them is under way; else null. */
  batchOf: (views: readonly AskProposalView[]) => BatchBarProps | null;
}

export interface BatchBarProps {
  cards: WaitingCard[];
  phase: BatchPhase;
  /** The end of the one shared Undo window. */
  until: string | null;
  stoppedAt: { head: string; reopened: number } | null;
  onApproveAll?: (keys: string[]) => void;
  onUndoAll?: () => void;
}

export function useCardShell({ messages, busy, onApproveAll }: { messages: readonly UIMessage[]; busy: boolean; /** Confirms the cards with these approval ids together. Absent: no bar is offered. */ onApproveAll?: (approvalIds: string[]) => void }): CardShell {
  const revisions = useMemo(() => {
    const byKey = new Map<string, ChatCardRevision>();
    for (const m of messages) {
      for (const part of m.parts as Array<{ type: string; data?: unknown }>) {
        if (part.type !== 'data-card-revision' || !part.data) continue;
        const r = part.data as ChatCardRevision;
        byKey.set(r.key, r);
      }
    }
    return byKey;
  }, [messages]);
  const [editing, setEditing] = useState<ReadonlySet<string>>(() => new Set());
  const [phases, setPhases] = useState<ReadonlyMap<string, WritePhase>>(() => new Map());
  const [batch, setBatch] = useState<{ keys: readonly string[]; undo: number } | null>(null);

  const onEditOpen = useCallback((key: string, open: boolean) => {
    setEditing((now) => {
      if (now.has(key) === open) return now;
      const next = new Set(now);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const onPhase = useCallback((key: string, phase: WritePhase) => {
    setPhases((now) => (now.get(key) === phase ? now : new Map(now).set(key, phase)));
  }, []);

  const inBatch = (v: AskProposalView): boolean => !!batch && (batch.keys.includes(idOf(v)) || batch.keys.includes(v.key));
  const card = (v: AskProposalView): WaitingCard => ({ key: idOf(v), tool: v.tool, proposal: v.proposal, editing: editing.has(v.key) });

  return {
    revisionOf: (v) => revisions.get(idOf(v)) ?? revisions.get(v.key) ?? null,
    onEditOpen,
    onPhase,
    undoSignalOf: (v) => (inBatch(v) ? (batch?.undo ?? 0) : 0),
    batchOf: (views) => {
      const together = views.filter(inBatch);
      const where = together.map((v) => phases.get(v.key) ?? stored(v.receipt));
      // A batch whose request was lost leaves every card waiting again: the bar offers them again.
      const under = together.length >= 2 && (busy || where.some((w) => w !== null));
      if (under) {
        const failed = together.find((_, i) => where[i] === 'failed');
        const phase: BatchPhase = failed ? 'stopped' : where.every((w) => w === 'undone') ? 'undone' : where.every((w) => w === 'saved') ? 'saved' : where.some((w) => w === 'held') ? 'held' : 'confirming';
        const until = together.reduce<string | null>((latest, v) => (v.receipt?.status === 'held' && v.receipt.held_until && (!latest || v.receipt.held_until > latest) ? v.receipt.held_until : latest), null);
        return {
          cards: together.map(card),
          phase,
          until,
          stoppedAt: failed ? { head: cardCopy(failed.tool, failed.proposal).head, reopened: together.filter(isWaiting).length } : null,
          onUndoAll: () => setBatch((b) => (b ? { ...b, undo: b.undo + 1 } : b)),
        };
      }
      const waiting = views.filter(isWaiting);
      if (!onApproveAll || waiting.length < 2) return null;
      return {
        cards: waiting.map(card),
        phase: 'waiting',
        until: null,
        stoppedAt: null,
        onApproveAll: (keys) => {
          setBatch({ keys, undo: 0 });
          onApproveAll(keys);
        },
      };
    },
  };
}

/** Whole seconds until `until`, ticking while `running`. A clock: the number changes at once each second. */
function useSecondsLeft(until: string | null, running: boolean): number {
  const left = () => (until ? Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 1000)) : 0);
  const [seconds, setSeconds] = useState(left);
  useEffect(() => {
    if (!until || !running) return;
    const tick = setInterval(() => setSeconds(Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 1000))), 200);
    return () => clearInterval(tick);
  }, [until, running]);
  return running ? seconds : 0;
}

/** The batch bar in a turn: `ApproveAll`, on the server's clock for the one shared Undo window. */
export function BatchBar({ cards, phase, until, stoppedAt, onApproveAll, onUndoAll }: BatchBarProps) {
  const seconds = useSecondsLeft(until, phase === 'held');
  return <ApproveAll cards={cards} phase={phase} seconds={seconds} stoppedAt={stoppedAt} onApproveAll={onApproveAll} onUndoAll={onUndoAll ? () => onUndoAll() : undefined} />;
}
