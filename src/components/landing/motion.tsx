'use client';

/**
 * Landing motion system — a direct port of the Claude Design prototype's
 * scroll choreography (Helm Landing.dc.html) into small React utilities.
 *
 * Four ideas, shared by every section:
 *   1. `useScrollFrame`  — one rAF-coalesced scroll/resize loop for the page.
 *   2. `<Reveal>`        — IntersectionObserver entrance (wipe / rise).
 *   3. `useSequence`     — on-enter choreography for [data-anim]/[data-fade]/
 *                          [data-bar]/[data-rise] children (bars grow, chips
 *                          stage in) inside a container.
 *   4. `useParallax`     — scroll-linked drift; elements with
 *                          data-parallax >= 40 get the 3D perspective tilt
 *                          that settles as they cross the viewport center.
 *
 * Entrances animate clip-path (a wipe), NOT opacity: text keeps full contrast
 * at every animation instant, so the axe color-contrast audit (which scrolls
 * every node into view and can sample mid-entrance) stays deterministic.
 * Opacity is reserved for non-text marks (the shot dots).
 *
 * Reduced motion: every helper checks `prefersReducedMotion()` once on mount
 * and renders the settled final state (nothing hidden, nothing transformed) —
 * the same contract the prototype's `setReducedFinal()` kept.
 */

import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';

export const LANDING_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Layout effect that is a no-op on the server (avoids the SSR warning).
 * Entrance prep MUST run before paint: with a plain useEffect there is one
 * painted frame of the settled state before the hidden state applies — a
 * visible flash on back-navigation with restored scroll or on /#hash loads.
 */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Which mock variant to render: null until first client layout (SSR and the
 * hydration pass render BOTH variants so markup matches; the hidden one is
 * then unmounted to halve the mockup DOM).
 */
export function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return isDesktop;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Progress of a tall (pinned) section through the viewport: 0 when its top
 * reaches the top of the screen, 1 when its bottom reaches the bottom.
 */
export function sectionProgress(sec: HTMLElement): number {
  const r = sec.getBoundingClientRect();
  const vh = window.innerHeight;
  const total = r.height - vh;
  if (total <= 0) return clamp01(-r.top / Math.max(1, r.height));
  return clamp01(-r.top / total);
}

// ─── 1. Shared scroll frame ─────────────────────────────────────────────────

type FrameCallback = () => void;

const frameSubs = new Set<FrameCallback>();
let frameRaf = 0;
let frameListening = false;

function runFrame() {
  frameRaf = 0;
  frameSubs.forEach((cb) => cb());
}

function scheduleFrame() {
  if (!frameRaf) frameRaf = requestAnimationFrame(runFrame);
}

function ensureListeners() {
  if (frameListening) return;
  window.addEventListener('scroll', scheduleFrame, { passive: true });
  window.addEventListener('resize', scheduleFrame, { passive: true });
  frameListening = true;
}

function releaseListeners() {
  if (!frameListening || frameSubs.size > 0) return;
  window.removeEventListener('scroll', scheduleFrame);
  window.removeEventListener('resize', scheduleFrame);
  if (frameRaf) cancelAnimationFrame(frameRaf);
  frameRaf = 0;
  frameListening = false;
}

/**
 * Subscribe `cb` to the page's single rAF-coalesced scroll/resize loop.
 * Runs once immediately so first paint is already settled.
 */
export function useScrollFrame(cb: FrameCallback): void {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useIsoLayoutEffect(() => {
    const stable: FrameCallback = () => cbRef.current();
    frameSubs.add(stable);
    ensureListeners();
    stable();
    return () => {
      frameSubs.delete(stable);
      releaseListeners();
    };
  }, []);
}

// ─── 2. Reveal ──────────────────────────────────────────────────────────────

/** Bottom-up wipe: everything clipped at rest, unmasked on reveal. */
const CLIP_HIDDEN = 'inset(0 0 100% 0)';
const CLIP_SHOWN = 'inset(0 0 0 0)';

