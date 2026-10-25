'use client';

import { animate, m, useMotionValue, useTransform, type AnimationPlaybackControls, type MotionValue } from 'motion/react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import type { ChShellData } from '../data/shell';
import { haptic } from '../lib/haptics';
import { CH_DUR, CH_EASE, chSpring, chSpringCurve } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { Icon } from '../ui/Icon';
import { phoneSectionFor, phoneSectionsFor, type ChNavItem, type ChRole } from './nav';
import { badgeCount } from './badge-count';

/**
 * The phone's section switcher (docs/clubhouse/phone/section-strip.md, owner 2026-10-12): no tab bar; the section's
 * name in the top bar opens a strip of every section under it. This holds what the title, the strip and the top bar's
 * gestures share:
 *
 *   progress   the strip's travel out from under the bar, 0 shut to 1 open. A tap springs it; a pull on the bar drives
 *              it with the finger and a release springs it on from there, at the speed it was let go.
 *   shown      the section the title names: the one just chosen (a pill, a swipe) until its page arrives, so the title
 *              changes in the tap, not after the network.
 *   dragX      the title's offset while the bar is swiped sideways.
 *
 * Desktop never opens it: the strip, the title's chevron and the gestures are phone-only (CSS and PHONE below).
 */
const PHONE = '(max-width: 820px)';

export interface ChSectionSwitch {
  /** False outside the provider (the dev preview's bare pieces, tests): the title renders as plain text. */
  enabled: boolean;
  sections: readonly ChNavItem[];
  /** The address's section. */
  current: ChNavItem | undefined;
  /** What the title and the strip show as current: a section just chosen, else the address's. */
  shown: ChNavItem | undefined;
  /** A section was chosen and its page hasn't arrived: the title already names it, and the bar's buttons (the old
   *  section's) step back until the new page brings its own (phone test 2026-10-13). */
  switching: boolean;
  /** A section switch has just landed (a moment after its page arrives): the bar can settle into the new page's layout
   *  with motion instead of jumping to it. */
  arrived: boolean;
  /** The address is its section's own page (a root), where the bar's gestures apply. */
  root: boolean;
  open: boolean;
  progress: MotionValue<number>;
  dragX: MotionValue<number>;
  /** Which side a new title comes in from: 1 from the right (the next section), -1 from the left. */
  dir: 1 | -1;
  counts: Readonly<Record<string, number | null>>;
  /** Another section than this one has something new: the closed title carries a dot. */
  attention: boolean;
  setOpen: (open: boolean, velocity?: number) => void;
  /** Stops the strip where it is, for a finger to take it. */
  grab: () => void;
  /** A pill was tapped: the title and plate change now, the strip closes, and the link navigates. */
  choose: (item: ChNavItem) => void;
  /** A committed swipe: the neighbouring section, if there is one (no wrap). Navigates and returns true. */
  step: (delta: 1 | -1) => boolean;
  accountOpen: boolean;
  setAccountOpen: (open: boolean) => void;
}

const Ctx = createContext<ChSectionSwitch | null>(null);

export function useSectionSwitch(): ChSectionSwitch | null {
  return useContext(Ctx);
}

/** The title button that is visible now (the shell bar's, or a page's own start title), for focus to return to. */
export function focusSectionTitle(): void {
  const all = Array.from(document.querySelectorAll<HTMLElement>('.ch-root .ch-sw'));
  const el = all.find((b) => b.offsetParent !== null) ?? all[0];
  el?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
}

