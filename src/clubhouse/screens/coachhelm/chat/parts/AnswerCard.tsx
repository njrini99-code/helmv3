'use client';

import { PlanCard } from '../../plan/PlanCard';
import { PlanIntake } from '../../plan/PlanIntake';
import { BriefCard } from './BriefCard';
import { HandoffCard } from './HandoffCard';
import { Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AskAssistantTurn, AskBlock } from '../../../../data/coachhelm-chat-thread';
import { Icon } from '../../../../ui/Icon';
import { useToast } from '../../../../ui/Toast';
import { CoachMark } from '../CoachMark';
import { AskEvidenceView } from '../Evidence';
import { AskProse } from '../Prose';
import { sentencesSince, TURN_TIMING } from '../turn-timing';
import { CoachComposition } from '../visual/CoachComposition';
import { CoachVisualArtifact } from '../visual/CoachVisualArtifact';
import { FollowUps } from './FollowUps';
import { ReadChip } from './ReadChip';
import { Sources } from './Sources';
import { ArtifactCard } from './Artifact';
import type { AskArtifact } from './artifacts';
import { TurnNotice, type TurnEnd } from './TurnNotice';
import { ReadList, useWork, useWorkListId, WorkLine } from './Work';

/** Seconds this browser watched the turn run; null for a reloaded turn (no honest duration). */
function useRan(active: boolean): number | null {
  const start = useRef<number | null>(null);
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (active) {
      start.current ??= performance.now();
      return;
    }
    if (start.current != null) {
      // A turn that runs again (a Confirm continues it) adds to its time: the line says how long the answer took in all.
      const ran = (performance.now() - start.current) / 1000;
      setSecs((s) => (s ?? 0) + ran);
      start.current = null;
    }
  }, [active]);
  return secs;
}

/** True once a live turn has gone a moment with no new words: the live dot sits after the last one (MO-5-2). */
function usePendingWords(text: string, live: boolean): boolean {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setPending(false);
    if (!live || !text) return;
    const t = setTimeout(() => setPending(true), TURN_TIMING.pending);
    return () => clearTimeout(t);
  }, [text, live]);
  return pending && live;
}

/** What a screen reader is told of a streaming answer: whole sentences as they complete, then the rest when the turn ends. Never a word at a time. */
function useSpoken(text: string, live: boolean): string {
  const [say, setSay] = useState('');
  const upTo = useRef(live ? 0 : text.length);
  useEffect(() => {
    if (!live) {
      const rest = text.slice(upTo.current).replace(/\*\*|\[[a-z]?\d+\]/gi, '').trim();
      upTo.current = text.length;
      if (rest) setSay(rest);
      return;
    }
    const next = sentencesSince(text, upTo.current);
    if (!next) return;
    upTo.current = next.upTo;
    setSay(next.say);
  }, [text, live]);
  return say;
}

export interface AnswerCardProps {
  turn: AskAssistantTurn;
  /** It arrived in this visit (not one the thread opened with). */
  fresh: boolean;
  showFollowUps: boolean;
  playersByName: Record<string, string>;
  players: Array<{ id: string; name: string }>;
  onSend: (text: string) => boolean | void;
  actions: (b: Extract<AskBlock, { kind: 'proposal' | 'receipt' }>) => ReactNode;
  onArtifact?: (a: AskArtifact) => void;
  /** When its question was sent (performance.now), while this browser waits on it. */
  sentAt?: number | null;
  /** The server has opened this turn (a message exists for it). */
  started?: boolean;
  /** The turn ended early: the coach's Stop, or a failure. Drawn as the turn's last line. */
  end?: TurnEnd | null;
  offline?: boolean;
  changed?: { changedNothing: boolean; unconfirmedWrite: boolean };
  onRetry?: () => void;
  onNewChat?: () => void;
  /** Opens one read in the evidence sheet or panel; `openRef` is the read that is open now. */
  onOpenRead?: (ref: string, label: string) => void;
  openRef?: string | null;
}

/**
 * One assistant turn (chat v3, SPEC Moments 4, 5 and 10): the mark and name with the work line, the reads while nothing is under
 * them, the answer as it streams, its visuals and cards, and then either its foot and follow-ups or the notice that it ended early.
 * Nothing in it moves once drawn.
 */
