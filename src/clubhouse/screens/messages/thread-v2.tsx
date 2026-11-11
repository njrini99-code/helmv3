'use client';

import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CH_FADE_MS, chSpringCurve, CH_SPRING_SETTLE_MS, CH_MS } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Icon } from '../../ui/Icon';
import { THREAD_SETTLE_MS } from './use-thread-anchor';
import { msAnimate, springScroll } from './motion/messages-motion';
import { stampSend } from './thread/send-stamps';
import { HOUSE_EASE, JUMP_FAR, JUMP_SCALE, PILL_GAP, PILL_HIDE_MS, SEND_KEY_SCALE_FROM, planSendRise, playSendRise } from './motion/messages-beats';

/** One day marker's box, in viewport px, for the floating date pill. */
export interface PillMarker {
  top: number;
  bottom: number;
  label: string;
}

/**
 * MSG-210 / MOT-X-1: which day the floating pill names, and whether a marker is close enough to take it over. The day is
 * the last marker that has gone above the pill's own spot; within PILL_GAP of any marker (above or below the spot) the
 * pill is `linked` and its opacity follows the scroll (`near / PILL_GAP`), so it never stacks on a marker.
 */
export function pillRead(markers: readonly PillMarker[], spot: { top: number; bottom: number }, gap = PILL_GAP): { label: string | null; near: number; linked: boolean; opacity: number } {
  let label: string | null = null;
  let near = Infinity;
  for (const m of markers) {
    if (m.top < spot.top) label = m.label;
    const d = m.bottom < spot.top ? spot.top - m.bottom : m.top > spot.bottom ? m.top - spot.bottom : 0;
    near = Math.min(near, d);
  }
  const linked = label != null && near < gap;
  return { label, near, linked, opacity: linked ? Math.max(0, Math.min(1, near / gap)) : 1 };
}

/**
 * The day of the topmost message that has passed the pill's own spot, shown while the thread scrolls and hidden a second after it stops
 * (MSG-210). The pill's spot is an always-mounted anchor (`.ch-msv-datepillspot`) so it can be measured before the pill shows.
 */
export function ThreadDatePill({ scroller, forced = false }: { scroller: RefObject<HTMLElement | null>; forced?: boolean }) {
  const [label, setLabel] = useState<string | null>(null);
  const [on, setOn] = useState(forced);
  const [linked, setLinked] = useState(false);
  const spot = useRef<HTMLDivElement | null>(null);
  const pill = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let timer = 0;
    let frame = 0;
    const read = () => {
      frame = 0;
      const top = el.getBoundingClientRect().top;
      const box = spot.current?.getBoundingClientRect();
      // jsdom has no layout: with a spot that has no box the pill sits at the scroller's top.
      const at = box && (box.top !== 0 || box.height !== 0) ? { top: box.top, bottom: pill.current?.getBoundingClientRect().bottom ?? box.top } : { top: top + 8, bottom: top + 8 };
      const markers: PillMarker[] = Array.from(el.querySelectorAll<HTMLElement>('.ch-ms-day')).map((d) => {
        const r = d.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom ?? r.top, label: d.querySelector('span')?.firstChild?.textContent ?? d.textContent ?? '' };
      });
      const r = pillRead(markers, at);
      setLabel(r.label);
      setLinked(r.linked);
      setOn(r.label != null && !r.linked);
      const node = pill.current;
      if (node) node.style.opacity = r.linked ? String(r.opacity) : '';
      window.clearTimeout(timer);
      if (!forced) {
        timer = window.setTimeout(() => {
          setOn(false);
          setLinked(false);
          if (pill.current) pill.current.style.opacity = '';
        }, PILL_HIDE_MS);
      }
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
  return (
    <>
      <div ref={spot} className="ch-msv-datepillspot" aria-hidden="true" />
      {label && (
        <div ref={pill} className={'ch-msv-datepill' + (on ? ' is-on' : '') + (linked ? ' linked' : '')} aria-hidden="true">
          {label}
        </div>
      )}
    </>
  );
}

/**
 * The jump key (MSG-211): a 40 glass circle with the unseen count, shown only once the reader is more than 0.9 of the scroller's
 * height above the end (a count alone never shows it). It scales in from 0.6 on `pop`, leaves in 160 ms to 0.8, and a return
 * mid-leave pops from the live frame on the same node (MC-09). Reduce Motion crossfades both. The count hides at the end.
 */
