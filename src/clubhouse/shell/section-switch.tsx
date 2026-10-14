'use client';

import { AnimatePresence, animate, m, useMotionValue, useTransform, type AnimationPlaybackControls, type MotionValue } from 'motion/react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import type { ChShellData } from '../data/shell';
import { haptic } from '../lib/haptics';
import { CH_DUR, CH_EASE, chSpring } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { Icon } from '../ui/Icon';
import { findLargeTitle } from './large-title';
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
  const sections = useMemo(() => phoneSectionsFor(role), [role]);
  const path = pathname.replace(/\/$/, '') || '/';
  const current = phoneSectionFor(path, role);
  const root = !!current && path === current.href;
  const [pending, setPending] = useState<ChNavItem | null>(null);
  const shown = pending ?? current;
  const switching = !!pending && pending.id !== current?.id;
  const [open, setOpenState] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const progress = useMotionValue(0);
  const dragX = useMotionValue(0);
  const travel = useRef<AnimationPlaybackControls | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const setOpen = useCallback(
    (next: boolean, velocity = 0) => {
      setOpenState(next);
      travel.current?.stop();
      travel.current = animate(progress, next ? 1 : 0, chSpring('smooth', reducedRef.current, velocity));
    },
    [progress],
  );
  const grab = useCallback(() => travel.current?.stop(), []);

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
      haptic('select');
      setDir(delta);
      setPending(next);
      if (openRef.current) setOpen(false);
      router.push(next.href);
      return true;
    },
    [indexOf, router, sections, setOpen],
  );

  // A new address settles the title on its own section and closes the strip.
  useEffect(() => {
    setPending(null);
    if (openRef.current) setOpen(false);
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

  // On a section's own page, its large title opens the strip too (the bar's title hides behind it until it tucks).
  const rootRef = useRef(root);
  rootRef.current = root;
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current || e.defaultPrevented || !window.matchMedia(PHONE).matches) return;
      const t = e.target instanceof Element ? e.target : null;
      if (!t || t.closest('a, button, input, select, textarea, label, [role="button"]')) return;
      const canvas = document.getElementById('ch-canvas');
      const title = canvas ? findLargeTitle(canvas) : null;
      if (title?.contains(t)) setOpen(!openRef.current);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [setOpen]);

  const counts = useMemo(() => Object.fromEntries(sections.map((s) => [s.id, badgeCount(s, badges, shell)])), [sections, badges, shell]);
  const attention = sections.some((s) => s.id !== shown?.id && (counts[s.id] ?? 0) > 0);

  const value = useMemo<ChSectionSwitch>(
    () => ({ enabled: true, sections, current, shown, switching, root, open, progress, dragX, dir, counts, attention, setOpen, grab, choose, step, accountOpen, setAccountOpen }),
    [sections, current, shown, switching, root, open, progress, dragX, dir, counts, attention, setOpen, grab, choose, step, accountOpen],
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
  if (!sw?.enabled) return <>{children}</>;
  const chosen = sw.shown && sw.shown.id !== sw.current?.id ? sw.shown : null;
  const key = (chosen ?? sw.current)?.id ?? 'page';
  const enter = reduced ? { duration: 0 } : chSpring('settle');
  const leave = reduced ? { duration: 0 } : { duration: CH_DUR.quick, ease: CH_EASE };
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
        <AnimatePresence initial={false} mode="popLayout" custom={sw.dir}>
          <m.span
            key={key}
            className="ch-sw__label"
            custom={sw.dir}
            variants={{
              enter: (d: number) => ({ x: d * 28, opacity: 0 }),
              center: { x: 0, opacity: 1, transition: enter },
              exit: (d: number) => ({ x: d * -28, opacity: 0, transition: leave }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {chosen ? chosen.label : children}
          </m.span>
        </AnimatePresence>
      </m.span>
      <m.span className="ch-sw__chev" style={{ rotate: turn }} aria-hidden="true">
        <Icon icon={ChevronDown} size={15} />
      </m.span>
      {sw.attention && (
        <>
          <span className="ch-sw__dot" aria-hidden="true" />
          <span className="ch-sr-only">, something new in another section</span>
        </>
      )}
    </button>
  );
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
