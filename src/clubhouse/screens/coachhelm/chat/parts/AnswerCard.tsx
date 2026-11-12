'use client';

import { PlanCard } from '../../plan/PlanCard';
import { PlanIntake } from '../../plan/PlanIntake';
import { BriefCard } from './BriefCard';
import { HandoffCard } from './HandoffCard';
import { Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { stepsReceipt, type AskAssistantTurn, type AskBlock } from '../../../../data/coachhelm-chat-thread';
import { Icon } from '../../../../ui/Icon';
import { chReport } from '../../../../lib/track';
import { useToast } from '../../../../ui/Toast';
import { AskEvidenceView } from '../Evidence';
import { AskProse } from '../Prose';
import { windowOf } from '../ask-scope-window';
import { elapsedWords, islandModel } from '../island/model';
import { TurnIsland } from '../island/TurnIsland';
import { sentencesSince, TURN_TIMING } from '../turn-timing';
import { CoachComposition } from '../visual/CoachComposition';
import { CoachVisualArtifact } from '../visual/CoachVisualArtifact';
import { FollowUps } from './FollowUps';
import { ReadChip } from './ReadChip';
import { Sources } from './Sources';
import { ArtifactCard } from './Artifact';
import type { AskArtifact } from './artifacts';
import { TurnNotice, type TurnEnd } from './TurnNotice';
import { revealMode, useReveal } from '../reveal';
import { pastOf } from '../work-tense';
import { useWork, useWorkListId, WorkLine } from './Work';

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
  /**
   * The work is shown by an island outside the thread (quick chat's header): this turn only keeps the line that opens it.
   * Left out, the turn draws its own island in the flow, under the question (direction A).
   */
  island?: { showing: boolean; open: boolean; onOpen: () => void };
  /** Who the answer is about, in the question's own words: the leaf's running head. */
  subject?: string | null;
}

type BodyBlock = Extract<AskBlock, { kind: 'text' | 'evidence' | 'visual' | 'composition' }>;
type BodyRun = { kind: 'body'; key: string; blocks: BodyBlock[] };
/** A run of the answer's own words and figures, or one card that stands by itself between two runs. */
type Segment = BodyRun | { kind: 'card'; key: string; node: ReactNode };
const isFigure = (b: AskBlock) => b.kind === 'visual' || b.kind === 'composition' || b.kind === 'evidence';
/** A later run is a leaf only when it is figures and nothing else; words after a card stay plain words. */
const figuresOnly = (run: BodyRun) => run.blocks.every(isFigure);

/**
 * One assistant turn (chat v3, SPEC Moments 4, 5 and 10; the look is direction A, "the yardage book").
 *
 * No mark and no name stand beside an answer. Under the question sits the activity island (the steps while it works, one
 * line once it has), then the words. An answer that read the team's data is a leaf: paper under a running head, its figures
 * ruled sections of the same leaf, its sources numbered at the foot. One that read nothing is plain words on the page. A
 * card (a draft, a brief, a handoff) never sits inside a leaf: it stands alone between two runs of the answer.
 * Nothing in it moves once drawn.
 */
