'use client';

import { ArrowUpRight, MapPin, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { ChatUIMessage } from '@/lib/coachhelm/v3/chat/engine/protocol';
import { describeChatError } from '../../data/coachhelm-chat-error';
import { ASK_STARTERS } from '../../data/coachhelm-chat-shape';
import { buildTurns, pendingApproval, type AskProposalView, type EvidenceFocus } from '../../data/coachhelm-chat-thread';
import { isoDay } from '../../lib/dates';
import { haptic } from '../../lib/haptics';
import { CH_EASE, CH_FADE_MS } from '../../lib/motion';
import type { ChMotionMode } from '../../lib/reduced-motion';
import { AskEvidencePanel } from '../../screens/coachhelm/chat/EvidencePanel';
import { ActivityIsland } from '../../screens/coachhelm/chat/island/ActivityIsland';
import { useIsland } from '../../screens/coachhelm/chat/island/useIsland';
import { askLinkHref } from '../../data/coachhelm-chat-links';
import { noteSendSource } from '../../screens/coachhelm/chat/send-source';
import { AskThread } from '../../screens/coachhelm/chat/Thread';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import type { ChAskSheetChat } from '../AskSheet';
import { subscribeOnline } from '../AskSheetBody';
import { saveLanding } from './landing';
import { useQcCtx } from './qc-context';
import { useQcSeam } from './qc-seam';
import { CONFIRM_FRESH_MS, PILL_REST_MS, RESTORE_GRACE_MS, SECOND_MS } from './qc-timing';
import { qcContext, qcScreen, quickStarts, type QuickStart } from './starts';
import { useDictation } from './useDictation';
import { phaseIsNow, useLandingDriver, type TaskPhase } from './use-landing-driver';
// The turn, the card and the island are styled beside Ask's own rules; the panel can open before Ask has ever been visited.
import '../../styles/coachhelm-ask-v2.css';

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
  /** The header's centred slot, where the activity island lives: one line there, and it opens over the body without changing the panel. */
  islandSlot: HTMLElement | null;
}

/**
 * The conversation inside the quick chat's frame (QUICK-CHAT.md, Moments 1, 2, 8 and 9): the chat hook, the empty start
 * for this screen, the context chip and the composer are this lane's; the thread itself (question, turn, reads, prose,
 * the task card and its receipt, the turn notice, the Latest key, Rule P) is the Ask lane's `AskThread` at compact
 * density, and the activity island is its `ActivityIsland`, both used whole and never restyled here.
 */
