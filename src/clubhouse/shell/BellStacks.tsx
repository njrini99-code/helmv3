'use client';

import { AnimatePresence, m } from 'motion/react';
import { BellOff, BrainCircuit, CalendarDays, ClipboardCheck, Eye, Megaphone, MessageSquare, Users, X, type LucideIcon } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref, type RefObject } from 'react';
import { isUnread, type NotificationCategoryId, type UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { haptic } from '../lib/haptics';
import { chSpring, chSpringCurve } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { Icon } from '../ui/Icon';
import { InlineNotice } from '../ui/Notices';
import { ago, moreLabel, notificationKey, openStack, stackFeed, type ChNotificationStack } from './notification-stacks';

/** Each kind's glyph and name: the settings panel's notification categories. */
export const CH_NOTIFICATION_KIND: Record<NotificationCategoryId, { icon: LucideIcon; label: string }> = {
  messages: { icon: MessageSquare, label: 'Messages' },
  events: { icon: CalendarDays, label: 'Events' },
  announcements: { icon: Megaphone, label: 'Announcements' },
  tasks: { icon: ClipboardCheck, label: 'Tasks' },
  coachhelm: { icon: BrainCircuit, label: 'CoachHelm' },
  pipeline: { icon: Users, label: 'Team' },
  profile_views: { icon: Eye, label: 'Profile' },
};

/** How far each folded card shows under the one above it, and how much narrower it is. */
const PEEK = 9;
const NARROW = 0.05;

/**
 * The phone notification drop as stacks (CH-1811; owner 2026-10-12, "lock screen stack"; the rules are
 * notification-stacks.ts). Glass cards on the green veil, the way the iPhone stacks notifications:
 *
 *   folded   a kind's newest card on top, the next two as glass edges under it; tap to fan it out (one at a time)
 *   fanned   the cards slide down out from under the top one on the smooth spring as the stack opens up; Show less folds
 *            them back under it; the stack's × marks the kind read
 *   swipe    a card thrown or dragged left past a third of its width marks it read: it leaves on the spring at the
 *            speed it was thrown and the stack closes over the gap; a short drag springs back
 *
 * Every motion is a D-64 spring (smooth for what is anchored, settle for a card arriving), interruptible, and instant
 * with reduced motion or Animations off. No staggers: a fanned stack's cards move as one.
 *
 * All of it is transform and opacity on the compositor. The feed is laid out once at its new size and what moved slides
 * from where it was (useFeedFlip); what leaves is lifted out of the flow and fades (popLayout). Heights and paddings
 * animated before, and re-laid the feed out on every frame of a fan (a player's fanned stack ran to 3,000px).
 */
/** What slides when the feed changes: the stacks, and the cards in a fanned stack. */
const FLIP_PARTS = '.ch-bst-stack, .ch-bst-fan__item';

/**
 * After each change to the feed, every stack and fanned card whose place moved plays the move from where it was, on the
 * smooth spring (FLIP: one layout, then WAAPI `translate`). A move still playing is taken from where it is on screen.
 */
function useFeedFlip(feed: RefObject<HTMLElement | null>, reduced: boolean): void {
  const was = useRef(new WeakMap<HTMLElement, number>());
  const playing = useRef(new WeakMap<HTMLElement, Animation>());
  // The closed drop rests out of the render tree (Bell.tsx), where nothing has a place: what changes there slides from
  // nowhere, and where things are is read as it comes back (laid out by then, so the read costs nothing).
  useEffect(() => {
    const root = feed.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;
    const shown = new ResizeObserver(() => {
      if (!root.getClientRects().length) return;
      for (const el of root.querySelectorAll<HTMLElement>(FLIP_PARTS)) if (!el.closest('[data-motion-pop-id]')) was.current.set(el, el.offsetTop);
    });
    shown.observe(root);
    return () => shown.disconnect();
  });
  useLayoutEffect(() => {
    const root = feed.current;
    if (!root || !root.getClientRects().length) return;
    const curve = reduced ? null : chSpringCurve('smooth');
    for (const el of root.querySelectorAll<HTMLElement>(FLIP_PARTS)) {
      // On its way out (popLayout lifted it out of the flow): it, and what is in it, stay where they are.
      if (el.closest('[data-motion-pop-id]')) continue;
      const top = el.offsetTop;
      const before = was.current.get(el);
      was.current.set(el, top);
      if (before === undefined || before === top || !curve) continue;
      const running = playing.current.get(el);
      const lift = running ? Number.parseFloat(getComputedStyle(el).translate.split(' ')[1] ?? '0') || 0 : 0;
      running?.cancel();
      const from = before - top + lift;
      if (Math.abs(from) < 0.5) continue;
      const move = el.animate?.([{ translate: `0 ${from}px` }, { translate: '0 0' }], { duration: curve.ms, easing: curve.linear });
      if (move) playing.current.set(el, move);
    }
  });
}
/**
 * Re-rendered only when the feed, its failure or the motion setting (read here) change: opening and closing the drop (the bell's
 * own state) never re-renders the cards, so nothing but transforms happens while it moves. The handlers it is given only
 * reach for state setters and the router, so an older one does the same as a newer one.
 */
export const BellStacks = memo(BellStacksView, (a, b) => a.items === b.items && a.failed === b.failed);

function BellStacksView({
  items,
  failed,
  onRetry,
  onOpen,
  onClear,
}: {
  items: UnifiedNotificationItem[] | null;
  failed: boolean;
  onRetry: () => void;
  onOpen: (item: UnifiedNotificationItem) => void;
  onClear: (items: UnifiedNotificationItem[]) => void;
}) {
  const reduced = useChReducedMotion();
  const [chosen, setChosen] = useState<string | null>(null);
  const feed = useMemo(() => stackFeed(items ?? []), [items]);
  const feedRef = useRef<HTMLDivElement>(null);
  useFeedFlip(feedRef, reduced);
  const open = openStack(feed, chosen);
  // `chosen`: null until the coach picks (the only New stack then opens by itself), '' once they fold everything.
  const toggle = (key: string) => {
    haptic('select');
    setChosen(open === key ? '' : key);
  };

  if (failed && !items?.length) {
    return (
      <div className="ch-bst-card ch-bst-card--still">
        <InlineNotice code="CH-1201" title="Notifications didn’t load" body="Try again; the error has been reported." onRetry={onRetry} />
      </div>
    );
  }
  if (items === null) {
    return (
      <div className="ch-bst-skel" aria-busy="true" aria-label="Loading notifications" data-ch-code="CH-1401">
        {[0, 1].map((k) => (
          <div key={k} className="ch-bst-pile ch-bst-pile--skel">
            <div className="ch-bst-card ch-bst-card--still">
              <span className="ch-bst-skel__line" style={{ width: '38%' }} />
              <span className="ch-bst-skel__line" style={{ width: '82%' }} />
              <span className="ch-bst-skel__line" style={{ width: '64%' }} />
            </div>
            <span className="ch-bst-shell" style={{ translate: `0 ${PEEK}px`, scale: `${1 - NARROW} 1` }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div ref={feedRef} className="ch-bst-feed">
      {feed.fresh.length === 0 && (
        <m.div className="ch-bst-empty" data-ch-code="CH-1302" initial={reduced ? false : { opacity: 0, transform: 'translate(0px, -8px)' }} animate={{ opacity: 1, transform: 'translate(0px, 0px)' }} transition={chSpring('settle', reduced)}>
          <span className="ch-bst-empty__ic">
            <Icon icon={BellOff} size={20} />
          </span>
          <b>You’re all caught up</b>
          <span>Messages, events, reminders and CoachHelm updates show up here.</span>
        </m.div>
      )}
      {/* A stack cleared to nothing fades where it was, out of the flow, and the stacks under it rise into its place. */}
      <AnimatePresence initial={false} mode="popLayout">
        {feed.fresh.map((s) => (
          <Stack key={s.key} stack={s} open={open === s.key} reduced={reduced} onToggle={() => toggle(s.key)} onOpen={onOpen} onClear={onClear} />
        ))}
      </AnimatePresence>
      <AnimatePresence initial={false} mode="popLayout">
        {feed.earlier && <Stack key="earlier" stack={feed.earlier} open={open === feed.earlier.key} reduced={reduced} onToggle={() => toggle('earlier')} onOpen={onOpen} onClear={onClear} />}
      </AnimatePresence>
    </div>
  );
}

function Stack({
  ref,
  stack,
  open,
  reduced,
  onToggle,
  onOpen,
  onClear,
}: {
  /** Given by AnimatePresence (popLayout), to lift a cleared stack out of the flow as it fades. */
  ref?: Ref<HTMLElement>;
  stack: ChNotificationStack;
  open: boolean;
  reduced: boolean;
  onToggle: () => void;
  onOpen: (item: UnifiedNotificationItem) => void;
  onClear: (items: UnifiedNotificationItem[]) => void;
}) {
  const [top, ...rest] = stack.items;
  const multi = rest.length > 0;
  const folded = multi && !open;
  const label = stack.kind === 'earlier' ? 'Earlier' : CH_NOTIFICATION_KIND[stack.category!].label;
  const smooth = chSpring('smooth', reduced);
  const settle = chSpring('settle', reduced);
  const swipe = stack.kind === 'new';
  if (!top) return null;
  return (
    <m.section
      ref={ref}
      className="ch-bst-stack"
      aria-label={stack.kind === 'earlier' ? 'Earlier notifications' : `${label}, ${stack.unread} new`}
      initial={reduced ? false : { opacity: 0, transform: 'translate(0px, -12px)' }}
      animate={{ opacity: 1, transform: 'translate(0px, 0px)' }}
      exit={{ opacity: 0 }}
      transition={smooth}
    >
      {/* Each card names its kind, so a New stack's head is only its tools while fanned; Earlier is named. */}
      <div className="ch-bst-stack__head" data-quiet={stack.kind === 'new' && !(open && multi) ? '' : undefined}>
        <span>{stack.kind === 'earlier' ? label : open && multi ? label : null}</span>
        <AnimatePresence initial={false}>
          {open && multi && (
            <m.span
              key="tools"
              className="ch-bst-stack__tools"
              initial={{ opacity: 0, transform: 'translate(8px, 0px)' }}
              animate={{ opacity: 1, transform: 'translate(0px, 0px)' }}
              exit={{ opacity: 0, transform: 'translate(8px, 0px)' }}
              transition={settle}
            >
              <button type="button" className="ch-bst-pill" onClick={onToggle}>
                Show less
              </button>
              {swipe && (
                <button type="button" className="ch-bst-pill ch-bst-pill--x" aria-label={`Mark ${label} read`} onClick={() => onClear(stack.items)}>
                  <Icon icon={X} size={14} />
                </button>
              )}
            </m.span>
          )}
        </AnimatePresence>
      </div>
      {/* Room for the folded edges: set at once, the feed's slide (useFeedFlip) carries the stacks below. */}
      <div className="ch-bst-pile" style={{ paddingBottom: folded ? PEEK * Math.min(rest.length, 2) : 0 }}>
        <AnimatePresence initial={false} mode="popLayout">
          <m.div
            key={notificationKey(top)}
            className="ch-bst-top"
            // A new top card (the one above it was cleared) rises out of the stack's first edge.
            initial={reduced ? false : { transform: `translate(0px, ${PEEK}px) scale(${1 - NARROW})`, opacity: 0.6 }}
            animate={{ transform: 'translate(0px, 0px) scale(1)', opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={settle}
          >
            <Card
              item={top}
              reduced={reduced}
              swipe={swipe}
              more={folded ? moreLabel(stack) : null}
              expandLabel={folded ? `Show ${stack.items.length} ${label} notifications` : undefined}
              expanded={multi ? open : undefined}
              onTap={folded ? onToggle : () => onOpen(top)}
              onClear={() => onClear([top])}
            />
          </m.div>
        </AnimatePresence>
        {/* The folded cards' edges: glass under the top card, each a little lower and narrower. They spread out from
            behind it as the drop lands, on the same spring, and tuck back in as the stack fans open. */}
        <AnimatePresence>
          {folded &&
            rest.slice(0, 2).map((_, i) => (
              <m.span
                key={`edge-${i}`}
                className="ch-bst-shell"
                aria-hidden="true"
                style={{ zIndex: -1 - i }}
                initial={{ transform: 'translate(0px, 0px) scaleX(1)', opacity: 0 }}
                animate={{ transform: `translate(0px, ${PEEK * (i + 1)}px) scaleX(${1 - NARROW * (i + 1)})`, opacity: i === 0 ? 0.82 : 0.55 }}
                exit={{ transform: `translate(0px, ${PEEK * (i + 1) + 18}px) scaleX(1)`, opacity: 0 }}
                transition={smooth}
              />
            ))}
        </AnimatePresence>
        {/* The fan takes its full height at once and its cards slide out from under the top card; folding, it is lifted out
            of the flow while they slide back, and the stacks below rise (useFeedFlip). */}
        <AnimatePresence initial={false} mode="popLayout">
          {open && multi && (
            <m.div key="fan" className="ch-bst-fan">
              <m.div
                className="ch-bst-fan__cards"
                // The fanned cards slide down out from under the top card as one, and fold back up under it.
                initial={reduced ? false : { transform: `translate(0px, -36px) scale(${1 - NARROW})`, opacity: 0 }}
                animate={{ transform: 'translate(0px, 0px) scale(1)', opacity: 1 }}
                exit={{ transform: `translate(0px, -36px) scale(${1 - NARROW})`, opacity: 0 }}
                transition={smooth}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {rest.map((it) => (
                    <m.div key={notificationKey(it)} className="ch-bst-fan__item" initial={false} exit={{ opacity: 0 }} transition={smooth}>
                      <Card item={it} reduced={reduced} swipe={swipe} onTap={() => onOpen(it)} onClear={() => onClear([it])} />
                    </m.div>
                  ))}
                </AnimatePresence>
              </m.div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </m.section>
  );
}

/** How far a card must be dragged (a share of its width), or how fast thrown (px/s), to clear. */
const CLEAR_AT = 0.34;
const THROW = 650;

/** The "Mark read" label's opacity for how far the card is pulled left: 0.35 at 40px, all of it by 140px. */
function revealAt(x: number): number {
  const d = Math.min(Math.max(-x, 0), 140);
  return d <= 40 ? (d / 40) * 0.35 : 0.35 + ((d - 40) / 100) * 0.65;
}

function Card({
  item,
  reduced,
  swipe,
  more = null,
  expandLabel,
  expanded,
  onTap,
  onClear,
}: {
  item: UnifiedNotificationItem;
  reduced: boolean;
  swipe: boolean;
  more?: string | null;
  expandLabel?: string;
  expanded?: boolean;
  onTap: () => void;
  onClear: () => void;
}) {
  const kind = CH_NOTIFICATION_KIND[item.category];
  const dragged = useRef(false);
  const clearLabel = useRef<HTMLSpanElement>(null);
  const unread = isUnread(item);
  const canSwipe = swipe && unread && !reduced;

  /**
   * The swipe to mark read, on pointer events. Motion's drag measured every draggable card through its layout projection
   * each time the card rendered, and a clear or a fold renders the whole feed, so the cards forced the drop's layout
   * mid-frame (the throw's long frames). The card follows the finger once the move is more across than down (down is
   * the list's scroll), with the give the drag had: 0.9 of the finger to the left, 0.06 to the right. The release plays
   * on the compositor (WAAPI `translate`), at the speed it was let go.
   */
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canSwipe || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = e.currentTarget;
    const label = clearLabel.current;
    const id = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let lock: 'x' | 'y' | null = null;
    let dx = 0;
    let at = 0;
    let v = 0;
    let last = x0;
    let lastT = performance.now();
    // On the window, as a drag's listeners are: a mouse that leaves the card still moves it.
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const now = performance.now();
      v = 0.8 * ((ev.clientX - last) / Math.max(1, now - lastT)) + 0.2 * v;
      last = ev.clientX;
      lastT = now;
      dx = ev.clientX - x0;
      if (!lock) {
        const dy = ev.clientY - y0;
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (lock === 'y') return stop();
        dragged.current = true;
        try {
          el.setPointerCapture(id);
        } catch {
          // A pointer that already went away.
        }
        // A spring back still playing gives way to the finger.
        el.getAnimations?.().forEach((a) => a.cancel());
        label?.getAnimations?.().forEach((a) => a.cancel());
      }
      at = dx < 0 ? dx * 0.9 : dx * 0.06;
      el.style.translate = `${at}px 0`;
      if (label) label.style.opacity = String(revealAt(at));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      stop();
      if (lock !== 'x') return;
      window.setTimeout(() => {
        dragged.current = false;
      }, 0);
      const vx = v * 1000;
      const width = el.offsetWidth || 360;
      if (ev.type === 'pointerup' && (dx < -width * CLEAR_AT || vx < -THROW)) {
        haptic('select');
        const to = -width - 40;
        const away = chSpringCurve('smooth', { velocity: vx / (to - at || -1) });
        el.style.translate = `${to}px 0`;
        const leave = el.animate?.([{ translate: `${at}px 0` }, { translate: `${to}px 0` }], { duration: away.ms, easing: away.linear });
        if (leave) void leave.finished.then(onClear, () => {});
        else onClear();
      } else if (at) {
        const back = chSpringCurve('settle', { velocity: vx / -at });
        const shown = revealAt(at);
        el.style.translate = '';
        if (label) label.style.opacity = '0';
        el.animate?.([{ translate: `${at}px 0` }, { translate: '0 0' }], { duration: back.ms, easing: back.linear });
        label?.animate?.([{ opacity: shown }, { opacity: 0 }], { duration: back.ms, easing: back.linear });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div className="ch-bst-cardwrap">
      {canSwipe && (
        <span ref={clearLabel} className="ch-bst-clear" style={{ opacity: 0 }} aria-hidden="true">
          Mark read
        </span>
      )}
      <button
        type="button"
        className="ch-bst-card"
        data-unread={unread || undefined}
        aria-label={expandLabel}
        aria-expanded={expanded}
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onClick={() => {
          if (dragged.current) return;
          onTap();
        }}
      >
        <span className="ch-bst-card__app">
          <span className="ch-bst-card__ic">
            <Icon icon={kind.icon} size={13} />
          </span>
          <span>{kind.label}</span>
          <span className="ch-bst-card__when ch-num">
            {unread && (
              <>
                <span className="ch-bst-card__dot" aria-hidden="true" />
                <span className="ch-sr-only">Unread, </span>
              </>
            )}
            {ago(item.created_at)}
          </span>
        </span>
        <span className="ch-bst-card__t">{item.title}</span>
        {item.body && <span className="ch-bst-card__b">{item.body}</span>}
        {more && <span className="ch-bst-card__more">{more}</span>}
      </button>
    </div>
  );
}
