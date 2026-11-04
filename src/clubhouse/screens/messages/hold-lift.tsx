'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CH_FADE_MS, chSpringCurve } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';

/**
 * The lift (S-MSG.hold, 07 M-MSG-10 and 11): the held bubble's copy rises over a blurred thread with a reaction bar above it and today's
 * rows below it. The real bubble hides while its copy is up. Dismissing settles the copy home, shrinks the bar and menu, fades the scrim
 * and returns focus to the bubble. Reduce Motion: everything appears in place and fades over `CH_FADE_MS`.
 */
export function HoldLift({ messageId, mine, bar, children, onClosed, closeSignal }: { messageId: string; mine: boolean; bar: ReactNode; children: ReactNode; onClosed: () => void; /** Bumped by a pick, to run the dismiss. */ closeSignal: number }) {
  const reduced = useChReducedMotion();
  const scrim = useRef<HTMLDivElement | null>(null);
  const copy = useRef<HTMLDivElement | null>(null);
  const rbar = useRef<HTMLDivElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const closing = useRef(false);
  const [rect] = useState<DOMRect | null>(() => document.getElementById(`ch-ms-message-${messageId}`)?.querySelector('.ch-ms-bub, .ch-ms-img')?.getBoundingClientRect() ?? null);
  const shift = useRef(0);
  const source = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = document.getElementById(`ch-ms-message-${messageId}`)?.querySelector<HTMLElement>('.ch-ms-bub, .ch-ms-img') ?? null;
    source.current = el;
    if (!el || !rect || !copy.current) return;
    copy.current.replaceChildren(el.cloneNode(true));
    el.style.visibility = 'hidden';
    const menuH = menu.current?.offsetHeight ?? 0;
    const top = rect.top - 58;
    const bottom = rect.bottom + 8 + menuH;
    const limit = window.innerHeight - 16;
    shift.current = top < 60 ? 60 - top : bottom > limit ? limit - bottom : 0;
    const lift = chSpringCurve('lift');
    const pop = chSpringCurve('pop');
    const smooth = chSpringCurve('smooth');
    const to = `translateY(${shift.current}px) scale(1.02)`;
    if (reduced) {
      copy.current.style.transform = `translateY(${shift.current}px)`;
      for (const n of [scrim.current, copy.current, rbar.current, menu.current]) n?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS });
    } else {
      copy.current.style.transform = to;
      copy.current.animate([{ transform: 'none' }, { transform: to }], { duration: lift.ms, easing: lift.linear });
      scrim.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 462, easing: smooth.linear });
      rbar.current?.animate([{ transform: 'scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: pop.ms, easing: pop.linear });
      menu.current?.animate([{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: lift.ms, easing: lift.linear });
    }
    menu.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    return () => {
      el.style.visibility = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the lift opens
  }, []);

  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    const settle = chSpringCurve('settle');
    const ease = 'cubic-bezier(.22,1,.36,1)';
    const finish = () => {
      source.current?.focus?.({ preventScroll: true });
      onClosed();
    };
    if (reduced || !copy.current?.animate) {
      const fade = scrim.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CH_FADE_MS, fill: 'forwards' });
      for (const n of [copy.current, rbar.current, menu.current]) n?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CH_FADE_MS, fill: 'forwards' });
      if (fade) fade.onfinish = finish;
      else finish();
      return;
    }
    rbar.current?.animate([{ opacity: 1 }, { transform: 'scale(.6)', opacity: 0 }], { duration: 160, easing: ease, fill: 'forwards' });
    menu.current?.animate([{ opacity: 1 }, { transform: 'scale(.85)', opacity: 0 }], { duration: 160, easing: ease, fill: 'forwards' });
    scrim.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: ease, fill: 'forwards' });
    const home = copy.current.animate([{ transform: getComputedStyle(copy.current).transform }, { transform: 'none' }], { duration: settle.ms, easing: settle.linear, fill: 'forwards' });
    home.onfinish = finish;
  };

  const signal = useRef(closeSignal);
  useEffect(() => {
    if (signal.current === closeSignal) return;
    signal.current = closeSignal;
    dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the signal alone
  }, [closeSignal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      } else if (e.key === 'Tab') {
        const items = Array.from(document.querySelectorAll<HTMLElement>('.ch-msv-lift button:not(:disabled)'));
        if (!items.length) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the overlay's own lifetime
  }, []);

  if (!rect) return null;
  const vw = window.innerWidth;
  const edge = 12;
  const side = mine ? { right: Math.max(edge, vw - rect.right) } : { left: Math.max(edge, rect.left) };
  return createPortal(
    <div className="ch-msv-lift" data-ch-ms-v2="on" role="dialog" aria-modal="true" aria-label="Message actions" data-ch-code="CH-7604">
      <div ref={scrim} className="ch-msv-lift__scrim" onClick={dismiss} aria-hidden="true" />
      <div ref={copy} className="ch-msv-lift__copy" aria-hidden="true" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, transformOrigin: mine ? '100% 100%' : '0% 100%' }} />
      <div ref={rbar} className="ch-msv-rbar" style={{ top: rect.top - 58 + shift.current, transformOrigin: mine ? '100% 100%' : '0% 100%', ...side }}>
        {bar}
      </div>
      <div ref={menu} className="ch-msv-holdmenu" style={{ top: rect.bottom + 8 + shift.current, transformOrigin: mine ? '100% 0%' : '0% 0%', ...side }}>
        {children}
      </div>
    </div>,
    document.querySelector('.ch-root') ?? document.body,
  );
}
