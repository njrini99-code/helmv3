'use client';

import { m, usePresence } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { chFade, chSpring } from '../lib/motion';
import { useChMotionMode, useChReducedMotion } from '../lib/reduced-motion';
import { usePaintedAfter } from '../lib/use-painted';
import { poppedByUA } from '../lib/ua-pop';
import { CH_UNDERLAY_SHIFT, usePhoneCover, usePhoneImmersive, usePhonePushed } from './phone-chrome';
import { useEdgeSwipeBack, type EdgeExitHold } from './use-edge-swipe';
import { useOverlayScrollLock } from '../lib/overlay-scroll';
import { isNativeApp } from '@/lib/utils/capacitor';

/**
 * A pushed phone screen (a thread, details, a new message): it slides in over the page on the smooth spring (base,
 * no bounce) and back out on pop on the same spring, so the page beneath is free again at once; it fades when
 * motion is reduced (CH-1610). The page it covers draws back about a quarter of the width and dims as it comes in, and
 * returns with it as it pops (PhoneUnderlay, CH-1618); a screen with another pushed over it (`covered`) does the same.
 * When iOS has already played the pop itself (the edge swipe), it leaves at once rather than slide out a second time
 * (CH-1908). While it is up, the shell's top bar is inert and hidden from assistive tech (CH-1809), and focus moves to
 * the screen's title so VoiceOver starts there. Whether the dock goes too is the screen's `immersive` choice: only one
 * with a composer or fields at its foot (and the round, which has no PhoneScreen) hides it; any other push keeps the
 * Resume round accessory up, as iOS keeps its tab bar for a push (NATIVE_FEEL P2-3). A finger that starts at the left
 * edge drags the screen back (use-edge-swipe.ts, shell-gestures.md), where the native gesture is not already doing it.
 * Render it inside `AnimatePresence` so the pop animates too. Its own top bar is a `PhoneBar`.
 */
