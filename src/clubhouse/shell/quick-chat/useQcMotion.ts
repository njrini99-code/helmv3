'use client';

import { useCallback, useRef } from 'react';
import { CH_EASE, CH_EASE_SHEET, CH_FADE_MS, CH_MS, chSpringCurve, CH_DUR } from '../../lib/motion';
import type { ChMotionMode } from '../../lib/reduced-motion';

const bez = (c: readonly number[]) => `cubic-bezier(${c.join(',')})`;

/** M-QC: the panel is opaque by 90 ms, on purpose below the motion scale: a slower fade reads as a ghost of the page. */
const PANEL_OPAQUE_MS = 90;
/** MO-1-4: the close holds the panel's opacity for this share of its time, then lets it go (07 M-CLOSE). */
const CLOSE_OPAQUE_SHARE = 0.4;
/** M-CONTENT's parts leave in this long (07 M-CLOSE: "parts 100ms"); `--ch-dur-press` rounded down to the table's value. */
const PARTS_OUT_MS = 100;
/** MO-1-5: the scrim thins to this as the sheet is dragged its own height. */
const SCRIM_DRAGGED = 0.4;

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

/** MO-1-5's verdict on a release: closed past a share of the sheet's height or on a fling, in either direction. */
export function dragCloses(dy: number, velocity: number, height: number, share: number, fling: number): boolean {
  return Math.abs(dy) > height * share || (Math.abs(velocity) > fling && Math.sign(velocity) === Math.sign(dy));
}

/**
 * MO-1-1, M-CONTENT, MO-1-2, MO-1-4, MO-1-5 and every retarget between them (QUICK-CHAT.md, Moment 1). Each move reads
 * where the panel is (its computed transform and opacity, which include a drag's offset and a running effect), cancels
 * what was running, and continues from there: nothing restarts from its first frame and nothing queues.
 */
