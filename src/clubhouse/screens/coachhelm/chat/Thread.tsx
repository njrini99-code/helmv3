'use client';

import type { UIMessage } from 'ai';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown } from 'lucide-react';
import type { ChatErrorNotice } from '../../../data/coachhelm-chat-error';
import {
  buildTurns,
  evidenceAvailable,
  failedAnswerChangedNothing,
  focusForProposal,
  pendingApproval,
  playerFollowUps,
  type AskAssistantTurn,
  type AskTurn,
  type EvidenceFocus,
} from '../../../data/coachhelm-chat-thread';
import { CH_FILL_EASE_POINTS, CH_MS, chSpringCurve } from '../../../lib/motion';
import { haptic } from '../../../lib/haptics';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { Icon } from '../../../ui/Icon';
import { useToast } from '../../../ui/Toast';
import { AnswerCard } from './parts/AnswerCard';
import type { TurnEnd } from './parts/TurnNotice';
import { LiveDot } from './parts/Work';
import { takeSendSource } from './send-source';
import { TURN_TIMING } from './turn-timing';
import { PlanVersions } from '../plan/PlanCard';
import { BatchBar, useCardShell } from './cards';
import type { AskProposalView } from '../../../data/coachhelm-chat-thread';
import { Receipt, type ReceiptPhase } from './parts/ConfirmCard';
import { TaskCard } from './parts/TaskCard';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { AskArtifact } from './parts/artifacts';
import { AskUserText } from './Prose';
import { scopeWho } from './ask-scope-window';
import '../../../styles/coachhelm-thread.css';

export interface AskThreadProps {
  onArtifact?: (a: AskArtifact) => void;
  /** The team's name, for a draft that shows how a player's phone will read it. */
  team?: string;
  /** The coach pressed Stop on the last turn. */
  stoppedTurn?: string | null;
  messages: UIMessage[];
  /** A turn is in flight. */
  busy: boolean;
  /** The failed answer's sentence and what to offer (describeChatError), or null. */
  error: ChatErrorNotice | null;
  offline: boolean;
  phone: boolean;
  players: Array<{ id: string; name: string }>;
  /** Who is asking: a player's next steps are read-only and about their own game. */
  viewer?: 'coach' | 'player';
  /** Both receive the APPROVAL id (`part.approval.id`). */
  onApprove: (approvalId: string) => void;
  onDeny: (approvalId: string) => void;
  onSend: (text: string) => boolean | void;
  onStop: () => void;
  onRetry: () => void;
  onNewChat: () => void;
  evidenceFocus: EvidenceFocus | null;
  onOpenEvidence: (focus: EvidenceFocus) => void;
  /** Ask draws full; quick chat's panel draws compact. */
  density?: 'full' | 'compact';
  /** Where the Latest key is placed: the element the thread's scroller sits in. Left out, the nearest `.ch-ask-main`. */
  jumpHost?: HTMLElement | null;
  /** A task card's write changed state (held, saved, undone, failed): what the page behind a quick chat lands from. */
  onCardPhase?: (key: string, phase: ReceiptPhase, receipt: ActionReceipt | null) => void;
  /** Edit mode: the coach changed fields on a waiting card (its approval id, the fields that changed). Left out, no card offers Edit. */
  onEditCard?: (approvalId: string, edits: Record<string, unknown>) => void;
  /** Several cards in one turn, confirmed together (their approval ids). Left out, each card is decided on its own. */
  onApproveAll?: (approvalIds: string[]) => void;
  /** A card's "Save now and open": the write is in, and the shell goes to the address its own way. Left out, the page loads there. */
  onOpenReceipt?: (view: AskProposalView, receipt: ActionReceipt, href: string) => void;
  /**
   * The work is shown by an island outside the thread (`island/useIsland`; quick chat's header): the turn it is on screen for,
   * whether its steps are open, and how a turn's own line opens it. Left out, each turn draws its island in the flow, under
   * its question (direction A).
   */
  island?: { turnId: string | null; open: boolean; pinned: boolean; openFor: (turnId: string) => void };
}

/** The nearest ancestor that scrolls, or null when the page itself does. */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}