export function QuickChatThread({ chat: useChatImpl, conversationId, initialMessages, restored, restoring, open, onClose, leaveTo, looking, pathname, planOn, phone, mode, text, setText, field, islandSlot }: QuickChatThreadProps) {
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
  // The turn that was stopped, not the session: an earlier finished turn stays finished. `pending`: stopped before the server opened one.
  const [stoppedTurn, setStoppedTurn] = useState<string | null>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [evidence, setEvidence] = useState<EvidenceFocus | null>(null);
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

  // `ST-9.qc.today`: opened on a thread that was already there, a quiet rule says what the coach is looking at. It goes
  // with the first question of this sitting: from then the page on screen is now.
  const [earlierUntil, setEarlierUntil] = useState<number | null>(() => (restored || seam?.today ? turns.length : null));
  const wasOpen = useRef(open);
  useLayoutEffect(() => {
    if (open && !wasOpen.current) setEarlierUntil(turns.length ? turns.length : null);
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the toggle
  }, [open]);
  const earlier = earlierUntil !== null && turns.length === earlierUntil;

  // The activity island: where CoachHelm's work is shown, in the header's own row, so it covers nothing in the thread.
  const island = useIsland({ messages: chat.messages, busy: chat.busy, ended: !!notice || stoppedTurn !== null });

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
  /** What the card in this sitting last said. A stored receipt is not an event: reopening a finished thread lands nothing and says nothing. */
  const [card, setCard] = useState<{ phase: TaskPhase; until: string | null } | null>(null);
  const seenPhase = useRef(new Map<string, TaskPhase>());
  const views = useRef<AskProposalView[]>([]);
  views.current = turns.flatMap((t) => (t.role === 'assistant' ? t.blocks.flatMap((b) => (b.kind === 'proposal' ? [b.view] : [])) : []));
  const onCardPhase = (key: string, phase: TaskPhase, receipt: ActionReceipt | null) => {
    const before = seenPhase.current.get(key);
    seenPhase.current.set(key, phase);
    const until = receipt?.status === 'held' ? (receipt.held_until ?? null) : null;
    const confirmedNow = confirmAt.current > 0 && performance.now() - confirmAt.current < CONFIRM_FRESH_MS;
    // A stored card reports once when it is drawn: that is not an event (a reloaded Undo lands nothing and says nothing).
    if (!phaseIsNow(before, phase, { heldUntil: until, confirmedNow })) return;
    setCard({ phase, until });
    const view = views.current.find((v) => v.key === key);
    if (!view) return;
    const made = receipt?.created[0];
    land(key, phase, {
      tool: view.tool,
      lands: view.proposal.lands ?? null,
      label: made?.label ?? view.proposal.summary,
      subject: view.proposal.affects.find((a) => a.kind === 'player')?.id ?? null,
      heldUntil: until,
      id: made?.id ?? null,
    });
  };

  // The pill and the flag follow the run. A task that waits on the coach says so for 1800ms, then the key carries a flag.
  const lastTurn = turns[turns.length - 1];
  const assistant = lastTurn?.role === 'assistant' ? lastTurn : null;
  // What it is doing now, in the step's own words; a calculation that calls reads shows the read it is on ("Working it out" between them).
  const stepLabel = ([...(assistant?.steps ?? [])].reverse().find((s) => s.state === 'active') ?? assistant?.steps[assistant.steps.length - 1])?.label ?? 'Working';
  const lastReceipt = assistant?.blocks.flatMap((b) => (b.kind === 'proposal' ? [b.view.receipt] : b.kind === 'receipt' ? [b.receipt] : [])).find(Boolean) ?? null;
  const storedFailed = lastReceipt?.status === 'failed';
  const [clock, tick] = useState(0);
  useEffect(() => {
    const left = card?.phase === 'held' && card.until ? Math.ceil((Date.parse(card.until) - Date.now()) / SECOND_MS) : 0;
    if (pendingId) {
      setRun({ state: 'wait', label: 'Needs your OK' });
      if (open) return;
      const t = setTimeout(() => {
        setRun({ state: 'idle', label: '' });
        setFlag(true);
      }, PILL_REST_MS);
      return () => clearTimeout(t);
    }
    if (chat.busy && card?.phase !== 'held') return setRun({ state: 'work', label: stepLabel });
    if (card?.phase === 'failed' || (!card && storedFailed)) return setRun({ state: 'failed', label: 'Didn’t go through' });
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
  }, [pendingId, chat.busy, stepLabel, storedFailed, card, open, setRun, setFlag, clock]);

  /** MO-2-3: the starts step back for the question; the one that was tapped has become it. */
  const [stepping, setStepping] = useState<{ rows: QuickStart[]; from: string | null } | null>(null);
  const send = (t: string, from: string | null = null): boolean => {
    const clean = t.trim();
    // Offline, nothing leaves and the words stay in the field; while a turn runs the key is Stop (SPEC `ST-3`).
    if (!clean || !online || chat.busy) return false;
    if (!turns.length && !reduced) {
      setStepping({ rows: starts, from });
      setTimeout(() => setStepping(null), CH_FADE_MS);
    }
    setText('');
    setChipHeld(false);
    setStoppedTurn(null);
    haptic('press');
    chat.send(clean);
    return true;
  };
  const stop = () => {
    haptic('press');
    chat.stop();
    const last = turns[turns.length - 1];
    setStoppedTurn(last?.role === 'assistant' ? last.id : 'pending');
  };

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

  /**
   * A link out of the panel (a receipt's Open, a link in an answer): the destination takes the panel's history entry and
   * arrives by the app's own push, not a page load, so a row the chat just made is still known when the page draws it
   * (MO-8-5). When the thing lives on the page behind, nothing navigates: the panel steps away and the page is the answer.
   */
  const openLink = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as Element).closest?.('a[href]');
    const href = a?.getAttribute('href');
    if (!a || !href || !href.startsWith('/') || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || a.getAttribute('target') === '_blank') return;
    e.preventDefault();
    const view = views.current.find((v) => v.receipt?.created.some((c) => c.href && (askLinkHref(c.href) ?? c.href) === href));
    const made = view?.receipt?.created.find((c) => c.href);
    if (view) saveLanding({ key: view.key, tool: view.tool, lands: view.proposal.lands ?? null, label: made?.label ?? view.proposal.summary, id: made?.id ?? null, subject: view.proposal.affects.find((x) => x.kind === 'player')?.id ?? null });
    haptic('press');
    if ((href.split(/[?#]/)[0] ?? '').replace(/\/$/, '') === pathname.replace(/\/$/, '')) onClose();
    else leaveTo(href);
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

  return (
    <>
      {/* A link's own click is caught on its way down (openLink); the link stays the control. */}
      <div className="qc__body" ref={setBody} data-qc-rise="" onClickCapture={openLink}>
        <p className="ch-sr-only" role="status">
          {landedLine}
        </p>
        <div className="qc__inner" data-late={restored && late ? '' : undefined}>
          {fresh ? (
            !restoring && (
              <ul className="qc-starts" aria-label="Starts for this screen" data-late={late ? '' : undefined}>
                {starts.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="qc-start"
                      data-ch-press=""
                      onClick={(e) => {
                        // MO-2-4: the question rises out of the words that were tapped.
                        noteSendSource(e.currentTarget.querySelector('[data-ch-ask-source]'));
                        send(s.ask, s.id);
                      }}
                    >
                      <span className="qc-start__q" data-ch-ask-source="">
                        {s.ask}
                      </span>
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
              {earlier && (
                <p className="qc-rule">
                  <span>Earlier today</span>
                </p>
              )}
              <AskThread
                density="compact"
                jumpHost={body}
                messages={chat.messages}
                busy={chat.busy}
                error={notice}
                offline={!online}
                // The panel is a phone-wide column on a desk too: the thread takes its phone page edge, not a desk's centred measure.
                phone
                players={[]}
                stoppedTurn={stoppedTurn}
                onApprove={(id) => {
                  confirmAt.current = performance.now();
                  chat.approve(id);
                }}
                onDeny={chat.deny}
                onSend={(t) => send(t)}
                onStop={stop}
                onRetry={() => {
                  setStoppedTurn(null);
                  chat.retry();
                }}
                onNewChat={chat.newConversation}
                evidenceFocus={evidence}
                onOpenEvidence={setEvidence}
                onCardPhase={onCardPhase}
                island={{ turnId: island.model?.turnId ?? null, open: island.open, pinned: island.pinned, openFor: island.openFor }}
              />
            </>
          )}
        </div>
      </div>
      <div className="qc__foot">
        <div className="qc__comp" data-qc-rise="">
          {!online && <p className="qc-offline">You’re offline. Your words stay here until you’re back.</p>}
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
                    <button type="button" className="qc-chip__x" aria-label="Remove" data-ch-press="" disabled={chat.busy} onClick={dropChip}>
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
                <button {...t} type="button" className="cmp__plus" aria-label="Add to your question" data-ch-press="">
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
              data-ch-ask-source=""
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
                  noteSendSource(e.currentTarget);
                  send(text);
                } else if (e.key === 'Backspace' && !text && chip) {
                  // An empty field's Backspace takes the chip, as a token field does.
                  e.preventDefault();
                  dropChip();
                }
              }}
            />
            {mic.available && (
              <button type="button" className={'cmp__mic' + (mic.on ? ' is-on' : '')} aria-label={mic.on ? 'Stop dictating' : 'Dictate'} aria-pressed={mic.on} data-ch-press="" onClick={mic.toggle}>
                <Ico d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" size={18} />
              </button>
            )}
            {chat.busy ? (
              <button className="cmp__send stop" type="button" aria-label="Stop" data-ch-press="" onClick={stop}>
                <span className="sq" />
              </button>
            ) : (
              <button
                className={'cmp__send' + (canSend ? '' : ' off')}
                type="button"
                aria-label="Send"
                aria-disabled={!canSend}
                data-ch-press=""
                onClick={() => {
                  noteSendSource(field.current);
                  send(text);
                }}
              >
                <Ico d="M12 19V5M6 11l6-6 6 6" size={17} />
              </button>
            )}
          </div>
        </div>
      </div>
      {islandSlot && !fresh && createPortal(<ActivityIsland island={island} density="compact" onOpenStep={(messageId, ref, label) => setEvidence({ messageId, key: `read-${messageId}-${ref}`, label, ref })} />, islandSlot)}
      {/* A figure's source, over the panel: the app's sheet on the phone and on a desk (the panel has no room beside its thread). */}
      {evidence && <AskEvidencePanel open focus={evidence} messages={chat.messages} phone onClose={() => setEvidence(null)} />}
      {seam?.keyboard ? <div className="qc-kbd-stand-in" aria-hidden="true" style={{ height: seam.keyboard }} /> : null}
    </>
  );
}