export function ThreadJumpKey({ scroller, unseen, onJump }: { scroller: RefObject<HTMLElement | null>; unseen: number; onJump: () => void }) {
  const [far, setFar] = useState(false);
  const reduced = useChReducedMotion();
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let frame = 0;
    // While a thread opens its messages land and it pins itself to its end (useThreadAnchor's settle), so being far from the end then means
    // nothing, and the key flashed in on every open. It reads once the settle is over, or as soon as the reader touches the thread.
    let settling = el.scrollTop === 0 && el.scrollHeight <= el.clientHeight;
    const read = () => {
      frame = 0;
      if (!settling) setFar(el.scrollHeight - el.clientHeight - el.scrollTop > el.clientHeight * JUMP_FAR);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const settled = () => {
      settling = false;
      read();
    };
    const timer = settling ? window.setTimeout(settled, THREAD_SETTLE_MS) : 0;
    const input = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const t of input) el.addEventListener(t, settled, { passive: true, once: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    // The keyboard or a turn changes how far the end is, with no scroll to say so.
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onScroll);
    resized?.observe(el);
    read();
    return () => {
      clearTimeout(timer);
      for (const t of input) el.removeEventListener(t, settled);
      resized?.disconnect();
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scroller]);
  const wanted = far;
  const [mounted, setMounted] = useState(wanted);
  const key = useRef<HTMLButtonElement | null>(null);
  const leave = useRef<Animation | null>(null);
  const shown = useRef(false);
  if (wanted && !mounted) setMounted(true);
  useLayoutEffect(() => {
    const el = key.current;
    if (!el?.animate) {
      if (!wanted) setMounted(false);
      return;
    }
    if (wanted) {
      if (leave.current) {
        // Back mid-leave: pop from where the key is now, on the same node (MOT-JMP-1, MC-09).
        const live = getComputedStyle(el);
        const from = { opacity: live.opacity, transform: live.transform };
        leave.current.onfinish = null;
        leave.current.cancel();
        leave.current = null;
        msAnimate(el, [from, { opacity: 1, transform: 'none' }], 'pop', { reduced });
      } else if (!shown.current) {
        msAnimate(el, [{ opacity: 0, transform: `scale(${JUMP_SCALE.from})` }, { opacity: 1, transform: 'none' }], 'pop', { reduced });
      }
      shown.current = true;
      return;
    }
    shown.current = false;
    const live = getComputedStyle(el);
    const out = msAnimate(el, [{ opacity: live.opacity, transform: live.transform }, { opacity: 0, transform: `scale(${JUMP_SCALE.to})` }], null, { reduced, fill: 'forwards', timing: { ms: CH_MS.fillInk, easing: HOUSE_EASE } });
    if (!out) {
      setMounted(false);
      return;
    }
    out.onfinish = () => {
      leave.current = null;
      setMounted(false);
    };
    leave.current = out;
  }, [wanted, reduced]);
  if (!mounted) return null;
  return (
    <button ref={key} type="button" className="ch-msv-jump" aria-label={unseen > 0 ? `Jump to latest, ${unseen} new` : 'Jump to latest'} onClick={onJump}>
      <Icon icon={ArrowDown} size={19} />
      {unseen > 0 && <b className="ch-num">{unseen}</b>}
    </button>
  );
}

/**
 * Jump to latest (MOT-JMP-3): `reveal` (921 ms) toward the live bottom, read from layout each frame so a message landing mid-glide is
 * included. A wheel, a touch or a press on the thread stops it where it is. Reduce Motion: straight to the end.
 */
export function useSpringToEnd(scroller: RefObject<HTMLElement | null>, toEnd: () => void, reduced: boolean): () => void {
  return () => {
    const el = scroller.current;
    if (!el || reduced) return toEnd();
    springScroll(el, 'end', 'reveal', false);
  };
}

/**
 * The thread making room (M-MSG-07b, B7): whatever the commit added to the list (the new row, and a date pill or a receipt with
 * it, or the typing row) has its full height at frame one, and the thread moves up by that much by transform only. Two in a row fold:
 * the new move starts from where the running one has the list, one animation at a time, so it stays on the compositor (an additive
 * animation can't). Only for a reader at the end: anyone reading further up stays put. A thread's first messages landing are not room to
 * make: the thread opens at rest.
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
    if (reduced || !list.animate || was == null || before === 0) return;
    const d = Math.max(-s.clientHeight, Math.min(s.clientHeight, now - was));
    if (Math.abs(d) < 1) return;
    const moved = list.getAnimations?.().length ? new DOMMatrixReadOnly(getComputedStyle(list).transform).m42 : 0;
    const bottom = list.getBoundingClientRect().bottom - moved - s.getBoundingClientRect().top + s.scrollTop;
    const fromEnd = bottom + (parseFloat(getComputedStyle(s).paddingBottom) || 0) - s.clientHeight - s.scrollTop;
    if (fromEnd > 60) return;
    const row = list.lastElementChild as HTMLElement | null;
    // The spring follows the cause (07b): your send on `send`, a reply on `reveal`, a typing row on `pop`, a removal on `smooth`.
    const curve = chSpringCurve(count > before ? (row?.classList.contains('is-mine') ? 'send' : 'reveal') : d > 0 ? 'pop' : 'smooth');
    for (const running of list.getAnimations?.() ?? []) running.cancel();
    list.animate([{ transform: `translateY(${d + moved}px)` }, { transform: 'none' }], { duration: curve.ms, easing: curve.linear });
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
      { duration: CH_SPRING_SETTLE_MS, easing: curve.linear },
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

/**
 * Send (MOT-SEND-6, -7; Q-19 fallback shape): the REAL bubble leaves the field. Up on `launch` (one soft overshoot), sideways on
 * the house ease over 62% of it, scale .92 > 1 on `pop` from its lower left; a text bubble starts as the plain words exactly where
 * they sat in the field and the green fill comes up under them in 160 ms; the tail grows in last; a file or poll also fades in.
 * Several bubbles sent at once are delayed 40 ms and lifted 8 px a step. Reduce Motion: the bubble crossfades in place.
 *
 * Runs after useThreadMakeRoom, whose glide is already holding the rows low when the boxes are read: the bubble's resting place is
 * its measured box less that hold, and the glide is cancelled on the new row alone (`counter`), so the bubble starts on the field
 * and follows the launch spring only. (It used to subtract the row's height from a box that already included the hold, and so
 * began one row above the field: the words never left the composer, they appeared over it.)
 */
