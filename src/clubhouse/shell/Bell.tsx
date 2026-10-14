'use client';

import { AnimatePresence, animate, m, useMotionValue } from 'motion/react';
import { Bell as BellIcon, BellOff, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { isSafeInternalPath } from '@/lib/utils/safe-redirect';
import { getUnifiedNotifications, markAllNotificationsRead, markNotificationRead } from '@/app/golf/actions/unified-notifications';
import {
  DAY_BUCKET_LABEL,
  NOTIFICATION_CATEGORY_IDS,
  countByCategory,
  groupByDayBucket,
  isUnread,
  itemMatchesFilter,
  type NotificationFilter,
  type UnifiedNotificationItem,
} from '@/app/golf/actions/unified-notifications-model';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { InlineNotice } from '../ui/Notices';
import { Menu } from '../ui/Menu';
import { EmptyState, Skeleton } from '../ui/States';
import { haptic } from '../lib/haptics';
import { CH_POP, chSpring, chSpringCurve } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { useChPhone } from '../lib/use-phone';
import { useSectionSwitch } from './section-switch';
import { BellStacks, CH_NOTIFICATION_KIND } from './BellStacks';
import { ago, markLocallyRead, notificationKey } from './notification-stacks';
import { chReport, chTrail } from '../lib/track';
import { useAction, type ServerResult } from '../lib/use-action';

/**
 * The notifications bell: the same feed, badge and read state as the
 * current app's bell (`getUnifiedNotifications`, the 45s badge poll in
 * NotificationBadgeProvider, mark one or all read), in Clubhouse's voice.
 * The list is fetched when the panel opens; a warm list stays on screen
 * while it refreshes. On the phone the panel is a sheet (MOBILE.md: popovers
 * become sheets): it rises over a scrim, is modal (CH-1811), and drags shut
 * (CH-1611).
 */

export interface ChBellApi {
  unread: number;
  load: () => Promise<ServerResult<{ items: UnifiedNotificationItem[] }>>;
  markRead: (item: UnifiedNotificationItem) => Promise<unknown>;
  markAll: () => Promise<ServerResult<unknown>>;
  refetchCount: () => void;
}

const FEED_LIMIT = 30;

/**
 * The drop's arrival: the reveal spring, ended once it is within 1% of its mark and rescaled so it lands there without a
 * step. The spring alone spent its last 300ms creeping the final few dozen pixels of the veil (827ms in all, measured on
 * the Simulator, 2026-10-14); this lands in about 660ms on the same curve.
 */
const REVEAL_IN = (() => {
  const c = chSpringCurve('reveal', { rest: 0.01 });
  const top = c.ease(0.9999);
  return { duration: c.ms / 1000, ease: (p: number) => (p >= 1 ? 1 : Math.min(1, c.ease(p) / top)) };
})();
const W = 380;

const BellSource = createContext<ChBellApi | null>(null);

const noSubscribe = () => () => {};

/** Preview only: a fixture feed in place of the live actions. */
export function BellSourceProvider({ api, children }: { api: ChBellApi; children: ReactNode }) {
  return <BellSource.Provider value={api}>{children}</BellSource.Provider>;
}

function useLiveBell(): ChBellApi {
  const badges = useNotificationBadges();
  const refetch = badges.refetch;
  return useMemo(
    () => ({
      unread: badges.notificationsUnread + badges.calendarNotifications,
      load: () => getUnifiedNotifications({ limit: FEED_LIMIT }),
      markRead: (item: UnifiedNotificationItem) => markNotificationRead(item.id, item.source).then(() => refetch()),
      markAll: () => markAllNotificationsRead(),
      refetchCount: () => void refetch(),
    }),
    [badges.notificationsUnread, badges.calendarNotifications, refetch],
  );
}

const CATEGORY = CH_NOTIFICATION_KIND;

export { ago };

export function Bell() {
  const preview = useContext(BellSource);
  const live = useLiveBell();
  const api = preview ?? live;
  const router = useRouter();
  const id = useId();
  const reduced = useChReducedMotion();
  const phone = useChPhone();
  // The portal waits for hydration: the server has no document, and the phone drop is always rendered once it exists.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  // The feed starts loading as the finger lands on the bell, so on a phone the cards are there before the drop lands
  // and nothing swaps under it mid-motion. Cleared on close, so the next open fetches fresh.
  const [primed, setPrimed] = useState(false);
  const wanted = open || primed;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [items, setItems] = useState<UnifiedNotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [attempt, setAttempt] = useState(0);
  const load = api.load;

  const close = useCallback((focus = true) => {
    setOpen(false);
    setPrimed(false);
    if (focus) btn.current?.focus({ preventScroll: true });
  }, []);
  const sw = useSectionSwitch();
  // CH-1612 (owner 2026-10-12, with the section strip): on the phone the sheet drops from under the top bar, as the strip
  // does, on the smooth spring, and goes back up under it on the same spring, at the speed it was thrown when swiped up.
  const sheetY = useMotionValue(0);
  const fling = useRef(0);
  const sheetMotion = {
    // The stacks drop from under the bar and land with the settle spring's slight give, a touch smaller as they come.
    // Transform and opacity only, nothing that re-rasterizes (no scale, no blur), so WebKit keeps it on the compositor.
    shown: { y: 0, opacity: 1, visibility: 'visible', transition: reduced ? { duration: 0 } : { ...REVEAL_IN, opacity: chSpring('smooth') } },
    gone: () => {
      if (reduced) return { opacity: 0, transition: { duration: 0 }, transitionEnd: { visibility: 'hidden' } };
      // Back up under the bar from where the finger left it, at the speed it was thrown, fading as it goes.
      const from = sheetY.get();
      const travel = 140;
      const left = travel + from;
      const out = chSpringCurve('smooth', { velocity: left > 0 ? fling.current / left : 0, rest: 0.5 / Math.max(left, 1) });
      fling.current = 0;
      return { y: [from, -travel], opacity: 0, transition: { duration: out.ms / 1000, ease: out.ease }, transitionEnd: { visibility: 'hidden' } };
    },
  };
  /** The sheet follows the finger up from its header or grab (CH-1611): past a third of its height, or flicked, it closes. */
  const onSheetDrag = (e: ReactPointerEvent) => {
    if (reduced || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const start = e.clientY;
    const el = e.currentTarget as HTMLElement;
    let last = start;
    let lastT = performance.now();
    let v = 0;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that already went away.
    }
    const move = (ev: PointerEvent) => {
      const now = performance.now();
      v = 0.8 * ((ev.clientY - last) / Math.max(1, now - lastT)) + 0.2 * v;
      last = ev.clientY;
      lastT = now;
      const dy = ev.clientY - start;
      sheetY.set(dy < 0 ? dy : dy * 0.15);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      const h = panel.current?.offsetHeight ?? 600;
      if (sheetY.get() < -h / 3 || v < -0.5) {
        fling.current = -v * 1000;
        haptic('commit');
        close();
      } else animate(sheetY, 0, chSpring('smooth', false, v * 1000));
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // The phone drop opens on its cards: the feed is read once the page settles, so the first open of a visit doesn't start
  // on the skeleton and swap the feed in mid-drop, which jumped the cards and stalled the drop (Simulator, 2026-10-14).
  // Opening still reads it again, and that read wins.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!phone) return;
    let live = true;
    const run = () => {
      loadRef
        .current()
        .then((r) => {
          if (live && r && (r.success || r.ok) && r.data) {
            const next = r.data.items;
            setItems((prev) => prev ?? next);
          }
        })
        .catch(() => {
          // The open reads it again and reports a failure there.
        });
    };
    const idle = typeof window.requestIdleCallback === 'function';
    const handle = idle ? window.requestIdleCallback(run, { timeout: 3000 }) : window.setTimeout(run, 1500);
    return () => {
      live = false;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [phone]);

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    load()
      .then((r) => {
        if (!live) return;
        if (r && (r.success || r.ok) && r.data) {
          const next = r.data.items;
          // The same feed again keeps the same list, so a refresh that lands mid-drop re-renders nothing.
          const same = (prev: UnifiedNotificationItem[] | null) =>
            !!prev && prev.length === next.length && prev.every((i, k) => i.id === next[k]!.id && i.source === next[k]!.source && i.read_at === next[k]!.read_at && i.title === next[k]!.title);
          setItems((prev) => (same(prev) ? prev : next));
          setFailed(false);
        } else {
          setFailed(true);
          chReport(new Error(r?.error || 'notifications read failed'), { surface: 'shell.bell', action: 'load', severity: 'low' });
        }
      })
      .catch((err: unknown) => {
        if (!live) return;
        setFailed(true);
        chReport(err, { surface: 'shell.bell', action: 'load' });
      });
    return () => {
      live = false;
    };
  }, [wanted, load, attempt]);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      setPos({ left: Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8)), top: r.bottom + 6 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // The filter menu portals outside the panel; a pick in it isn't an outside click.
      if (t instanceof Element && t.closest('.ch-menu')) return;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.ch-menu')) return;
      if (e.key === 'Escape') close();
      // The phone sheet is modal: Tab stays inside it.
      if (e.key === 'Tab' && phone && panel.current) {
        const all = [...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
        const first = all[0];
        const last = all[all.length - 1];
        const at = document.activeElement;
        if (!first || !last) return;
        if (!panel.current.contains(at) || (e.shiftKey && at === first) || (!e.shiftKey && at === last)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    // The desktop popover isn't modal: when focus leaves it for the page (Tab past its last item), it closes, rather than
    // staying open over a page the keyboard is now walking (audit A-30).
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (phone || !(t instanceof Element) || t.closest('.ch-menu')) return;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    const frame = requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, close, phone]);

  const markAll = useAction('shell.markAllRead', api.markAll, { done: 'All notifications marked read', failed: "Couldn't mark your notifications read", code: 'CH-1001' });

  /** Marks items read where the coach cleared them (a swipe, a stack's ×): the feed restacks at once, the server follows. */
  const clearItems = (list: UnifiedNotificationItem[]) => {
    const unreadOnes = list.filter(isUnread);
    if (!unreadOnes.length) return;
    chTrail('bell clear', { count: unreadOnes.length });
    const keys = new Set(unreadOnes.map(notificationKey));
    setItems((prev) => (prev ? markLocallyRead(prev, keys, new Date().toISOString()) : prev));
    for (const item of unreadOnes) void api.markRead(item).catch((err: unknown) => chReport(err, { surface: 'shell.bell', action: 'markRead', severity: 'low' }));
  };
  const markAllNow = async () => {
    const before = items;
    const at = new Date().toISOString();
    setItems((prev) => prev?.map((i) => ({ ...i, read_at: i.read_at ?? at })) ?? prev);
    const r = await markAll.run();
    if (r.success) api.refetchCount();
    else setItems(before);
  };

  const openItem = (item: UnifiedNotificationItem) => {
    haptic('select');
    chTrail('bell open notification', { category: item.category });
    if (isUnread(item)) {
      const at = new Date().toISOString();
      setItems((prev) => prev?.map((i) => (i.id === item.id && i.source === item.source ? { ...i, read_at: at } : i)) ?? prev);
      void api.markRead(item).catch((err: unknown) => chReport(err, { surface: 'shell.bell', action: 'markRead', severity: 'low' }));
    }
    close(false);
    // Stored links are only followed inside GolfHelm: a notification can never send someone off-site.
    if (isSafeInternalPath(item.action_url)) router.push(item.action_url);
  };

  const unread = api.unread;
  // The count is the badge's. While the list hasn't loaded the panel can't show what it counts, so its head says nothing
  // of it and offers no Mark all read (the button keeps its badge).
  const listFailed = failed && !items?.length;
  const shownUnread = listFailed ? 0 : unread;
  const list = items ?? [];
  const counts = countByCategory(list);
  const cats = NOTIFICATION_CATEGORY_IDS.filter((c) => counts[c] > 0);
  const groups = groupByDayBucket(list.filter((i) => itemMatchesFilter(i, filter)));

  const filterMenu = cats.length > 1 && (
    <Menu
      label="Show notifications"
      items={[
        { label: 'All', checked: filter === 'all', onSelect: () => setFilter('all') },
        ...cats.map((c) => ({ label: CATEGORY[c].label, icon: CATEGORY[c].icon, checked: filter === c, onSelect: () => setFilter(c) })),
      ]}
      trigger={(p) => (
        <button type="button" className="ch-btn ch-btn--ghost ch-btn--sm ch-bellp__filter" aria-label={`Show ${filter === 'all' ? 'all' : CATEGORY[filter].label}`} {...p}>
          {filter === 'all' ? 'All' : CATEGORY[filter].label}
          <Icon icon={ChevronDown} size={13} />
        </button>
      )}
    />
  );
  const markAllButton = (
    <Button
      size="sm"
      variant="ghost"
      disabled={unread === 0 || markAll.pending}
      onClick={() => void markAllNow()}
    >
      Mark all read
    </Button>
  );
  const body = (
    <div className="ch-bellp__body">
      {listFailed ? (
        <InlineNotice code="CH-1201" title="Notifications didn’t load" body="Try again; the error has been reported." onRetry={() => setAttempt((x) => x + 1)} />
      ) : items === null ? (
        <div className="ch-bellp__skel" aria-busy="true" aria-label="Loading notifications" data-ch-code="CH-1401">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="ch-bellp__skelrow">
              <Skeleton width={32} height={32} radius={9} />
              <span>
                <Skeleton width="70%" height={12} />
                <Skeleton width="45%" height={10} />
              </span>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        // The shared section empty (states audit, 2026-10-08): a flush line at the rows' inset, not a centred block.
        <EmptyState
          compact
          icon={BellOff}
          code={filter === 'all' ? 'CH-1302' : 'CH-1303'}
          title={filter === 'all' ? 'You’re all caught up' : 'Nothing of this kind'}
          body={filter === 'all' ? 'Messages, events, reminders and CoachHelm updates show up here.' : 'Clear the filter to see everything.'}
          action={
            filter !== 'all' && (
              <Button size="sm" variant="secondary" onClick={() => setFilter('all')}>
                Show all
              </Button>
            )
          }
        />
      ) : (
        groups.map((g) => (
          <section key={g.bucket} aria-label={DAY_BUCKET_LABEL[g.bucket]}>
            <div className="ch-bellp__day">{DAY_BUCKET_LABEL[g.bucket]}</div>
            {g.items.map((item) => {
              const cat = CATEGORY[item.category] ?? CATEGORY.messages;
              const unreadRow = isUnread(item);
              return (
                <button key={`${item.source}:${item.id}`} type="button" className={'ch-bellp__row' + (unreadRow ? ' is-unread' : '')} onClick={() => openItem(item)}>
                  <span className="ch-bellp__ic">
                    <Icon icon={cat.icon} size={15} />
                  </span>
                  <span className="ch-bellp__main">
                    <span className="ch-bellp__top">
                      <b>
                        {unreadRow && <span className="ch-sr-only">Unread: </span>}
                        {item.title}
                      </b>
                      <time className="ch-num" dateTime={item.created_at}>
                        {ago(item.created_at)}
                      </time>
                    </span>
                    {item.body && <span className="ch-bellp__txt">{item.body}</span>}
                  </span>
                  <span className="ch-bellp__dot" aria-hidden />
                </button>
              );
            })}
          </section>
        ))
      )}
    </div>
  );

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="ch-btn ch-btn--ghost ch-iconbtn ch-bell"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
        aria-expanded={open}
        aria-controls={id}
        onPointerDown={() => {
          if (!open) setPrimed(true);
        }}
        onClick={() => {
          // CH-1705: a tick as the bell opens; CH-1612: on the phone its sheet rises over a scrim; CH-1805: it is a dialog.
          haptic('select');
          if (open) return close(false);
          chTrail('bell open');
          sw?.setOpen(false);
          setOpen(true);
        }}
      >
        <Icon icon={BellIcon} size={16} />
        {unread > 0 && (
          <span className="ch-bell__count ch-num" aria-hidden>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {hydrated &&
        createPortal(
          <AnimatePresence>
            {/* The phone drop stays rendered, hidden and inert, so opening it only moves it: a first frame that has to
                render every card is the stutter it had (an 85ms frame at 4x CPU, 2026-10-12). */}
            {phone && (
              <m.div
                key="veil"
                className="ch-bst-veil"
                data-ui="clubhouse"
                aria-hidden="true"
                data-open={open || undefined}
                // The veil pours down from under the bar, its feathered edge leading (a static mask on a layer taller than
                // the screen, moved by transform alone, so the compositor carries it), and draws back up as the drop goes.
                initial={false}
                animate={
                  reduced
                    ? { opacity: open ? 1 : 0, y: '0%', visibility: open ? 'visible' : 'hidden', transition: { duration: 0 } }
                    : open
                      ? { y: '0%', opacity: 1, visibility: 'visible', transition: REVEAL_IN }
                      : { y: '-100%', opacity: 1, transition: chSpring('smooth'), transitionEnd: { visibility: 'hidden' } }
                }
                onClick={() => close()}
              />
            )}
            {phone && (
              <m.div
                key="sheet"
                ref={panel}
                id={id}
                role="dialog"
                aria-modal={open || undefined}
                aria-hidden={open ? undefined : true}
                inert={!open || undefined}
                aria-label="Notifications"
                // Read by the iOS swipe-back guard (NativeSwipeBackBridge): no edge swipe while the sheet is up.
                data-state={open ? 'open' : undefined}
                data-ch-code="CH-1811"
                tabIndex={-1}
                className="ch-bst"
                data-ui="clubhouse"
                style={{ y: sheetY }}
                initial={false}
                variants={sheetMotion}
                animate={open ? 'shown' : 'gone'}
              >
                {/* No OverlayScrollLock: freezing the body re-lays out the whole page in the drop's first frame (and again as
                    it closes), the stutter. The drop covers the screen and takes the touches (touch-action in shell.css),
                    and its list contains its own scroll, so the page under it cannot move anyway. */}
                <div className="ch-bst__head" onPointerDown={onSheetDrag}>
                  <b>Notifications</b>
                  {shownUnread > 0 && (
                    <button type="button" className="ch-bst__all" disabled={markAll.pending} onClick={() => void markAllNow()}>
                      Mark all read
                    </button>
                  )}
                </div>
                {/* A tap on the open space puts the drop away; the keyboard has Esc, so the space needs no key of its own. */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- see above */}
                <div
                  className="ch-bst__scroll"
                  onClick={(e) => {
                    if (e.target === e.currentTarget || (e.target as Element).classList?.contains('ch-bst-feed')) close();
                  }}
                >
                  <BellStacks items={items} failed={listFailed} onRetry={() => setAttempt((x) => x + 1)} onOpen={openItem} onClear={clearItems} />
                </div>
                <div className="ch-bst__grab" aria-hidden="true" onPointerDown={onSheetDrag} />
              </m.div>
            )}
            {open && !phone && (
              <m.div
                key="popover"
                ref={panel}
                id={id}
                role="dialog"
                aria-label="Notifications"
                tabIndex={-1}
                className="ch-bellp ch-popover"
                data-ui="clubhouse"
                style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: W }}
                {...(reduced ? {} : CH_POP)}
              >
                <div className="ch-bellp__head">
                  <b>
                    Notifications
                    {shownUnread > 0 && <span className="ch-num"> · {shownUnread} unread</span>}
                  </b>
                  {filterMenu}
                  {!listFailed && markAllButton}
                </div>
                {body}
              </m.div>
            )}
          </AnimatePresence>,
          document.querySelector('.ch-root') ?? document.body,
        )}
    </>
  );
}