/** Clear the clip once the wipe lands so box-shadows stop being cropped. */
function clearClipOnEnd(el: HTMLElement) {
  const onEnd = (e: TransitionEvent) => {
    if (e.propertyName !== 'clip-path') return;
    el.style.clipPath = '';
    el.removeEventListener('transitionend', onEnd);
  };
  el.addEventListener('transitionend', onEnd);
}

/**
 * Fraction of `el` currently inside the viewport (0..1 of its own height).
 *
 * Deliberately rect-based, NOT IntersectionObserver: Chrome folds the
 * target's own clip-path into the intersection rect, so a fully-clipped
 * (hidden) element reports isIntersecting=false forever — the reveal that
 * hides via clip-path can then never trigger itself. getBoundingClientRect
 * ignores clipping, so the shared scroll frame sees the true geometry.
 */
function visibleFraction(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  if (r.height <= 0) return 0;
  const vh = window.innerHeight;
  const visible = Math.min(r.bottom, vh * 0.92) - Math.max(r.top, 0);
  return clamp01(visible / r.height);
}

interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'p' | 'span';
  /** transition-delay in ms (the prototype's data-reveal-delay). */
  delay?: number;
  /**
   * Wipe-only reveal (no transform) — required when the same element is
   * parallax-driven (a transform transition would smooth the scrub into
   * stillness; the prototype hit exactly this bug and removed it).
   */
  wipeOnly?: boolean;
  children?: ReactNode;
}

export function Reveal({ as = 'div', delay, wipeOnly = false, children, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const revealedRef = useRef(false);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    revealedRef.current = false;
    el.style.clipPath = CLIP_HIDDEN;
    if (wipeOnly) {
      el.style.transition = `clip-path 0.9s ${LANDING_EASE}`;
    } else {
      el.style.transform = 'translateY(26px)';
      el.style.transition = `clip-path 0.8s ${LANDING_EASE}, transform 0.8s ${LANDING_EASE}`;
      if (delay) el.style.transitionDelay = `${delay}ms`;
    }
  }, [delay, wipeOnly]);

  useScrollFrame(
    useCallback(() => {
      const el = ref.current;
      if (!el || revealedRef.current || prefersReducedMotion()) return;
      if (visibleFraction(el) < 0.15) return;
      revealedRef.current = true;
      // Double-rAF: guarantee one painted hidden frame first, so content
      // already in the viewport at load still gets its entrance wipe.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          clearClipOnEnd(el);
          el.style.clipPath = CLIP_SHOWN;
          if (!wipeOnly) el.style.transform = 'none';
        }),
      );
    }, [wipeOnly]),
  );

  return createElement(as, { ...rest, ref }, children);
}

// ─── 3. On-enter sequence choreography ──────────────────────────────────────

function prepSequence(container: HTMLElement) {
  // Text-bearing pieces wipe in (clip-path, never opacity — see header note).
  container.querySelectorAll<HTMLElement>('[data-anim]').forEach((el) => {
    el.style.clipPath = CLIP_HIDDEN;
    el.style.transform = 'translateY(12px)';
    el.style.transition = `clip-path 0.6s ${LANDING_EASE}, transform 0.6s ${LANDING_EASE}`;
  });
  // Pure marks (SVG shot dots — no text) may still fade.
  container.querySelectorAll<HTMLElement>('[data-fade]').forEach((el) => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.5s ease';
  });
  container.querySelectorAll<HTMLElement>('[data-bar]').forEach((el) => {
    el.dataset.targetWidth = el.getAttribute('data-w') ?? el.style.width;
    el.style.width = '0';
    el.style.transition = `width 0.9s ${LANDING_EASE}`;
  });
  container.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
    el.style.clipPath = CLIP_HIDDEN;
    el.style.transform = 'translateY(60px)';
    el.style.transition = `clip-path 0.7s ${LANDING_EASE}, transform 0.85s ${LANDING_EASE}`;
  });
}

