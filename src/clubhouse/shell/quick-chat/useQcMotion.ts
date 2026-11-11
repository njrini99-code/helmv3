'use client';

import { useCallback, useRef } from 'react';
import { CH_EASE, CH_EASE_SHEET, CH_FADE_MS, chSpringCurve, CH_DUR } from '../../lib/motion';

const bez = (c: readonly number[]) => `cubic-bezier(${c.join(',')})`;

/**
 * M-OPEN, M-CLOSE, M-RETARGET, M-CONTENT, M-SCRIM. A toggle mid-move reads where the panel is, cancels and goes from there, never from the start.
 */
/** M-QC: the panel is opaque by 90 ms, on purpose below the motion scale: a slower fade reads as a ghost of the page. */
const PANEL_OPAQUE_MS = 90;

/**
 * M-OPEN's `transform-origin`: the key's centre (a viewport point) in the panel's own untransformed box. The panel's
 * place comes from its offsets (07: "offsetLeft / offsetTop chains, never getBoundingClientRect, which includes a
 * running scale"), so a retarget that measures mid-pour gets the same origin as the first open and the panel stays on
 * the key. Offsets are from the offset parent's padding edge; that parent is not moving, so its rect places them in the
 * viewport. The phone's panel is fixed and has no offset parent: its offsets are already from the viewport.
 */
export function pourOrigin(panel: HTMLElement, key: { x: number; y: number }): string {
  const parent = panel.offsetParent as HTMLElement | null;
  const at = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
  const left = at.left + (parent?.clientLeft ?? 0) + panel.offsetLeft;
  const top = at.top + (parent?.clientTop ?? 0) + panel.offsetTop;
  return `${key.x - left}px ${key.y - top}px`;
}

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
      panel.style.transformOrigin = pourOrigin(panel, origin);
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
