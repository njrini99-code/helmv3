'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CH_FADE_MS, chSpringCurve, CH_DUR, CH_SPRING_SETTLE_MS } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';

/** An element's box with any press scale taken out: its place at rest. */
function atRest(el: HTMLElement | null | undefined): DOMRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const w = el.offsetWidth || r.width;
  const h = el.offsetHeight || r.height;
  return new DOMRect(r.left - (w - r.width) / 2, r.top - (h - r.height) / 2, w, h);
}

/**
 * The lift (S-MSG.hold, 07 M-MSG-10 and 11): the held bubble's copy rises over a blurred thread with a reaction bar above it and today's
 * rows below it. The real bubble hides while its copy is up. Dismissing settles the copy home, shrinks the bar and menu, fades the scrim
 * and returns focus to the bubble. Reduce Motion: everything appears in place and fades over `CH_FADE_MS`.
 */
export function HoldLift({ messageId, mine, bar, children, onClosed, closeSignal, onReopen }: { /** A pick waiting on this dismiss is dropped when the lift is taken back. */ onReopen?: () => void; messageId: string; mine: boolean; bar: ReactNode; children: ReactNode; onClosed: () => void; /** Bumped by a pick, to run the dismiss. */ closeSignal: number }) {
  const reduced = useChReducedMotion();
  const scrim = useRef<HTMLDivElement | null>(null);
  const copy = useRef<HTMLDivElement | null>(null);
  const rbar = useRef<HTMLDivElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const closing = useRef(false);
  const holdAfterCancel = useRef(onReopen);
  holdAfterCancel.current = onReopen;
  // The running exit: a touch on the settling copy reverses every part from where it is, never a second copy (HOLD_OUT, M-MSG-11).
  const outs = useRef<Animation[]>([]);
  // The bubble is mid-press (scale .97): the copy takes its size at rest, or its text would wrap differently and the lift would jump.
  const [sink] = useState(() => {
    const el = document.getElementById(`ch-ms-message-${messageId}`)?.querySelector<HTMLElement>('.ch-ms-bub, .ch-ms-img');
    return el && el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
  });
  const [rect] = useState<DOMRect | null>(() => atRest(document.getElementById(`ch-ms-message-${messageId}`)?.querySelector<HTMLElement>('.ch-ms-bub, .ch-ms-img')) ?? null);
  const shift = useRef(0);
  const source = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = document.getElementById(`ch-ms-message-${messageId}`)?.querySelector<HTMLElement>('.ch-ms-bub, .ch-ms-img') ?? null;
    source.current = el;
    if (!el || !rect || !copy.current) return;
    copy.current.replaceChildren(el.cloneNode(true));
    el.style.visibility = 'hidden';
    const menuH = menu.current?.offsetHeight ?? 0;
    // M-MSG-10b: the menu 10 below the bubble, the bar 56 above it, inside 60 top / 36 bottom on a phone and 12 / 12 on a desktop.
    const phone = window.innerWidth < 768;
    const insetTop = phone ? 60 : 12;
    const top = rect.top - 56;
    const bottom = rect.bottom + 10 + menuH;
    const limit = window.innerHeight - (phone ? 36 : 12);
    shift.current = bottom > limit ? Math.max(limit - bottom, insetTop - top) : top < insetTop ? insetTop - top : 0;
    // The bar and menu are placed here, after the menu can be measured: a render alone would leave them at the unshifted spot.
    if (rbar.current) rbar.current.style.top = `${top + shift.current}px`;
    if (menu.current) menu.current.style.top = `${rect.bottom + 10 + shift.current}px`;
    const lift = chSpringCurve('lift');
    const pop = chSpringCurve('pop');
    const smooth = chSpringCurve('smooth');
    const to = `translateY(${shift.current}px) scale(1.02)`;
    if (reduced) {
      copy.current.style.transform = `translateY(${shift.current}px)`;
      for (const n of [scrim.current, copy.current, rbar.current, menu.current]) n?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS });
    } else {
      copy.current.style.transform = to;
      copy.current.animate([{ transform: `scale(${sink})` }, { transform: to }], { duration: lift.ms, easing: lift.linear });
      scrim.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_SPRING_SETTLE_MS, easing: smooth.linear });
      rbar.current?.animate([{ transform: 'scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: pop.ms, easing: pop.linear });
      menu.current?.animate([{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: lift.ms, easing: lift.linear });
    }
    // The first reaction takes focus, as the page's toolbar (its first control).
    rbar.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
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
    const a = rbar.current?.animate([{ opacity: 1 }, { transform: 'scale(.6)', opacity: 0 }], { duration: CH_DUR.quick * 1000, easing: ease, fill: 'forwards' });
    const b = menu.current?.animate([{ opacity: 1 }, { transform: 'scale(.85)', opacity: 0 }], { duration: CH_DUR.quick * 1000, easing: ease, fill: 'forwards' });
    const c = scrim.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CH_DUR.release * 1000, easing: ease, fill: 'forwards' });
    const home = copy.current.animate([{ transform: getComputedStyle(copy.current).transform }, { transform: 'none' }], { duration: settle.ms, easing: settle.linear, fill: 'forwards' });
    home.onfinish = finish;
    outs.current = [a, b, c, home].filter((x): x is Animation => !!x);
  };

  const reopen = () => {
    if (!closing.current || !outs.current.length) return;
    closing.current = false;
    holdAfterCancel.current?.();
    for (const x of outs.current) {
      x.onfinish = null;
      x.reverse();
    }
    outs.current = [];
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
      <div ref={scrim} className="ch-msv-lift__scrim" onClick={() => (closing.current ? reopen() : dismiss())} aria-hidden="true" />
      <div ref={copy} className={'ch-msv-lift__copy ch-ms-msg is-first is-last' + (mine ? ' is-mine' : '')} aria-hidden="true" onPointerDown={reopen} style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, transformOrigin: mine ? '100% 100%' : '0% 100%' }} />
      <div ref={rbar} className="ch-msv-rbar" style={{ top: rect.top - 56, transformOrigin: mine ? '100% 100%' : '0% 100%', ...side }}>
        {bar}
      </div>
      <div ref={menu} className="ch-msv-holdmenu" style={{ top: rect.bottom + 10, transformOrigin: mine ? '100% 0%' : '0% 0%', ...side }}>
        {children}
      </div>
    </div>,
    document.querySelector('.ch-root') ?? document.body,
  );
}
