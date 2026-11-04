'use client';

import { ArrowDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CH_FADE_MS, chSpringCurve } from '../../lib/motion';
import { Icon } from '../../ui/Icon';

const DATE_PILL_HIDE_MS = 1000;

/** The day of the topmost visible message, shown while the thread scrolls and hidden 1 second after it stops (S-MSG.date-pill). */
export function ThreadDatePill({ scroller, forced = false }: { scroller: RefObject<HTMLElement | null>; forced?: boolean }) {
  const [label, setLabel] = useState<string | null>(null);
  const [on, setOn] = useState(forced);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let timer = 0;
    let frame = 0;
    const read = () => {
      frame = 0;
      const top = el.getBoundingClientRect().top;
      let day: string | null = null;
      for (const d of Array.from(el.querySelectorAll<HTMLElement>('.ch-ms-day'))) {
        if (d.getBoundingClientRect().top > top + 8) break;
        day = d.querySelector('span')?.firstChild?.textContent ?? d.textContent;
      }
      setLabel(day);
      setOn(day != null);
      window.clearTimeout(timer);
      if (!forced) timer = window.setTimeout(() => setOn(false), DATE_PILL_HIDE_MS);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    if (forced) read();
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scroller, forced]);
  if (!label) return null;
  return (
    <div className={'ch-msv-datepill' + (on ? ' is-on' : '')} aria-hidden="true">
      {label}
    </div>
  );
}

/**
 * The jump key (S-MSG.jump): a 40 glass circle with the unseen count, shown more than 0.9 of the scroller's height above the end, or
 * whenever something arrived unseen. It pops in on `pop` and leaves on 160ms (CSS). The count hides once the reader reaches the end.
 */
export function ThreadJumpKey({ scroller, unseen, onJump }: { scroller: RefObject<HTMLElement | null>; unseen: number; onJump: () => void }) {
  const [far, setFar] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setFar(el.scrollHeight - el.clientHeight - el.scrollTop > el.clientHeight * 0.9);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    read();
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scroller]);
  if (!far && unseen <= 0) return null;
  return (
    <button type="button" className="ch-msv-jump" aria-label={unseen > 0 ? `Jump to latest, ${unseen} new` : 'Jump to latest'} onClick={onJump}>
      <Icon icon={ArrowDown} size={19} />
      {unseen > 0 && <b className="ch-num">{unseen}</b>}
    </button>
  );
}

/**
 * The thread making room (M-MSG-07, B7): an arriving row has its full height at frame one, and everything above moves by transform
 * only. Each arrival adds its own animation, so two in a row stack rather than restart. Skipped when reduced.
 */
export function useThreadMakeRoom(scroller: RefObject<HTMLElement | null>, count: number, enabled: boolean, reduced: boolean): void {
  const seen = useRef(count);
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = count;
    if (!enabled || reduced || count <= before || before === 0) return;
    const list = scroller.current?.querySelector<HTMLElement>('.ch-ms-msgs');
    const row = list?.lastElementChild as HTMLElement | null | undefined;
    if (!list?.animate || !row) return;
    const h = row.getBoundingClientRect().height;
    // A reply makes room on `reveal` (M-MSG-07b); your own send on `send`.
    const curve = chSpringCurve(row.classList.contains('is-mine') ? 'send' : 'reveal');
    list.animate([{ transform: `translateY(${h}px)` }, { transform: 'none' }], { duration: curve.ms, easing: curve.linear, composite: 'add' });
  }, [scroller, count, enabled, reduced]);
}

/** The bubble's drawn tail (`redesign.css` `.tail`), on the last bubble of a run. */
export function BubbleTail() {
  return (
    <svg className="ch-msv-tail" viewBox="0 0 18 20" aria-hidden="true">
      <path d="M0 0h12c0 9 1.6 14.5 6 20-5.2.3-9.8-.9-13.4-3.6L0 20z" />
    </svg>
  );
}

