'use client';

import type { UIMessage } from 'ai';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, CircleAlert, Copy, RotateCw, Sparkles } from 'lucide-react';
import type { ChatErrorNotice } from '../../../data/coachhelm-chat-error';
import {
  buildTurns,
  evidenceAvailable,
  failedAnswerChangedNothing,
  focusForProposal,
  pendingApproval,
  type AskAssistantTurn,
  type EvidenceFocus,
} from '../../../data/coachhelm-chat-thread';
import { haptic } from '../../../lib/haptics';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { useToast } from '../../../ui/Toast';
import { AskActionCard, AskReceiptCard } from './ActionCard';
import { AskEvidenceView } from './Evidence';
import { AskProse, AskUserText } from './Prose';
import '../../../styles/coachhelm-thread.css';

export interface AskThreadProps {
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
  onSend: (text: string) => void;
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

function nearBottom(sp: HTMLElement | null): boolean {
  if (sp) return sp.scrollHeight - sp.scrollTop - sp.clientHeight < 80;
  const doc = document.documentElement;
  return doc.scrollHeight - window.scrollY - window.innerHeight < 80;
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
    if (start.current === null) start.current = performance.now();
    setSecs(0);
    const t = window.setInterval(() => setSecs((performance.now() - (start.current ?? performance.now())) / 1000), 200);
    return () => window.clearInterval(t);
  }, [active]);
  return secs;
}

/**
 * The conversation: the coach's lines, each answer as flat text with its evidence and follow-ups,
 * action cards and receipts, and the failed-answer notice. It scrolls to the newest message when
 * the coach sends, and stays where the coach scrolled to while an answer streams. Streamed text
 * does not animate; a new turn arrives with the base fade.
 */
export function AskThread({ messages, busy, error, offline, phone, players, onApprove, onDeny, onSend, onStop, onRetry, onNewChat, evidenceFocus, onOpenEvidence }: AskThreadProps) {
  const toast = useToast();
  const reduced = useChReducedMotion();
  const turns = useMemo(() => buildTurns(messages, { busy }), [messages, busy]);
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
  useEffect(() => {
    const sp = scrollParentOf(rootRef.current);
    const target: HTMLElement | Window = sp ?? window;
    const onScroll = () => {
      stick.current = nearBottom(sp);
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, []);
  const turnCount = turns.length;
  const lastRole = last?.role;
  useEffect(() => {
    // The coach sent something: show it, wherever they were.
    if (lastRole === 'user') {
      stick.current = true;
      endRef.current?.scrollIntoView?.({ block: 'end', behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [turnCount, lastRole, reduced]);
  useEffect(() => {
    // Streaming: follow the answer only while the coach is at the bottom.
    if (stick.current) endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, busy, error]);

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
      if (r.receipt.status === 'completed') {
        haptic('success');
      } else {
        haptic('error');
        toast({ title: `${r.receipt.action}, not completed`, tone: 'error', body: r.receipt.error ?? r.receipt.summary, code: 'CH-13050' });
      }
    }
  }, [turns, toast]);

  // ── A new turn fades in; the ones the thread opened with do not ──
  const initial = useRef<Set<string> | null>(null);
  if (initial.current === null) initial.current = new Set(turns.map((t) => t.id));

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', code: 'CH-13950' });
    } catch {
      toast({ title: "Couldn't copy", body: 'Select the answer and copy it instead.', tone: 'error', code: 'CH-13051' });
    }
  };

  return (
    <div ref={rootRef} className={'ch-th' + (phone ? ' ch-th--phone' : '')} data-ch-code="CH-13850">
      <div className="ch-th-col" role="log" aria-label="Conversation">
        {turns.map((turn) => {
          const fresh = !initial.current?.has(turn.id);
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
          return (
            <article key={turn.id} className={'ch-th-turn ch-th-ans' + (fresh ? ' is-new' : '')} aria-label="CoachHelm answer" aria-busy={turn.active || undefined}>
              <span className="ch-th-mark" aria-hidden="true">
                <Icon icon={Sparkles} size={16} />
              </span>
              <div className="ch-th-ans__body">
                <Work turn={turn} onStop={phone ? undefined : onStop} />
                {turn.note && (
                  <p className="ch-th-note" data-ch-code="CH-13252">
                    {turn.note}
                  </p>
                )}
                {turn.blocks.map((b) => {
                  if (b.kind === 'text') return <AskProse key={b.key} text={b.text} lead={b.lead} playersByName={playersByName} />;
                  if (b.kind === 'evidence') return <AskEvidenceView key={b.key} envelope={b.envelope} />;
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
                {turn.answerText && !turn.active && !turn.note && (
                  <div className="ch-th-tools">
                    <button type="button" className="ch-th-icobtn" aria-label="Copy" title="Copy" onClick={() => void copy(turn.answerText)}>
                      <Icon icon={Copy} size={16} />
                    </button>
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
            <span className="ch-th-mark" aria-hidden="true">
              <Icon icon={Sparkles} size={16} />
            </span>
            <p className="ch-th-think" aria-live="polite">
              Reading your program
            </p>
          </div>
        )}
        {error && <AskError notice={error} offline={offline} changed={failedAnswerChangedNothing(messages)} onRetry={onRetry} onNewChat={onNewChat} />}
        <div ref={endRef} className="ch-th-end" />
      </div>
    </div>
  );
}

/** What CoachHelm is doing while it works, and the one line it leaves behind. Only steps the server announced are drawn: no invented future steps, no percentage. */
function Work({ turn, onStop }: { turn: AskAssistantTurn; onStop?: () => void }) {
  const elapsed = useElapsed(turn.active);
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (turn.steps.length === 0) return null;
  const secs = elapsed === null ? '' : ` · ${elapsed.toFixed(1)}s`;
  const list = (live: boolean) => (
    <ol id={live ? undefined : listId} className="ch-th-steps" aria-label="What CoachHelm is doing" aria-live={live ? 'polite' : undefined} aria-relevant={live ? 'additions text' : undefined}>
      {turn.steps.map((s, i) => {
        const current = live && i === turn.steps.length - 1;
        return (
          <li key={s.id} aria-current={current ? 'step' : undefined}>
            {current ? (
              <span className="ch-th-spin" aria-hidden="true" />
            ) : (
              <Icon icon={Check} size={14} className="ch-th-steps__ok" />
            )}
            {s.label}
          </li>
        );
      })}
    </ol>
  );
  if (turn.active) {
    return (
      <div className="ch-th-work ch-th-work--live" data-ch-code="CH-13850">
        {list(true)}
        <span className="ch-th-work__time">
          Working{secs}
          {onStop && (
            <button type="button" className="ch-th-link" onClick={onStop}>
              Stop
            </button>
          )}
        </span>
      </div>
    );
  }
  return (
    <div className="ch-th-work">
      <button type="button" className="ch-th-work__btn" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
        <Icon icon={Check} size={15} className="ch-th-steps__ok" />
        {`${turn.work ?? ''}${secs}`}
        <Icon icon={ChevronDown} size={13} className={open ? 'ch-th-flip' : undefined} />
      </button>
      {open && list(false)}
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
            You&apos;re offline. Reconnect, then try again.
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
