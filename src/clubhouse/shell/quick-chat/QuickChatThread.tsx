'use client';

import { ArrowUpRight, MapPin, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import type { ChatUIMessage } from '@/lib/coachhelm/v3/chat/engine/protocol';
import { describeChatError } from '../../data/coachhelm-chat-error';
import { ASK_STARTERS } from '../../data/coachhelm-chat-shape';
import { buildTurns, pendingApproval, stepsReceipt, type AskAssistantTurn } from '../../data/coachhelm-chat-thread';
import { isoDay } from '../../lib/dates';
import { haptic } from '../../lib/haptics';
import { CH_EASE, CH_FADE_MS } from '../../lib/motion';
import { pluralWord } from '../../lib/plural';
import type { ChMotionMode } from '../../lib/reduced-motion';
import { AskProse } from '../../screens/coachhelm/chat/Prose';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import type { ChAskSheetChat } from '../AskSheet';
import { subscribeOnline } from '../AskSheetBody';
import { LANDING_HOMES } from './landing';
import { useQcCtx } from './qc-context';
import { useQcSeam } from './qc-seam';
import { PILL_REST_MS, RESTORE_GRACE_MS, SECOND_MS } from './qc-timing';
import { QuickAsk } from './QuickAsk';
import { qcContext, qcScreen, quickStarts, type QuickStart } from './starts';
import { TaskCard } from './TaskCard';
import { useDictation } from './useDictation';
import { useLandingDriver, type TaskPhase, type TaskPhaseMeta } from './use-landing-driver';
import { PlanTask } from './visuals/PlanTask';

const TURNS_SHOWN = 30;
/** AC-QC-STP-04: past six rows, the oldest done ones fold. */
const STEPS_SHOWN = 6;
const ease = `cubic-bezier(${CH_EASE.join(',')})`;
const Ico = ({ d, size }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={size} height={size} aria-hidden="true">
    <path d={d} />
  </svg>
);

export interface QuickChatThreadProps {
  chat: ChAskSheetChat;
  conversationId: string | null;
  initialMessages?: ChatUIMessage[];
  /** Today's thread came back from the server: it is drawn at rest under the "Earlier today" rule. */
  restored: boolean;
  /** Today's thread is still being read: the starts are held back so they cannot flash before it. */
  restoring: boolean;
  open: boolean;
  onClose: () => void;
  leaveTo: (href: string) => void;
  looking: { label: string; playerId: string | null; playerName: string | null };
  pathname: string;
  planOn: boolean;
  phone: boolean;
  mode: ChMotionMode;
  text: string;
  setText: (next: string | ((was: string) => string)) => void;
  field: RefObject<HTMLTextAreaElement | null>;
}

/**
 * The conversation inside the quick chat's frame: the chat hook, the empty start for this screen, the thread, the
 * context chip and the composer (QUICK-CHAT.md, Moments 1, 2, 8 and 9). The turn's own pieces (steps, the task card)
 * are the inherited ones in this folder, standing in until the Ask lane's shared thread pieces are exported at compact
 * size; they are composed here, never restyled.
 */
export function QuickChatThread({ chat: useChatImpl, conversationId, initialMessages, restored, restoring, open, onClose, leaveTo, looking, pathname, planOn, phone, mode, text, setText, field }: QuickChatThreadProps) {
  const reduced = mode !== 'full';
  const seam = useQcSeam();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const { setRun, setFlag, setSession } = useQcCtx();

  // The context chip: what the chat was opened on, and so what goes with the question.
  const context = useMemo(() => qcContext(pathname, looking), [pathname, looking.label, looking.playerId, looking.playerName]); // eslint-disable-line react-hooks/exhaustive-deps -- `looking` is a new object each render
  const [dropped, setDropped] = useState<ReadonlySet<string>>(() => new Set());
  const chip = context && !dropped.has(context.key) ? context : null;
  /** The chip's row keeps its height after a removal until the next send, so nothing under the finger moves (MO-1-7). */
  const [chipHeld, setChipHeld] = useState(false);
  const chipEl = useRef<HTMLSpanElement>(null);

  const chat = useChatImpl({ surface: 'quick_chat', conversationId, initialMessages, initialContext: chip?.playerId ? [{ kind: 'player', id: chip.playerId, label: chip.playerName ?? 'This player' }] : undefined });
  const turns = useMemo(() => buildTurns(chat.messages, { busy: chat.busy }), [chat.messages, chat.busy]);
  const pending = pendingApproval(chat.messages);
  // A fresh object each render: effects key on its id, or setting the key's state re-renders into a loop.
  const pendingId = pending?.approvalId ?? null;
  const notice = chat.error ? describeChatError(chat.error) : null;
  const mic = useDictation((words) => setText((t) => (t.trim() ? `${t.trimEnd()} ${words}` : words)));
  // The turn that was stopped, not the session: an earlier finished turn stays finished.
  const [stoppedId, setStoppedId] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  // MOB-QC-13: one announcement when an answer finishes, not one per streamed word.
  const finished = useMemo(() => (chat.busy ? '' : ([...turns].reverse().find((t) => t.role === 'assistant') as { answerText?: string } | undefined)?.answerText ?? ''), [chat.busy, turns]);
  /** A row landing in the page behind, said once: "Added to Tasks: Putting ladder for Eli." */
  const [landedLine, setLandedLine] = useState('');

  useEffect(() => {
    setSession(chat);
    return () => setSession(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the hook's result changes when the run does
  }, [chat.messages, chat.busy, chat.conversationId]);

  // Nothing is sent that the chip does not show: the hook's player context follows the chip.
  const chipPlayer = chip?.playerId ?? null;
  useEffect(() => {
    for (const c of chat.context) if (c.kind === 'player' && c.id !== chipPlayer) chat.removeContext(c.id);
    if (chipPlayer && !chat.context.some((c) => c.id === chipPlayer)) chat.addContext({ kind: 'player', id: chipPlayer, label: chip?.playerName ?? 'This player' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the chip, not on the hook's array
  }, [chipPlayer]);

  // `ST-9.qc.newday`: the first open of a new day starts fresh; yesterday's thread is in Ask. Never while a turn runs.
  const day = useRef(isoDay(new Date()));
  useEffect(() => {
    if (!open || chat.busy) return;
    const today = isoDay(new Date());
    if (today !== day.current && chat.messages.length) chat.newConversation();
    day.current = today;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checked on open
  }, [open]);

  // `ST-9.qc.today`: reopened on a thread, the rule sits over its last page; the turns below it were asked in this sitting.
  const lastQuestion = [...turns].reverse().find((t) => t.role === 'user')?.id ?? null;
  const [ruleAt, setRuleAt] = useState<string | null>(() => (restored || seam?.today ? lastQuestion : null));
  const wasOpen = useRef(open);
  /** A turn finished, or a card started waiting, while the panel was away: reopened, the thread shows the top of that page. */
  const unread = useRef(false);
  useLayoutEffect(() => {
    if (open && !wasOpen.current) {
      if (turns.length) setRuleAt(lastQuestion);
      const el = body.current;
      if (el) {
        const page = unread.current && lastQuestion ? el.querySelector<HTMLElement>(`[data-turn="${CSS.escape(lastQuestion)}"]`) : null;
        el.scrollTop = page ? Math.max(0, page.offsetTop - 12) : el.scrollHeight;
      }
      unread.current = false;
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the toggle
  }, [open]);
  useLayoutEffect(() => {
    // A thread that is there when the panel first draws (restored, or reopened by a reload) opens on its newest words.
    const el = body.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    // Once more when the cards inside have taken their height.
    const raf = requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
    return () => cancelAnimationFrame(raf);
  }, []);

  // The pill and the flag follow the run. A task that waits on the coach says so for 1800ms, then the key carries a flag.
  const lastTurn = turns[turns.length - 1];
  const assistant = lastTurn?.role === 'assistant' ? lastTurn : null;
  const stepLabel = assistant?.steps[assistant.steps.length - 1]?.label ?? 'Working';
  const lastReceipt = assistant?.blocks.flatMap((b) => (b.kind === 'proposal' ? [b.view.receipt] : b.kind === 'receipt' ? [b.receipt] : [])).find(Boolean) ?? null;
  const receiptStatus = lastReceipt?.status;
  const heldUntil = receiptStatus === 'held' ? (lastReceipt?.held_until ?? null) : null;
  /** What the card in this sitting last said. The stored receipt stays `held` until the thread is read again, so the card is the truth. */
  const [card, setCard] = useState<{ phase: TaskPhase; until: string | null } | null>(null);
  const [clock, tick] = useState(0);
  useEffect(() => {
    const until = card ? (card.phase === 'held' ? card.until : null) : heldUntil;
    const left = until ? Math.ceil((Date.parse(until) - Date.now()) / SECOND_MS) : 0;
    if (pendingId) {
      setRun({ state: 'wait', label: 'Needs your OK' });
      if (open) return;
      unread.current = true;
      const t = setTimeout(() => {
        setRun({ state: 'idle', label: '' });
        setFlag(true);
      }, PILL_REST_MS);
      return () => clearTimeout(t);
    }
    if (chat.busy) return setRun({ state: 'work', label: stepLabel });
    if (card?.phase === 'failed' || (!card && receiptStatus === 'failed')) return setRun({ state: 'failed', label: 'Didn’t go through' });
    if (left > 0) {
      // The hold's clock on the pill, from the server's instant: "Saves in 5".
      setRun({ state: 'wait', label: `Saves in ${left}` });
      const t = setTimeout(() => tick((n) => n + 1), SECOND_MS);
      return () => clearTimeout(t);
    }
    if (card?.phase === 'held') return setRun({ state: 'work', label: 'Saving…' });
    // Only a save made in this sitting is said on the key; reopening and closing a finished thread says nothing.
    if (card?.phase === 'saved') {
      setRun({ state: 'done', label: 'Added' });
      const t = setTimeout(() => {
        setRun({ state: 'idle', label: '' });
        setCard(null);
      }, PILL_REST_MS);
      return () => clearTimeout(t);
    }
    setRun({ state: 'idle', label: '' });
    return undefined;
  }, [pendingId, chat.busy, stepLabel, receiptStatus, heldUntil, card, open, setRun, setFlag, clock]);
  // An answer that finished with the panel away has not been read: reopened, the thread shows the top of its page.
  const wasBusy = useRef(chat.busy);
  useEffect(() => {
    if (wasBusy.current && !chat.busy && !open) unread.current = true;
    wasBusy.current = chat.busy;
  }, [chat.busy, open]);

  // Anything added scrolls the body; the panel's own height never moves (M-GROW). Only a reader at the bottom is followed (MOB-QC-4).
  useEffect(() => {
    const el = body.current;
    if (!el || !chat.messages.length) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTo({ top: el.scrollHeight, behavior: reduced || chat.busy ? 'auto' : 'smooth' });
  }, [chat.messages, chat.busy, reduced]);

  // Moment 8: the page behind as the proof.
  const confirmAt = useRef(0);
  const fieldFocusAt = useRef(0);
  const state = useRef({ text, busy: chat.busy });
  state.current = { text, busy: chat.busy };
  const land = useLandingDriver({
    pathname,
    open,
    mode,
    // The chat stays when the coach is already on to the next thing: words in the field, the field taken up since Confirm, a turn running.
    canRecede: () => !state.current.text.trim() && fieldFocusAt.current <= confirmAt.current && !state.current.busy,
    recede: onClose,
    announce: setLandedLine,
  });
  const onPhase = (key: string, phase: TaskPhase, meta: TaskPhaseMeta) => {
    setCard({ phase, until: meta.heldUntil ?? null });
    land(key, phase, meta);
  };

  /** MO-2-3: the starts step back for the question; the one that was tapped has become it. */
  const [stepping, setStepping] = useState<{ rows: QuickStart[]; from: string | null } | null>(null);
  const born = useRef<ReadonlySet<string>>(new Set(turns.map((t) => t.id)));
  const send = (t: string, from: string | null = null) => {
    const clean = t.trim();
    // Offline, nothing leaves and the words stay in the field; while a turn runs the key is Stop (SPEC `ST-3`).
    if (!clean || !online || chat.busy) return;
    if (!turns.length && !reduced) {
      setStepping({ rows: starts, from });
      setTimeout(() => setStepping(null), CH_FADE_MS);
    }
    setText('');
    setChipHeld(false);
    setStoppedId(null);
    haptic('press');
    chat.send(clean);
  };
  const stop = () => {
    haptic('press');
    chat.stop();
    setStoppedId(turns[turns.length - 1]?.id ?? null);
  };
  /** A receipt's Open: in place when the thing lives on this page, by the shared push when it lives elsewhere (MO-8-5). */
  const openThing = (href: string) => {
    if ((href.split(/[?#]/)[0] ?? '').replace(/\/$/, '') === pathname.replace(/\/$/, '')) onClose();
    else leaveTo(href);
  };
  const toAsk = () => leaveTo(chat.conversationId ? `/golf/dashboard/coachhelm/chat?c=${encodeURIComponent(chat.conversationId)}` : '/golf/dashboard/coachhelm/chat');

  const dropChip = () => {
    if (!chip || chat.busy) return;
    haptic('select');
    const done = () => {
      setDropped((s) => new Set(s).add(chip.key));
      setChipHeld(true);
    };
    const el = chipEl.current;
    if (!el?.animate || mode === 'off') return done();
    const out = el.animate(reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.9)' }], { duration: CH_FADE_MS, easing: ease, fill: 'forwards' });
    out.onfinish = done;
  };

  const fresh = turns.length === 0;
  const canSend = !!text.trim() && online;
  // With the chip dropped the screen is still the screen: its starts stay, without the player's name.
  const starts = quickStarts(chip ?? (context ? { ...context, screen: qcScreen(pathname), playerName: null, playerId: null } : null), pathname, { count: phone ? 3 : 4, planOn: planOn || !!seam?.planOn });
  // MQ-2-2: starts that could not be shown with the panel (today's thread was still being read) fade in when it is known there is none.
  const openedAt = useRef(0);
  useLayoutEffect(() => {
    if (open) openedAt.current = performance.now();
  }, [open]);
  const late = open && performance.now() - openedAt.current > RESTORE_GRACE_MS;
  const hidden = turns.length > TURNS_SHOWN ? turns.length - TURNS_SHOWN : 0;

  return (
    <>
      <div className="qc__body" ref={body} data-qc-rise="">
        <p className="ch-sr-only" role="status">
          {finished}
        </p>
        <p className="ch-sr-only" role="status">
          {landedLine}
        </p>
        <div className="qc__inner" data-late={restored && late ? '' : undefined}>
          {fresh ? (
            !restoring && (
              <ul className="qc-starts" aria-label="Starts for this screen" data-late={late ? '' : undefined}>
                {starts.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="qc-start" data-ch-press="" onClick={() => send(s.ask, s.id)}>
                      <span className="qc-start__q">{s.ask}</span>
                      <span className="qc-start__d">{s.does}</span>
                      <Icon icon={ArrowUpRight} size={16} className="qc-start__go" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              {stepping && (
                <ul className="qc-starts is-leaving" aria-hidden="true">
                  {stepping.rows.map((s) => (
                    <li key={s.id} data-from={s.id === stepping.from ? '' : undefined}>
                      <span className="qc-start">
                        <span className="qc-start__q">{s.ask}</span>
                        <span className="qc-start__d">{s.does}</span>
                        <Icon icon={ArrowUpRight} size={16} className="qc-start__go" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {hidden > 0 && (
                <button type="button" className="steps-sum" onClick={toAsk}>
                  Earlier in this chat · Open in Ask
                </button>
              )}
              {turns.slice(hidden).map((turn) =>
                turn.role === 'user' ? (
                  <div className="qc-q" key={turn.id} data-turn={turn.id}>
                    {ruleAt === turn.id && (
                      <p className="qc-rule">
                        <span>Earlier today</span>
                      </p>
                    )}
                    <div className="ub" data-new={born.current.has(turn.id) ? undefined : ''}>
                      {turn.text}
                    </div>
                  </div>
                ) : (
                  <AssistantTurn
                    key={turn.id}
                    turn={turn}
                    failed={!!notice && turn.id === turns[turns.length - 1]?.id}
                    onFull={toAsk}
                    online={online}
                    stopped={stoppedId === turn.id}
                    onSend={send}
                    onApprove={(id) => {
                      confirmAt.current = performance.now();
                      chat.approve(id);
                    }}
                    onDeny={chat.deny}
                    onOpen={openThing}
                    onPhase={onPhase}
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
      <div className="qc__foot">
        <div className="qc__comp" data-qc-rise="">
          {!online && <p className="say quiet qc-offline">You’re offline. Your words stay here until you’re back.</p>}
          {(chip || chipHeld) && (
            <div className="qc-ctx">
              {chip && (
                <span ref={chipEl} className="qc-chip" role="group" aria-label={`Asking about ${chip.label.replace(/\s·\s/g, ', ')}`}>
                  <Badge tone="neutral">
                    <Icon icon={MapPin} size={13} className="qc-chip__pin" />
                    {chip.playerName && chip.label.endsWith(chip.playerName) && chip.label.length > chip.playerName.length ? (
                      // A long trail gives way in its screen part; the name is never cut.
                      <>
                        <span className="qc-chip__l">{chip.label.slice(0, -chip.playerName.length).replace(/\s·\s$/, '')}</span>
                        <span className="qc-chip__n">· {chip.playerName}</span>
                      </>
                    ) : (
                      <span className="qc-chip__l">{chip.label}</span>
                    )}
                    <button type="button" className="qc-chip__x" aria-label="Remove" disabled={chat.busy} onClick={dropChip}>
                      <Icon icon={X} size={13} />
                    </button>
                  </Badge>
                </span>
              )}
            </div>
          )}
          <div className="cmp">
            <Menu
              label="Add to your question"
              align="start"
              keepFocus
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
              placeholder={fresh ? 'Ask about your team' : pendingId ? 'Ask something else, or answer the card' : 'Ask a follow-up'}
              rows={1}
              value={text}
              onFocus={() => {
                fieldFocusAt.current = performance.now();
              }}
              onChange={(e) => {
                setText(e.target.value);
                // Grows with the words, up to four lines, in one frame (QC-8).
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 4 * parseFloat(getComputedStyle(el).lineHeight || '22'))}px`;
              }}
              enterKeyHint="send"
              onKeyDown={(e) => {
                // A phone's blue send key sends, as Messages' does.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                } else if (e.key === 'Backspace' && !text && chip) {
                  // An empty field's Backspace takes the chip, as a token field does.
                  e.preventDefault();
                  dropChip();
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
              <button className={'cmp__send' + (canSend ? '' : ' off')} type="button" aria-label="Send" aria-disabled={!canSend} onClick={() => send(text)}>
                <Ico d="M12 19V5M6 11l6-6 6 6" size={17} />
              </button>
            )}
          </div>
        </div>
      </div>
      {seam?.keyboard ? <div className="qc-kbd-stand-in" aria-hidden="true" style={{ height: seam.keyboard }} /> : null}
    </>
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
  if (!turn.active && started.current !== null && seconds.current === null) seconds.current = (performance.now() - started.current) / SECOND_MS;
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
    <ol className="steps">
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
            <span className="step__l">
              {active ? s.label : (s.done ?? s.label)}
              {!active && s.detail && <span className="step__d"> · {s.detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AssistantTurn({ turn, online, stopped, failed = false, onSend, onApprove, onDeny, onOpen, onFull, onPhase }: { turn: AskAssistantTurn; online: boolean; stopped: boolean; failed?: boolean; onFull: () => void; onSend: (t: string) => void; onApprove: (id: string) => void; onDeny: (id: string) => void; onOpen: (href: string) => void; onPhase: React.ComponentProps<typeof TaskCard>['onPhase'] }) {
  return (
    <>
      <Steps turn={turn} stopped={stopped} failed={failed} />
      {stopped && !turn.active && !turn.blocks.length && <p className="say quiet">Stopped. Nothing was saved.</p>}
      {turn.note && <p className="say quiet">{turn.note}</p>}
      {turn.blocks.map((b) => {
        if (b.kind === 'text')
          return (
            <div className="say" key={b.key}>
              <AskProse text={b.text} playersByName={{}} />
            </div>
          );
        // Quick chat finishes four tasks with their own visuals; anything else carries on in Ask, the same conversation, words and all (FID-QC-1).
        if (b.kind === 'proposal' && !b.view.proposal.visual && !LANDING_HOMES[b.view.tool])
          return (
            <p className="say quiet qc-handoff" key={b.key}>
              <span>This one’s easier to finish in Ask.</span>
              <button type="button" onClick={onFull}>
                Open in Ask
              </button>
            </p>
          );
        if (b.kind === 'proposal') return <TaskCard key={b.key} view={b.view} online={online} onSend={onSend} onApprove={onApprove} onDeny={onDeny} onOpen={onOpen} onPhase={onPhase} />;
        if (b.kind === 'plan') return <PlanTask key={b.key} plan={b.plan} online={online} onOpen={onOpen} />;
        if (b.kind === 'brief') return <QuickAsk key={b.key} brief={b.brief} onSend={onSend} />;
        // The card is the record of its own receipt; a receipt with no card in this turn says its one line.
        if (b.kind === 'receipt')
          return turn.blocks.some((x) => x.kind === 'proposal') ? null : (
            <p className="say quiet" key={b.key}>
              {b.receipt.summary}
            </p>
          );
        // A chart or a table the panel doesn't draw isn't dropped silently (QC-1).
        return (
          <p className="say quiet qc-handoff" key={b.key}>
            <span>There’s a chart with this answer.</span>
            <button type="button" onClick={onFull}>
              See it in Ask
            </button>
          </p>
        );
      })}
    </>
  );
}
