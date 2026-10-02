'use client';

import Link from 'next/link';
import { LinkPending } from './LinkPending';
import { AnimatePresence, m } from 'framer-motion';
import { ChevronRight, LayoutGrid, LifeBuoy, LogOut, Settings, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { chSignOut } from '../lib/sign-out';
import { chReport } from '../lib/track';
import { haptic } from '../lib/haptics';
import { chTween } from '../lib/motion';
import { useSheetDrag } from '../lib/sheet-drag';
import { useChReducedMotion } from '../lib/reduced-motion';
import type { ChShellData } from '../data/shell';
import { activeNavItem, phoneTabsFor, type ChRole } from './nav';
import { usePhoneChromeState } from './phone-chrome';
import { badgeCount } from './Sidebar';
import { MoreTeamSwitch } from './TeamSwitch';
import type { ChTeamSwitch } from './team-switch';

/**
 * Phone navigation (owner design, D-40): the ivory glass tab bar, four
 * destinations per role plus More, the active tab in green. A selection tick
 * on every tab change; More opens a sheet with the rest of the app (D-41).
 * When Messages lives under More, its unread count rolls up onto More.
 *
 * The sheet follows the v2 More board (m-ch.jsx `MoreM`): who you are (it
 * opens Settings), the rest of the app with the next event under Calendar,
 * then Settings, Help and Sign out.
 */
export function TabBar({
  pathname,
  shell,
  role,
  user,
  teamSwitch = null,
}: {
  pathname: string;
  shell: ChShellData;
  role: ChRole;
  user?: { name: string; teamName?: string | null };
  /** The coach's teams when they can switch among them: the More sheet lists them under who they are. */
  teamSwitch?: ChTeamSwitch | null;
}) {
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  const signOut = async () => {
    haptic('press');
    setLeaving(true);
    try {
      await chSignOut();
    } catch (err) {
      // CH-1002: the session is still open, so nothing is lost; say so and let them try again.
      chReport(err, { surface: 'shell.more', action: 'signOut' });
      haptic('error');
      setLeaving(false);
      toast({ tone: 'error', title: "Couldn't sign out", body: 'You are still signed in. Try again.', code: 'CH-1002', action: { label: 'Retry', run: () => void signOut() } });
    }
  };
  const badges = useNotificationBadges();
  const reduced = useChReducedMotion();
  const { immersive } = usePhoneChromeState();
  const [moreOpen, setMoreOpen] = useState(false);
  const current = activeNavItem(pathname, role);
  const { tabs, more: rest } = phoneTabsFor(role);
  const moreActive = !!current && !tabs.some((t) => t.id === current.id);
  const messagesUnderMore = rest.find((i) => i.badge === 'messages');
  const moreCount = messagesUnderMore ? badgeCount(messagesUnderMore, badges, shell) : null;

  const moreBtn = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const drag = useSheetDrag(sheet, closeMore, { enabled: !reduced });

  useEffect(() => setMoreOpen(false), [pathname]);
  // The sheet is modal: focus moves into it, Tab stays inside, Esc closes it,
  // and focus returns to More when it closes (CH-1802).
  useEffect(() => {
    if (!moreOpen) return;
    const trigger = moreBtn.current;
    // The sheet mounts in the same commit, so it can take focus right away.
    sheet.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setMoreOpen(false);
      if (e.key !== 'Tab' || !sheet.current) return;
      const els = Array.from(sheet.current.querySelectorAll<HTMLElement>('a, button'));
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Back on More without a ring after a tap (F-46); a keyboard user still lands on it.
      trigger?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    };
  }, [moreOpen]);

  return (
    <>
      <nav className="ch-tabbar" aria-label="Main" data-ch-code="CH-1808" inert={immersive || undefined}>
        {tabs.map((t) => {
          const count = badgeCount(t, badges, shell);
          const active = current?.id === t.id;
          return (
            <Link
              key={t.id}
              href={t.href}
              className="ch-tab"
              // CH-1803: the current tab is marked; CH-1701: changing tabs ticks, tapping the current one does not.
              aria-current={active ? 'page' : undefined}
              onClick={() => !active && haptic('select')}
            >
              <span className="ch-tab__icon">
                <Icon icon={t.icon} size={21} />
                {count != null && (
                  <span className="ch-tab__badge ch-num" aria-hidden="true">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>
              <span className="ch-tab__label">{t.label}</span>
              {count != null && <span className="ch-sr-only">, {count} new</span>}
              <LinkPending />
            </Link>
          );
        })}
        <button
          ref={moreBtn}
          type="button"
          className="ch-tab"
          aria-current={moreActive ? 'page' : undefined}
          aria-expanded={moreOpen}
          aria-controls="ch-more"
          aria-label={moreCount != null ? `More, ${moreCount} unread ${moreCount === 1 ? 'message' : 'messages'}` : 'More'}
          onClick={() => {
            // CH-1704: the tick as More opens (the swipe-shut tap is useSheetDrag's); CH-1602: the sheet rises over its scrim.
            haptic('select');
            setMoreOpen((o) => !o);
          }}
        >
          <span className="ch-tab__icon">
            <Icon icon={LayoutGrid} size={21} />
            {moreCount != null && (
              <span className="ch-tab__badge ch-num" aria-hidden="true">
                {moreCount > 99 ? '99+' : moreCount}
              </span>
            )}
          </span>
          <span className="ch-tab__label">More</span>
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <>
            <m.div
              key="scrim"
              className="ch-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={chTween('base')}
              onClick={() => setMoreOpen(false)}
            />
            <m.div
              ref={sheet}
              key="sheet"
              id="ch-more"
              data-ch-code="CH-1802"
              role="dialog"
              // Read by the iOS swipe-back guard (NativeSwipeBackBridge): no edge swipe while the sheet is up.
              data-state="open"
              aria-modal="true"
              aria-label="More"
              className="ch-more"
              initial={reduced ? { opacity: 0 } : { y: '100%' }}
              animate={reduced ? { opacity: 1 } : { y: 0 }}
              exit={reduced ? { opacity: 0 } : { y: '100%' }}
              transition={chTween('base')}
            >
              <div className="ch-more__grab" aria-hidden="true" onPointerDown={drag.onPointerDown} />
              <div className="ch-more__head" onPointerDown={drag.onPointerDown}>
                <span>More</span>
                <button type="button" className="ch-more__x" aria-label="Close" onClick={() => setMoreOpen(false)}>
                  <Icon icon={X} size={16} />
                </button>
              </div>
              {user && (
                <Link href="/golf/dashboard/settings" className="ch-more__me" onClick={() => haptic('select')}>
                  <Avatar name={user.name} size={44} />
                  <span className="ch-more__me-t">
                    <b>{user.name}</b>{' '}
                    <em>{[role === 'coach' ? 'Coach' : 'Player', user.teamName].filter(Boolean).join(' · ')}</em>
                  </span>
                  <Icon icon={ChevronRight} size={16} />
                </Link>
              )}
              {teamSwitch && <MoreTeamSwitch model={teamSwitch} onSwitched={closeMore} />}
              <div className="ch-more__list">
                {rest.map((i) => {
                  const count = 'badge' in i && i.badge ? badgeCount(i, badges, shell) : null;
                  return (
                    <Link
                      key={i.id}
                      href={i.href}
                      className="ch-more__row"
                      aria-current={current?.id === i.id ? 'page' : undefined}
                      onClick={() => haptic('select')}
                    >
                      <span className="ch-more__ic">
                        <Icon icon={i.icon} size={17} />
                      </span>
                      {i.id === 'calendar' && shell.nextEvent ? (
                        <span className="ch-more__label">
                          {i.label}{' '}
                          <span className="ch-more__sub ch-num">
                            {shell.nextEvent.whenLabel} · {shell.nextEvent.title}
                          </span>
                        </span>
                      ) : (
                        <span className="ch-more__label">{i.label}</span>
                      )}
                      {/* The spaces are text nodes, so the link is named "Messages 3 new", not "Messages3new". */}
                      {count != null && (
                        <>
                          {' '}
                          <span className="ch-more__count ch-num">
                            {count > 99 ? '99+' : count}{' '}
                            <span className="ch-sr-only">new</span>
                          </span>
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
              <div className="ch-more__list">
                <Link href="/golf/dashboard/settings" className="ch-more__row" aria-current={current?.id === 'settings' ? 'page' : undefined} onClick={() => haptic('select')}>
                  <span className="ch-more__ic">
                    <Icon icon={Settings} size={17} />
                  </span>
                  <span className="ch-more__label">Settings</span>
                </Link>
                <Link href="/golf/dashboard/settings#set-help" className="ch-more__row" onClick={() => haptic('select')}>
                  <span className="ch-more__ic">
                    <Icon icon={LifeBuoy} size={17} />
                  </span>
                  <span className="ch-more__label">Help</span>
                </Link>
                <button type="button" className="ch-more__row" onClick={() => void signOut()} disabled={leaving}>
                  <span className="ch-more__ic">
                    <Icon icon={LogOut} size={17} />
                  </span>
                  <span className="ch-more__label">{leaving ? 'Signing out…' : 'Sign out'}</span>
                </button>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