export function useQcMotion(mode: ChMotionMode) {
  const anims = useRef<Animation[]>([]);
  const moving = useRef(false);
  const stop = () => {
    anims.current.forEach((a) => a.cancel());
    anims.current = [];
  };
  const held = (panel: HTMLElement, scrim: HTMLElement | null) => {
    const from = getComputedStyle(panel);
    const parts = [...panel.querySelectorAll<HTMLElement>('[data-qc-rise]')].map((el) => {
      const s = getComputedStyle(el);
      return { el, o: s.opacity, t: s.transform };
    });
    return { t: from.transform, o: from.opacity, scrim: scrim ? getComputedStyle(scrim).opacity : '0', parts };
  };
  const clearDrag = (panel: HTMLElement, scrim: HTMLElement | null) => {
    panel.style.transform = '';
    if (scrim) scrim.style.opacity = '';
  };

  const open = useCallback(
    (panel: HTMLElement, scrim: HTMLElement | null, origin: { x: number; y: number }, onRest: () => void) => {
      const live = moving.current || !!panel.style.transform;
      const was = live ? held(panel, scrim) : { t: 'scale(0.5)', o: '0', scrim: '0', parts: [] as Array<{ el: HTMLElement; o: string; t: string }> };
      stop();
      clearDrag(panel, scrim);
      if (mode === 'off') {
        moving.current = false;
        onRest();
        return;
      }
      moving.current = true;
      const rest = (a: Animation) => {
        void a.finished
          .then(() => {
            if (!anims.current.includes(a)) return;
            moving.current = false;
            stop();
            onRest();
          })
          .catch(() => undefined);
      };
      if (mode === 'fade') {
        const a = panel.animate([{ opacity: was.o }, { opacity: 1 }], { duration: CH_FADE_MS, easing: 'linear' });
        anims.current.push(a);
        if (scrim) anims.current.push(scrim.animate([{ opacity: was.scrim }, { opacity: 1 }], { duration: CH_FADE_MS, easing: 'linear' }));
        rest(a);
        return;
      }
      panel.style.transformOrigin = pourOrigin(panel, origin);
      const pour = chSpringCurve('pour');
      const smooth = chSpringCurve('smooth');
      const a = panel.animate([{ transform: was.t === 'none' ? 'scale(1)' : was.t }, { transform: 'none' }], { duration: pour.ms, easing: pour.linear });
      anims.current.push(a);
      // A reopen finishes the fade it interrupted in the time that is left of it (07 M-RETARGET).
      anims.current.push(panel.animate([{ opacity: was.o }, { opacity: 1 }], { duration: Math.max(1, PANEL_OPAQUE_MS * (1 - Number(was.o))), easing: 'linear' }));
      if (scrim) anims.current.push(scrim.animate([{ opacity: was.scrim }, { opacity: 1 }], { duration: smooth.ms, easing: smooth.linear }));
      // The one allowed stagger: header, body, composer (07 M-CONTENT). A part turned around mid-close has no delay.
      panel.querySelectorAll<HTMLElement>('[data-qc-rise]').forEach((el, i) => {
        const part = was.parts.find((p) => p.el === el);
        anims.current.push(
          part
            ? el.animate([{ opacity: part.o, transform: part.t === 'none' ? 'translateY(0)' : part.t }, { opacity: 1, transform: 'none' }], { duration: CH_DUR.release * 1000, easing: bez(CH_EASE) })
            : el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: CH_DUR.release * 1000, delay: 60 + i * 30, easing: bez(CH_EASE), fill: 'backwards' }),
        );
      });
      rest(a);
    },
    [mode],
  );

  const close = useCallback(
    (panel: HTMLElement, scrim: HTMLElement | null, done: () => void) => {
      const was = held(panel, scrim);
      stop();
      clearDrag(panel, scrim);
      if (mode === 'off') {
        moving.current = false;
        done();
        return;
      }
      moving.current = true;
      const duration = mode === 'fade' ? CH_FADE_MS : CH_MS.field;
      const easing = mode === 'fade' ? 'linear' : bez(CH_EASE_SHEET);
      const main =
        mode === 'fade'
          ? panel.animate([{ opacity: was.o }, { opacity: 0 }], { duration, easing, fill: 'forwards' })
          : panel.animate([{ transform: was.t === 'none' ? 'scale(1)' : was.t }, { transform: 'scale(0.5)' }], { duration, easing, fill: 'forwards' });
      anims.current.push(main);
      if (mode !== 'fade') {
        anims.current.push(panel.animate([{ opacity: was.o }, { opacity: was.o, offset: CLOSE_OPAQUE_SHARE }, { opacity: 0 }], { duration, easing: 'linear', fill: 'forwards' }));
        for (const p of was.parts) anims.current.push(p.el.animate([{ opacity: p.o }, { opacity: 0 }], { duration: PARTS_OUT_MS, easing: 'linear', fill: 'forwards' }));
      }
      if (scrim) anims.current.push(scrim.animate([{ opacity: was.scrim }, { opacity: 0 }], { duration, easing, fill: 'forwards' }));
      void main.finished
        .then(() => {
          if (!anims.current.includes(main)) return;
          moving.current = false;
          done();
          stop();
        })
        .catch(() => undefined);
    },
    [mode],
  );

  /** MO-1-5, under the finger: the sheet 1:1 from the grab point, the scrim thinning with the travel. Starts from the live frame. */
  const dragTo = useCallback((panel: HTMLElement, scrim: HTMLElement | null, dy: number) => {
    if (anims.current.length) {
      stop();
      moving.current = false;
    }
    panel.style.transform = `translateY(${dy}px)`;
    if (scrim) scrim.style.opacity = String(1 - (1 - SCRIM_DRAGGED) * Math.min(1, Math.abs(dy) / Math.max(1, panel.offsetHeight)));
  }, []);

  /** MO-1-5, let go short of a close: back to rest on settle, carrying the release velocity (px per ms, signed like `dy`). */
  const dragBack = useCallback(
    (panel: HTMLElement, scrim: HTMLElement | null, dy: number, velocity: number) => {
      const scrimFrom = scrim ? getComputedStyle(scrim).opacity : '1';
      stop();
      clearDrag(panel, scrim);
      if (mode !== 'full' || !dy) return;
      // Progress per second toward rest: a release moving away from rest starts the spring going the wrong way, as a real one would.
      const settle = chSpringCurve('settle', { velocity: (-velocity * 1000) / dy });
      moving.current = true;
      const a = panel.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: settle.ms, easing: settle.linear });
      anims.current.push(a);
      if (scrim) anims.current.push(scrim.animate([{ opacity: scrimFrom }, { opacity: 1 }], { duration: settle.ms, easing: bez(CH_EASE) }));
      void a.finished
        .then(() => {
          if (!anims.current.includes(a)) return;
          moving.current = false;
          stop();
        })
        .catch(() => undefined);
    },
    [mode],
  );

  return { open, close, dragTo, dragBack };
}