export function AnswerCard({ turn, fresh, showFollowUps, playersByName, players, onSend, actions, onArtifact, sentAt = null, started = true, end = null, offline = false, changed = { changedNothing: false, unconfirmedWrite: false }, onRetry, onNewChat, onOpenRead, openRef = null }: AnswerCardProps) {
  const live = turn.active;
  const seconds = useRan(live);
  const artifacts = turn.artifacts ?? [];
  const toast = useToast();
  const reads = useMemo(() => turn.reads ?? [], [turn.reads]);
  const known = useMemo(() => new Set(reads.map((r) => r.ref)), [reads]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const chip = useMemo(
    () => ({
      known,
      draw: (ref: string) => {
        const read = reads.find((r) => r.ref === ref);
        return read ? <ReadChip read={read} onSources={() => setSourcesOpen(true)} onOpen={onOpenRead ? () => onOpenRead(read.ref, read.name) : undefined} selected={openRef === read.ref} /> : null;
      },
    }),
    [known, reads, onOpenRead, openRef],
  );
  const hasBoard = turn.blocks.some((b) => b.kind === 'handoff' && b.handoff.kind === 'board');
  const charts = turn.blocks.filter((b) => b.kind === 'visual' || b.kind === 'composition');
  const boardTiles =
    hasBoard && charts.length > 0
      ? charts.map((b) => (
          <div key={b.key} className="bt">
            {b.kind === 'visual' ? <CoachVisualArtifact artifact={b.artifact} /> : b.kind === 'composition' ? <CoachComposition composition={b.composition} live={false} /> : null}
          </div>
        ))
      : undefined;
  const waiting = turn.blocks.some((b) => b.kind === 'proposal' && (b.view.status === 'live' || b.view.status === 'preparing'));
  // The answer has begun once there is something under the name that is not a card and not a held-back read: from then the read list is folded.
  const hasBody = turn.blocks.some((b) => b.kind !== 'proposal' && b.kind !== 'receipt' && !(b.kind === 'evidence' && b.ref)) || !!turn.note;
  const work = useWork({ steps: turn.steps, live, sentAt, started, hasText: hasBody, waitingForCoach: waiting && !live, seconds });
  const listId = useWorkListId();
  const pending = usePendingWords(turn.answerText, live);
  const spoken = useSpoken(turn.answerText, live);
  const lastText = [...turn.blocks].reverse().find((b) => b.kind === 'text')?.key;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(turn.answerText);
      toast({ title: 'Copied' });
    } catch {
      toast({ title: 'Couldn’t copy that' });
    }
  };
  // The turn has settled when it is neither live nor ended early: its foot and follow-ups arrive (MO-5-7). Only a turn this visit watched arrives; a restored one is still.
  const settled = !live && !end;
  const watched = useRef(live);
  if (live) watched.current = true;
  // The turn arrives after its question, as a reply does (MO-4-1): until then it holds no space, and nothing is under it to move.
  if (!work.present) return <div className="ch-ak-turn is-early" aria-hidden="true" />;
  return (
    <div className={'ch-ak-turn' + (fresh ? ' is-new' : '') + (settled && watched.current ? ' is-settling' : '')}>
      <article className="msg-a" aria-label="CoachHelm answer" aria-busy={live || undefined}>
        <div className="who">
          <CoachMark working={live} />
          <span className="nm">CoachHelm</span>
          <WorkLine work={work} listId={listId} />
        </div>
        <ReadList work={work} id={listId} live={live} />
        {turn.note && (
          <p className="prose ch-th-note" data-ch-code="CH-13252">
            {turn.note}
          </p>
        )}
        {work.textReady &&
          turn.blocks.map((b) => {
            // A board holds the turn's charts: they're drawn once, on it, and what's on it is what the player gets.
            if (boardTiles && (b.kind === 'visual' || b.kind === 'composition')) return null;
            if (b.kind === 'text')
              return (
                <div className="prose" key={b.key}>
                  <AskProse text={b.text} lead={b.lead} playersByName={playersByName} streaming={live} pending={pending && b.key === lastText} chip={chip} />
                </div>
              );
            // A read the engine named is drawn under the prose once the turn has finished (below). An older stored read, with no ref, stays where it was.
            if (b.kind === 'evidence') return b.ref ? null : <AskEvidenceView key={b.key} envelope={b.envelope} roster={players} />;
            // Visuals are complete at first paint (owner decision Q-153): no skeleton before them, nothing grows inside them.
            if (b.kind === 'visual')
              return (
                <div key={b.key} className="ch-ak-vis">
                  <CoachVisualArtifact artifact={b.artifact} />
                </div>
              );
            // A plan and its intake sit on the thread, beside this bubble (PP-2).
            if (b.kind === 'plan' || (b.kind === 'brief' && b.brief.intake)) return null;
            if (b.kind === 'brief') return <BriefCard key={b.key} title={b.brief.title} questions={b.brief.questions} onDone={(_a, line) => onSend(line || 'Skip, just build')} />;
            if (b.kind === 'handoff') return <HandoffCard key={b.key} handoff={b.handoff} tiles={b.handoff.kind === 'board' ? boardTiles : undefined} />;
            if (b.kind === 'composition')
              return (
                <div key={b.key} className="ch-ak-vis">
                  <CoachComposition composition={b.composition} live={false} />
                </div>
              );
            return actions(b);
          })}
        {/* The worked-out tables and figures of this turn's reads: under the answer, and only once it has finished. While the answer is
            being written the set can still change (a visual may stand in for a read), and a card that came or went above the text
            would move the words being read. */}
        {!live &&
          turn.blocks.map((b) =>
            b.kind === 'evidence' && b.ref ? (
              <div key={b.key} className="ch-ak-vis">
                <AskEvidenceView envelope={b.envelope} roster={players} />
              </div>
            ) : null,
          )}
        {artifacts.map((a) => (
          <ArtifactCard key={a.id} artifact={a} writing={live} onOpen={() => onArtifact?.(a)} />
        ))}
        {end && onRetry && onNewChat && <TurnNotice end={end} offline={offline} changed={changed} onRetry={onRetry} onNewChat={onNewChat} />}
        {settled && (reads.length > 0 || turn.answerText) && (
          <div className="acts">
            <Sources reads={reads} open={sourcesOpen} onToggle={() => setSourcesOpen((v) => !v)} />
            <span className="sp" />
            {turn.answerText && !turn.note && (
              <button type="button" className="sb" aria-label="Copy" onClick={() => void copy()}>
                <Icon icon={Copy} size={16} />
              </button>
            )}
          </div>
        )}
        {/* What a screen reader hears of the answer: sentences, not words. The words themselves are not a live region. */}
        <span className="ch-sr-only" aria-live="polite" aria-atomic="true">
          {spoken}
        </span>
      </article>
      {turn.blocks.map((b) => {
        if (b.kind === 'plan') return <PlanCard key={b.key} plan={b.plan} onSend={onSend} fresh={fresh} />;
        if (b.kind === 'brief' && b.brief.intake) return <PlanIntake key={b.key} brief={b.brief} onSend={onSend} />;
        return null;
      })}
      {showFollowUps && settled && <FollowUps items={turn.followUps} onSend={onSend} />}
    </div>
  );
}
