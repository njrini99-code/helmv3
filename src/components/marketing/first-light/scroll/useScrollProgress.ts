'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useMotionValue, useSpring, type MotionValue } from 'framer-motion';

/**
 * A `['<target-edge> <viewport-edge>', '<target-edge> <viewport-edge>']`
 * pair, e.g. `['start start', 'end end']` (classic pinned-scrub window) or
 * `['start end', 'end start']` (classic full-pass parallax window) —
 * matches the subset of framer-motion's `useScroll` offset syntax this
 * hook supports (§ below explains why it's hand-rolled instead of
 * delegating to `useScroll`).
 */
export type ScrollProgressOffset = [string, string];

export interface ScrollProgressOptions {
  /** Defaults to `['start end', 'end start']` (full-pass window). */
  offset?: ScrollProgressOffset;
  /**
   * Wrap the raw progress in a `useSpring` so transforms feel weighted
   * rather than 1:1 with the scrollbar — matches the Lenis "buttery
   * glide" feel per docs/redesign/.../03_apple_scroll_playbook.md §2b.
   * Default `true`. Pass `false` for frame-exact 1:1 scrub tracking.
   */
  smooth?: boolean;
}

export interface ScrollProgressResult<T extends HTMLElement> {
  /** Attach to the section/container whose progress you want. */
  ref: RefObject<T | null>;
  /**
   * 0→1 progress, GPU-safe (a framer-motion `MotionValue`) — feed straight
   * into `useTransform` for transform/opacity-only consumers. Already
   * spring-smoothed unless `smooth: false` was passed.
   */
  progress: MotionValue<number>;
  /** The unsmoothed 0→1 value, in case a consumer needs exact scrub math. */
  rawProgress: MotionValue<number>;
}

function parseEdgePair(pair: ScrollProgressOffset): [{ target: number; viewport: number }, { target: number; viewport: number }] {
  const parseOne = (s: string) => {
    const [targetEdge, viewportEdge] = s.trim().split(/\s+/);
    return {
      target: targetEdge === 'end' ? 1 : 0,
      viewport: viewportEdge === 'end' ? 1 : 0,
    };
  };
  return [parseOne(pair[0]), parseOne(pair[1])];
}

/**
 * Returns 0..1 scroll progress for a ref'd section, reading the real
 * scroll position Lenis writes (see {@link LenisRoot}). Built for
 * transform-only consumers: pass `progress` into `useTransform`, never
 * into a layout-affecting style.
 *
 * IMPLEMENTATION NOTE — hand-rolled instead of framer-motion's
 * `useScroll({ target, offset })`: Motion v12 opportunistically
 * "accelerates" `target`+`offset` scroll progress onto the browser's
 * native `ScrollTimeline`/`ViewTimeline` when the offset matches one of
 * its four presets (`['start start','end end']` — this hook's pinned-
 * scrub case — matches the "All"/`contain` preset). That acceleration
 * bypasses the normal `MotionValue.set()` flow the raw value's `.get()`
 * relies on; verified in this repo (2026-07-02, Chromium via Playwright)
 * that a `useTransform` chain consuming that accelerated value THROUGH A
 * CHILD COMPONENT (progress passed as a prop, one or more component
 * boundaries away from the `useScroll` call — exactly `PinnedScrub`'s
 * render-prop shape) freezes at its initial computed value and never
 * updates on subsequent scroll, even via real mouse-wheel input. A
 * same-component `useTransform` right next to `useScroll` (no prop
 * boundary) was NOT observed to freeze, so this may be narrow to the
 * cross-component case — but every current and anticipated consumer of
 * this hook (`PinnedScrub` above all) passes `progress` down through
 * child components, so a plain `window.scroll` listener + `getBoundingClientRect`
 * (this implementation) sidesteps the whole acceleration path and is
 * the reliable default. If a future framer-motion upgrade fixes the
 * underlying issue, this can revert to `useScroll` — re-verify with the
 * same repro (PinnedScrub → child `useTransform`, real wheel scroll)
 * before doing so.
 */
export function useScrollProgress<T extends HTMLElement = HTMLDivElement>(
  options: ScrollProgressOptions = {},
): ScrollProgressResult<T> {
  const { offset = ['start end', 'end start'], smooth = true } = options;
  const ref = useRef<T>(null);
  const raw = useMotionValue(0);
  const smoothed = useSpring(raw, { stiffness: 120, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    const el = ref.current;
    if (typeof window === 'undefined' || !el) return;

    const [a, b] = parseEdgePair(offset);
    let rafId = 0;
    let pending = false;

    function measure() {
      pending = false;
      const rect = el!.getBoundingClientRect();
      const vh = window.innerHeight;
      const docTop = rect.top + window.scrollY;
      const height = rect.height;
      const yAt = (edge: { target: number; viewport: number }) =>
        docTop + edge.target * height - edge.viewport * vh;
      const startY = yAt(a);
      const endY = yAt(b);
      const denom = endY - startY;
      const p = denom === 0 ? 0 : (window.scrollY - startY) / denom;
      raw.set(Math.min(1, Math.max(0, p)));
    }

    function schedule() {
      if (pending) return;
      pending = true;
      rafId = requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (rafId) cancelAnimationFrame(rafId);
    };
    // `offset` is a small literal tuple recreated per-render at most call
    // sites — compare by value, not identity, to avoid tearing down/
    // rebuilding the listener every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset[0], offset[1], raw]);

  return {
    ref,
    progress: smooth ? smoothed : raw,
    rawProgress: raw,
  };
}
