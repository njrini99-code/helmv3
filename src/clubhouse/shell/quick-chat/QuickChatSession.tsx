'use client';
import { pluralWord } from '../../lib/plural';
import { AskProse } from '../../screens/coachhelm/chat/Prose';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import { describeChatError } from '../../data/coachhelm-chat-error';
import { buildTurns, pendingApproval, stepsReceipt, type AskAssistantTurn } from '../../data/coachhelm-chat-thread';
import { useChPhone } from '../../lib/use-phone';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { conversationHref } from '../../screens/coachhelm/chat/History';
import { subscribeOnline } from '../AskSheetBody';
import { modKey } from '../command/shortcuts';
import type { ChAskSheetChat } from '../AskSheet';
import { HelmMark, useQcCtx } from './qc-context';
import { QuickAsk } from './QuickAsk';
import { useQcSeam } from './qc-seam';
import { quickStarts, START_ICON } from './starts';
import { PlanTask } from './visuals/PlanTask';
import { useEarlierToday } from './earlier-today';
import { TaskCard } from './TaskCard';
import { useQcMotion } from './useQcMotion';
import { useDictation } from './useDictation';
import { ASK_STARTERS } from '../../data/coachhelm-chat-shape';
import { Menu } from '../../ui/Menu';

const TURNS_SHOWN = 30;
/** AC-QC-STP-04: past six rows, the oldest done ones fold. */
const STEPS_SHOWN = 6;
/** A release this far up on the header or grab bar closes the phone panel (M-CLOSE's build rule); the panel doesn't follow the finger. */
const SWIPE_SLOP = 10;
const Ico = ({ d, size }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
    <path d={d} />
  </svg>
);