export function PhoneScreen({
  labelledBy,
  className,
  children,
  code,
  keyboardAware = false,
  immersive = keyboardAware,
  covered = false,
}: {
  /** The id of the screen's title in its `PhoneBar`. */
  labelledBy: string;
  className?: string;
  children: ReactNode;
  /** Catalog number (docs/clubhouse/catalog). */
  code?: string;
  /**
   * The screen has a composer or a field at its foot: it lifts by the iOS
   * keyboard's height (`--keyboard-height`) and tells the shell not to
   * scroll fields into view itself (`data-fw-keyboard-aware`).
   */
  keyboardAware?: boolean;
  /**
   * The screen takes the whole phone, dock included: a composer that sits on the keyboard, a full-page flow. Off by
   * default for every other push, which keeps the dock's Resume round accessory (and the screen stops above it). A
   * keyboard-aware screen is immersive unless it says otherwise.
   */
  immersive?: boolean;
  /** Another screen is pushed over this one: it is inert until that one pops. */
  covered?: boolean;
}) {
  usePhoneImmersive(immersive);
  usePhoneCover(!immersive);
  // Leaving, it no longer holds the page back: the page returns as it slides out.
  const [present, safeToRemove] = usePresence();
  usePhonePushed(present);
  useOverlayScrollLock();
  const reduced = useChReducedMotion();
  // Under Reduce Motion the screen fades in and out over the quick beat instead of sliding (owner decision 2, OQ-15);
  // Animations off swaps it at once.
  const mode = useChMotionMode();
  const ref = useRef<HTMLElement>(null);
  // Once covered, a return to the top comes back with the screen above's exit (the base ease-out), not on the spring
  // this screen arrived on.
  const [wasCovered, setWasCovered] = useState(false);
  if (covered && !wasCovered) setWasCovered(true);
  const drawnBack = covered && !reduced;
  useSafariKeyboardFit(ref, keyboardAware);
  // A swipe back that lets go past the mark leaves on its own spring from where the finger left it: the exit waits for
  // it (`holding`) instead of playing the pop again, and React is told when the screen has gone.
  const exit = useRef<EdgeExitHold>({ holding: false, done: () => {}, present: true });
  exit.current.present = present;
  exit.current.done = () => safeToRemove?.();
  useEffect(() => {
    if (!present && !exit.current.holding) safeToRemove?.();
  }, [present, safeToRemove]);
  useEdgeSwipeBack(ref, { enabled: !covered, reduced, exit });
  useKeepDockClear(ref, !immersive);
  useEffect(() => {
    const opener = document.activeElement;
    const title = document.getElementById(labelledBy);
    const inside = title && ref.current?.contains(title) ? title : null;
    const target = inside?.matches('h1, [tabindex]') ? inside : inside?.querySelector<HTMLElement>('[tabindex], h1, button');
    (target ?? ref.current)?.focus({ preventScroll: true });
    return () => {
      if (!(opener instanceof HTMLElement) || !opener.isConnected) return;
      if (!opener.closest('[inert]')) {
        opener.focus({ preventScroll: true });
        return;
      }
      // An opener in the shell's top bar (Messages' New message) is still inert here: this screen's immersive hold is
      // released in the same commit, after this runs. Focus it a frame later if nothing else took focus (audit A-28).
      requestAnimationFrame(() => {
        const lost = !document.activeElement || document.activeElement === document.body;
        if (lost && opener.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
      });
    };
  }, [labelledBy]);
  const painted = usePaintedAfter(true);
  return (
    <m.section
      ref={ref}
      // The iOS shell's keyboard contract attribute (not a class): see keyboardAware.
      data-fw-keyboard-aware={keyboardAware ? '' : undefined}
      // Dims it while another screen covers it (shell.css, CH-1618).
      data-ch-covered={drawnBack ? '' : undefined}
      // The dock's Resume round accessory stays over this screen, which stops above it (shell.css, L10 phone shell).
      data-ch-keeps-dock={immersive ? undefined : ''}
      className={'ch-pscreen' + (className ? ` ${className}` : '')}
      aria-labelledby={labelledBy}
      data-ch-code={code}
      inert={covered || undefined}
      tabIndex={-1}
      initial={reduced ? { opacity: 0 } : { transform: 'translateX(100%)' }}
      // Slides in once its first frame is on screen (lib/use-painted.ts): a heavy screen (a thread, a player) spent the
      // first half of the push on its own render, so it appeared halfway in (WebKit, 2026-10-15).
      animate={
        !painted
          ? undefined
          : drawnBack
            ? { transform: `translateX(${-CH_UNDERLAY_SHIFT * 100}%)`, opacity: 1, transition: chSpring('smooth') }
            : { transform: 'translateX(0%)', opacity: 1, transition: wasCovered ? (reduced || poppedByUA() ? { duration: 0 } : chSpring('smooth')) : reduced ? chFade(mode) : chSpring('smooth') }
      }
      // Read as the pop begins, so a Back that iOS already animated doesn't play again.
      exit="pop"
      // The pop rides the same smooth spring as the push (native-feel audit 2026-10-08, P1-2: the base ease-out read as a
      // 183ms jump); it is clear of the screen by about 350ms.
      // A swipe back that is carrying the screen out itself (`holding`) leaves the exit to it: nothing here moves.
      variants={{
        pop: () =>
          exit.current.holding
            ? { transition: { duration: 0 } }
            : poppedByUA()
              ? { opacity: 0, transition: { duration: 0 } }
              : reduced
              ? { opacity: 0, transition: chFade(mode) }
              : { transform: 'translateX(100%)', transition: chSpring('smooth') },
      }}
    >
      {children}
    </m.section>
  );
}

/**
 * A screen that is not immersive leaves the dock's Resume round accessory up (shell.css, L10 phone shell). The accessory
 * floats over the page, so the screen stops short of it by however much of the screen's foot it covers
 * (`--ch-pscreen-dock`, which the screen pads its foot by); nothing when no round is in progress. It is read again when
 * the dock changes size (it appears as this screen's cover lands) and with the window.
 */
function useKeepDockClear(ref: RefObject<HTMLElement | null>, on: boolean): void {
  useEffect(() => {
    const el = ref.current;
    const root = el?.closest('.ch-root');
    if (!on || !el || !root) return;
    const measure = () => {
      const resume = root.querySelector<HTMLElement>('.ch-dock:not([hidden]) .ch-resume');
      const box = resume?.getBoundingClientRect();
      const room = box && box.height > 0 ? Math.max(0, Math.ceil(el.getBoundingClientRect().bottom - box.top + 8)) : 0;
      el.style.setProperty('--ch-pscreen-dock', `${room}px`);
    };
    measure();
    const dock = root.querySelector('.ch-dock');
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (dock) ro?.observe(dock);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      el.style.removeProperty('--ch-pscreen-dock');
    };
  }, [ref, on]);
}

/**
 * Mobile Safari (not the app): the keyboard neither resizes the page nor reports its height, and iOS scrolls the
 * visible area down to the focused composer, which took the screen's own bar off the top. While the keyboard is up,
 * the screen fits the visible area instead (`data-ch-vv`, shell.css), so its bar stays and the composer sits on the
 * keys. The app's WebView takes the other path: CapacitorProvider publishes `--keyboard-height` (body.capacitor).
 */
function useSafariKeyboardFit(ref: RefObject<HTMLElement | null>, on: boolean): void {
  useEffect(() => {
    const el = ref.current;
    const vv = window.visualViewport;
    if (!on || !el || !vv || isNativeApp() || !window.matchMedia?.('(pointer: coarse)').matches) return;
    const fit = () => {
      // The layout viewport's height (clientHeight) is what the keyboard covers: Safari 26 shrinks innerHeight with the
      // visible area, so innerHeight minus it reads 0 with the keyboard up. A pinch-zoom shrinks the visible area too;
      // it is not a keyboard.
      const up = vv.scale <= 1.01 && document.documentElement.clientHeight - vv.height > 120;
      if (!up) {
        delete el.dataset.chVv;
        return;
      }
      el.style.setProperty('--ch-vv-top', `${Math.round(vv.offsetTop)}px`);
      el.style.setProperty('--ch-vv-h', `${Math.round(vv.height)}px`);
      el.dataset.chVv = '';
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    fit();
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      delete el.dataset.chVv;
    };
  }, [ref, on]);
}
