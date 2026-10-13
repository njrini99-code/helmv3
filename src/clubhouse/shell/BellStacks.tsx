'use client';

import { AnimatePresence, animate, m, useMotionValue, useTransform } from 'motion/react';
import { BellOff, CalendarDays, ClipboardCheck, Eye, Megaphone, MessageSquare, Sparkles, Users, X, type LucideIcon } from 'lucide-react';
import { memo, useMemo, useRef, useState } from 'react';
import { isUnread, type NotificationCategoryId, type UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { haptic } from '../lib/haptics';
import { chSpring } from '../lib/motion';
import { Icon } from '../ui/Icon';
import { InlineNotice } from '../ui/Notices';
import { ago, moreLabel, notificationKey, openStack, stackFeed, type ChNotificationStack } from './notification-stacks';

/** Each kind's glyph and name: the settings panel's notification categories. */
export const CH_NOTIFICATION_KIND: Record<NotificationCategoryId, { icon: LucideIcon; label: string }> = {
  messages: { icon: MessageSquare, label: 'Messages' },
  events: { icon: CalendarDays, label: 'Events' },
  announcements: { icon: Megaphone, label: 'Announcements' },
  tasks: { icon: ClipboardCheck, label: 'Tasks' },
  coachhelm: { icon: Sparkles, label: 'CoachHelm' },
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
 */
/**
 * Re-rendered only when the feed, its failure or the motion setting change: opening and closing the drop (the bell's
 * own state) never re-renders the cards, so nothing but transforms happens while it moves. The handlers it is given only
 * reach for state setters and the router, so an older one does the same as a newer one.
 */
export const BellStacks = memo(BellStacksView, (a, b) => a.items === b.items && a.failed === b.failed && a.reduced === b.reduced);

function BellStacksView({
  items,
  failed,
  reduced,
  onRetry,
  onOpen,
  onClear,
}: {
  items: UnifiedNotificationItem[] | null;
  failed: boolean;
  reduced: boolean;
  onRetry: () => void;
  onOpen: (item: UnifiedNotificationItem) => void;
  onClear: (items: UnifiedNotificationItem[]) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const feed = useMemo(() => stackFeed(items ?? []), [items]);
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
    <div className="ch-bst-feed">
      {feed.fresh.length === 0 && (
        <m.div className="ch-bst-empty" data-ch-code="CH-1302" initial={reduced ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={chSpring('settle', reduced)}>
          <span className="ch-bst-empty__ic">
            <Icon icon={BellOff} size={20} />
          </span>
          <b>You’re all caught up</b>
          <span>Messages, events, reminders and CoachHelm updates land here first.</span>
        </m.div>
      )}
      {/* A stack cleared to nothing closes its gap on the spring, so the stacks under it rise instead of jumping. */}
      <AnimatePresence initial={false}>
        {feed.fresh.map((s) => (
          <Stack key={s.key} stack={s} open={open === s.key} reduced={reduced} onToggle={() => toggle(s.key)} onOpen={onOpen} onClear={onClear} />
        ))}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {feed.earlier && <Stack key="earlier" stack={feed.earlier} open={open === feed.earlier.key} reduced={reduced} onToggle={() => toggle('earlier')} onOpen={onOpen} onClear={onClear} />}
      </AnimatePresence>
    </div>
  );
}

function Stack({
  stack,
  open,
  reduced,
  onToggle,
  onOpen,
  onClear,
}: {
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
      className="ch-bst-stack"
      aria-label={stack.kind === 'earlier' ? 'Earlier notifications' : `${label}, ${stack.unread} new`}
      initial={reduced ? false : { opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ height: 0, marginBottom: 0, opacity: 0 }}
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
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
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
      <m.div className="ch-bst-pile" initial={false} animate={{ paddingBottom: folded ? PEEK * Math.min(rest.length, 2) : 0 }} transition={smooth}>
        <AnimatePresence initial={false} mode="popLayout">
          <m.div
            key={notificationKey(top)}
            className="ch-bst-top"
            // A new top card (the one above it was cleared) rises out of the stack's first edge.
            initial={reduced ? false : { y: PEEK, scale: 1 - NARROW, opacity: 0.6 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
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
                initial={{ y: 0, scaleX: 1, opacity: 0 }}
                animate={{ y: PEEK * (i + 1), scaleX: 1 - NARROW * (i + 1), opacity: i === 0 ? 0.82 : 0.55 }}
                exit={{ y: PEEK * (i + 1) + 18, scaleX: 1, opacity: 0 }}
                transition={smooth}
              />
            ))}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {open && multi && (
            <m.div key="fan" className="ch-bst-fan" initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={smooth}>
              <m.div
                className="ch-bst-fan__cards"
                // The fanned cards slide down out from under the top card as one, and fold back up under it.
                initial={reduced ? false : { y: -36, scale: 1 - NARROW, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ y: -36, scale: 1 - NARROW, opacity: 0 }}
                transition={smooth}
              >
                <AnimatePresence initial={false}>
                  {rest.map((it) => (
                    <m.div
                      key={notificationKey(it)}
                      className="ch-bst-fan__item"
                      initial={false}
                      exit={{ height: 0, marginTop: 0, opacity: 0 }}
                      transition={smooth}
                    >
                      <Card item={it} reduced={reduced} swipe={swipe} onTap={() => onOpen(it)} onClear={() => onClear([it])} />
                    </m.div>
                  ))}
                </AnimatePresence>
              </m.div>
            </m.div>
          )}
        </AnimatePresence>
      </m.div>
    </m.section>
  );
}

/** How far a card must be dragged (a share of its width), or how fast thrown (px/s), to clear. */
const CLEAR_AT = 0.34;
const THROW = 650;

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
  const x = useMotionValue(0);
  const reveal = useTransform(x, [-140, -40, 0], [1, 0.35, 0]);
  const dragged = useRef(false);
  const self = useRef<HTMLButtonElement>(null);
  const unread = isUnread(item);
  const canSwipe = swipe && unread && !reduced;
  return (
    <div className="ch-bst-cardwrap">
      {canSwipe && (
        <m.span className="ch-bst-clear" style={{ opacity: reveal }} aria-hidden="true">
          Mark read
        </m.span>
      )}
      <m.button
        ref={self}
        type="button"
        className="ch-bst-card"
        data-unread={unread || undefined}
        aria-label={expandLabel}
        aria-expanded={expanded}
        style={{ x, touchAction: 'pan-y' }}
        drag={canSwipe ? 'x' : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.9, right: 0.06 }}
        dragMomentum={false}
        dragSnapToOrigin={false}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={(_, info) => {
          const width = self.current?.offsetWidth ?? 360;
          if (info.offset.x < -width * CLEAR_AT || info.velocity.x < -THROW) {
            haptic('select');
            void animate(x, -width - 40, chSpring('smooth', false, info.velocity.x)).then(onClear);
          } else void animate(x, 0, chSpring('settle', false, info.velocity.x));
          window.setTimeout(() => {
            dragged.current = false;
          }, 0);
        }}
        whileTap={reduced ? undefined : { scale: 0.985 }}
        transition={chSpring('settle', reduced)}
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
      </m.button>
    </div>
  );
}
