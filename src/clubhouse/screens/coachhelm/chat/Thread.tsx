'use client';

import type { UIMessage } from 'ai';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, Check, ChevronDown, CircleAlert, Copy, RotateCw } from 'lucide-react';
import type { ChatErrorNotice } from '../../../data/coachhelm-chat-error';
import {
  buildTurns,
  evidenceAvailable,
  failedAnswerChangedNothing,
  focusForProposal,
  pendingApproval,
  workReceipt,
  type AskAssistantTurn,
  type EvidenceFocus,
} from '../../../data/coachhelm-chat-thread';
import { haptic } from '../../../lib/haptics';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { OFFLINE_LINE } from '../../../ui/Retry';
import { useToast } from '../../../ui/Toast';
import { Tooltip } from '../../../ui/Tooltip';
import { CoachMark } from './CoachMark';
import { AnswerCard } from './parts/AnswerCard';
import { Steps } from './parts/Steps';
import { PlanVersions } from '../plan/PlanCard';
import { ConfirmCard, Receipt } from './parts/ConfirmCard';
import type { AskArtifact } from './parts/artifacts';
import { AskActionCard, AskReceiptCard } from './ActionCard';
import { AskEvidenceView } from './Evidence';
import { CoachComposition } from './visual/CoachComposition';
import { CoachVisualArtifact } from './visual/CoachVisualArtifact';
import { AskProse, AskUserText } from './Prose';
import '../../../styles/coachhelm-thread.css';

export interface AskThreadProps {
  onArtifact?: (a: AskArtifact) => void;
  /** Ask v2's answer card, steps, chips and tool cards. Off: today's markup. */
  v2?: boolean;
  /** The team's name, for a draft that shows how a player's phone will read it. */
  team?: string;
  /** The assistant message the coach pressed Stop on. */
  stoppedTurn?: string | null;
  messages: UIMessage[];
  /** A turn is in flight. */
  busy: boolean;
  /** The failed answer's sentence and what to offer (describeChatError), or null. */
  error: ChatErrorNotice | null;
  offline: boolean;
  phone: boolean;
  players: Array<{ id: string; name: string }>;
  /** Both receive the APPROVAL id (`part.approval.id`). */
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
  onSend: (text: string) => boolean | void;
  onStop: () => void;
  onRetry: () => void;
  onNewChat: () => void;
  evidenceFocus: EvidenceFocus | null;
  onOpenEvidence: (focus: EvidenceFocus) => void;
}

/** The nearest ancestor that scrolls, or null when the page itself does. */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}

/** How far from the bottom the reader is. */
function fromBottom(sp: HTMLElement | null): { gap: number; screen: number } {
  if (sp) return { gap: sp.scrollHeight - sp.scrollTop - sp.clientHeight, screen: sp.clientHeight };
  const doc = document.documentElement;
  return { gap: doc.scrollHeight - window.scrollY - window.innerHeight, screen: window.innerHeight };
}

/** Seconds the browser watched a turn run, or null for a turn it did not (a reloaded thread has no honest duration). */
function useElapsed(active: boolean): number | null {
  const start = useRef<number | null>(null);
  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (!active) {
      if (start.current !== null) {
        setSecs((performance.now() - start.current) / 1000);
        start.current = null;
      }
      return;
    }
    // Nothing ticks while it works (the live line shows no clock); the duration is taken once, when the turn ends.
    if (start.current === null) start.current = performance.now();
  }, [active]);
  return secs;
}

/**
 * The conversation: the coach's lines, each answer as flat text with its evidence and follow-ups,
 * action cards and receipts, and the failed-answer notice. It scrolls to the newest message when
 * the coach sends, and stays where the coach scrolled to while an answer streams. Streamed text
 * does not animate; a new turn arrives with the base fade.
 */
