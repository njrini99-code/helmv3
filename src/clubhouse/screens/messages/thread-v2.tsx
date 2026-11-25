'use client';

import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CH_DUR_MS, CH_EASE_IOS_CSS, chSpringCurve, CH_SPRING_SETTLE_MS, CH_MS } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Icon } from '../../ui/Icon';
import { THREAD_SETTLE_MS } from './use-thread-anchor';
import { msAnimate, springScroll } from './motion/messages-motion';
import { stampSend } from './thread/send-stamps';
import { HOUSE_EASE, JUMP_FAR, JUMP_SCALE, PILL_GAP, PILL_HIDE_MS, SEND_KEY_SCALE_FROM } from './motion/messages-beats';

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
 * height above the end (a count alone never shows it). It scales in from 0.6 on `settle`, leaves in 160 ms to 0.8, and a return
 * mid-leave comes back from the live frame on the same node (MC-09). Reduce Motion crossfades both. The count hides at the end.
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
    // Every open holds, not only one whose messages have yet to land: a thread already laid out still sits at its top until the
    // anchor pins it, and that read flashed the key in and out as the screen opened (motion gate, messages-stress, 2026-11-25).
    let settling = true;
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
    const timer = window.setTimeout(settled, THREAD_SETTLE_MS);
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
        // Back mid-leave: return from where the key is now, on the same node (MOT-JMP-1, MC-09).
        const live = getComputedStyle(el);
        const from = { opacity: live.opacity, transform: live.transform };
        leave.current.onfinish = null;
        leave.current.cancel();
        leave.current = null;
        msAnimate(el, [from, { opacity: 1, transform: 'none' }], 'settle', { reduced });
      } else if (!shown.current) {
        msAnimate(el, [{ opacity: 0, transform: `scale(${JUMP_SCALE.from})` }, { opacity: 1, transform: 'none' }], 'settle', { reduced });
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
 * The thread making room (MOTION-AND-VISUAL 3.5, M-MSG-07b, B7): whatever the commit added to the list (a message, yours or
 * theirs, and a date pill or a receipt with it, or the typing row) has its full height at frame one, and the thread moves up
 * by that much by transform only: the rows above slide to their new places (FLIP) over the base beat on the iOS curve,
 * whatever the cause, and a removal closes up on the same beat. A new message only rises its own 8 px (ui/ListPresence):
 * the move is taken back off its row on the same clock, so it never travels with the rows above it. Two in a row fold: the
 * new move starts from where the running one has the list, one animation at a time, so it stays on the compositor (an
 * additive animation can't). Only for a reader at the end: anyone reading further up stays put. A thread's first messages
 * landing are not room to make: the thread opens at rest.
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
    for (const running of list.getAnimations?.() ?? []) running.cancel();
    const from = d + moved;
    list.animate([{ transform: `translateY(${from}px)` }, { transform: 'none' }], MAKE_ROOM);
    if (count <= before) return;
    // The messages this commit added hold their place while the rows above make room: their own rise is the arrival.
    const rows = Array.from(list.querySelectorAll<HTMLElement>('.ch-ms-msg[id]')).slice(-Math.min(count - before, 4));
    for (const row of rows) {
      for (const part of Array.from(row.children) as HTMLElement[]) {
        if (part.matches('.ch-ms-msg__av, .ch-ms-msg__col')) part.animate?.([{ transform: `translateY(${-from}px)` }, { transform: 'none' }], MAKE_ROOM);
      }
    }
  });
}
/** The thread's move: a list insert's FLIP, the base beat on the iOS curve (3.5). */
const MAKE_ROOM: KeyframeAnimationOptions = { duration: CH_DUR_MS.base, easing: CH_EASE_IOS_CSS };

/** The bubble's drawn tail (`redesign.css` `.tail`), on the last bubble of a run. */
export function BubbleTail() {
  return (
    <svg className="ch-msv-tail" viewBox="0 0 18 20" aria-hidden="true">
      <path d="M0 0h12c0 9 1.6 14.5 6 20-5.2.3-9.8-.9-13.4-3.6L0 20z" />
    </svg>
  );
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
 * A sent message is an insert (MOTION-AND-VISUAL 3.5): its row rises 8 px in on the base beat and the iOS curve
 * (ui/ListPresence) while the thread makes room (useThreadMakeRoom); the send flight it replaces (the launch and send springs)
 * is gone. This notes when each of your messages arrived, so its Delivered receipt can wait out the rise (send-stamps.ts).
 */
export function useSendStamps(scroller: RefObject<HTMLElement | null>, count: number, enabled: boolean): void {
  const seen = useRef(count);
  useLayoutEffect(() => {
    const before = seen.current;
    seen.current = count;
    const el = scroller.current;
    if (!enabled || !el || count <= before || before === 0) return;
    const rows = Array.from(el.querySelectorAll<HTMLElement>('.ch-ms-msg[id]')).slice(-Math.min(count - before, 4));
    for (const row of rows) if (row.classList.contains('is-mine')) stampSend(row.id.replace(/^ch-ms-message-/, ''));
  }, [scroller, count, enabled]);
}

/** The send key: hidden with an empty field, springs in on `settle`, and shrinks out from where it is before it hides (M-MSG-06). */
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
    const curve = chSpringCurve('settle');
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

/** A chip arriving in the composer (a file, a reply) is an insert (3.5): it rises 8 px as it fades in, over the base beat on the iOS curve; Reduce Motion, it appears (MSG-FILE-02, MSG-REPLY-02). */
export function useChipRise(reduced: boolean): (el: HTMLElement | null) => void {
  // One callback for the life of the composer: a new ref each render made React call it on every keystroke, and every chip rose again.
  const still = useRef(reduced);
  still.current = reduced;
  return useCallback((el) => {
    if (!el || still.current || !el.animate) return;
    el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: CH_DUR_MS.base, easing: CH_EASE_IOS_CSS });
  }, []);
}
