'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { CH_DUR, CH_EASE, chSpringCurve, type ChSpringKind } from './motion';

/**
 * A selected plate that slides from the option it left to the one chosen (a segmented chip, the strip's plate, a tab
 * bar's underline). The plate is rendered inside the chosen option only; when `key` changes this reads the new
 * option's box once and plays the move from the old box as a compositor transform (WAAPI, transform-origin left top).
 *
 * It replaces Motion's shared layout (`layoutId`), which measured the plate, its ancestors and the document's scroll
 * on every render of the component, mid-frame, so a section switch re-laid the incoming page out several times on the
 * main thread (owner, 2026-10-15: "super slow and choppy"; 68 frames dropped of 96 at 4x CPU).
 */
export function useSlidePlate(
  container: RefObject<HTMLElement | null>,
  plate: string,
  key: string | null,
  { reduced = false, still, kind = 'settle', tween }: { reduced?: boolean; still?: () => boolean; kind?: ChSpringKind; tween?: keyof typeof CH_DUR } = {},
): void {
  const last = useRef<Box | null>(null);
  // The move in flight, so a choice mid-glide starts from where the plate is, at its speed (F-0017).
  const running = useRef<{ anim: Animation; from: Box; to: Box; ms: number; ease: (p: number) => number } | null>(null);
  useLayoutEffect(() => {
    const el = container.current?.querySelector<HTMLElement>(plate);
    const host = el?.parentElement;
    if (!el || !host) {
      last.current = null;
      return undefined;
    }
    const box = () => ({ x: host.offsetLeft, y: host.offsetTop, w: host.offsetWidth, h: host.offsetHeight });
    const from = last.current;
    // Nothing to slide from yet (it has just mounted, or came back): where it sits is read a frame later, once the page
    // has been laid out anyway. Read here, it forced the arriving page's whole layout inside React's commit, the largest
    // part of a section switch's script (27ms of 165 at 4x CPU, a switch to Stats; Chromium, production build, 2026-10-15).
    // Held still (the strip shut as a section's page arrives): nothing moves, so its new place is read a frame later too.
    if (!from || still?.()) {
      last.current = null;
      const frame = requestAnimationFrame(() => {
        if (host.isConnected) last.current = box();
      });
      return () => cancelAnimationFrame(frame);
    }
    const to = box();
    last.current = to;
    // A glide still running is read before it goes: where the plate is now, and how fast it is moving.
    const live = liveOf(running.current);
    running.current?.anim.cancel?.();
    running.current = null;
    const start = live?.box ?? from;
    if (reduced || !to.w || !to.h) return undefined;
    if (start.x === to.x && start.y === to.y && start.w === to.w && start.h === to.h) return undefined;
    // Its speed toward the new mark, in progress per second over the distance left (chSpringCurve's units).
    const dx = to.x - start.x;
    const dy = to.y - start.y;
    const left = Math.hypot(dx, dy);
    const velocity = live && left > 0 ? (live.vx * dx + live.vy * dy) / (left * left) : 0;
    // A tween where the plate's design gives one (CH_DUR on CH_EASE), otherwise the spring.
    const curve = tween
      ? { ms: CH_DUR[tween] * 1000, linear: `cubic-bezier(${CH_EASE.join(', ')})`, ease: tweenEase }
      : chSpringCurve(kind, { velocity });
    const anim = el.animate?.(
      [
        { transformOrigin: 'left top', transform: `translate(${start.x - to.x}px, ${start.y - to.y}px) scale(${start.w / to.w}, ${start.h / to.h})` },
        { transformOrigin: 'left top', transform: 'none' },
      ],
      { duration: curve.ms, easing: curve.linear },
    );
    if (anim) running.current = { anim, from: start, to, ms: curve.ms, ease: curve.ease };
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the move is per choice; `still` is read when it happens
  }, [key, reduced]);
}

type Box = { x: number; y: number; w: number; h: number };

/** CH_EASE as a function, close enough to place a tweened plate mid-move: a cubic bezier solved for x by bisection. */
function tweenEase(p: number): number {
  const [x1, y1, x2, y2] = CH_EASE;
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (at(x1, x2, mid) < p) lo = mid;
    else hi = mid;
  }
  return at(y1, y2, (lo + hi) / 2);
}

/** Where a running glide has the plate now, and its velocity in pixels per second; null when none is running. */
function liveOf(r: { anim: Animation; from: Box; to: Box; ms: number; ease: (p: number) => number } | null): { box: Box; vx: number; vy: number } | null {
  if (!r || r.anim.playState !== 'running') return null;
  const t = Number(r.anim.currentTime ?? 0);
  if (!(t > 0) || t >= r.ms) return null;
  const p = r.ease(t / r.ms);
  const lerp = (a: number, b: number) => a + (b - a) * p;
  const box = { x: lerp(r.from.x, r.to.x), y: lerp(r.from.y, r.to.y), w: lerp(r.from.w, r.to.w), h: lerp(r.from.h, r.to.h) };
  // The spring's slope at t, from two samples 4 ms either side, in progress per second.
  const dp = (r.ease(Math.min(1, (t + 4) / r.ms)) - r.ease(Math.max(0, (t - 4) / r.ms))) / 0.008;
  return { box, vx: (r.to.x - r.from.x) * dp, vy: (r.to.y - r.from.y) * dp };
}