/** The session and panel. Mounted once on `warm`; a path change doesn't touch the run. */
export default function QuickChatSession({ open, onClose, looking, pathname, planOn = false, chat: useChatImpl = useCoachHelmChat, initialText = '' }: { planOn?: boolean; open: boolean; onClose: () => void; looking: { label: string; playerId: string | null; playerName: string | null }; pathname: string; chat?: ChAskSheetChat; initialText?: string }) {
  const router = useRouter();
  const phone = useChPhone();
  const reduced = useChReducedMotion();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const { keyRef, setRun, setFlag, setSession } = useQcCtx();
  const chat = useChatImpl({ initialContext: looking.playerId ? [{ kind: 'player', id: looking.playerId, label: looking.playerName ?? 'This player' }] : undefined });
  const turns = useMemo(() => buildTurns(chat.messages, { busy: chat.busy }), [chat.messages, chat.busy]);
  const pending = pendingApproval(chat.messages);
  // A fresh object each render: effects key on its id, or setting the key's state re-renders into a loop.
  const pendingId = pending?.approvalId ?? null;
  const notice = chat.error ? describeChatError(chat.error) : null;
  const [text, setText] = useState(initialText);
  const mic = useDictation((words) => setText((t) => (t.trim() ? `${t.trimEnd()} ${words}` : words)));
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
    el.style.setProperty('--ch-qc-qc-top', `${bar + 6}px`);
    el.parentElement?.style.setProperty('--ch-qc-qc-scrim-top', `${bar}px`);
    if (phone) {
      const kb = window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : window.innerHeight;
      // A keyboard pan moves the visual viewport: the panel follows, so its header stays on screen (QC-9).
      el.style.setProperty('--ch-qc-qc-top', `${(window.visualViewport?.offsetTop ?? 0) + bar + 6}px`);
      el.style.setProperty('--ch-qc-qc-h', `${Math.min(700, kb - bar - 6 - 8)}px`);
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
    vv.addEventListener('scroll', place);
    return () => {
      vv.removeEventListener('resize', place);
      vv.removeEventListener('scroll', place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT') return;
      // First Escape leaves a field that has words in it; the next closes (QC-20).
      if (t?.tagName === 'TEXTAREA' && (t as HTMLTextAreaElement).value) {
        t.blur();
        return;
      }
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
    if (pendingId) {
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
  }, [pendingId, chat.busy, stepLabel, receiptStatus, open, setRun, setFlag]);

  // Anything added scrolls the body; the panel's own height never moves (M-GROW).
  useEffect(() => {
    const el = body.current;
    if (el && chat.messages.length) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [chat.messages, reduced]);

  // AC-QC-CMP-03, 05: a message written during a run or offline waits, and goes when it can. A pending confirm holds it too.
  const [queued, setQueued] = useState<string[]>([]);
  const send = (t: string) => {
    const clean = t.trim();
    if (!clean) return;
    setText('');
    if (chat.busy || pending || !online) {
      setQueued((q) => [...q, clean]);
      return;
    }
    setStopped(false);
    chat.send(clean);
  };
  useEffect(() => {
    if (!queued.length || chat.busy || pending || !online) return;
    setStopped(false);
    chat.send(queued[0]!);
    setQueued((q) => q.slice(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sends when the way clears, keyed on the id (`pending` is new each render)
  }, [queued, chat.busy, pendingId, online]);
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
  const canSend = !!text.trim();
  const seam = useQcSeam();
  const liveEarlier = useEarlierToday(open, fresh && !seam);
  const earlier = seam ? (seam.earlier ?? null) : liveEarlier;
  // Tab stays inside the dialog (AC-QC-PNL-08).
  const onPanelKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const stops = [...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, a[href], input:not(:disabled), [tabindex="0"]')].filter((el) => el.offsetParent !== null);
    if (!stops.length) return;
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  const swipeFrom = useRef<number | null>(null);
  const swipe = phone
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          swipeFrom.current = e.clientY;
        },
        onPointerUp: (e: React.PointerEvent) => {
          if (swipeFrom.current != null && swipeFrom.current - e.clientY > SWIPE_SLOP) onClose();
          swipeFrom.current = null;
        },
      }
    : {};
  const hidden = turns.length > TURNS_SHOWN ? turns.length - TURNS_SHOWN : 0;
  return (
    <div className={'ch-qcs' + (phone ? ' is-phone' : ' is-desk') + (reduced ? ' is-reduce' : '')}>
      <div ref={scrim} className="scrim" hidden={!shown} onClick={onClose} aria-hidden="true" />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the dialog keeps Tab inside itself (AC-QC-PNL-08) */}
      <section id="ch-qc-panel" ref={panel} className="qc" role="dialog" aria-label="CoachHelm" hidden={!shown} data-ch-qc-panel="" onKeyDown={onPanelKey}>
        <header className="qc__h" data-qc-rise="" {...swipe}>
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
                    {quickStarts(pathname, planOn || !!seam?.planOn).map((t) => (
                      <button key={t.id} className={'tile t-' + t.id} type="button" onClick={() => send(t.ask)}>
                        <i>
                          <Ico d={START_ICON[t.id]} />
                        </i>
                        <svg className="go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M7 17L17 7M9 7h8v8" />
                        </svg>
                        <b>{t.title}</b>
                        <span>{t.line}</span>
                      </button>
                    ))}
                  </div>
                  {earlier && (
                    <div className="earlier">
                      <small>Earlier today</small>
                      <div className="earlier__r">
                        <span className="rcpt__g">
                          <Ico d="M5 13l4 4L19 7" />
                        </span>
                        <span className="earlier__t">
                          <b>{earlier.title}</b>
                          <span>{earlier.line}</span>
                        </span>
                        <time className="ch-num">{earlier.at}</time>
                      </div>
                    </div>
                  )}
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
                        failed={!!notice && turn.id === turns[turns.length - 1]?.id}
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
                  {notice && (
                    <p className="say quiet qc-lost" role="alert">
                      <span>{notice.message ?? 'Lost the connection. Nothing was saved.'}</span>
                      {notice.recovery === 'retry' && (
                        <button type="button" onClick={() => chat.retry()}>
                          Try again
                        </button>
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="qc__comp" data-qc-rise="">
            {!online && <p className="say quiet">You’re offline. CoachHelm will send when you’re back.</p>}
            <div className="cmp">
              <Menu
                label="Add to your question"
                align="start"
                items={ASK_STARTERS.filter((s) => s.id !== 'add-player').map((s) => ({
                  label: s.label,
                  onSelect: () => {
                    setText((t) => (t.trim() ? `${t.trimEnd()} ${s.seed}` : s.seed));
                    field.current?.focus();
                  },
                }))}
                trigger={(t) => (
                  <button {...t} type="button" className="cmp__plus" aria-label="Add to your question">
                    <Ico d="M12 5v14M5 12h14" size={18} />
                  </button>
                )}
              />
              <textarea
                ref={field}
                className="cmp__t"
                aria-label="Ask CoachHelm"
                placeholder="Ask CoachHelm or tell it what to do"
                rows={1}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  // Grows with the words, up to four lines (QC-8).
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 4 * parseFloat(getComputedStyle(el).lineHeight || '22'))}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !phone) {
                    e.preventDefault();
                    send(text);
                  }
                }}
              />
              {mic.available && (
                <button type="button" className={'cmp__mic' + (mic.on ? ' is-on' : '')} aria-label={mic.on ? 'Stop dictating' : 'Dictate'} aria-pressed={mic.on} onClick={mic.toggle}>
                  <Ico d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" size={18} />
                </button>
              )}
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
                  <kbd>{modKey(true)}J</kbd> open
                </span>
                <span>
                  <kbd>esc</kbd> close
                </span>
                <span>Saved in CoachHelm</span>
              </div>
            )}
          </div>
          {phone && <i className="ch-grab" aria-hidden="true" {...swipe} />}
        </div>
      </section>
    </div>
  );
}