/** A page: one question and everything that answers it, until the next question (SPEC, Rule P). */
interface Page {
  id: string;
  turns: AskTurn[];
}
function pagesOf(turns: AskTurn[]): Page[] {
  const pages: Page[] = [];
  for (const t of turns) {
    if (t.role === 'user' || pages.length === 0) pages.push({ id: t.id, turns: [t] });
    else pages[pages.length - 1]!.turns.push(t);
  }
  return pages;
}

/** The turn that stands in for an answer the server has not opened yet: the island's one line, and whatever the wait has earned. */
const pendingTurn = (id: string): AskAssistantTurn => ({ role: 'assistant', id, steps: [], envelopes: [], blocks: [], note: null, answerText: '', work: null, followUps: [], active: true });

/**
 * The conversation (chat v3, SPEC Rule P and Moments 3 to 5, 10).
 *
 * The question takes the top of the page: on send the thread's position is set so the new question sits at the top and its
 * page is at least one screen tall, so the answer writes into space that already exists. Nothing on screen moves again: reads
 * open and fold, charts land and text streams without the thread scrolling. It follows the newest words only when the coach
 * has scrolled to the live edge; otherwise the Latest key says there is more below.
 */
export function AskThread({ viewer = 'coach', team, stoppedTurn = null, onArtifact, messages, busy, error, offline, phone, players, onApprove, onDeny, onSend, onRetry, onNewChat, evidenceFocus, onOpenEvidence, density = 'full', jumpHost, onCardPhase, onEditCard, onApproveAll, onOpenReceipt, island }: AskThreadProps) {
  const toast = useToast();
  const reduced = useChReducedMotion();
  const turns = useMemo(() => buildTurns(messages, { busy }), [messages, busy]);
  const planVersions = useMemo(() => turns.flatMap((t) => (t.role === 'assistant' ? t.blocks.flatMap((b) => (b.kind === 'plan' ? [b.plan] : [])) : [])), [turns]);
  const names = useMemo(() => players.map((p) => p.name), [players]);
  const playersByName = useMemo(() => Object.fromEntries(players.map((p) => [p.name, p.id])), [players]);
  const pending = pendingApproval(messages);
  const last = turns[turns.length - 1];
  // The question is out and nothing has opened its answer: the turn exists anyway (it arrives after the question, as a reply does).
  const awaiting = !!last && last.role === 'user' && (busy || !!error || stoppedTurn !== null);
  const lastAssistantId = [...turns].reverse().find((t) => t.role === 'assistant')?.id;
  const lastUserId = [...turns].reverse().find((t) => t.role === 'user')?.id;
  const pages = useMemo(() => pagesOf(turns), [turns]);
  const changed = useMemo(() => failedAnswerChangedNothing(messages), [messages]);
  // What the cards' built behaviours need kept across the turn: an edit's answer, open edit forms, each write's state, the one batch.
  const cards = useCardShell({ messages, busy, onApproveAll });

  const rootRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  /** How far under the scroller's top the column starts, at rest: where a page's question sits when it takes the top. */
  const inset = useRef(0);

  // ── The page: its height, and where the thread rests ──
  // The last page is at least as tall as the thread's visible height, less the scroller's own insets, so a short answer leaves open
  // space under it and a growing one grows into space that is already there.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const sp = scrollParentOf(root);
    if (!root || !sp) return;
    const measure = () => {
      const col = colRef.current;
      if (!col) return;
      // What sits above the column (the scroller's and the thread's own insets) and the insets below it: the page fills the rest.
      const above = col.getBoundingClientRect().top - sp.getBoundingClientRect().top + sp.scrollTop;
      const below = parseFloat(getComputedStyle(root).paddingBottom || '0') + parseFloat(getComputedStyle(sp).paddingBottom || '0');
      inset.current = above;
      root.style.setProperty('--ch-ak-view', `${Math.max(0, Math.floor(sp.clientHeight - above - below))}px`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(sp);
    return () => ro.disconnect();
  }, []);

  // When each question was sent, for the turn that waits on it (the work line's words are a matter of time).
  const sentAt = useRef(new Map<string, number>());
  const knownTurns = useRef<Set<string> | null>(null);
  // A thread opened from history is at rest: none of its turns arrive. One that mounts on its first question (the home handing over) is new.
  const openedOnSend = useRef(messages.length === 1 && busy);
  if (knownTurns.current === null) knownTurns.current = new Set(openedOnSend.current ? [] : turns.map((t) => t.id));
  for (const t of turns) if (t.role === 'user' && !knownTurns.current.has(t.id) && !sentAt.current.has(t.id)) sentAt.current.set(t.id, typeof performance === 'undefined' ? 0 : performance.now());

  // ── Follow, and the Latest key ──
  // `follow`: the coach is at the live edge because they went there. A send clears it: the answer never chases itself.
  const follow = useRef(false);
  const ours = useRef(0);
  const [more, setMore] = useState<{ host: HTMLElement; bottom: number } | null>(null);
  const place = useCallback(() => {
    const sp = scrollParentOf(rootRef.current);
    if (!sp) return;
    const gap = sp.scrollHeight - sp.scrollTop - sp.clientHeight;
    const host = jumpHost ?? rootRef.current?.closest<HTMLElement>('.ch-ask-main') ?? null;
    const bottom = host ? Math.round(host.getBoundingClientRect().bottom - sp.getBoundingClientRect().bottom) + 12 : 0;
    const next = gap > TURN_TIMING.edge && host ? { host, bottom } : null;
    setMore((m) => (m?.host === next?.host && m?.bottom === next?.bottom ? m : next));
    return gap;
  }, [jumpHost]);
  useEffect(() => {
    // Listen on the document's capture: at mount the scroller's overflow may not have applied yet, and a listener on the window never hears it.
    const onScroll = () => {
      const gap = place();
      // A scroll the thread made itself (the send, the glide to Latest) is not the coach going to the edge.
      if (gap !== undefined && performance.now() > ours.current) follow.current = gap <= TURN_TIMING.edge;
    };
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, [place]);

  // A thread opened from history shows its newest words.
  useLayoutEffect(() => {
    if (openedOnSend.current) return;
    const sp = scrollParentOf(rootRef.current);
    if (sp) sp.scrollTop = sp.scrollHeight;
  }, []);

  // ── Send: the question takes the top of the page (MO-3-4, MO-3-5) ──
  const drawn = useRef<string | undefined>(openedOnSend.current ? undefined : lastUserId);
  useLayoutEffect(() => {
    if (!lastUserId || drawn.current === lastUserId) return;
    drawn.current = lastUserId;
    const root = rootRef.current;
    const col = colRef.current;
    const sp = scrollParentOf(root);
    const page = col?.querySelector<HTMLElement>('.ch-ak-page.is-last');
    const bubble = page?.querySelector<HTMLElement>('.ch-th-user p');
    if (!root || !col || !sp || !page) return;
    follow.current = false;
    ours.current = performance.now() + 400;
    const before = sp.scrollTop;
    const top = sp.scrollTop + page.getBoundingClientRect().top - sp.getBoundingClientRect().top - inset.current;
    sp.scrollTop = Math.max(0, top);
    const delta = Math.min(sp.scrollTop - before, sp.clientHeight);
    const source = takeSendSource() ?? document.querySelector<HTMLElement>('.ch-ask-cmp textarea')?.getBoundingClientRect() ?? null;
    if (reduced || typeof col.animate !== 'function') return;
    // The scroll position is already final. The glide shows the older pages going up and away instead of vanishing; a second
    // send adds its own glide on top of one still running (composite add), so nothing snaps.
    const send = chSpringCurve('send');
    if (delta > 1) col.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: send.ms, easing: send.linear, composite: 'add' });
    if (bubble && source) {
      // The words rise out of the thing the coach touched (the field, a start, a follow-up), on the launch spring.
      const rest = bubble.getBoundingClientRect();
      const dx = Math.min(0, source.left - rest.left);
      const dy = source.top - rest.top - delta;
      const launch = chSpringCurve('launch');
      bubble.animate([{ transform: `translate(${dx}px, ${dy}px) scale(0.96)` }, { transform: 'translate(0, 0) scale(1)' }], { duration: launch.ms, easing: launch.linear });
      bubble.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: CH_MS.fillInk, easing: `cubic-bezier(${CH_FILL_EASE_POINTS.join(', ')})` });
    }
  }, [lastUserId, reduced]);

  // While an answer arrives: follow only at the live edge. The Latest key's place is kept up as the content grows.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const sp = scrollParentOf(rootRef.current);
      if (sp && follow.current) {
        ours.current = performance.now() + 80;
        sp.scrollTop = sp.scrollHeight;
      }
      place();
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, busy, error, place]);
  const toLatest = () => {
    const sp = scrollParentOf(rootRef.current);
    haptic('select');
    follow.current = true;
    ours.current = performance.now() + 900;
    setMore(null);
    sp?.scrollTo?.({ top: sp.scrollHeight, behavior: reduced ? 'instant' : 'smooth' });
  };

  // ── Receipts that arrive while this thread is on screen: one haptic, and a toast when a write did not complete. A reloaded thread's receipts are not announced again. ──
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const receipts = turns.flatMap((t) => (t.role === 'assistant' ? t.blocks.flatMap((b) => (b.kind === 'receipt' ? [{ ...b, carded: t.blocks.some((x) => x.kind === 'proposal' && x.view.receipt === b.receipt) }] : [])) : []));
    if (seen.current === null) {
      seen.current = new Set(receipts.map((r) => r.key));
      return;
    }
    for (const r of receipts) {
      if (seen.current.has(r.key)) continue;
      seen.current.add(r.key);
      // A held write is not saved yet: its haptic comes with the save (the card's own). A failure the coach is looking at needs no toast.
      if (r.receipt.status === 'completed') {
        // A receipt on its card: the card fires the haptic, at the moment the write is saved (after a hold, that is later than this).
        if (!r.carded) haptic('success');
      } else if (r.receipt.status !== 'held') {
        haptic('error');
        toast({ title: `${r.receipt.action}, not completed`, tone: 'error', body: r.receipt.error ?? r.receipt.summary, code: 'CH-13050' });
      }
    }
  }, [turns, toast]);

  const openRead = useCallback((messageId: string) => (ref: string, label: string) => onOpenEvidence({ messageId, key: `read-${messageId}-${ref}`, label, ref }), [onOpenEvidence]);

  return (
    <PlanVersions.Provider value={planVersions}>
    <div ref={rootRef} className={'ch-th' + ' ch-ak-th' + (phone ? ' ch-th--phone' : '') + (density === 'compact' ? ' is-compact' : '')} data-ch-code="CH-13850" data-v2="" data-v3="">
      <div ref={colRef} className="ch-th-col" aria-label="Conversation" role="group">
        {pages.map((page, pageIndex) => {
          const lastPage = pageIndex === pages.length - 1;
          return (
            <div key={page.id} className={'ch-ak-page' + (lastPage ? ' is-last' : '')}>
              {[
                ...page.turns.map((turn, turnIndex) => {
                const fresh = !knownTurns.current?.has(turn.id);
                if (turn.role === 'user') {
                  return (
                    <div key={turn.id} className={'ch-th-turn ch-th-user' + (fresh ? ' is-new' : '')}>
                      <p>
                        <AskUserText text={turn.text} names={names} />
                      </p>
                    </div>
                  );
                }
                const isLast = turn.id === lastAssistantId && lastPage;
                const followUps = viewer === 'player' ? playerFollowUps(turn.followUps, turn.envelopes) : turn.followUps;
                const showFollowUps = isLast && !busy && !pending && !error && followUps.length > 0;
                const question = page.turns[turnIndex - 1];
                // The turn that answers the page's question keeps one identity from the moment the question is sent, so the island that
                // waited is the island that works: nothing remounts when the server opens the turn.
                const answersQuestion = question?.role === 'user' && turnIndex === 1;
                const end: TurnEnd | null = !isLast || busy ? null : error ? { kind: 'failed', notice: error } : stoppedTurn !== null ? { kind: 'stopped' } : null;
                return (
                  <AnswerCard
                    key={answersQuestion ? `answer-${question.id}` : turn.id}
                    turn={followUps === turn.followUps ? turn : { ...turn, followUps, followUpPrompts: undefined }}
                    fresh={fresh}
                    showFollowUps={showFollowUps}
                    playersByName={playersByName}
                    onSend={onSend}
                    sentAt={answersQuestion && turn.active ? (sentAt.current.get(question.id) ?? null) : null}
                    end={end}
                    offline={offline}
                    changed={changed}
                    onRetry={onRetry}
                    onNewChat={onNewChat}
                    onOpenRead={openRead(turn.id)}
                    openRef={evidenceFocus?.messageId === turn.id ? (evidenceFocus.ref ?? null) : null}
                    subject={question?.role === 'user' ? scopeWho(question.text, viewer === 'player' ? 'My rounds' : (team ?? 'Your team'), viewer === 'player' ? [] : names) : null}
                    island={island ? { showing: island.turnId === turn.id && !island.pinned, open: island.turnId === turn.id && island.open, onOpen: () => island.openFor(turn.id) } : undefined}
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
                      // Several cards in one turn: the one safe "approve all" sits under the last of them.
                      const proposed = turn.blocks.flatMap((x) => (x.kind === 'proposal' ? [x.view] : []));
                      const last = proposed.length > 1 && proposed[proposed.length - 1] === b.view;
                      const batch = last ? cards.batchOf(proposed) : null;
                      const task = (
                        <TaskCard
                          key={b.key}
                          view={b.view}
                          density={density}
                          // The card arrived in this visit while the turn was live: it rises out of the answer. A stored one draws still.
                          fresh={fresh || turn.active}
                          busy={busy}
                          roster={players}
                          team={team}
                          evidence={focus && evidenceAvailable(messages, focus) ? { open: evidenceFocus?.key === b.view.key, onOpen: () => onOpenEvidence(focus) } : undefined}
                          onApprove={onApprove}
                          onDeny={onDeny}
                          onSend={onSend}
                          onPhase={(key, phase, receipt) => {
                            cards.onPhase(key, phase);
                            onCardPhase?.(key, phase, receipt);
                          }}
                          onEdit={onEditCard}
                          revision={cards.revisionOf(b.view)}
                          onEditOpen={cards.onEditOpen}
                          onOpenReceipt={onOpenReceipt}
                          undoSignal={cards.undoSignalOf(b.view)}
                        />
                      );
                      // The last of several keeps one place in the tree whether or not the bar is drawn, so its card never remounts mid-hold.
                      if (!last) return task;
                      return (
                        <div key={b.key} className="ch-akc-deck">
                          {task}
                          {batch && <BatchBar {...batch} />}
                        </div>
                      );
                    }}
                    onArtifact={onArtifact}
                    players={players}
                  />
                );
                }),
                // The answer the server has not opened yet. It shares the list and the key of the turn that will take its place.
                lastPage && awaiting && last?.role === 'user' ? (
                <AnswerCard
                  key={`answer-${last.id}`}
                  turn={{ ...pendingTurn(`pending-${last.id}`), active: busy }}
                  fresh
                  showFollowUps={false}
                  playersByName={playersByName}
                  players={players}
                  onSend={onSend}
                  actions={() => null}
                  sentAt={sentAt.current.get(last.id) ?? null}
                  started={false}
                  end={busy ? null : error ? { kind: 'failed', notice: error } : { kind: 'stopped' }}
                  offline={offline}
                  changed={changed}
                  onRetry={onRetry}
                  onNewChat={onNewChat}
                />
                ) : null,
              ]}
            </div>
          );
        })}
      </div>
      {more &&
        createPortal(
          <button type="button" className={'ch-ak-jump' + (busy ? ' is-live' : '')} aria-label={busy ? 'More below. Jump to the latest' : 'Jump to the latest'} data-ch-press="" style={{ bottom: more.bottom }} onClick={toLatest}>
            <Icon icon={ArrowDown} size={19} />
            {busy && <LiveDot />}
          </button>,
          more.host,
        )}
    </div>
    </PlanVersions.Provider>
  );
}
