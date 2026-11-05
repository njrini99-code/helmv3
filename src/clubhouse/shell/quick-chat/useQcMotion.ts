'use client';

import { useCallback, useRef } from 'react';
import { CH_EASE, CH_EASE_SHEET, CH_FADE_MS, chSpringCurve, CH_DUR } from '../../lib/motion';

const bez = (c: readonly number[]) => `cubic-bezier(${c.join(',')})`;

/**
 * M-OPEN, M-CLOSE, M-RETARGET, M-CONTENT, M-SCRIM. A toggle mid-move reads where the panel is, cancels and goes from there, never from the start.
 */
/** M-QC: the panel is opaque by 90 ms, on purpose below the motion scale: a slower fade reads as a ghost of the page. */
const PANEL_OPAQUE_MS = 90;

export function useQcMotion(reduced: boolean) {
  const anims = useRef<Animation[]>([]);
  const stop = () => {
    anims.current.forEach((a) => a.cancel());
    anims.current = [];
  };
  const open = useCallback(
    (panel: HTMLElement, scrim: HTMLElement | null, origin: { x: number; y: number }) => {
      const from = getComputedStyle(panel);
      const was = anims.current.length ? { t: from.transform === 'none' ? 'scale(0.5)' : from.transform, o: from.opacity } : { t: 'scale(0.5)', o: '0' };
      const scrimFrom = scrim ? getComputedStyle(scrim).opacity : '0';
      stop();
      if (reduced) {
        anims.current.push(panel.animate([{ opacity: was.o }, { opacity: 1 }], { duration: CH_FADE_MS, easing: 'linear' }));
        if (scrim) anims.current.push(scrim.animate([{ opacity: scrimFrom }, { opacity: 1 }], { duration: CH_FADE_MS, easing: 'linear' }));
        return;
      }
      const r = panel.getBoundingClientRect();
      panel.style.transformOrigin = `${origin.x - r.left}px ${origin.y - r.top}px`;
      const curve = chSpringCurve('pour');
      anims.current.push(panel.animate([{ transform: was.t }, { transform: 'none' }], { duration: curve.ms, easing: curve.linear }));
      anims.current.push(panel.animate([{ opacity: was.o }, { opacity: 1 }], { duration: PANEL_OPAQUE_MS, easing: bez(CH_EASE) }));
      if (scrim) anims.current.push(scrim.animate([{ opacity: scrimFrom }, { opacity: 1 }], { duration: CH_DUR.base * 1000, easing: bez(CH_EASE) }));
      // The one allowed stagger: header, body, composer (07 M-CONTENT).
      panel.querySelectorAll<HTMLElement>('[data-qc-rise]').forEach((el, i) => {
        anims.current.push(el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: CH_DUR.release * 1000, delay: 60 + i * 30, easing: bez(CH_EASE), fill: 'backwards' }));
      });
    },
    [reduced],
  );
  const close = useCallback(
    (panel: HTMLElement, scrim: HTMLElement | null, done: () => void) => {
      const from = getComputedStyle(panel);
      const t = from.transform === 'none' ? 'none' : from.transform;
      const o = from.opacity;
      const scrimFrom = scrim ? getComputedStyle(scrim).opacity : '1';
      stop();
      const duration = reduced ? CH_FADE_MS : 220;
      const easing = reduced ? 'linear' : bez(CH_EASE_SHEET);
      const main = panel.animate(reduced ? [{ opacity: o }, { opacity: 0 }] : [{ transform: t, opacity: o }, { transform: 'scale(0.5)', opacity: 0 }], { duration, easing, fill: 'forwards' });
      anims.current.push(main);
      if (scrim) anims.current.push(scrim.animate([{ opacity: scrimFrom }, { opacity: 0 }], { duration, easing, fill: 'forwards' }));
      main.onfinish = () => {
        stop();
        done();
      };
    },
    [reduced],
  );
  return { open, close };
}