export function AskThread({ v2 = false, team, stoppedTurn = null, onArtifact, messages, busy, error, offline, phone, players, onApprove, onDeny, onSend, onStop, onRetry, onNewChat, evidenceFocus, onOpenEvidence }: AskThreadProps) {
  const toast = useToast();
  const reduced = useChReducedMotion();
  const turns = useMemo(() => buildTurns(messages, { busy }), [messages, busy]);
  const planVersions = useMemo(() => turns.flatMap((t) => (t.role === 'assistant' ? t.blocks.flatMap((b) => (b.kind === 'plan' ? [b.plan] : [])) : [])), [turns]);
  const names = useMemo(() => players.map((p) => p.name), [players]);
  const playersByName = useMemo(() => Object.fromEntries(players.map((p) => [p.name, p.id])), [players]);
  const pending = pendingApproval(messages);
  const last = turns[turns.length - 1];
  const awaiting = busy && (!last || last.role === 'user');
  const lastAssistantId = [...turns].reverse().find((t) => t.role === 'assistant')?.id;

  // ── Scroll ──
  const rootRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // CP-7: Ask v2 follows the answer while the reader is within 0.9 of a screen of the bottom; past that, S-ASK.jump brings them back.
  // It sits in the chat column, not the thread: the thread is its own overflow box, so anything sticky in it travels with the words.
  const [jump, setJump] = useState<{ host: HTMLElement; bottom: number } | null>(null);
  useEffect(() => {
    // Read the scroller on each scroll, and listen on the document's capture: at mount the scroller's overflow may not have applied yet, and a
    // listener left on the window never hears it, so the thread kept following a reader who had scrolled away.
    const onScroll = () => {
      const sp = scrollParentOf(rootRef.current);
      const { gap, screen } = fromBottom(sp);
      const reach = v2 ? screen * 0.9 : 80;
      stick.current = gap < reach;
      if (!v2) return;
      const host = rootRef.current?.closest<HTMLElement>('.ch-ask-main');
      const bottom = host && sp ? Math.round(host.getBoundingClientRect().bottom - sp.getBoundingClientRect().bottom) + 12 : 0;
      const next = gap >= reach && host ? { host, bottom } : null;
      setJump((j) => (j?.host === next?.host && j?.bottom === next?.bottom ? j : next));
    };
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, [v2]);
  const turnCount = turns.length;
  const lastRole = last?.role;
  // ASK-15: only the thread's own scroller moves. scrollIntoView also scrolls every ancestor, the page included.
  const toEnd = (behavior: ScrollBehavior) => {
    const sp = scrollParentOf(rootRef.current);
    if (sp) sp.scrollTo?.({ top: sp.scrollHeight, behavior });
    else endRef.current?.scrollIntoView?.({ block: 'end', behavior });
  };
  useEffect(() => {
    // The coach sent something: show it, wherever they were.
    if (lastRole === 'user') {
      stick.current = true;
      toEnd(reduced ? 'instant' : 'smooth');
    }
  }, [turnCount, lastRole, reduced]);
  useEffect(() => {
    // Streaming: follow the answer only while the coach is at the bottom.
    if (lastRole === 'user') return;
    // Coalesce chunks received before the next paint; never inherit CSS smooth
    // scrolling, which would restart an animation for every stream update.
    const frame = requestAnimationFrame(() => {
      if (stick.current) toEnd('instant');
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, busy, error, lastRole]);

  // ── Receipts that arrive while this thread is on screen: one haptic, and a toast when a write did not complete. A reloaded thread's receipts are not announced again. ──
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const receipts = turns.flatMap((t) => (t.role === 'assistant' ? t.blocks.flatMap((b) => (b.kind === 'receipt' ? [b] : [])) : []));
    if (seen.current === null) {
      seen.current = new Set(receipts.map((r) => r.key));
      return;
    }
    for (const r of receipts) {
      if (seen.current.has(r.key)) continue;
      seen.current.add(r.key);
      // Held is a write that went through its press and is waiting out Undo, not a failure: no "not completed" toast.
      if (r.receipt.status === 'completed' || r.receipt.status === 'held') {
        haptic('success');
      } else {
        haptic('error');
        toast({ title: `${r.receipt.action}, not completed`, tone: 'error', body: r.receipt.error ?? r.receipt.summary, code: 'CH-13050' });
      }
    }
  }, [turns, toast]);

  // ── A new turn rises in; the ones the thread opened with do not ──
  const initial = useRef<Set<string> | null>(null);
  if (initial.current === null) initial.current = new Set(turns.map((t) => t.id));
  // The answer that takes over from the "Reading your program" placeholder is already on screen: it must not fade in a
  // second time (the avatar and name blinked out and back, 2026-10-29). Its id is kept so it stays still on re-renders.
  const placeholderShown = useRef(false);
  const continued = useRef(new Set<string>());
  if (awaiting) placeholderShown.current = true;
  for (const t of turns) {
    if (t.role !== 'assistant' || initial.current.has(t.id) || continued.current.has(t.id)) continue;
    if (placeholderShown.current) continued.current.add(t.id);
    placeholderShown.current = false;
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', code: 'CH-13950' });
    } catch {
      toast({ title: "Couldn’t copy", body: 'Select the answer and copy it instead.', tone: 'error', code: 'CH-13051' });
    }
  };

  return (
    <PlanVersions.Provider value={planVersions}>
    <div ref={rootRef} className={'ch-th' + (v2 ? ' ch-ak-th' : '') + (phone ? ' ch-th--phone' : '')} data-ch-code="CH-13850" data-v2={v2 ? '' : undefined}>
      <div className="ch-th-col" role="log" aria-label="Conversation">
        {turns.map((turn, turnIndex) => {
          const fresh = !initial.current?.has(turn.id) && !continued.current.has(turn.id);
          if (turn.role === 'user') {
            return (
              <div key={turn.id} className={'ch-th-turn ch-th-user' + (fresh ? ' is-new' : '')}>
                <p>
                  <AskUserText text={turn.text} names={names} />
                </p>
              </div>
            );
          }
          const showFollowUps = turn.id === lastAssistantId && !busy && !pending && !error && turn.followUps.length > 0;
          if (v2) {
            return (
              <AnswerCard
                key={turn.id}
                turn={turn}
                stopped={stoppedTurn === turn.id}
                question={(() => {
                  const before = turns[turnIndex - 1];
                  return before?.role === 'user' ? before.text : undefined;
                })()}
                fresh={fresh}
                showFollowUps={showFollowUps}
                playersByName={playersByName}
                onSend={onSend}
                actions={(b) => {
                  if (b.kind === 'receipt') {
                    // A receipt with its card is drawn on the card; one alone (an older thread) draws by itself.
                    if (turn.blocks.some((x) => x.kind === 'proposal' && x.view.receipt)) return null;
                    return (
                      <section key={b.key} className="conf">
                        <Receipt receipt={b.receipt} idempotencyKey={b.key.replace(/^r-receipt-/, '')} />
                      </section>
                    );
                  }
                  if (b.kind !== 'proposal') return null;
                  const focus = focusForProposal(turn.id, b.view);
                  return (
                    <ConfirmCard
                      key={b.key}
                      view={b.view}
                      inlineReceipt={null}
                      // A live answer takes over from the placeholder, so the turn's own `fresh` is false; what counts is that it was streaming as the card arrived.
                      fresh={turn.active}
                      roster={players}
                      team={team}
                      evidence={focus && evidenceAvailable(messages, focus) ? { open: evidenceFocus?.key === b.view.key, onOpen: () => onOpenEvidence(focus) } : undefined}
                      onApprove={onApprove}
                      onDeny={onDeny}
                      onSend={onSend}
                    />
                  );
                }}
                onArtifact={onArtifact}
                players={players}
              />
            );
          }
          return (
            <article key={turn.id} className={'ch-th-turn ch-th-ans' + (fresh ? ' is-new' : '')} aria-label="CoachHelm answer" aria-busy={turn.active || undefined}>
              <CoachMark working={turn.active} />
              <div className="ch-th-ans__body">
                <span className="ch-th-who">CoachHelm</span>
                <Work turn={turn} onStop={phone ? undefined : onStop} />
                {(turn.note || turn.blocks.length > 0) && (
                  <div className="ch-th-card">
                {turn.note && (
                  <p className="ch-th-note" data-ch-code="CH-13252">
                    {turn.note}
                  </p>
                )}
                {turn.blocks.map((b) => {
                  if (b.kind === 'text') return <AskProse key={b.key} text={b.text} lead={b.lead} playersByName={playersByName} streaming={turn.active} />;
                  if (b.kind === 'evidence') return <AskEvidenceView key={b.key} envelope={b.envelope} roster={players} />;
                  if (b.kind === 'visual') return <CoachVisualArtifact key={b.key} artifact={b.artifact} />;
                  // `live`: the turn was streaming when the visual arrived; CoachComposition reads it once, at mount.
                  if (b.kind === 'composition') return <CoachComposition key={b.key} composition={b.composition} live={turn.active} />;
                  if (b.kind === 'brief' || b.kind === 'handoff' || b.kind === 'plan') return null;
                  if (b.kind === 'receipt') return <AskReceiptCard key={b.key} receipt={b.receipt} onAskAgain={onSend} />;
                  const focus = focusForProposal(turn.id, b.view);
                  return (
                    <AskActionCard
                      key={b.key}
                      view={b.view}
                      messageId={turn.id}
                      phone={phone}
                      hasEvidence={focus ? evidenceAvailable(messages, focus) : false}
                      evidenceOpen={evidenceFocus?.key === b.view.key}
                      onApprove={onApprove}
                      onDeny={onDeny}
                      onOpenEvidence={onOpenEvidence}
                    />
                  );
                })}
                  </div>
                )}
                {turn.answerText && !turn.active && !turn.note && (
                  <div className="ch-th-tools">
                    <Tooltip>
                      <button type="button" className="ch-th-icobtn" aria-label="Copy" onClick={() => void copy(turn.answerText)}>
                        <Icon icon={Copy} size={16} />
                      </button>
                    </Tooltip>
                  </div>
                )}
                {showFollowUps && (
                  <ul className="ch-th-follow" aria-label="Next steps">
                    {turn.followUps.map((f) => (
                      <li key={f}>
                        <button
                          type="button"
                          className="ch-th-pill"
                          data-ch-code="CH-13752"
                          onClick={() => {
                            haptic('select');
                            onSend(f);
                          }}
                        >
                          {f}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
        {awaiting && (
          <div className="ch-th-turn ch-th-ans is-new" aria-busy="true">
            <CoachMark working />
            <div className="ch-th-ans__body">
              <span className="ch-th-who">CoachHelm</span>
              {v2 ? (
                // E-STEPS: the first frame is already the live row, so nothing swaps when the first read names itself.
                <Steps steps={[{ id: 'first', label: 'Reading your program', state: 'active' }]} active seconds={null} />
              ) : (
                <p className="ch-th-think">
                  <span className="ch-th-live">Reading your program</span>
                </p>
              )}
            </div>
          </div>
        )}
        {error && <AskError notice={error} offline={offline} changed={failedAnswerChangedNothing(messages)} onRetry={onRetry} onNewChat={onNewChat} />}
        <div ref={endRef} className="ch-th-end" />
      </div>
      {v2 &&
        jump &&
        createPortal(
          <button
            type="button"
            className="ch-ak-jump"
            aria-label="Jump to the latest"
            data-ch-press=""
            style={{ bottom: jump.bottom }}
            onClick={() => {
              stick.current = true;
              setJump(null);
              toEnd(reduced ? 'instant' : 'smooth');
            }}
          >
            <Icon icon={ArrowDown} size={19} />
          </button>,
          jump.host,
        )}
    </div>
    </PlanVersions.Provider>
  );
}

/** What CoachHelm is doing while it works, and the one line it leaves behind. Only steps the server announced are drawn: no invented future steps, no percentage. */
function Work({ turn, onStop }: { turn: AskAssistantTurn; onStop?: () => void }) {
  const elapsed = useElapsed(turn.active);
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (turn.steps.length === 0) {
    return turn.active && turn.blocks.length === 0 ? (
      <p className="ch-th-think">
        {/* The placeholder's words, so the hand-over from it to the answer changes nothing on screen (2026-10-29). */}
        <span className="ch-th-live">Reading your program</span>
      </p>
    ) : null;
  }
  const list = (live: boolean) => (
    <ol id={live ? undefined : listId} className="ch-th-steps" aria-label="What CoachHelm is doing">
      {turn.steps.map((s, i) => {
        const current = live && i === turn.steps.length - 1;
        return (
          <li key={s.id} className={live ? 'is-in' : undefined} aria-current={current ? 'step' : undefined}>
            {current ? <span className="ch-th-dot" aria-hidden="true" /> : <Icon icon={Check} size={14} className="ch-th-steps__ok" />}
            {current ? <span className="ch-th-live">{s.label}</span> : s.label}
          </li>
        );
      })}
    </ol>
  );
  if (turn.active) {
    // The shimmering step label is the status (rubric P013): no ticking "Working 12s" beside it. The time it took is still
    // said once, on the finished line below, as the Claude and ChatGPT apps do.
    return (
      <div className="ch-th-work ch-th-work--live" data-ch-code="CH-13850">
        {list(true)}
        {onStop && (
          <span className="ch-th-work__time">
            <button type="button" className="ch-th-link" onClick={onStop}>
              Stop
            </button>
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="ch-th-work">
      {/* One quiet collapsed row (playbook §4): how long it worked and how many steps; what it read is inside, when opened. */}
      <button type="button" className="ch-th-work__btn" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
        {workReceipt(turn.steps.length, elapsed)}
        <Icon icon={ChevronDown} size={13} className={open ? 'ch-th-flip' : undefined} />
      </button>
      {open && (
        <>
          {turn.work && <p className="ch-th-work__read">{turn.work}</p>}
          {list(false)}
        </>
      )}
    </div>
  );
}

/**
 * A failed answer, in a sentence the coach can act on. Try again appears only when it can work;
 * a lost conversation offers a new chat; a daily limit offers nothing, because nothing pressed
 * changes it. "Nothing was changed." is only said when it is true of this turn.
 */
function AskError({ notice, offline, changed, onRetry, onNewChat }: { notice: ChatErrorNotice; offline: boolean; changed: { changedNothing: boolean; unconfirmedWrite: boolean }; onRetry: () => void; onNewChat: () => void }) {
  useEffect(() => {
    haptic('error');
  }, [notice.message]);
  const offlineRetry = offline && notice.recovery === 'retry';
  return (
    <div className="ch-th-error" role="alert" data-ch-code="CH-13251">
      <Icon icon={CircleAlert} size={16} className="ch-th-error__icon" />
      <div className="ch-th-error__txt">
        <p className="ch-th-error__title">{notice.message}</p>
        {changed.changedNothing && <p className="ch-th-error__body">Nothing was changed.</p>}
        {changed.unconfirmedWrite && <p className="ch-th-error__body">You confirmed an action in this answer. Check whether it was created before you ask again.</p>}
        {offlineRetry && (
          <p className="ch-th-error__body" data-ch-code="CH-1905">
            {OFFLINE_LINE}
          </p>
        )}
      </div>
      {notice.recovery === 'retry' && (
        <Button size="sm" variant="secondary" leftIcon={RotateCw} disabled={offlineRetry} onClick={onRetry}>
          Try again
        </Button>
      )}
      {notice.recovery === 'new-chat' && (
        <Button size="sm" variant="secondary" onClick={onNewChat}>
          Start a new chat
        </Button>
      )}
    </div>
  );
}
