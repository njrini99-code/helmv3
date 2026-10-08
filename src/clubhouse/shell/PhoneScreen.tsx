'use client';

import { m, useIsPresent } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { chSpring, chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { poppedByUA } from '../lib/ua-pop';
import { CH_UNDERLAY_SHIFT, usePhoneImmersive, usePhonePushed } from './phone-chrome';
import { useOverlayScrollLock } from '../lib/overlay-scroll';

/**
 * A pushed phone screen (a thread, details, a new message): it slides in over the page on the smooth spring (base,
 * no bounce) and back out on pop over the base ease-out, so the page beneath is free again at once; it fades when
 * motion is reduced (CH-1610). The page it covers draws back about a quarter of the width and dims as it comes in, and
 * returns with it as it pops (PhoneUnderlay, CH-1618); a screen with another pushed over it (`covered`) does the same.
 * When iOS has already played the pop itself (the edge swipe), it leaves at once rather than slide out a second time
 * (CH-1908). While it is up, the shell's top bar and tab bar are inert and hidden from assistive tech (CH-1809), and
 * focus moves to the screen's title so VoiceOver starts there. Render it inside `AnimatePresence` so the pop animates
 * too. Its own top bar is a `PhoneBar`.
 */
export function PhoneScreen({
  labelledBy,
  className,
  children,
  code,
  keyboardAware = false,
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
  /** Another screen is pushed over this one: it is inert until that one pops. */
  covered?: boolean;
}) {
  usePhoneImmersive(true);
  // Leaving, it no longer holds the page back: the page returns as it slides out.
  const present = useIsPresent();
  usePhonePushed(present);
  useOverlayScrollLock();
  const reduced = useChReducedMotion();
  const ref = useRef<HTMLElement>(null);
  // Once covered, a return to the top comes back with the screen above's exit (the base ease-out), not on the spring
  // this screen arrived on.
  const [wasCovered, setWasCovered] = useState(false);
  if (covered && !wasCovered) setWasCovered(true);
  const drawnBack = covered && !reduced;
  useEffect(() => {
    const opener = document.activeElement;
    const title = document.getElementById(labelledBy);
    const inside = title && ref.current?.contains(title) ? title : null;
    const target = inside?.matches('h1, [tabindex]') ? inside : inside?.querySelector<HTMLElement>('[tabindex], h1, button');
    (target ?? ref.current)?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    };
  }, [labelledBy]);
  return (
    <m.section
      ref={ref}
      // The iOS shell's keyboard contract attribute (not a class): see keyboardAware.
      data-fw-keyboard-aware={keyboardAware ? '' : undefined}
      // Dims it while another screen covers it (shell.css, CH-1618).
      data-ch-covered={drawnBack ? '' : undefined}
      className={'ch-pscreen' + (className ? ` ${className}` : '')}
      aria-labelledby={labelledBy}
      data-ch-code={code}
      inert={covered || undefined}
      tabIndex={-1}
      initial={reduced ? { opacity: 0 } : { x: '100%' }}
      animate={
        drawnBack
          ? { x: `${-CH_UNDERLAY_SHIFT * 100}%`, opacity: 1, transition: chSpring('smooth') }
          : { x: 0, opacity: 1, transition: wasCovered ? (reduced || poppedByUA() ? { duration: 0 } : chTween('base')) : chSpring('smooth', reduced) }
      }
      // Read as the pop begins, so a Back that iOS already animated doesn't play again.
      exit="pop"
      variants={{ pop: () => (reduced || poppedByUA() ? { opacity: 0, transition: { duration: 0 } } : { x: '100%', transition: chTween('base') }) }}
    >
      {children}
    </m.section>
  );
}
