'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { describeChatError } from '../../data/coachhelm-chat-error';
import { buildTurns, pendingApproval, type AskAssistantTurn } from '../../data/coachhelm-chat-thread';
import { useChPhone } from '../../lib/use-phone';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { conversationHref } from '../../screens/coachhelm/chat/History';
import { BriefCard } from '../../screens/coachhelm/chat/parts/BriefCard';
import { PlanCard } from '../../screens/coachhelm/plan/PlanCard';
import '../../styles/coachhelm-plan.css';
import { subscribeOnline } from '../AskSheetBody';
import type { ChAskSheetChat } from '../AskSheet';
import { HelmMark, useQcCtx } from './QuickChatProvider';
import { quickStarts } from './starts';
import { TaskCard } from './TaskCard';
import { useQcMotion } from './useQcMotion';

const TURNS_SHOWN = 30;
const Ico = ({ d, size }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
    <path d={d} />
  </svg>
);

/** The session and panel. Mounted once on `warm`; a path change doesn't touch the run. */
export default function QuickChatSession({ open, onClose, looking, pathname, chat: useChatImpl = useCoachHelmChat, initialText = '' }: { open: boolean; onClose: () => void; looking: { label: string; playerId: string | null; playerName: string | null }; pathname: string; chat?: ChAskSheetChat; initialText?: string }) {
  const router = useRouter();
  const phone = useChPhone();
  const reduced = useChReducedMotion();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const { keyRef, setRun, setFlag, setSession } = useQcCtx();
  const chat = useChatImpl({ initialContext: looking.playerId ? [{ kind: 'player', id: looking.playerId, label: looking.playerName ?? 'This player' }] : undefined });
  const turns = useMemo(() => buildTurns(chat.messages, { busy: chat.busy }), [chat.messages, chat.busy]);
  const pending = pendingApproval(chat.messages);
  const notice = chat.error ? describeChatError(chat.error) : null;
  const [text, setText] = useState(initialText);
  const [stopped, setStopped] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [shown, setShown] = useState(open);
  const motion = useQcMotion(reduced);

  useEffect(() => {
    setSession(chat);
    return () => setSession(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the hook's result changes when the run does
  }, [chat.messages, chat.busy, chat.conversationId]);

  // The panel's box comes from the key's: 6pt under the bar on both, and above the keyboard on the phone.
  const place = useCallback(() => {
    const el = panel.current;
    const key = keyRef.current?.getBoundingClientRect();
    if (!el || !key) return { x: window.innerWidth - 60, y: 60 };
    const bar = key.bottom;
    el.style.setProperty('--qc-top', `${bar + 6}px`);
    el.parentElement?.style.setProperty('--qc-scrim-top', `${bar}px`);
    if (phone) {
      const kb = window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : window.innerHeight;
      el.style.setProperty('--qc-h', `${Math.min(700, kb - bar - 6 - 8)}px`);
    }
    return { x: key.left + key.width / 2, y: key.top + key.height / 2 };
  }, [keyRef, phone]);

  useLayoutEffect(() => {
    if (open) setShown(true);
  }, [open]);
  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (open) {
      const origin = place();
      motion.open(el, scrim.current, origin);
      if (!phone) field.current?.focus({ preventScroll: true });
    } else if (shown) {
      motion.close(el, scrim.current, () => setShown(false));
      keyRef.current?.querySelector('button')?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the toggle
  }, [open, phone]);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !open) return;
    vv.addEventListener('resize', place);
    return () => vv.removeEventListener('resize', place);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT') return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // The pill and the flag follow the run. A task that waits on the coach says so for 1800ms, then the key carries a flag.
  const lastTurn = turns[turns.length - 1];
  const assistant = lastTurn?.role === 'assistant' ? lastTurn : null;
  const stepLabel = assistant?.steps[assistant.steps.length - 1]?.label ?? 'Working';
  const receiptStatus = assistant?.blocks.flatMap((b) => (b.kind === 'proposal' ? [b.view.receipt?.status] : b.kind === 'receipt' ? [b.receipt.status] : [])).find(Boolean);
  useEffect(() => {
    if (pending) {
      setRun({ state: 'wait', label: 'Needs your OK' });
      if (open) return;
      const t = setTimeout(() => {
        setRun({ state: 'idle', label: '' });
        setFlag(true);
      }, 1800);
      return () => clearTimeout(t);
    }
    if (chat.busy) return setRun({ state: 'work', label: stepLabel });
    if (receiptStatus === 'failed') return setRun({ state: 'failed', label: 'Didn’t go through' });
    if (receiptStatus === 'held' || receiptStatus === 'completed') {
      setRun({ state: 'done', label: 'Done' });
      const t = setTimeout(() => setRun({ state: 'idle', label: '' }), 1800);
      return () => clearTimeout(t);
    }
    setRun({ state: 'idle', label: '' });
    return undefined;
  }, [pending, chat.busy, stepLabel, receiptStatus, open, setRun, setFlag]);

  // Anything added scrolls the body; the panel's own height never moves (M-GROW).
  useEffect(() => {
    const el = body.current;
    if (el && chat.messages.length) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [chat.messages, reduced]);

  const send = (t: string) => {
    if (!t.trim() || chat.busy || pending || !online) return;
    setStopped(false);
    chat.send(t.trim());
    setText('');
  };
  const stop = () => {
    chat.stop();
    setStopped(true);
  };
  const full = () => {
    if (!chat.conversationId) return;
    onClose();
    router.push(conversationHref(chat.conversationId));
  };

  const fresh = turns.length === 0;
  const canSend = !!text.trim() && online && !pending;
  const hidden = turns.length > TURNS_SHOWN ? turns.length - TURNS_SHOWN : 0;
  return (
    <div className={'ch-qcs' + (phone ? ' is-phone' : ' is-desk') + (reduced ? ' is-reduce' : '')}>
      <div ref={scrim} className="scrim" hidden={!shown} onClick={onClose} aria-hidden="true" />
      <section ref={panel} className="qc" role="dialog" aria-label="CoachHelm" hidden={!shown} data-ch-qc-panel="">
        <header className="qc__h" data-qc-rise="">
          <span className="qc__mark">
            <HelmMark />
          </span>
          <span className="qc__ttl">
            <b>CoachHelm</b>
            <span className="qc__ctx">
              <i />
              Looking at {looking.label}
            </span>
          </span>
          <button className="qbtn qc__full" type="button" aria-label="Open full chat" disabled={!chat.conversationId} onClick={full}>
            <Ico d="M9 15L4 20M4 15v5h5M15 9l5-5M20 9V4h-5" size={16} />
          </button>
          <button className="qbtn qc__x" type="button" aria-label="Close" onClick={onClose}>
            <Ico d="M6 6l12 12M18 6L6 18" size={16} />
          </button>
        </header>
        <div className="qc__sheet">
          <div className="qc__body" ref={body} data-qc-rise="">
            <div className="qc__inner" aria-live="polite">
              {fresh ? (
                <div className="hello">
                  <h3 className="hello__t">What should we get done?</h3>
                  <p className="hello__s">You confirm everything before it happens.</p>
                  <div className="tiles">
                    {quickStarts(pathname, false).map((t) => (
                      <button key={t.id} className={'tile t-' + t.id} type="button" onClick={() => send(t.ask)}>
                        <i>
                          <Ico d="M5 12h14M13 6l6 6-6 6" />
                        </i>
                        <b>{t.title}</b>
                        <span>{t.line}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {hidden > 0 && (
                    <button type="button" className="steps-sum" onClick={full}>
                      Earlier in this chat · Open full chat
                    </button>
                  )}
                  {turns.slice(hidden).map((turn) =>
                    turn.role === 'user' ? (
                      <div className="ub" key={turn.id}>
                        {turn.text}
                      </div>
                    ) : (
                      <AssistantTurn
                        key={turn.id}
                        turn={turn}
                        online={online}
                        stopped={stopped}
                        onSend={send}
                        onApprove={chat.approve}
                        onDeny={chat.deny}
                        onOpen={(href) => {
                          onClose();
                          router.push(href);
                        }}
                      />
                    ),
                  )}
                  {notice && <p className="say quiet">{notice.message ?? 'CoachHelm couldn’t finish that.'}</p>}
                </>
              )}
            </div>
          </div>
          <div className="qc__comp" data-qc-rise="">
            {!online && <p className="say quiet">You’re offline. CoachHelm will send when you’re back.</p>}
            <div className="cmp">
              <textarea
                ref={field}
                className="cmp__t"
                aria-label="Ask CoachHelm"
                placeholder="Ask CoachHelm or tell it what to do"
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !phone) {
                    e.preventDefault();
                    send(text);
                  }
                }}
              />
              {chat.busy ? (
                <button className="cmp__send stop" type="button" aria-label="Stop" onClick={stop}>
                  <span className="sq" />
                </button>
              ) : (
                <button className={'cmp__send' + (canSend ? '' : ' off')} type="button" aria-label="Send" disabled={!canSend} onClick={() => send(text)}>
                  <Ico d="M12 19V5M6 11l6-6 6 6" size={17} />
                </button>
              )}
            </div>
            {!phone && (
              <div className="cmp__hint">
                <span>
                  <kbd>⌘J</kbd> open
                </span>
                <span>
                  <kbd>esc</kbd> close
                </span>
                <span>Saved in CoachHelm</span>
              </div>
            )}
          </div>
          {phone && <span className="qc__grab" aria-hidden="true" />}
        </div>
      </section>
    </div>
  );
}