/**
 * The reply opens out of its typing bubble, in the same slot (M-MSG-08b). The typing row's size is read while it shows; when a message
 * from them lands in its place, the new bubble scales up from it, opaque by 35% of the eased curve. Build with WAAPI: the offset is in
 * eased progress. Reduce Motion fades. A reader more than 60px up is left alone (M-MSG-33 counts it).
 */
export function useReplyFromTyping(scroller: RefObject<HTMLElement | null>, count: number, typing: boolean, enabled: boolean, reduced: boolean): void {
  const seen = useRef(count);
  const box = useRef<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = count;
    const el = scroller.current;
    if (!enabled || !el) return;
    const dots = el.querySelector<HTMLElement>('.ch-msv-typing');
    const was = box.current;
    if (dots) {
      const r = dots.getBoundingClientRect();
      box.current = { w: r.width, h: r.height };
    }
    if (count <= before || !was) return;
    if (!dots) box.current = null;
    if (el.scrollHeight - el.clientHeight - el.scrollTop > 60) return;
    const rows = el.querySelectorAll<HTMLElement>('.ch-ms-msg:not(.is-mine)');
    const bub = rows[rows.length - 1]?.querySelector<HTMLElement>('.ch-ms-bub');
    if (!bub?.animate) return;
    if (reduced) {
      bub.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS });
      return;
    }
    const b = bub.getBoundingClientRect();
    const sc = Math.max(0.45, Math.min(1, Math.min(was.w / (b.width || 1), was.h / (b.height || 1))));
    const curve = chSpringCurve('reveal');
    bub.style.transformOrigin = '0% 100%';
    bub.animate(
      [
        { transform: `scale(${sc})`, opacity: 0, offset: 0 },
        { transform: `scale(${sc + (1 - sc) * 0.35})`, opacity: 1, offset: 0.35 },
        { transform: 'none', opacity: 1, offset: 1 },
      ],
      { duration: curve.ms, easing: curve.linear },
    );
  }, [scroller, count, typing, enabled, reduced]);
}

/** Where the tapped row's face was, for the flight into the thread bar. Set on the tap, taken once by the opening thread. */
const lastFace: { el: HTMLElement | null; rect: DOMRect | null } = { el: null, rect: null };

/** The inbox's capture click: remember the face of the row or pin that was tapped. */
export function noteTappedFace(target: EventTarget | null): void {
  const row = (target as Element | null)?.closest?.('.ch-ms-row, .ch-msv-pin');
  const face = row?.querySelector<HTMLElement>('.ch-avatar, .ch-ms-grp');
  lastFace.el = face ?? null;
  lastFace.rect = face ? face.getBoundingClientRect() : null;
}

/**
 * The tapped face flies to the bar's face on the push's own clock (M-MSG-01b): a clone, translated and scaled from origin 0 0, with the
 * bar face hidden until it lands. Leaving mid-push removes the clone at once and shows the bar face. No flight under Reduce Motion.
 */
export function useFaceFlight(enabled: boolean, reduced: boolean): void {
  useLayoutEffect(() => {
    const { el, rect } = lastFace;
    lastFace.el = null;
    lastFace.rect = null;
    if (!enabled || reduced || !el || !rect) return;
    const target = document.querySelector<HTMLElement>('.ch-msp-who > :first-child');
    if (!target) return;
    const to = target.getBoundingClientRect();
    const clone = el.cloneNode(true) as HTMLElement;
    Object.assign(clone.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', transformOrigin: '0 0', zIndex: '60', pointerEvents: 'none' });
    clone.setAttribute('aria-hidden', 'true');
    document.body.appendChild(clone);
    target.style.visibility = 'hidden';
    const curve = chSpringCurve('smooth');
    const flight = clone.animate(
      [{ transform: 'none' }, { transform: `translate(${to.left - rect.left}px, ${to.top - rect.top}px) scale(${to.width / (rect.width || 1)})` }],
      { duration: 462, easing: curve.linear },
    );
    const land = () => {
      clone.remove();
      target.style.visibility = '';
    };
    flight.onfinish = land;
    return () => {
      flight.cancel();
      land();
    };
  }, [enabled, reduced]);
}