export function SectionSwitchProvider({
  pathname,
  role,
  shell,
  children,
}: {
  pathname: string;
  role: ChRole;
  shell: ChShellData;
  children: ReactNode;
}) {
  const router = useRouter();
  const reduced = useChReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const badges = useNotificationBadges();
  const sections = useMemo(() => phoneSectionsFor(role, shell), [role, shell]);
  const path = pathname.replace(/\/$/, '') || '/';
  const current = phoneSectionFor(path, role, shell);
  const root = !!current && path === current.href;
  const [pending, setPending] = useState<ChNavItem | null>(null);
  const shown = pending ?? current;
  const switching = !!pending && pending.id !== current?.id;
  const [open, setOpenState] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [arrived, setArrived] = useState(false);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const progress = useMotionValue(0);
  const dragX = useMotionValue(0);
  const travel = useRef<AnimationPlaybackControls | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // A tap's open or close runs on the compositor: the strip, its pills' fade and the chevron play the spring as WAAPI
  // keyframes, and `progress` lands on the end when they finish (or at the start, opening, so the strip is shown). As a
  // Motion spring it wrote those styles on the main thread each frame, so the new page rendering under a tap stalled
  // it (owner, 2026-10-15: "super slow and choppy"). A drag and its throw stay with Motion, which carries the speed.
  const glide = useRef<{ anims: Animation[]; from: number; to: number; ms: number; ease: (t: number) => number; t0: number } | null>(null);
  const stopGlide = useCallback(() => {
    const g = glide.current;
    if (!g) return;
    glide.current = null;
    const t = Math.min(1, (performance.now() - g.t0) / g.ms);
    land(g.anims);
    progress.jump(g.from + (g.to - g.from) * g.ease(t));
  }, [progress]);
  const setOpen = useCallback(
    (next: boolean, velocity = 0) => {
      setOpenState(next);
      travel.current?.stop();
      stopGlide();
      const to = next ? 1 : 0;
      const from = progress.get();
      const strip = document.getElementById('ch-strip');
      if (velocity || reducedRef.current || !strip || from === to || typeof strip.animate !== 'function') {
        travel.current = animate(progress, to, chSpring('smooth', reducedRef.current, velocity));
        return;
      }
      const { ms, ease } = chSpringCurve('smooth');
      const n = Math.max(2, Math.round(ms / 16));
      const ps = Array.from({ length: n + 1 }, (_, i) => from + (to - from) * ease(i / n));
      const play = (el: Element | null | undefined, frame: (p: number) => Keyframe) =>
        el?.animate?.(ps.map(frame), { duration: ms, easing: 'linear', fill: 'forwards' });
      const anims = [
        play(strip, (p) => ({ transform: `translateY(${(p - 1) * 100}%)` })),
        play(strip.querySelector('.ch-strip__row'), (p) => ({ opacity: p < 0.4 ? (p / 0.4) * 0.55 : 0.55 + ((p - 0.4) / 0.6) * 0.45 })),
        ...Array.from(document.querySelectorAll('.ch-sw__chev'), (el) => play(el, (p) => ({ transform: `rotate(${p * 180}deg)` }))),
      ].filter((a): a is Animation => !!a);
      const g = { anims, from, to, ms, ease, t0: performance.now() };
      glide.current = g;
      if (next) progress.jump(to);
      anims[0]?.addEventListener('finish', () => {
        if (glide.current !== g) return;
        glide.current = null;
        land(anims);
        progress.jump(to);
      });
    },
    [progress, stopGlide],
  );
  const grab = useCallback(() => {
    travel.current?.stop();
    stopGlide();
  }, [stopGlide]);

  const indexOf = useCallback((item: ChNavItem | undefined) => (item ? sections.findIndex((s) => s.id === item.id) : -1), [sections]);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const choose = useCallback(
    (item: ChNavItem) => {
      const from = indexOf(shownRef.current);
      if (shownRef.current?.id !== item.id) {
        haptic('select');
        setDir(indexOf(item) >= from ? 1 : -1);
        setPending(item);
      }
      setOpen(false);
    },
    [indexOf, setOpen],
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      const next = sections[indexOf(shownRef.current) + delta];
      if (!next) return false;
      // A step to the next section is navigation, so it is silent (D-70, A14).
      setDir(delta);
      setPending(next);
      if (openRef.current) setOpen(false);
      // RouteFrame restores the scroll (SectionStrip says why Next's is off).
      router.push(next.href, { scroll: false });
      return true;
    },
    [indexOf, router, sections, setOpen],
  );

  // A new address settles the title on its own section and closes the strip.
  useEffect(() => {
    const switched = pendingRef.current !== null;
    setPending(null);
    if (openRef.current) setOpen(false);
    // Reached another way (Back, a link): nothing of a switch is left standing, even one cut short.
    if (!switched) {
      setArrived(false);
      return;
    }
    setArrived(true);
    const id = window.setTimeout(() => setArrived(false), 600);
    return () => window.clearTimeout(id);
  }, [pathname, setOpen]);

  // Esc closes the strip, and focus goes back to the title.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      focusSectionTitle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const counts = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, badgeCount(s, badges, shell)])), [sections, badges, shell]);
  const attention = sections.some((s) => s.id !== shown?.id && (counts[s.id] ?? 0) > 0);

  const value = useMemo<ChSectionSwitch>(
    () => ({ enabled: true, sections, current, shown, switching, arrived, root, open, progress, dragX, dir, counts, attention, setOpen, grab, choose, step, accountOpen, setAccountOpen }),
    [sections, current, shown, switching, arrived, root, open, progress, dragX, dir, counts, attention, setOpen, grab, choose, step, accountOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The section's name as the switcher (CH-1816): the label, a chevron that turns as the strip comes out, and a dot
 * while another section has something new. A new section's name comes in from the side it lies on. Outside the
 * provider it is the plain label.
 */
export function SectionTrigger({ children }: { children: ReactNode }) {
  const sw = useSectionSwitch();
  const reduced = useChReducedMotion();
  const fallback = useMotionValue(0);
  const turn = useTransform(sw?.progress ?? fallback, [0, 1], [0, 180]);
  const fade = useTransform(sw?.dragX ?? fallback, (x) => 1 - Math.min(Math.abs(x) / 160, 0.65));
  const chosen = sw?.shown && sw.shown.id !== sw.current?.id ? sw.shown : null;
  const key = (chosen ?? sw?.current)?.id ?? 'page';
  const label = chosen ? chosen.label : children;
  // The name that is leaving: it is laid over the new one (out of the flow), so nothing is measured as they swap.
  const [now, setNow] = useState({ key, label });
  const [out, setOut] = useState<{ n: number; label: ReactNode; dir: 1 | -1 } | null>(null);
  if (now.key !== key) {
    setOut({ n: (out?.n ?? 0) + 1, label: now.label, dir: sw?.dir ?? 1 });
    setNow({ key, label });
  } else if (typeof label === 'string' && label !== now.label) setNow({ key, label });
  const inRef = useRef<HTMLSpanElement>(null);
  const outRef = useRef<HTMLSpanElement>(null);
  // The new name comes in from the side it lies on and the old one leaves the other way, as compositor transforms
  // (WAAPI), so the change stays smooth on a phone while the new page renders on the main thread (owner, 2026-10-15:
  // "super slow and choppy"). Not AnimatePresence's popLayout, which measured the leaving name mid-frame.
  const outN = out?.n;
  useLayoutEffect(() => {
    if (outN === undefined) return;
    const d = out?.dir ?? 1;
    const leave = !reduced && outRef.current?.animate?.(
      [{ transform: 'none', opacity: 1 }, { transform: `translateX(${d * -28}px)`, opacity: 0 }],
      { duration: CH_DUR.quick * 1000, easing: `cubic-bezier(${CH_EASE.join(', ')})`, fill: 'forwards' },
    );
    if (!leave) {
      setOut(null);
      return;
    }
    const { ms, linear } = chSpringCurve('settle');
    inRef.current?.animate?.([{ transform: `translateX(${d * 28}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: ms, easing: linear });
    leave.onfinish = () => setOut((o) => (o?.n === outN ? null : o));
    return () => {
      leave.onfinish = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one run per name change
  }, [outN]);
  const tail = useRef<HTMLSpanElement>(null);
  const width = useRef<number | null>(null);
  // The old name leaves the layout as the new one takes its place, so the chevron and dot glide from where they were
  // to the new width instead of jumping to it, as a compositor `translate` (WAAPI). Not Motion's layout projection,
  // which measured the whole bar on every render of a switch (owner, 2026-10-15: "super slow and choppy"). The new
  // name's width comes from a ResizeObserver, which reports after the browser's own layout and before that frame
  // paints: reading the tail's place in this effect forced the new page's whole layout inside React's commit, the
  // largest single part of a switch's script (15ms of 107 at 4x CPU, Chromium, production build, 2026-10-15).
  useLayoutEffect(() => {
    const label = inRef.current;
    if (!label || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(([entry]) => {
      const w = entry?.borderBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width;
      if (w === undefined) return;
      // A name with no width is not drawn (its bar is display: none while the page's own bar holds the switcher, or its
      // text has no font yet). There is no place to glide from, so the next drawn width lands where it is: gliding from 0
      // started the chevron and dot on top of the name's first letters (A22).
      if (w < 1) {
        width.current = null;
        return;
      }
      const from = width.current;
      width.current = w;
      const el = tail.current;
      if (from === null || !el || reduced || Math.abs(from - w) < 0.5) return;
      const { ms, linear } = chSpringCurve('smooth');
      el.getAnimations?.().forEach((a) => a.cancel());
      el.animate?.([{ translate: `${from - w}px 0` }, { translate: '0 0' }], { duration: ms, easing: linear });
    });
    watch.observe(label);
    return () => watch.disconnect();
  }, [key, reduced]);
  if (!sw?.enabled) return <>{children}</>;
  return (
    <button
      type="button"
      className="ch-sw"
      data-ch-code="CH-1816"
      aria-expanded={sw.open}
      aria-controls="ch-strip"
      onClick={() => sw.setOpen(!sw.open)}
    >
      <m.span className="ch-sw__track" style={{ x: sw.dragX, opacity: fade }}>
        {out && (
          <span key={`out-${out.n}`} ref={outRef} className="ch-sw__label ch-sw__label--out" aria-hidden="true">
            {out.label}
          </span>
        )}
        <span key={key} ref={inRef} className="ch-sw__label">
          {label}
        </span>
      </m.span>
      <span className="ch-sw__tail" ref={tail}>
        <m.span className="ch-sw__chev" style={{ rotate: turn }} aria-hidden="true">
          <Icon icon={ChevronDown} size={15} />
        </m.span>
        {sw.attention && <span className="ch-sw__dot" aria-hidden="true" />}
      </span>
      {sw.attention && <span className="ch-sr-only">, something new in another section</span>}
    </button>
  );
}

/**
 * Hands each animation's place to its element's own style before it goes, so no frame shows the style Motion has yet
 * to rewrite. An element no longer drawn has nothing to keep.
 */
function land(anims: Animation[]): void {
  for (const a of anims) {
    try {
      a.commitStyles();
    } catch {
      // Not rendered (the strip went away mid-move): nothing to carry over.
    }
    a.cancel();
  }
}

/** Resistance: free travel slows as it grows; past either end it barely moves. */
function rubber(d: number, end: boolean): number {
  if (end) return d * 0.18;
  return d / (1 + Math.abs(d) / 240);
}

/**
 * The top bar's gestures on a section's own page (section-strip.md): pull down to draw the strip out under the
 * finger, swipe sideways to step to the next or previous section. A touch decides its axis after 8px. A swipe that
 * starts within 20px of the left edge is the iOS back gesture's. A drag never also counts as a tap on the title.
 */
export function useSectionGestures(bar: RefObject<HTMLElement | null>, enabled: boolean): void {
  const sw = useSectionSwitch();
  const swRef = useRef(sw);
  swRef.current = sw;
  const reduced = useChReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  useEffect(() => {
    const el = bar.current;
    if (!el || !enabled || !swRef.current?.enabled) return;
    type Drag = { id: number; x: number; y: number; axis: 'x' | 'y' | null; base: number; vx: number; vy: number; lx: number; ly: number; lt: number };
    let d: Drag | null = null;
    const height = () => document.getElementById('ch-strip')?.offsetHeight || 60;
    const ends = () => {
      const s = swRef.current;
      if (!s) return { first: true, last: true };
      const i = s.sections.findIndex((x) => x.id === s.shown?.id);
      return { first: i <= 0, last: i < 0 || i >= s.sections.length - 1 };
    };
    const swallowClick = () => {
      const stop = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
      };
      el.addEventListener('click', stop, { capture: true, once: true });
      window.setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 0);
    };
    const down = (e: PointerEvent) => {
      if (!window.matchMedia(PHONE).matches || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (e.clientX < 20) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('.ch-topbar__actions, .ch-pbar__right, .ch-pbar__back, .ch-pbar__text, .ch-pbar__icon')) return;
      const now = performance.now();
      d = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, base: swRef.current?.progress.get() ?? 0, vx: 0, vy: 0, lx: e.clientX, ly: e.clientY, lt: now };
    };
    const move = (e: PointerEvent) => {
      const s = swRef.current;
      if (!d || !s || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.axis) {
        if (Math.hypot(dx, dy) < 8) return;
        d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        // Upward on a shut strip is nothing to take.
        if (d.axis === 'y' && dy < 0 && d.base <= 0) {
          d = null;
          return;
        }
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // A pointer that already went away.
        }
        if (d.axis === 'y') {
          s.grab();
          d.base = s.progress.get();
        }
      }
      const now = performance.now();
      const dt = Math.max(1, now - d.lt);
      d.vx = 0.8 * ((e.clientX - d.lx) / dt) + 0.2 * d.vx;
      d.vy = 0.8 * ((e.clientY - d.ly) / dt) + 0.2 * d.vy;
      d.lx = e.clientX;
      d.ly = e.clientY;
      d.lt = now;
      if (d.axis === 'y') {
        const p = d.base + dy / height();
        s.progress.set(p > 1 ? 1 + (p - 1) * 0.15 : Math.max(0, p));
      } else {
        const { first, last } = ends();
        s.dragX.set(rubber(dx, dx > 0 ? first : last));
      }
    };
    const up = (e: PointerEvent) => {
      const s = swRef.current;
      if (!d || !s || e.pointerId !== d.id) return;
      const drag = d;
      d = null;
      if (!drag.axis) return;
      swallowClick();
      if (drag.axis === 'y') {
        const h = height();
        const p = s.progress.get();
        const open = drag.vy > 0.45 ? true : drag.vy < -0.45 ? false : p > 0.5;
        // The release speed, in the strip's own units (its height per second), carried into the spring.
        s.setOpen(open, (drag.vy * 1000) / h);
        return;
      }
      const dx = e.clientX - drag.x;
      const flick = Math.abs(drag.vx) > 0.45 && Math.sign(drag.vx) === Math.sign(dx);
      if (Math.abs(dx) > 56 || flick) s.step(dx < 0 ? 1 : -1);
      animate(s.dragX, 0, chSpring('smooth', reducedRef.current, drag.vx * 1000));
    };
    const cancel = (e: PointerEvent) => {
      const s = swRef.current;
      if (!d || !s || e.pointerId !== d.id) return;
      const axis = d.axis;
      d = null;
      if (axis === 'x') animate(s.dragX, 0, chSpring('smooth', reducedRef.current));
      if (axis === 'y') s.setOpen(s.progress.get() > 0.5);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [bar, enabled]);
}