function runSequence(container: HTMLElement, timers: number[]) {
  container.querySelectorAll<HTMLElement>('[data-anim]').forEach((el, i) => {
    timers.push(
      window.setTimeout(() => {
        clearClipOnEnd(el);
        el.style.clipPath = CLIP_SHOWN;
        el.style.transform = 'none';
      }, 90 + i * 80),
    );
  });
  container.querySelectorAll<HTMLElement>('[data-fade]').forEach((el, i) => {
    timers.push(window.setTimeout(() => { el.style.opacity = '1'; }, 220 + i * 150));
  });
  container.querySelectorAll<HTMLElement>('[data-bar]').forEach((el, i) => {
    timers.push(
      window.setTimeout(() => { el.style.width = el.dataset.targetWidth ?? ''; }, 260 + i * 110),
    );
  });
  container.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
    timers.push(
      window.setTimeout(() => {
        clearClipOnEnd(el);
        el.style.clipPath = CLIP_SHOWN;
        el.style.transform = 'none';
      }, 640),
    );
  });
}

/**
 * Choreograph the container's data-anim / data-fade / data-bar / data-rise
 * children once ≥25% of it is in the viewport. Rect-driven from the shared
 * scroll frame (see visibleFraction — IO can't observe clipped subtrees).
 */
export function useSequence(containerRef: RefObject<HTMLElement | null>): void {
  const firedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  useIsoLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || prefersReducedMotion()) return;
    firedRef.current = false;
    prepSequence(container);
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
    };
  }, [containerRef]);

  useScrollFrame(
    useCallback(() => {
      const container = containerRef.current;
      if (!container || firedRef.current || prefersReducedMotion()) return;
      if (visibleFraction(container) < 0.25) return;
      firedRef.current = true;
      runSequence(container, timersRef.current);
    }, [containerRef]),
  );
}

// ─── 4. Parallax drift + settle-tilt ────────────────────────────────────────

/**
 * Drive every `[data-parallax]` descendant of `containerRef` from the shared
 * scroll frame. Values < 40 drift vertically; values >= 40 additionally get
 * the perspective tilt + scale that settles as the element passes the
 * viewport center — the prototype's signature feature-panel motion.
 */
export function useParallax(containerRef: RefObject<HTMLElement | null>): void {
  const elsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || prefersReducedMotion()) return;
    elsRef.current = Array.from(container.querySelectorAll<HTMLElement>('[data-parallax]'));
    return () => {
      elsRef.current = [];
    };
  }, [containerRef]);

  useScrollFrame(() => {
    const els = elsRef.current;
    if (!els.length) return;
    const vh = window.innerHeight;
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = (r.top + r.height / 2) / vh - 0.5; // -0.5 (top) .. +0.5 (bottom)
      const amt = parseFloat(el.getAttribute('data-parallax') ?? '0') || 0;
      const big = amt >= 40;
      const ty = (-d * amt).toFixed(1);
      if (big) {
        const rx = (d * 7).toFixed(2);
        const prox = 1 - Math.min(1, Math.abs(d) * 1.5);
        const sc = (0.94 + 0.06 * prox).toFixed(3);
        el.style.transform = `perspective(1500px) translateY(${ty}px) rotateX(${rx}deg) scale(${sc})`;
      } else {
        el.style.transform = `translateY(${ty}px)`;
      }
    });
  });
}

// ─── Scaled embed ───────────────────────────────────────────────────────────

interface ScaledEmbedProps {
  /** The mockup's intrinsic design width in px (it renders at exactly this). */
  designWidth: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Renders a fixed-width mockup scaled to fill its container. Uses CSS `zoom`
 * (the prototype's final approach) so the frame auto-sizes to the scaled
 * height — no transform/height bookkeeping.
 */
export function ScaledEmbed({ designWidth, className, style, children }: ScaledEmbedProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const inner = innerRef.current;
    if (!frame || !inner) return;
    const apply = () => {
      const w = frame.clientWidth;
      if (w > 0) inner.style.zoom = String(w / designWidth);
    };
    apply();
    const ro = new ResizeObserver(() => requestAnimationFrame(apply));
    ro.observe(frame);
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div ref={frameRef} className={className} style={style}>
      <div ref={innerRef} style={{ width: designWidth }}>
        {children}
      </div>
    </div>
  );
}
