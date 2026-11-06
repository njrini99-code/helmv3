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
import { CoachComposition } from '../visual/CoachComposition';
import { CoachVisualArtifact } from '../visual/CoachVisualArtifact';
import { FollowUps } from './FollowUps';
import { ReadChip } from './ReadChip';
import { Sources } from './Sources';
import { ArtifactCard } from './Artifact';
import type { AskArtifact } from './artifacts';
import { Steps } from './Steps';
import { ToolSkeleton } from './ToolCard';

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
      setSecs((performance.now() - start.current) / 1000);
      start.current = null;
    }
  }, [active]);
  return secs;
}

/** One card per assistant turn (the Messages receive surface): steps, prose with its read chips, visuals, sources; follow-ups sit under it. */
export function AnswerCard({ turn, fresh, showFollowUps, playersByName, players, onSend, actions, onArtifact, stopped = false, question }: { /** The coach pressed Stop on this turn. */ stopped?: boolean; /** The question this turn answers, for Try again. */ question?: string; onArtifact?: (a: AskArtifact) => void; turn: AskAssistantTurn; fresh: boolean; showFollowUps: boolean; playersByName: Record<string, string>; players: Array<{ id: string; name: string }>; onSend: (text: string) => boolean | void; actions: (b: Extract<AskBlock, { kind: 'proposal' | 'receipt' }>) => ReactNode }) {
  const seconds = useRan(turn.active);
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
        return read ? <ReadChip read={read} onSources={() => setSourcesOpen(true)} /> : null;
      },
    }),
    [known, reads],
  );
  // M-ASK / E-SKEL: when the chart arrives, the skeleton it replaces stays a moment over it and fades.
  const [ghost, setGhost] = useState<string[] | null>(null);
  const lastPending = useRef(turn.pendingVisual);
  useEffect(() => {
    if (lastPending.current?.length && !turn.pendingVisual?.length) setGhost(lastPending.current);
    lastPending.current = turn.pendingVisual;
  }, [turn.pendingVisual]);
  const lastChart = [...turn.blocks].reverse().find((b) => b.kind === 'composition')?.key;
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
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(turn.answerText);
      toast({ title: 'Copied' });
    } catch {
      toast({ title: 'Couldn’t copy that' });
    }
  };
  return (
    <div className={'ch-ak-turn' + (fresh ? ' is-new' : '')}>
      <article className="msg-a" aria-label="CoachHelm answer" aria-busy={turn.active || undefined}>
        <div className="who">
          <CoachMark working={turn.active} />
          CoachHelm
        </div>
        <Steps steps={turn.steps} active={turn.active} seconds={seconds} waiting={waiting} stopped={stopped && !turn.answerText} />
        {turn.note && (
          <p className="prose ch-th-note" data-ch-code="CH-13252">
            {turn.note}
          </p>
        )}
        {turn.blocks.map((b) => {
          // A board holds the turn's charts: they're drawn once, on it, and what's on it is what the player gets.
          if (boardTiles && (b.kind === 'visual' || b.kind === 'composition')) return null;
          if (b.kind === 'text')
            return (
              <div className="prose" key={b.key}>
                <AskProse text={b.text} lead={b.lead} playersByName={playersByName} streaming={turn.active} chip={chip} />
              </div>
            );
          if (b.kind === 'evidence') return <AskEvidenceView key={b.key} envelope={b.envelope} roster={players} />;
          if (b.kind === 'visual') return <CoachVisualArtifact key={b.key} artifact={b.artifact} />;
          if (b.kind === 'plan') return <PlanCard key={b.key} plan={b.plan} onSend={onSend} fresh={fresh} />;
          if (b.kind === 'brief' && b.brief.intake) return <PlanIntake key={b.key} brief={b.brief} onSend={onSend} />;
          if (b.kind === 'brief') return <BriefCard key={b.key} title={b.brief.title} questions={b.brief.questions} onDone={(_a, line) => onSend(line || 'Skip, just build')} />;
          if (b.kind === 'handoff') return <HandoffCard key={b.key} handoff={b.handoff} tiles={b.handoff.kind === 'board' ? boardTiles : undefined} />;
          if (b.kind === 'composition') {
            const drawn = <CoachComposition key={b.key} composition={b.composition} live={turn.active} />;
            return ghost && b.key === lastChart ? (
              <div key={b.key} className="ch-ak-swap">
                <div className="next">{drawn}</div>
                <div className="ghost" onAnimationEnd={() => setGhost(null)}>
                  <ToolSkeleton types={ghost} />
                </div>
              </div>
            ) : (
              drawn
            );
          }
          return actions(b);
        })}
        {artifacts.map((a) => (
          <ArtifactCard key={a.id} artifact={a} writing={turn.active} onOpen={() => onArtifact?.(a)} />
        ))}
        {turn.pendingVisual && <ToolSkeleton types={turn.pendingVisual} />}
        {stopped && !turn.active && !!turn.answerText && (
          <p className="ch-ak-stopped">
            Stopped.
            {question && (
              <button type="button" onClick={() => onSend(question)}>
                Try again
              </button>
            )}
          </p>
        )}
        {!turn.active && (reads.length > 0 || turn.answerText) && (
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
      </article>
      {showFollowUps && !stopped && <FollowUps items={turn.followUps} onSend={onSend} />}
    </div>
  );
}