export function useSendRise(scroller: RefObject<HTMLElement | null>, count: number, enabled: boolean, reduced: boolean): void {
  const seen = useRef(count);
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = count;
    const el = scroller.current;
    if (!enabled || !el || count <= before || before === 0) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>('.ch-ms-msg'));
    const added = Math.min(count - before, 4);
    const fresh = rows.slice(-added);
    if (!fresh[fresh.length - 1]?.classList.contains('is-mine')) return;
    const field = document.querySelector<HTMLElement>('.ch-ms-comp textarea');
    const f = field?.getBoundingClientRect();
    const glide = reduced ? null : readGlide(el.querySelector<HTMLElement>('.ch-ms-msgs'));
    fresh.forEach((row, n) => {
      if (!row.classList.contains('is-mine')) return;
      stampSend(row.id.replace(/^ch-ms-message-/, ''));
      const bub = row.querySelector<HTMLElement>('.ch-ms-bub, .ch-ms-img');
      if (!bub?.animate) return;
      if (reduced || !f) {
        playSendRise(bub, planSendRise({ field: { left: 0, bottom: 0 }, bubble: { left: 0, bottom: 0 }, text: false }), { reduced: true });
        return;
      }
      const b = bub.getBoundingClientRect();
      const text = bub.classList.contains('ch-ms-bub') && !bub.classList.contains('ch-ms-bub--file');
      const plan = planSendRise({ field: { left: f.left, bottom: f.bottom }, bubble: { left: b.left, bottom: b.bottom - (glide?.now ?? 0) }, text, step: fresh.length - 1 - n });
      const line = row.querySelector<HTMLElement>('.ch-ms-msg__line');
      playSendRise(bub, plan, {
        reduced: false,
        tail: bub.querySelector<HTMLElement>('.ch-msv-tail'),
        carrier: row.querySelector<HTMLElement>('.ch-ms-msg__stack'),
        counter: glide && line ? { el: line, from: glide.from, ms: glide.ms, easing: glide.easing } : null,
        ink: text && field ? getComputedStyle(field).color : null,
      });
    });
  }, [scroller, count, enabled, reduced]);
}

/**
 * The thread's make-room glide as it stands: how far it holds the list low right now (already in every measured box), where it
 * began, and its clock, so a send can cancel it on its own row. Null when the list is not gliding (a reader further up, jsdom).
 */
function readGlide(list: HTMLElement | null): { now: number; from: number; ms: number; easing: string } | null {
  const running = list?.getAnimations?.().find((a) => a.effect instanceof KeyframeEffect && a.effect.getKeyframes().some((k) => typeof k.transform === 'string' && k.transform !== 'none'));
  if (!list || !running || typeof DOMMatrixReadOnly === 'undefined') return null;
  const effect = running.effect as KeyframeEffect;
  const timing = effect.getTiming();
  const y = (transform: string) => (transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0);
  return { now: y(getComputedStyle(list).transform), from: y(String(effect.getKeyframes()[0]?.transform ?? 'none')), ms: Number(timing.duration) || 0, easing: String(timing.easing ?? 'linear') };
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
        ? [{ transform: `scale(${SEND_KEY_SCALE_FROM})`, opacity: 0 }, { transform: 'none', opacity: 1 }]
        : [{ transform: live.transform === 'none' ? 'none' : live.transform, opacity: live.opacity }, { transform: `scale(${SEND_KEY_SCALE_FROM})`, opacity: 0 }],
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
  // One callback for the life of the composer: a new ref each render made React call it on every keystroke, and every chip rose again.
  const still = useRef(reduced);
  still.current = reduced;
  return useCallback((el) => {
    if (!el || still.current || !el.animate) return;
    const curve = chSpringCurve('smooth');
    el.animate([{ transform: 'translateY(12px)' }, { transform: 'none' }], { duration: curve.ms, easing: curve.linear });
  }, []);
}
