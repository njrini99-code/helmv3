'use client';

import { AnimatePresence, m } from 'framer-motion';
import { Bell as BellIcon, BellOff, ChevronDown, CalendarDays, ClipboardCheck, Eye, Megaphone, MessageSquare, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { getUnifiedNotifications, markAllNotificationsRead, markNotificationRead } from '@/app/golf/actions/unified-notifications';
import {
  DAY_BUCKET_LABEL,
  NOTIFICATION_CATEGORY_IDS,
  countByCategory,
  groupByDayBucket,
  isUnread,
  itemMatchesFilter,
  type NotificationCategoryId,
  type NotificationFilter,
  type UnifiedNotificationItem,
} from '@/app/golf/actions/unified-notifications-model';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { InlineNotice } from '../ui/Notices';
import { Menu } from '../ui/Menu';
import { Skeleton } from '../ui/States';
import { haptic } from '../lib/haptics';
import { CH_POP } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { chReport, chTrail } from '../lib/track';
import { useAction, type ServerResult } from '../lib/use-action';

/**
 * The notifications bell: the same feed, badge and read state as the
 * current app's bell (`getUnifiedNotifications`, the 45s badge poll in
 * NotificationBadgeProvider, mark one or all read), in Clubhouse's voice.
 * The list is fetched when the panel opens; a warm list stays on screen
 * while it refreshes.
 */

export interface ChBellApi {
  unread: number;
  load: () => Promise<ServerResult<{ items: UnifiedNotificationItem[] }>>;
  markRead: (item: UnifiedNotificationItem) => Promise<unknown>;
  markAll: () => Promise<ServerResult<unknown>>;
  refetchCount: () => void;
}

const FEED_LIMIT = 30;
const W = 380;

const BellSource = createContext<ChBellApi | null>(null);

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

const CATEGORY: Record<NotificationCategoryId, { icon: LucideIcon; label: string }> = {
  messages: { icon: MessageSquare, label: 'Messages' },
  events: { icon: CalendarDays, label: 'Events' },
  announcements: { icon: Megaphone, label: 'Announcements' },
  tasks: { icon: ClipboardCheck, label: 'Tasks' },
  coachhelm: { icon: Sparkles, label: 'CoachHelm' },
  pipeline: { icon: Users, label: 'Team' },
  profile_views: { icon: Eye, label: 'Profile' },
};

export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Bell() {
  const preview = useContext(BellSource);
  const live = useLiveBell();
  const api = preview ?? live;
  const router = useRouter();
  const id = useId();
  const reduced = useChReducedMotion();
  const btn = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [items, setItems] = useState<UnifiedNotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [attempt, setAttempt] = useState(0);
  const load = api.load;

  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    let live = true;
    load()
      .then((r) => {
        if (!live) return;
        if (r && (r.success || r.ok) && r.data) {
          setItems(r.data.items);
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
  }, [open, load, attempt]);

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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.ch-menu') && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => panel.current?.focus());
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const markAll = useAction('shell.markAllRead', api.markAll, { done: 'All notifications marked read', failed: "Couldn't mark your notifications read" });

  const openItem = (item: UnifiedNotificationItem) => {
    haptic('select');
    chTrail('bell open notification', { category: item.category });
    if (isUnread(item)) {
      const at = new Date().toISOString();
      setItems((prev) => prev?.map((i) => (i.id === item.id && i.source === item.source ? { ...i, read_at: at } : i)) ?? prev);
      void api.markRead(item).catch((err: unknown) => chReport(err, { surface: 'shell.bell', action: 'markRead', severity: 'low' }));
    }
    close(false);
    if (item.action_url) router.push(item.action_url);
  };

  const unread = api.unread;
  const list = items ?? [];
  const counts = countByCategory(list);
  const cats = NOTIFICATION_CATEGORY_IDS.filter((c) => counts[c] > 0);
  const groups = groupByDayBucket(list.filter((i) => itemMatchesFilter(i, filter)));

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
        onClick={() => {
          haptic('select');
          if (!open) chTrail('bell open');
          setOpen((o) => !o);
        }}
      >
        <Icon icon={BellIcon} size={16} />
        {unread > 0 && (
          <span className="ch-bell__count ch-num" aria-hidden>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <m.div
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
                    {unread > 0 && <span className="ch-num"> · {unread} unread</span>}
                  </b>
                  {cats.length > 1 && (
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
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={unread === 0 || markAll.pending}
                    onClick={async () => {
                      const before = items;
                      const at = new Date().toISOString();
                      setItems((prev) => prev?.map((i) => ({ ...i, read_at: i.read_at ?? at })) ?? prev);
                      const r = await markAll.run();
                      if (r.success) api.refetchCount();
                      else setItems(before);
                    }}
                  >
                    Mark all read
                  </Button>
                </div>
                <div className="ch-bellp__body">
                  {failed && !items?.length ? (
                    <InlineNotice title="Notifications didn't load." body="Try again; the error has been reported." onRetry={() => setAttempt((x) => x + 1)} />
                  ) : items === null ? (
                    <div className="ch-bellp__skel" aria-busy="true" aria-label="Loading notifications">
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
                    <div className="ch-bellp__empty">
                      <Icon icon={BellOff} size={18} />
                      <b>{filter === 'all' ? "You're all caught up." : 'Nothing of this kind.'}</b>
                      <span>{filter === 'all' ? 'Messages, events, reminders and CoachHelm updates show up here.' : 'Clear the filter to see everything.'}</span>
                      {filter !== 'all' && (
                        <Button size="sm" variant="secondary" onClick={() => setFilter('all')}>
                          Show all
                        </Button>
                      )}
                    </div>
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
              </m.div>
            )}
          </AnimatePresence>,
          document.querySelector('.ch-root') ?? document.body,
        )}
    </>
  );
}
