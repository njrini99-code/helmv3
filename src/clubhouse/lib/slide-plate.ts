'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { CH_DUR, CH_EASE, CH_SPRING, chSpringCurve, type ChSpringKind } from './motion';

/**
 * Messages' filter thumb (MOT-X-2, MOT-LIST-4): 360 ms on the overshooting CSS spring `(.34, 1.3, .64, 1)` the artifact
 * draws, not the settle spring. `tween: 'thumb'`; under Reduce Motion the plate jumps like every other.
 */
export const CH_THUMB = { ms: 360, ease: CH_SPRING } as const;
export type SlidePlateTween = keyof typeof CH_DUR | 'thumb';

/**
 * A selected plate that slides from the option it left to the one chosen (a segmented chip, the strip's plate, a tab
 * bar's underline). The plate is rendered inside the chosen option only; when `key` changes this reads the new
 * option's box once and plays the move from the old box (WAAPI): a translate, and the width between the two options.
 *
 * It replaces Motion's shared layout (`layoutId`), which measured the plate, its ancestors and the document's scroll
 * on every render of the component, mid-frame, so a section switch re-laid the incoming page out several times on the
 * main thread (owner, 2026-10-15: "super slow and choppy"; 68 frames dropped of 96 at 4x CPU).
 */
export function useSlidePlate(
  container: RefObject<HTMLElement | null>,
  plate: string,
  key: string | null,
  { reduced = false, still, kind = 'settle', tween, ink }: { ink?: string; reduced?: boolean; still?: () => boolean; kind?: ChSpringKind; tween?: SlidePlateTween } = {},
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
    const inkAt = (leaving: number, arriving: number) => {
      if (!ink) return;
      for (const option of container.current?.querySelectorAll<HTMLElement>(ink) ?? []) {
        for (const a of option.getAnimations?.() ?? []) {
          if ((a as CSSTransition).transitionProperty === 'color') a.effect?.updateTiming({ delay: option === host ? arriving : leaving });
        }
      }
    };
    if (reduced || !to.w || !to.h || (start.x === to.x && start.y === to.y && start.w === to.w && start.h === to.h)) {
      inkAt(0, 0);
      return undefined;
    }
    // Its speed toward the new mark, in progress per second over the distance left (chSpringCurve's units).
    const dx = to.x - start.x;
    const dy = to.y - start.y;
    const left = Math.hypot(dx, dy);
    const velocity = live && left > 0 ? (live.vx * dx + live.vy * dy) / (left * left) : 0;
    // A tween where the plate's design gives one (CH_DUR on CH_EASE), otherwise the spring.
    const curve = tween
      ? tween === 'thumb'
        ? { ms: CH_THUMB.ms, linear: `cubic-bezier(${CH_SPRING.join(', ')})`, ease: bezierEase(CH_SPRING) }
        : { ms: CH_DUR[tween] * 1000, linear: `cubic-bezier(${CH_EASE.join(', ')})`, ease: tweenEase }
      : chSpringCurve(kind, { velocity });
    // Translate and width only: a scale squashed the pill's rounded corners mid-glide (owner, 2026-11-07). The plate may be narrower than its option (an underline), so its width goes by the options' ratio.
    const plateW = el.offsetWidth;
    const anim = el.animate?.(
      [
        { transform: `translate(${start.x - to.x}px, ${start.y - to.y}px)`, width: `${(plateW * start.w) / to.w}px` },
        { transform: 'none', width: `${plateW}px` },
      ],
      { duration: curve.ms, easing: curve.linear },
    );
    if (anim) running.current = { anim, from: start, to, ms: curve.ms, ease: curve.ease };
    // Each label takes its new ink as the plate crosses it, so it reads on the ground under it the whole way (at least 4.5:1).
    const cross = plateCrossing(curve.ease, curve.ms, Math.hypot(start.x + start.w / 2 - (to.x + to.w / 2), start.y + start.h / 2 - (to.y + to.h / 2)), start.w, to.w);
    inkAt(cross.leaving, cross.arriving);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the move is per choice; `still` is read when it happens
  }, [key, reduced]);
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * When a plate on `ease` over `ms`, travelling `distance` from a mark `fromW` wide to one `toW` wide, covers half of each label: it has
 * left the old one after half the two widths' mean, and reaches the new one that far short of the end. Next-door options cross at the
 * halfway point; farther ones leave sooner and arrive later.
 */
export function plateCrossing(ease: (p: number) => number, ms: number, distance: number, fromW: number, toW: number): { leaving: number; arriving: number } {
  const share = distance > 0 ? Math.min(0.5, (fromW + toW) / 4 / distance) : 0.5;
  const at = (target: number) => {
    const steps = 64;
    for (let i = 1; i <= steps; i++) if (ease(i / steps) >= target) return Math.round((ms * i) / steps);
    return Math.round(ms);
  };
  return { leaving: at(share), arriving: at(1 - share) };
}

/** CH_EASE as a function, close enough to place a tweened plate mid-move: a cubic bezier solved for x by bisection. */
function tweenEase(p: number): number {
  return bezierEase(CH_EASE)(p);
}

/** A cubic bezier `(x1, y1, x2, y2)` as a function of progress: solved for x by bisection (x is monotonic, y may overshoot 1). */
export function bezierEase([x1, y1, x2, y2]: readonly [number, number, number, number]): (p: number) => number {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (p: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < p) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
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
