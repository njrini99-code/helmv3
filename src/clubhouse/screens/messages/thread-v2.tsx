'use client';

import { ArrowDown } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CH_FADE_MS, chSpringCurve, CH_EASE, chSpringAt } from '../../lib/motion';
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
      let inFlow = false;
      for (const d of Array.from(el.querySelectorAll<HTMLElement>('.ch-ms-day'))) {
        const at = d.getBoundingClientRect();
        // Trap 6: a day pill already on screen near the top says the day, so the floating one doesn't double it.
        if (at.bottom > top && at.top < top + 60) inFlow = true;
        if (at.top > top + 8) break;
        day = d.querySelector('span')?.firstChild?.textContent ?? d.textContent;
      }
      setLabel(day);
      setOn(day != null && !inFlow);
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
  // M-MSG-24a, b: leaving is a fade from the live values, and coming back mid-fade pops from there on the same node (case 9).
  const wanted = far || unseen > 0;
  const [mounted, setMounted] = useState(wanted);
  const key = useRef<HTMLButtonElement | null>(null);
  const leave = useRef<Animation | null>(null);
  if (wanted && !mounted) setMounted(true);
  useLayoutEffect(() => {
    const el = key.current;
    if (!el?.animate) {
      if (!wanted) setMounted(false);
      return;
    }
    if (wanted) {
      if (!leave.current) return;
      const live = getComputedStyle(el);
      const from = { opacity: live.opacity, transform: live.transform };
      leave.current.onfinish = null;
      leave.current.cancel();
      leave.current = null;
      const curve = chSpringCurve('pop');
      el.animate([from, { opacity: 1, transform: 'none' }], { duration: curve.ms, easing: curve.linear });
      return;
    }
    const live = getComputedStyle(el);
    const gone = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'none' : 'scale(0.8)';
    const out = el.animate([{ opacity: live.opacity, transform: live.transform }, { opacity: 0, transform: gone }], { duration: 160, easing: `cubic-bezier(${CH_EASE.join(', ')})`, fill: 'forwards' });
    out.onfinish = () => {
      leave.current = null;
      setMounted(false);
    };
    leave.current = out;
  }, [wanted]);
  if (!mounted) return null;
  return (
    <button ref={key} type="button" className="ch-msv-jump" aria-label={unseen > 0 ? `Jump to latest, ${unseen} new` : 'Jump to latest'} onClick={onJump}>
      <Icon icon={ArrowDown} size={19} />
      {unseen > 0 && <b className="ch-num">{unseen}</b>}
    </button>
  );
}

/**
 * Jump to latest (M-MSG-24c): 921ms on `reveal`, the end re-read each frame so a message landing mid-glide is included. A wheel, a
 * touch or a press on the thread stops it where it is. Reduce Motion: straight to the end.
 */
export function useSpringToEnd(scroller: RefObject<HTMLElement | null>, toEnd: () => void, reduced: boolean): () => void {
  return () => {
    const el = scroller.current;
    if (!el || reduced) return toEnd();
    const from = el.scrollTop;
    const started = performance.now();
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      for (const type of ['wheel', 'touchstart', 'pointerdown']) el.removeEventListener(type, stop);
    };
    for (const type of ['wheel', 'touchstart', 'pointerdown']) el.addEventListener(type, stop, { passive: true });
    const step = (now: number) => {
      const t = (now - started) / 1000;
      if (t >= 0.921) {
        stop();
        toEnd();
        return;
      }
      el.scrollTop = from + (el.scrollHeight - el.clientHeight - from) * chSpringAt('reveal', t);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
}

/**
 * The thread making room (M-MSG-07b, B7): whatever the commit added to the list (the new row, and a date pill or a receipt with
 * it, or the typing row) has its full height at frame one, and the thread moves up by that much by transform only. Each change adds
 * its own animation, so two in a row stack rather than restart. Only for a reader at the end: anyone reading further up stays put.
 * Skipped when reduced. Runs after useThreadAnchor, which has already pinned the thread, in the same commit.
 */
export function useThreadMakeRoom(scroller: RefObject<HTMLElement | null>, count: number, enabled: boolean, reduced: boolean): void {
  const height = useRef<number | null>(null);
  const seen = useRef(count);
  // The list also grows with no render (a photo loading): that isn't room to make, so the height stays current between renders.
  useEffect(() => {
    const list = scroller.current?.querySelector<HTMLElement>('.ch-ms-msgs');
    if (!enabled || !list || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      height.current = list.offsetHeight;
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, [scroller, enabled]);
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = count;
    const s = scroller.current;
    const list = s?.querySelector<HTMLElement>('.ch-ms-msgs');
    if (!enabled || !s || !list) return;
    const now = list.offsetHeight;
    const was = height.current;
    height.current = now;
    if (reduced || !list.animate || was == null) return;
    const d = Math.max(-s.clientHeight, Math.min(s.clientHeight, now - was));
    if (Math.abs(d) < 1) return;
    const moved = list.getAnimations?.().length ? new DOMMatrixReadOnly(getComputedStyle(list).transform).m42 : 0;
    const bottom = list.getBoundingClientRect().bottom - moved - s.getBoundingClientRect().top + s.scrollTop;
    const fromEnd = bottom + (parseFloat(getComputedStyle(s).paddingBottom) || 0) - s.clientHeight - s.scrollTop;
    if (fromEnd > 60) return;
    const row = list.lastElementChild as HTMLElement | null;
    // The spring follows the cause (07b): your send on `send`, a reply on `reveal`, a typing row on `pop`, a removal on `smooth`.
    const curve = chSpringCurve(count > before ? (row?.classList.contains('is-mine') ? 'send' : 'reveal') : d > 0 ? 'pop' : 'smooth');
    list.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: curve.ms, easing: curve.linear, composite: 'add' });
  });
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