function AssistantTurn({ turn, online, stopped, onSend, onApprove, onDeny, onOpen }: { turn: AskAssistantTurn; online: boolean; stopped: boolean; onSend: (t: string) => void; onApprove: (id: string) => void; onDeny: (id: string) => void; onOpen: (href: string) => void }) {
  return (
    <>
      {turn.active || !turn.blocks.length ? (
        <ol className="steps" aria-live="polite">
          {turn.steps.map((s, i) => {
            const active = turn.active && i === turn.steps.length - 1;
            return (
              <li key={s.id} className={'step ' + (active ? 'active' : stopped && i === turn.steps.length - 1 ? 'stopped' : 'done')}>
                <span className="step__g">
                  {active ? (
                    <span className="dot" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="step__l">{s.label}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        turn.steps.length > 0 && (
          <span className="steps-sum">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
              <path d="M5 13l4 4L19 7" />
            </svg>
            {turn.steps.length} {turn.steps.length === 1 ? 'step' : 'steps'}
          </span>
        )
      )}
      {stopped && !turn.active && !turn.blocks.length && <p className="say quiet">Stopped. Nothing was saved.</p>}
      {turn.note && <p className="say quiet">{turn.note}</p>}
      {turn.blocks.map((b) => {
        if (b.kind === 'text') return <p className="say" key={b.key}>{b.text}</p>;
        if (b.kind === 'proposal') return <TaskCard key={b.key} view={b.view} online={online} onSend={onSend} onApprove={onApprove} onDeny={onDeny} onOpen={onOpen} />;
        if (b.kind === 'plan') return <PlanCard key={b.key} plan={b.plan} onSend={onSend} />;
        if (b.kind === 'brief') return <BriefCard key={b.key} title={b.brief.title} questions={b.brief.questions} onDone={(_a, line) => onSend(line || 'Skip, just build')} />;
        return null;
      })}
    </>
  );
}
