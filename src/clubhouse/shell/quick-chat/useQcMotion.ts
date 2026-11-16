'use client';

import { useCallback, useRef } from 'react';
import { CH_DUR, CH_EASE, CH_EASE_IOS, CH_EASE_IOS_CSS, CH_FADE_MS, chSpringCurve } from '../../lib/motion';
import type { ChMotionMode } from '../../lib/reduced-motion';

const bez = (c: readonly number[]) => `cubic-bezier(${c.join(',')})`;

/**
 * The panel is a large popover, not a growing blob (production audit 2026-11-15, MOT-09, S3.5): it enters from 96% with
 * its opacity over the base beat and leaves over the quick beat, the whole panel at once (no part is staggered), on the
 * one curve every tap-started enter and exit rides (`--ch-ease-ios`).
 */
export const QC_FROM = 'scale(0.96)';
export const QC_OPEN_MS = CH_DUR.base * 1000;
export const QC_CLOSE_MS = CH_DUR.quick * 1000;
/** How fast `--ch-ease-ios` leaves its start (y1 / x1, progress per unit of time). A throw's carry is sized by it, so the close leaves at the finger's speed. */
const IOS_LAUNCH = CH_EASE_IOS[1] / CH_EASE_IOS[0];
/** MO-1-5: the scrim thins to this as the sheet is dragged its own height. */
const SCRIM_DRAGGED = 0.4;

/**
 * The panel's `transform-origin`: the key's centre (a viewport point) in the panel's own untransformed box, so the
 * popover settles onto the key it hangs from. The panel's place comes from its offsets (07: "offsetLeft / offsetTop
 * chains, never getBoundingClientRect, which includes a running scale"), so a retarget that measures mid-open gets the
 * same origin as the first open and the panel stays on the key. Offsets are from the offset parent's padding edge; that
 * parent is not moving, so its rect places them in the viewport. The phone's panel is fixed and has no offset parent:
 * its offsets are already from the viewport.
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
 * Where a close goes (S3.5): back to 96%, where the panel opened from. A sheet that was dragged leaves from where the finger
 * put it; a thrown one carries on along its throw at the finger's speed (`speed`, px per ms) without shrinking, so the hand
 * and the close are one motion in the same 180 ms.
 */
export function qcCloseTo(dragged: number, speed: number): string {
  if (!dragged) return QC_FROM;
  if (speed <= 0) return `translateY(${dragged}px) ${QC_FROM}`;
  return `translateY(${dragged + (Math.sign(dragged) * speed * QC_CLOSE_MS) / IOS_LAUNCH}px)`;
}

/** A computed transform as a keyframe: `none` (and an engine that reports nothing) is where the panel rests. */
const asFrame = (t: string) => (!t || t === 'none' ? 'scale(1)' : t);

/**
 * MO-1-1, MO-1-2, MO-1-4, MO-1-5 and every retarget between them (QUICK-CHAT.md, Moment 1). Each move reads where the
 * panel is (its computed transform and opacity, which include a drag's offset and a running effect), cancels what was
 * running, and continues from there: nothing restarts from its first frame and nothing queues. Reduce Motion is opacity
 * only over 180 ms (S3.9); Animations off is at once.
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
    return { t: asFrame(from.transform), o: from.opacity || '1', scrim: scrim ? getComputedStyle(scrim).opacity || '1' : '0' };
  };
  const clearDrag = (panel: HTMLElement, scrim: HTMLElement | null) => {
    panel.style.transform = '';
    if (scrim) scrim.style.opacity = '';
  };

  const open = useCallback(
    (panel: HTMLElement, scrim: HTMLElement | null, origin: { x: number; y: number }, onRest: () => void) => {
      const live = moving.current || !!panel.style.transform;
      const was = live ? held(panel, scrim) : { t: QC_FROM, o: '0', scrim: '0' };
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
      // The whole panel at once: transform and opacity together, from where it is (96% and clear on a first open).
      panel.style.transformOrigin = pourOrigin(panel, origin);
      const a = panel.animate(
        [
          { transform: was.t, opacity: was.o },
          { transform: 'none', opacity: 1 },
        ],
        { duration: QC_OPEN_MS, easing: CH_EASE_IOS_CSS },
      );
      anims.current.push(a);
      if (scrim) anims.current.push(scrim.animate([{ opacity: was.scrim }, { opacity: 1 }], { duration: QC_OPEN_MS, easing: CH_EASE_IOS_CSS }));
      rest(a);
    },
    [mode],
  );

  const close = useCallback(
    (panel: HTMLElement, scrim: HTMLElement | null, done: () => void, thrownAt = 0) => {
      const was = held(panel, scrim);
      // How far a finger has the sheet (dragTo's offset), read before the drag is cleared.
      const dragged = Number(/translateY\((-?[\d.]+)px\)/.exec(panel.style.transform)?.[1] ?? 0);
      stop();
      clearDrag(panel, scrim);
      if (mode === 'off') {
        moving.current = false;
        done();
        return;
      }
      moving.current = true;
      const duration = mode === 'fade' ? CH_FADE_MS : QC_CLOSE_MS;
      const easing = mode === 'fade' ? 'linear' : CH_EASE_IOS_CSS;
      const main =
        mode === 'fade'
          ? panel.animate([{ opacity: was.o }, { opacity: 0 }], { duration, easing, fill: 'forwards' })
          : panel.animate(
              [
                { transform: was.t, opacity: was.o },
                { transform: qcCloseTo(dragged, thrownAt), opacity: 0 },
              ],
              { duration, easing, fill: 'forwards' },
            );
      anims.current.push(main);
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
