'use client';

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { haptic } from './haptics';

/** A drag down past this many pixels closes the sheet. */
export const CH_SHEET_CLOSE_PX = 80;
/** So does a flick faster than this (px per ms), once it has moved a little. */
const FLICK_PX_PER_MS = 0.5;

/**
 * A phone sheet follows the finger down, and closes past 80px or on a quick
 * flick with the press haptic; let go sooner and it springs back in 260ms (base),
 * the sheet's own duration. With reduced motion there is no drag (pass
 * `enabled: false`); Close, the scrim and Esc still close it. CH-1611.
 *
 * The sheet moves by the CSS `translate` property, which composes with the
 * `transform` its open and close animations use, so a closing sheet leaves
 * from where the finger let go. Spread the returned handler on the part that
 * starts a drag (the grab and the header, with `touch-action: none` there);
 * a press on a control inside it is left alone.
 */
export function useSheetDrag(sheet: RefObject<HTMLElement | null>, onClose: () => void, { enabled = true } = {}) {
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const el = sheet.current;
      if (!enabled || !el || e.button !== 0) return;
      if ((e.target as Element).closest('button, a, input, textarea, select')) return;
      stop.current?.();
      if (typeof e.pointerId === 'number') e.currentTarget.setPointerCapture?.(e.pointerId);
      const startY = e.clientY;
      let dy = 0;
      let lastY = startY;
      let lastT = e.timeStamp;
      let speed = 0;
      el.style.transition = 'none';

      const move = (ev: PointerEvent) => {
        const dt = ev.timeStamp - lastT;
        if (dt > 0) speed = (ev.clientY - lastY) / dt;
        lastY = ev.clientY;
        lastT = ev.timeStamp;
        dy = Math.max(0, ev.clientY - startY);
        el.style.translate = `0 ${dy}px`;
      };
      const end = (ev: PointerEvent) => {
        stop.current?.();
        if (ev.type === 'pointerup' && (dy > CH_SHEET_CLOSE_PX || (dy > 10 && speed > FLICK_PX_PER_MS))) {
          haptic('press');
          onClose();
          return;
        }
        el.style.transition = 'translate var(--ch-dur-base) var(--ch-ease)';
        el.style.translate = '';
      };
      stop.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        stop.current = null;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [sheet, onClose, enabled],
  );

  return { onPointerDown };
}
