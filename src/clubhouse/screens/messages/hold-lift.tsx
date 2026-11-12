'use client';

import { CH_PHONE_QUERY } from '../../lib/phone-query';
import { Children, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { MS_BEATS, msAnimate, sheetCloseCurve } from './motion/messages-motion';
import '../../styles/messages-overlays.css';

/** What the lift keeps from the thread: the row's box, the message's bubbles together, how pressed the stack is. */
export interface LiftGeometry {
  row: { left: number; top: number; width: number; height: number };
  bubble: { left: number; top: number; right: number; bottom: number };
  /** The stack's live press scale (the bubble is mid-press, .97): the lift starts from it, clamped .9 to 1. */
  sink: number;
  /** The thread scope classes the clone needs to keep its look outside the thread (`ch-msp-thread`). */
  scope: string;
}

/** The notch and home bar, in pixels, from the page's own env(). */
function safeAreaInsets(): { top: number; bottom: number } {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  probe.remove();
  return out;
}

export const rowOf = (messageId: string) => document.getElementById(`ch-ms-message-${messageId}`);

/** The elements that draw a message: every shell (`data-ch-bubble`), or the old bubble and photo classes on a row that predates the attribute. */
const shellsOf = (row: HTMLElement) => {
  const marked = Array.from(row.querySelectorAll<HTMLElement>('[data-ch-bubble]'));
  return marked.length ? marked : Array.from(row.querySelectorAll<HTMLElement>('.ch-ms-bub, .ch-ms-img'));
};

/** The element that takes focus back when the lift closes: the stack that opened it (a tab stop), else the first shell. */
export const focusTargetOf = (row: HTMLElement | null): HTMLElement | null => (row ? (row.querySelector<HTMLElement>('[data-ch-msg-focus]') ?? shellsOf(row)[0] ?? null) : null);

/**
 * A box with the press scale taken out. The stack sinks to .97 about its own centre while held; the lift opens from where the
 * message rests, so a point `p` on the scaled stack is mapped back to `c + (p - c) / s`.
 */
export function atRestBox(el: DOMRect, scaled: DOMRect, scaledWidth: number): DOMRect {
  const s = scaledWidth > 0 ? scaled.width / scaledWidth : 1;
  if (!s || Math.abs(s - 1) < 0.001) return el;
  const cx = scaled.left + scaled.width / 2;
  const cy = scaled.top + scaled.height / 2;
  const back = (x: number, y: number): [number, number] => [cx + (x - cx) / s, cy + (y - cy) / s];
  const [l, t] = back(el.left, el.top);
  const [r, b] = back(el.right, el.bottom);
  return new DOMRect(l, t, r - l, b - t);
}

/** Measure the message as it rests: the row's box, all its shells together, the stack's press scale. Null when nothing draws. */
export function measureLift(messageId: string): LiftGeometry | null {
  const row = rowOf(messageId);
  if (!row) return null;
  const shells = shellsOf(row);
  if (!shells.length) return null;
  const stack = row.querySelector<HTMLElement>('.ch-ms-msg__stack');
  const stackRect = stack?.getBoundingClientRect();
  const sink = stack && stack.offsetWidth ? (stackRect?.width ?? stack.offsetWidth) / stack.offsetWidth : 1;
  const rest = (r: DOMRect) => (stack && stackRect ? atRestBox(r, stackRect, stack.offsetWidth) : r);
  const rects = shells.map((s) => rest(s.getBoundingClientRect()));
  const bubble = {
    left: Math.min(...rects.map((r) => r.left)),
    top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  };
  const rr = row.getBoundingClientRect();
  const scope = ['ch-msp-thread', 'ch-ms-thread'].filter((c) => row.closest(`.${c}`)).join(' ');
  return { row: { left: rr.left, top: rr.top, width: rr.width || row.offsetWidth, height: rr.height || row.offsetHeight }, bubble, sink, scope };
}

export interface LiftPlacement {
  /** How far the message moves so the bar and the menu both fit (negative: up). */
  shift: number;
  barTop: number;
  menuTop: number;
  barLeft: number;
  menuLeft: number;
}

/**
 * MSG-402 placement. The bar sits 56 above the bubble's top, the menu 10 below its bottom, inside 60 top / 36 bottom on a phone and
 * 12 / 12 on desktop (plus the safe-area insets). Mine align right to the bubble's right edge, theirs left to its left edge, each
 * clamped 8 px from the screen's edges. A bubble too tall for the screen keeps the menu on it; the copy clips at the top.
 */
export function placeLift(g: LiftGeometry, box: { barW: number; menuW: number; menuH: number }, view: { w: number; h: number }, o: { mine: boolean; phone: boolean; inset: { top: number; bottom: number } }): LiftPlacement {
  const insetTop = (o.phone ? 60 : 12) + o.inset.top;
  const limit = view.h - (o.phone ? 36 : 12) - o.inset.bottom;
  const top = g.bubble.top - 56;
  const bottom = g.bubble.bottom + 10 + box.menuH;
  const shift = bottom > limit ? (bottom - top > limit - insetTop ? limit - bottom : Math.max(limit - bottom, insetTop - top)) : top < insetTop ? insetTop - top : 0;
  const clamp = (v: number, w: number) => Math.max(8, Math.min(v, view.w - w - 8));
  return {
    shift,
    barTop: g.bubble.top + shift - 56,
    menuTop: g.bubble.bottom + shift + 10,
    barLeft: clamp(o.mine ? g.bubble.right - box.barW : g.bubble.left, box.barW),
    menuLeft: clamp(o.mine ? g.bubble.right - box.menuW : g.bubble.left, box.menuW),
  };
}

const HIDDEN = 'hidden';

/**
 * The lift (MSG-402, MOT-HOLD-1..6): the held message's row is copied into an overlay at the same place, over a scrim blurred 14 px
 * (set once, only its opacity moves). The copy rises (`translateY(shift) scale(1.02)` on `lift`, from the live press scale) with the
 * reaction bar 56 above it (growing from its top corner on `pop`) and the menu 10 below it (unfolding 0.8 to 1 on `lift`). The real
 * row hides while the copy is up. Dismissing settles the copy home from where it is, shrinks the bar and menu over 160 ms, fades the
 * scrim over 280 ms, restores the row and returns focus to the bubble. Touching the copy while it settles takes it back from the live
 * frame. Reduce Motion: the copy appears in place and every part crossfades.
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
  // The running exit: a touch on the settling copy reverses every part from where it is, never a second copy (MOT-HOLD-6).
  const outs = useRef<Animation[]>([]);
  const [geom] = useState<LiftGeometry | null>(() => (typeof document === 'undefined' ? null : measureLift(messageId)));
  const row = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = rowOf(messageId);
    row.current = el;
    if (!el || !geom || !copy.current) return;
    // The copy is the row itself, drawn again: nothing in it answers a tap, speaks, shows an id, or carries the press.
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    clone.querySelectorAll('[data-ch-press-scale]').forEach((n) => {
      n.removeAttribute('data-ch-press-scale');
      (n as HTMLElement).style.transform = '';
      (n as HTMLElement).style.transition = '';
    });
    clone.querySelectorAll('[tabindex], [data-ch-msg-focus]').forEach((n) => {
      n.removeAttribute('tabindex');
      n.removeAttribute('data-ch-msg-focus');
    });
    clone.style.visibility = '';
    clone.setAttribute('inert', '');
    copy.current.replaceChildren(clone);
    el.style.visibility = HIDDEN;
    const phone = window.matchMedia(CH_PHONE_QUERY).matches;
    const place = placeLift(geom, { barW: rbar.current?.offsetWidth ?? 260, menuW: menu.current?.offsetWidth ?? 236, menuH: menu.current?.offsetHeight ?? 0 }, { w: window.innerWidth, h: window.innerHeight }, { mine, phone, inset: safeAreaInsets() });
    // The bar and menu are placed here, after the menu can be measured: a render alone would leave them at the unshifted spot.
    if (rbar.current) {
      rbar.current.style.top = `${place.barTop}px`;
      rbar.current.style.left = `${place.barLeft}px`;
    }
    if (menu.current) {
      menu.current.style.top = `${place.menuTop}px`;
      menu.current.style.left = `${place.menuLeft}px`;
    }
    const to = `translateY(${place.shift}px) scale(1.02)`;
    const s0 = Math.min(1, Math.max(0.9, geom.sink));
    // Where the exit's settle ends, and where Reduce Motion stands without the grow.
    copy.current.style.transform = reduced ? `translateY(${place.shift}px)` : to;
    if (scrim.current) msAnimate(scrim.current, [{ opacity: 0 }, { opacity: 1 }], 'smooth', { reduced });
    msAnimate(copy.current, [{ transform: `translateY(0) scale(${Math.round(s0 * 1000) / 1000})` }, { transform: to }], 'lift', { reduced, rd: null });
    if (rbar.current) msAnimate(rbar.current, [{ transform: 'scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], 'pop', { reduced });
    if (menu.current) msAnimate(menu.current, [{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], 'lift', { reduced });
    // The first reaction takes focus, as the page's toolbar (its first control).
    // Not while typing on a phone: taking focus drops the keyboard, and the thread would move under what was just measured (MOB-MSG-6).
    if (!(phone && document.activeElement instanceof HTMLTextAreaElement)) rbar.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    return () => {
      el.style.visibility = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the lift opens
  }, []);

  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    const finish = () => {
      // The real row is back before focus moves to it (a hidden element cannot take focus).
      if (row.current) row.current.style.visibility = '';
      focusTargetOf(row.current)?.focus?.({ preventScroll: true });
      onClosed();
    };
    const beat = { ms: MS_BEATS.fillInk, easing: sheetCloseCurve.easing };
    const live = { live: true, fill: 'forwards' as const, reduced };
    const a = rbar.current && msAnimate(rbar.current, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.6)' }], null, { ...live, timing: beat });
    const b = menu.current && msAnimate(menu.current, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.85)' }], null, { ...live, timing: beat });
    const c = scrim.current && msAnimate(scrim.current, [{ opacity: 1 }, { opacity: 0 }], null, { ...live, timing: sheetCloseCurve });
    const home = copy.current && msAnimate(copy.current, [{ transform: 'none' }, { transform: 'none' }], 'settle', { ...live, rd: null });
    const all = [a, b, c, home].filter((x): x is Animation => !!x);
    if (!all.length) {
      finish();
      return;
    }
    // Done when the longest part is: the copy home, or the scrim under Reduce Motion.
    let left = all.length;
    for (const x of all)
      x.onfinish = () => {
        left -= 1;
        if (left === 0) finish();
      };
    outs.current = all;
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
        const items = Array.from(document.querySelectorAll<HTMLElement>('.ch-mso-lift button:not(:disabled)'));
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

  /** Arrow keys inside the bar (left, right) and the menu (up, down), wrapping; Home and End to the ends. */
  const arrows = (axis: 'x' | 'y') => (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const keys = axis === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)'));
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === keys[0] || e.key === keys[1]) {
      e.preventDefault();
      rows[(i + (e.key === keys[1] ? 1 : -1) + rows.length) % rows.length]?.focus({ preventScroll: true });
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      rows[e.key === 'Home' ? 0 : rows.length - 1]?.focus({ preventScroll: true });
    }
  };

  if (!geom) return null;
  const bx = (geom.bubble.left + geom.bubble.right) / 2 - geom.row.left;
  const by = (geom.bubble.top + geom.bubble.bottom) / 2 - geom.row.top;
  return createPortal(
    <div className="ch-mso-lift" data-ch-ms-v2="on" role="dialog" aria-modal="true" aria-label="Message actions" data-ch-code="CH-7604">
      <div ref={scrim} className="ch-mso-lift__scrim" onClick={() => (closing.current ? reopen() : dismiss())} aria-hidden="true" />
      <div
        ref={copy}
        className={'ch-mso-lift__copy' + (geom.scope ? ` ${geom.scope}` : '')}
        aria-hidden="true"
        onPointerDown={reopen}
        style={{ left: geom.row.left, top: geom.row.top, width: geom.row.width, height: geom.row.height, transformOrigin: `${bx}px ${by}px` }}
      />
      <div ref={rbar} className="ch-mso-rbar" role="toolbar" aria-label="React" aria-orientation="horizontal" onKeyDown={arrows('x')} style={{ top: geom.bubble.top - 56, transformOrigin: mine ? '100% 100%' : '0% 100%' }}>
        {bar}
      </div>
      {/* No rows, no menu: a message with nothing to offer (someone else's deleted one) lifts with its reactions alone. */}
      {Children.count(children) > 0 && (
        <div ref={menu} className="ch-mso-menu" role="menu" tabIndex={-1} aria-label="Message" onKeyDown={arrows('y')} style={{ top: geom.bubble.bottom + 10, transformOrigin: mine ? '100% 0%' : '0% 0%' }}>
          {children}
        </div>
      )}
    </div>,
    document.querySelector('.ch-root') ?? document.body,
  );
}
