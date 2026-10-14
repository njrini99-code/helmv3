'use client';

import Link from 'next/link';
import { AnimatePresence, m } from 'motion/react';
import { ChevronRight, LifeBuoy, LogOut, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { chSignOut } from '../lib/sign-out';
import { chReport } from '../lib/track';
import { haptic } from '../lib/haptics';
import { chSpring, chTween } from '../lib/motion';
import { chThrownExit, takeSheetFling, useSheetDrag } from '../lib/sheet-drag';
import { OverlayScrollLock } from '../lib/overlay-scroll';
import { useChReducedMotion } from '../lib/reduced-motion';
import type { ChRole } from './nav';
import { focusSectionTitle, useSectionSwitch } from './section-switch';
import { MoreTeamSwitch } from './TeamSwitch';
import type { ChTeamSwitch } from './team-switch';

/**
 * The phone's account sheet (CH-1802), opened from the section strip's last pill (docs/clubhouse/phone/section-strip.md).
 * It was the More sheet (D-41); the sections it listed are on the strip now, so what stays is the v2 More board's
 * (m-ch.jsx `MoreM`) who you are (it opens Settings), the coach's team switch, Help and Sign out.
 */
export function AccountSheet({
  pathname,
  role,
  user,
  teamSwitch = null,
}: {
  pathname: string;
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
  const reduced = useChReducedMotion();
  const sw = useSectionSwitch();
  const moreOpen = sw?.accountOpen ?? false;
  const setMoreOpen = useCallback((open: boolean) => sw?.setAccountOpen(open), [sw]);

  const sheet = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closeMore = useCallback(() => setMoreOpen(false), [setMoreOpen]);
  // A row that navigates (native-feel audit 2026-10-08, P0-3): the sheet and its scrim leave at once, in the tap, before
  // the router starts. Left to slide out, they sat in the page transition's snapshot over the old page and the new one.
  const jumped = useRef(false);
  const leaveForPage = useCallback(() => {
    haptic('select');
    jumped.current = true;
    for (const el of [sheet.current, scrim.current]) el?.style.setProperty('visibility', 'hidden');
    setMoreOpen(false);
  }, [setMoreOpen]);
  const drag = useSheetDrag(sheet, closeMore, { enabled: !reduced });
  // CH-1602: More rises on the smooth spring and leaves on it too, at the speed it was thrown when swiped shut (CH-1611),
  // ending as it leaves sight. Read as the exit begins, since the sheet's props are fixed once it is removed.
  const sheetMotion = {
    shown: { y: 0, opacity: 1, transition: chSpring('smooth', reduced) },
    gone: (_custom: unknown, current: { y?: unknown }) => {
      if (jumped.current) return { opacity: 0, transition: { duration: 0 } };
      if (reduced) return { y: 0, opacity: 0, transition: { duration: 0 } };
      const travel = sheet.current?.offsetHeight ?? 0;
      if (!travel) return { y: '100%', transition: chTween('base') };
      // From where it is now (mid rise, when closed early), plus the frame a throw has already carried it.
      const from = typeof current?.y === 'number' ? current.y : 0;
      const out = chThrownExit(takeSheetFling(sheet.current, { peek: true }), travel - from);
      return { y: [from + out.lead, travel], transition: { duration: out.ms / 1000, ease: out.ease } };
    },
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new address closes the sheet; setMoreOpen is stable enough
  useEffect(() => setMoreOpen(false), [pathname]);
  // P001-D3: the page, its bars and the dock go inert under the sheet, so VoiceOver's swipe can't reach them (aria-modal
  // alone is not enough in Safari). Making the whole page inert is a full style pass (6 to 20ms a frame in WebKit, motion
  // audit 2026-10-12), so it happens once the sheet has settled, and is undone once it has left, never mid-slide.
  const shielded = useRef<{ el: HTMLElement; was: boolean }[] | null>(null);
  const shield = useCallback(() => {
    if (shielded.current) return;
    shielded.current = Array.from(document.querySelectorAll<HTMLElement>('.ch-root > .ch-app, .ch-root > .ch-strip, .ch-root > .ch-dock, .ch-root > .ch-skip')).map((el) => {
      const was = el.inert;
      el.inert = true;
      return { el, was };
    });
  }, []);
  const unshield = useCallback(() => {
    shielded.current?.forEach(({ el, was }) => {
      el.inert = was;
    });
    shielded.current = null;
  }, []);
  // Gone with the shell (a sign-out, a route that drops it): the page is put back all the same.
  useEffect(() => unshield, [unshield]);
  // The sheet is modal: focus moves into it, Tab stays inside and Esc closes it. Focus returns to the section title once
  // it has left (CH-1802).
  useEffect(() => {
    if (!moreOpen) return;
    // A fresh open leaves on the spring again, whatever the last one did.
    jumped.current = false;
    // The sheet mounts in the same commit, so it can take focus right away.
    sheet.current?.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true });
    // Reduced motion has no rise to wait for.
    if (reduced) shield();
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
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen, setMoreOpen, reduced, shield]);
  const left = useCallback(() => {
    unshield();
    // Back on the section title without a ring after a tap (F-46); a keyboard user still lands on it.
    focusSectionTitle();
  }, [unshield]);

  return (
    <AnimatePresence onExitComplete={left}>
        {moreOpen && (
          <>
            <m.div
              ref={scrim}
              key="scrim"
              className="ch-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduced ? { duration: 0 } : chTween('base')}
              onClick={() => setMoreOpen(false)}
            />
            <m.div
              ref={sheet}
              key="sheet"
              id="ch-account"
              data-ch-code="CH-1802"
              role="dialog"
              // Read by the iOS swipe-back guard (NativeSwipeBackBridge): no edge swipe while the sheet is up.
              data-state="open"
              aria-modal="true"
              aria-label="Account"
              className="ch-more"
              initial={reduced ? { opacity: 0 } : { y: '100%' }}
              variants={sheetMotion}
              animate="shown"
              exit="gone"
              onAnimationComplete={(done) => {
                if (done === 'shown') shield();
              }}
            >
              <OverlayScrollLock />
              <div className="ch-more__grab" aria-hidden="true" onPointerDown={drag.onPointerDown} />
              <div className="ch-more__head" onPointerDown={drag.onPointerDown}>
                <span>Account</span>
                <button type="button" className="ch-more__x" aria-label="Close" onClick={() => setMoreOpen(false)}>
                  <Icon icon={X} size={16} />
                </button>
              </div>
              {user && (
                <Link href="/golf/dashboard/settings" className="ch-more__me" onClick={leaveForPage}>
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
                <Link href="/golf/dashboard/settings#set-help" className="ch-more__row" onClick={leaveForPage}>
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
  );
}
