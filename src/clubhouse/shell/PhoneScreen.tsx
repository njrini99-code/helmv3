'use client';

import { m } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { usePhoneImmersive } from './phone-chrome';

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
}: {
  /** The id of the screen's title in its `PhoneBar`. */
  labelledBy: string;
  className?: string;
  children: ReactNode;
  /** Catalog number (docs/clubhouse/catalog). */
  code?: string;
}) {
  usePhoneImmersive(true);
  const reduced = useChReducedMotion();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const title = document.getElementById(labelledBy);
    const inside = title && ref.current?.contains(title) ? title : null;
    const target = inside?.matches('h1, [tabindex]') ? inside : inside?.querySelector<HTMLElement>('[tabindex], h1, button');
    (target ?? ref.current)?.focus({ preventScroll: true });
  }, [labelledBy]);
  return (
    <m.section
      ref={ref}
      className={'ch-pscreen' + (className ? ` ${className}` : '')}
      aria-labelledby={labelledBy}
      data-ch-code={code}
      tabIndex={-1}
      initial={reduced ? { opacity: 0 } : { x: '100%' }}
      animate={reduced ? { opacity: 1 } : { x: 0 }}
      exit={reduced ? { opacity: 0 } : { x: '100%' }}
      transition={chTween('base')}
    >
      {children}
    </m.section>
  );
}