/** The real bubble rises from the field to its slot (M-MSG-07a): it starts over the field's text, on `send`, from its tail corner. A second send starts its own. Reduce Motion fades in place. */
export function useSendRise(scroller: RefObject<HTMLElement | null>, count: number, enabled: boolean, reduced: boolean): void {
  const seen = useRef(count);
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = count;
    const el = scroller.current;
    if (!enabled || !el || count <= before || before === 0) return;
    const rows = el.querySelectorAll<HTMLElement>('.ch-ms-msg');
    const row = rows[rows.length - 1];
    if (!row?.classList.contains('is-mine')) return;
    const bub = row.querySelector<HTMLElement>('.ch-ms-bub, .ch-ms-img');
    if (!bub?.animate) return;
    if (reduced) {
      bub.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS });
      return;
    }
    const field = document.querySelector<HTMLElement>('.ch-ms-comp textarea');
    if (!field) return;
    const f = field.getBoundingClientRect();
    const b = bub.getBoundingClientRect();
    const d = row.getBoundingClientRect().height;
    const curve = chSpringCurve('send');
    bub.style.transformOrigin = '100% 100%';
    bub.animate(
      [{ transform: `translate(${f.left - 9 - b.left}px, ${f.bottom - b.bottom - d}px) scale(0.96)`, opacity: 0.85 }, { transform: 'none', opacity: 1 }],
      { duration: curve.ms, easing: curve.linear },
    );
  }, [scroller, count, enabled, reduced]);
}

/** The send key: hidden with an empty field, springs in on `pop`, and shrinks out from where it is before it hides (M-MSG-06). */
export function useSendKeyPop(ready: boolean, reduced: boolean): { ref: RefObject<HTMLSpanElement | null>; hidden: boolean } {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [hidden, setHidden] = useState(!ready);
  const was = useRef(ready);
  useLayoutEffect(() => {
    if (was.current === ready) return;
    was.current = ready;
    const el = ref.current;
    if (ready) setHidden(false);
    if (reduced || !el?.animate) {
      if (!ready) setHidden(true);
      return;
    }
    const curve = chSpringCurve('pop');
    const live = getComputedStyle(el);
    const anim = el.animate(
      ready
        ? [{ transform: 'scale(0.4)', opacity: 0 }, { transform: 'none', opacity: 1 }]
        : [{ transform: live.transform === 'none' ? 'none' : live.transform, opacity: live.opacity }, { transform: 'scale(0.4)', opacity: 0 }],
      { duration: curve.ms, easing: curve.linear, fill: 'none' },
    );
    if (!ready) {
      anim.onfinish = () => setHidden(true);
      return () => {
        anim.onfinish = null;
      };
    }
    return;
  }, [ready, reduced]);
  return { ref, hidden };
}

/** A chip rises 12 on `smooth` when it arrives; Reduce Motion, it appears (MSG-FILE-02, MSG-REPLY-02). */
export function useChipRise(reduced: boolean): (el: HTMLElement | null) => void {
  return (el) => {
    if (!el || reduced || !el.animate) return;
    const curve = chSpringCurve('smooth');
    el.animate([{ transform: 'translateY(12px)' }, { transform: 'none' }], { duration: curve.ms, easing: curve.linear });
  };
}
