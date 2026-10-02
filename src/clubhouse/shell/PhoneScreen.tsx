'use client';

import { m } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { usePhoneImmersive } from './phone-chrome';
import { useOverlayScrollLock } from '../lib/overlay-scroll';

/**
 * A pushed phone screen (a thread, details, a new message): it slides in over
 * the page in 220ms and back out on pop, or fades when motion is reduced
 * (CH-1610). While it is up, the shell's top bar and tab bar are inert and
 * hidden from assistive tech (CH-1809), and focus moves to the screen's title
 * so VoiceOver starts there. Render it inside `AnimatePresence` so the pop
 * animates too. Its own top bar is a `PhoneBar`.
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
  useOverlayScrollLock();
  const reduced = useChReducedMotion();
  const ref = useRef<HTMLElement>(null);
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
      className={'ch-pscreen' + (className ? ` ${className}` : '')}
      aria-labelledby={labelledBy}
      data-ch-code={code}
      inert={covered || undefined}
      tabIndex={-1}
      initial={reduced ? { opacity: 0 } : { x: '100%' }}
      animate={{ x: 0, opacity: 1 }}
      exit={reduced ? { x: 0, opacity: 0 } : { x: '100%' }}
      transition={reduced ? { duration: 0 } : chTween('base')}
    >
      {children}
    </m.section>
  );
}
