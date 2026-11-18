'use client';

import { useEffect, useRef } from 'react';
import { CH_EASE, CH_SWEEP_MS, chSpringCurve } from '../../../../lib/motion';
import { chMotionModeNow, useChReducedMotion } from '../../../../lib/reduced-motion';

export type DraftState = 'draft' | 'landing' | 'landed' | 'gone';
export interface DraftMotionProps {
  /** Opt in only for a newly arriving proposal. History and restored proposals omit this. */
  fresh?: boolean;
  state?: DraftState;
}

/** Final-state markup is the source of truth. Cancel, unmount and preference changes expose it immediately. */
export function useDraftMotion<T extends HTMLElement>(fresh = false, state: DraftState = 'draft') {
  const ref = useRef<T>(null);
  const atMount = useRef(fresh && state === 'draft');
  const played = useRef(false);
  const reduced = useChReducedMotion();
  useEffect(() => {
    const root = ref.current;
    if (!root || !atMount.current || played.current) return;
    if (reduced || state !== 'draft' || chMotionModeNow() !== 'full') { played.current = true; return; }
    const animations: Animation[] = [];
    const frame = requestAnimationFrame(() => {
      if (chMotionModeNow() !== 'full') { played.current = true; return; }
      played.current = true;
      const smooth = chSpringCurve('smooth');
      const settle = chSpringCurve('settle');
      const reveal = chSpringCurve('reveal');
      const pop = chSpringCurve('pop');
      const ease = `cubic-bezier(${CH_EASE.join(',')})`;
      root.querySelectorAll<HTMLElement | SVGElement>('[data-draft-motion]').forEach((el) => {
        if (typeof el.animate !== 'function') return;
        const kind = el.dataset.draftMotion;
        const delay = Number(el.dataset.delay ?? 0);
        let frames: Keyframe[] = [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }];
        let duration = smooth.ms;
        let easing = smooth.linear;
        if (kind === 'slide') frames = [{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }];
        if (kind === 'pop' || kind === 'lock' || kind === 'pin') {
          const from = kind === 'lock' ? 'scale(.4) rotate(-20deg)' : kind === 'pin' ? 'translateY(-26px)' : 'scale(.9)';
          frames = [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }];
          duration = pop.ms; easing = pop.linear;
        }
        if (kind === 'band') {
          frames = [{ opacity: 0, transform: 'scaleY(.2)' }, { opacity: 1, transform: 'none' }];
          duration = settle.ms; easing = settle.linear;
        }
        if (kind === 'draw' || kind === 'ring') {
          frames = [{ strokeDashoffset: kind === 'ring' ? '100' : '1' }, { strokeDashoffset: el.dataset.end ?? '0' }];
          duration = kind === 'ring' ? reveal.ms : CH_SWEEP_MS; easing = kind === 'ring' ? reveal.linear : ease;
        }
        if (kind === 'bar') {
          frames = [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }]; duration = reveal.ms; easing = reveal.linear;
        }
        if (kind === 'bell') {
          frames = [0, 14, -12, 8, 0].map((angle) => ({ transform: `rotate(${angle}deg)` })); duration = 620; easing = ease;
        }
        if (kind === 'scan') {
          frames = [{ opacity: 0, transform: 'translateY(-120%)' }, { opacity: 1, transform: 'translateY(70%)', offset: .4 }, { opacity: 0, transform: 'translateY(280%)' }]; duration = 300; easing = ease;
        }
        if (kind === 'route' || kind === 'roll') {
          const path = root.querySelector<SVGPathElement>(kind === 'route' ? '[data-route-path]' : '[data-roll-path]');
          if (!path || typeof path.getTotalLength !== 'function') return;
          const length = path.getTotalLength();
          const end = path.getPointAtLength(length);
          frames = Array.from({ length: 41 }, (_, i) => {
            const p = path.getPointAtLength(length * i / 40);
            return { transform: `translate(${p.x - end.x}px, ${p.y - end.y}px)`, offset: i / 40 };
          });
          duration = kind === 'route' ? 1300 : CH_SWEEP_MS; easing = ease;
        }
        const asked = Number(el.dataset.ms);
        if (Number.isFinite(asked) && asked > 0) duration = asked;
        if (kind === 'flight') {
          const source = root.querySelector<HTMLElement>(`[data-coin-source="${el.dataset.source}"]`);
          if (!source) return;
          const a = source.getBoundingClientRect();
          const b = el.getBoundingClientRect();
          const x = a.left - b.left, y = a.top - b.top;
          frames = [{ opacity: 0, transform: `translate(${x}px, ${y}px)` }, { opacity: 1, transform: `translate(${x * .5}px, ${y * .5 - 18}px)`, offset: .5 }, { opacity: 1, transform: 'none' }];
        }
        animations.push(el.animate(frames, { duration, delay, easing, fill: 'backwards' }));
      });
    });
    const stop = () => animations.forEach((a) => a.cancel());
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => { if (chMotionModeNow() !== 'full') stop(); };
    media.addEventListener('change', changed);
    const observer = new MutationObserver(changed);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    return () => { cancelAnimationFrame(frame); stop(); media.removeEventListener('change', changed); observer.disconnect(); };
  }, [reduced, state]);
  return ref;
}