export function AnswerCard({ turn, fresh, showFollowUps, playersByName, players, onSend, actions, onArtifact, sentAt = null, started = true, end = null, offline = false, changed = { changedNothing: false, unconfirmedWrite: false }, onRetry, onNewChat, onOpenRead, openRef = null, island, subject = null }: AnswerCardProps) {
  const flow = !island;
  const live = turn.active;
  // How long it worked: this browser's own count for a turn it watched, else the server's stored figure (a restored turn), else unknown.
  const ran = useRan(live);
  const seconds = ran ?? (turn.durationMs != null ? turn.durationMs / 1000 : null);
  const artifacts = turn.artifacts ?? [];
  const toast = useToast();
  // A stored visual block that could not be drawn is reported once per answer, never hidden in silence (preview, 12 Nov).
  const faults = (turn.visualFaults ?? []).join(' | ');
  useEffect(() => {
    if (faults && !live) chReport(new Error(`Ask visual not fully drawn: ${faults}`), { surface: 'coachhelm-ask', action: 'visual-parse', severity: 'medium', extra: { messageId: turn.id } });
  }, [faults, live, turn.id]);
  const reads = useMemo(() => turn.reads ?? [], [turn.reads]);
  const known = useMemo(() => new Set(reads.map((r) => r.ref)), [reads]);
  const chip = useMemo(
    () => ({
      known,
      draw: (ref: string) => {
        const at = reads.findIndex((r) => r.ref === ref);
        const read = reads[at];
        return read ? <ReadChip read={read} n={at + 1} onOpen={onOpenRead ? () => onOpenRead(read.ref, read.name) : undefined} selected={openRef === read.ref} /> : null;
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
  // In the flow the island speaks for the turn, so the work line and the read list are never drawn; the hook still times the turn's arrival.
  const work = useWork({ steps: turn.steps, live, sentAt, started, hasText: hasBody, waitingForCoach: waiting && !live, seconds, island: island ? { showing: island.showing } : flow ? { showing: false } : null });
  // The island in the flow: open by itself only while nothing is under it; the coach's own tap outranks that.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const ended = !!end;
  const model = useMemo(() => (flow ? islandModel(turn, { live, hasText: hasBody, waitingForCoach: false, seconds, ended, ordered: true }) : null), [flow, turn, live, hasBody, seconds, ended]);
  const islandOpen = chosen ?? (live && !hasBody && turn.steps.length > 0);
  const oneStep = turn.steps.length === 1 ? turn.steps[0] : null;
  const summary = turn.work ?? (oneStep ? pastOf(oneStep.done ?? oneStep.label) : 'Done');
  // "3 steps · 4s" beside it; a summary that already counts its steps keeps only the time.
  const meta = /\bsteps?\b/.test(summary) ? (seconds === null ? '' : elapsedWords(seconds)) : stepsReceipt(turn.steps, seconds);
  // A live turn with no step yet is one line, and it leaves as the first words take its place (nothing is under it to move).
  const showIsland = !!model && (model.steps.length > 0 || (live && !hasBody));
  // Before the first step the line says only what is known, and nothing at all for the first 1.2 s (the ring turns): the hook's own clock.
  const waitWords = work.line.kind === 'words' ? work.line.text : null;
  const listId = useWorkListId();
  const pending = usePendingWords(turn.answerText, live);
  const spoken = useSpoken(turn.answerText, live);
  const lastBlock = [...turn.blocks].reverse().find((b) => b.kind === 'text');
  const lastText = lastBlock?.key;
  // The block being written is released by the frame clock when the surface chose the smoothed reveal; every other block, and
  // every block once the turn is not live, is whole.
  const revealed = useReveal(lastBlock?.kind === 'text' ? lastBlock.text : '', live && revealMode() === 'smooth', lastText ?? null);
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
  // The answer in runs: its words and figures, broken where a card stands. A read the engine named joins the last run once the
  // turn has finished (while the answer is being written the set can still change, and a figure that came or went above the
  // text would move the words being read).
  const segments: Segment[] = [];
  const push = (b: BodyBlock) => {
    const last = segments[segments.length - 1];
    if (last?.kind === 'body') last.blocks.push(b);
    else segments.push({ kind: 'body', key: b.key, blocks: [b] });
  };
  if (work.textReady)
    for (const b of turn.blocks) {
      // A board holds the turn's charts: they're drawn once, on it, and what's on it is what the player gets.
      if (boardTiles && (b.kind === 'visual' || b.kind === 'composition')) continue;
      // A plan and its intake sit on the thread, beside this answer (PP-2).
      if (b.kind === 'plan' || (b.kind === 'brief' && b.brief.intake)) continue;
      if (b.kind === 'text' || b.kind === 'visual' || b.kind === 'composition') push(b);
      else if (b.kind === 'evidence') {
        // An older stored read, with no ref, stays where it was; a named one is drawn once the turn has finished (below).
        if (!b.ref) push(b);
      } else {
        const node =
          b.kind === 'brief' ? (
            <BriefCard key={b.key} title={b.brief.title} questions={b.brief.questions} onDone={(_a, line) => onSend(line || 'Skip, just build')} />
          ) : b.kind === 'handoff' ? (
            <HandoffCard key={b.key} handoff={b.handoff} tiles={b.handoff.kind === 'board' ? boardTiles : undefined} />
          ) : (
            actions(b)
          );
        if (node) segments.push({ kind: 'card', key: b.key, node });
      }
    }
  const bodyRuns = () => segments.filter((x): x is BodyRun => x.kind === 'body');
  if (!live) {
    const named = turn.blocks.filter((b): b is Extract<AskBlock, { kind: 'evidence' }> => b.kind === 'evidence' && !!b.ref);
    const tail = bodyRuns().pop();
    if (tail) tail.blocks.push(...named);
    else if (named.length) segments.push({ kind: 'body', key: named[0]!.key, blocks: named });
  }
  const bodies = bodyRuns();
  const lastBody = bodies[bodies.length - 1];
  // A leaf is chosen once, when the answer's first words are drawn, from what the turn had read by then (its reads come before
  // its words): a run that began as plain words never gains a frame around text the coach is already reading. Only the run
  // that opens the turn can be the leaf; words that follow a card ("Here it is. Nothing is created until you confirm.") are
  // plain words, and a later run is a leaf only when it is a figure by itself.
  const opens = segments[0]?.kind === 'body' ? segments[0] : null;
  const leafy = reads.length > 0 || turn.envelopes.length > 0;
  const firstLeaf = useRef<boolean | null>(null);
  if (opens && firstLeaf.current === null) firstLeaf.current = leafy || opens.blocks.some(isFigure);
  const isLeaf = (run: BodyRun) => (run === opens ? firstLeaf.current === true : figuresOnly(run));
  const windowLine = windowOf(turn.envelopes);
  const foot = settled && (reads.length > 0 || (!!turn.answerText && !turn.note));
  const copyKey = turn.answerText && !turn.note && (
    <button type="button" className="sb" aria-label="Copy" onClick={() => void copy()}>
      <Icon icon={Copy} size={16} />
    </button>
  );
  const drawBlock = (b: BodyBlock, inLeaf: boolean) => {
    if (b.kind === 'text')
      return (
        <div className="prose" key={b.key}>
          <AskProse text={b.key === lastText ? revealed : b.text} lead={b.lead} playersByName={playersByName} streaming={live} pending={pending && b.key === lastText} chip={chip} />
        </div>
      );
    // Visuals are complete at first paint (owner decision Q-153): no skeleton before them, nothing grows inside them.
    const figure = b.kind === 'evidence' ? <AskEvidenceView envelope={b.envelope} roster={players} /> : b.kind === 'visual' ? <CoachVisualArtifact artifact={b.artifact} /> : <CoachComposition composition={b.composition} live={false} />;
    // In a leaf a figure is one more ruled section; among plain words it is a leaf of its own.
    return (
      <div key={b.key} className={'ch-ak-vis' + (inLeaf ? '' : ' ch-ak-leaf is-figure')}>
        {figure}
      </div>
    );
  };
  const papers = artifacts.map((a) => <ArtifactCard key={a.id} artifact={a} writing={live} onOpen={() => onArtifact?.(a)} />);
  // The turn arrives after its question, as a reply does (MO-4-1): until then it holds no space, and nothing is under it to move.
  if (!work.present) return <div className="ch-ak-turn is-early" aria-hidden="true" />;
  return (
    <div className={'ch-ak-turn' + (fresh ? ' is-new' : '') + (settled && watched.current ? ' is-settling' : '')}>
      <article className="msg-a" aria-label="CoachHelm answer" aria-busy={live || undefined}>
        {flow
          ? showIsland && model && <TurnIsland model={model} summary={summary} meta={meta} words={waitWords} open={islandOpen} onToggle={() => setChosen(!islandOpen)} onOpenStep={onOpenRead} />
          : work.line.kind !== 'none' && (
              <div className="ch-ak-wlrow">
                <WorkLine work={work} listId={listId} handle={island ? { open: island.open, onOpen: island.onOpen } : undefined} />
              </div>
            )}
        {turn.note && (
          <p className="prose ch-th-note" data-ch-code="CH-13252">
            {turn.note}
          </p>
        )}
        {segments.map((seg) => {
          if (seg.kind === 'card') return seg.node;
          const leaf = isLeaf(seg);
          const last = seg === lastBody;
          return (
            <div key={seg.key} className={leaf ? 'ch-ak-leaf' : 'ch-ak-say'}>
              {leaf && seg === opens && subject && (
                <header className="ch-ak-leaf__head">
                  <span>{subject}</span>
                  {windowLine && <span className="ch-num">{windowLine}</span>}
                </header>
              )}
              {seg.blocks.map((b) => drawBlock(b, leaf))}
              {last && leaf && foot && <Sources reads={reads} onOpen={onOpenRead} openRef={openRef} action={copyKey} />}
            </div>
          );
        })}
        {papers}
        {/* Plain words keep their sources and the copy key on one quiet row under them. */}
        {foot && !(lastBody && isLeaf(lastBody)) && <Sources reads={reads} onOpen={onOpenRead} openRef={openRef} action={copyKey} plain />}
        {end && onRetry && onNewChat && <TurnNotice end={end} offline={offline} changed={changed} onRetry={onRetry} onNewChat={onNewChat} />}
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