/** The steps, and their fold once the card is ready: "N steps · Ns", which a tap reopens in place (AC-QC-STP-03, 04). */
function Steps({ turn, stopped, failed = false }: { turn: AskAssistantTurn; stopped: boolean; failed?: boolean }) {
  const [opened, setOpened] = useState(false);
  const [more, setMore] = useState(false);
  // Only the browser that watched the run knows how long it took; a reloaded chat folds to the count alone.
  const started = useRef<number | null>(turn.active ? performance.now() : null);
  const seconds = useRef<number | null>(null);
  if (turn.active && started.current === null) started.current = performance.now();
  if (!turn.active && started.current !== null && seconds.current === null) seconds.current = (performance.now() - started.current) / 1000;
  const list = turn.active || !turn.blocks.length || opened;
  if (!turn.steps.length) return null;
  const summary = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
  if (!list)
    return (
      <button type="button" className="steps-sum" aria-expanded="false" onClick={() => setOpened(true)}>
        {summary}
        {stepsReceipt(turn.steps, seconds.current)}
      </button>
    );
  const folded = more ? 0 : Math.max(0, turn.steps.length - STEPS_SHOWN);
  return (
    <ol className="steps" aria-live="polite">
      {folded > 0 && (
        <li className="step done">
          <button type="button" className="steps-sum" onClick={() => setMore(true)}>
            {folded} more {pluralWord(folded, 'step', 'steps')}
          </button>
        </li>
      )}
      {turn.steps.slice(folded).map((s) => {
        const last = s === turn.steps[turn.steps.length - 1];
        const active = turn.active && last;
        return (
          <li key={s.id} className={'step ' + (active ? 'active' : failed && last ? 'fail' : stopped && last ? 'stopped' : 'done')}>
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
  );
}

function AssistantTurn({ turn, online, stopped, failed = false, onSend, onApprove, onDeny, onOpen }: { turn: AskAssistantTurn; online: boolean; stopped: boolean; failed?: boolean; onSend: (t: string) => void; onApprove: (id: string) => void; onDeny: (id: string) => void; onOpen: (href: string) => void }) {
  return (
    <>
      <Steps turn={turn} stopped={stopped} failed={failed} />
      {stopped && !turn.active && !turn.blocks.length && <p className="say quiet">Stopped. Nothing was saved.</p>}
      {turn.note && <p className="say quiet">{turn.note}</p>}
      {turn.blocks.map((b) => {
        if (b.kind === 'text') return <div className="say" key={b.key}><AskProse text={b.text} playersByName={{}} /></div>;
        if (b.kind === 'proposal') return <TaskCard key={b.key} view={b.view} online={online} onSend={onSend} onApprove={onApprove} onDeny={onDeny} onOpen={onOpen} />;
        if (b.kind === 'plan') return <PlanTask key={b.key} plan={b.plan} online={online} onOpen={onOpen} />;
        if (b.kind === 'brief') return <QuickAsk key={b.key} brief={b.brief} onSend={onSend} />;
        return null;
      })}
    </>
  );
}
