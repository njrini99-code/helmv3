'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { msAnimate } from '../motion/messages-motion';
import {
  KB_RIDE_ID,
  KEYBOARD_KEEPERS,
  barIsFlat,
  keyboardHeight,
  layerPadding,
  pinnedToBottom,
  rideLift,
  rideShift,
  rideTiming,
  type LayerKind,
} from './thread-layers';

/** The custom properties this sets on the thread root; thread-layers CSS (messages-thread.css) reads them. */
export const LAYER_VARS = { top: '--ch-ms-pad-top', bottom: '--ch-ms-pad-bot', lift: '--ch-ms-kb' } as const;

/**
 * Makes the thread three layers (MSG-201, MSG-203, MSG-307): the scroller runs under the bar and the floating composer.
 *
 * - Measures the bar and the composer and hands the list its `--ch-ms-pad-top` / `--ch-ms-pad-bot` (thread-layers.ts).
 * - Marks the bar `is-flat` while the list is at its top, so its hairline shows only when content is under it.
 * - Phone: the composer and the jump key rise with the keyboard (`--ch-ms-kb`, which CSS eases over 480 ms), the list's floor
 *   rises with them in the same task, and a reader pinned to the bottom stays on the last message while the list glides.
 *   The lift comes from `visualViewport` (Safari, and the app's WebView when it reports) and `--keyboard-height` (the app's
 *   `keyboardWillShow`), read by `keyboardHeight`.
 * - Phone: a tap on the thread's page lowers the keyboard (MOT-SEND-3).
 *
 * Nothing runs off the redesign (no `[data-ch-ms-v2]` above the thread).
 */
export function useThreadLayers(scroller: RefObject<HTMLElement | null>, { kind, convId, reduced }: { kind: LayerKind; convId: string; reduced: boolean }): void {
  // The latest Reduce Motion, read when a ride starts, so turning it on mid-thread does not re-run the layout work.
  const calm = useRef(reduced);
  calm.current = reduced;
  useLayoutEffect(() => {
    const s = scroller.current;
    const root = s?.closest<HTMLElement>('.ch-msp-thread, .ch-ms-thread');
    if (!s || !root || !root.closest('[data-ch-ms-v2]')) return;
    const bar = () => root.querySelector<HTMLElement>(':scope > .ch-pbar, :scope > .ch-ms-th');
    // The phone's composer rides in its wrapper; the desktop's footer is the layer.
    const layer = () => root.querySelector<HTMLElement>(':scope > .ch-msp-composer, :scope > .ch-ms-comp');
    const footer = () => root.querySelector<HTMLElement>('.ch-ms-comp');

    const measure = () => {
      const pad = layerPadding({ kind, barHeight: bar()?.getBoundingClientRect().height ?? 0, composerHeight: layer()?.getBoundingClientRect().height ?? 0 });
      root.style.setProperty(LAYER_VARS.top, `${pad.top}px`);
      root.style.setProperty(LAYER_VARS.bottom, `${pad.bottom}px`);
    };
    const flat = () => bar()?.classList.toggle('is-flat', barIsFlat(s.scrollTop));
    measure();
    flat();
    const sized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    for (const el of [bar(), layer()]) if (el) sized?.observe(el);
    s.addEventListener('scroll', flat, { passive: true });

    const cleanups: Array<() => void> = [];
    if (kind === 'phone') {
      let lift = 0;
      let last = -1;
      const vv = window.visualViewport;
      const apply = () => {
        const published = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height'));
        const keyboard = keyboardHeight({
          native: isNativeApp(),
          layoutHeight: document.documentElement.clientHeight,
          viewportHeight: vv?.height ?? 0,
          scale: vv?.scale ?? 1,
          published,
        });
        // A visual-viewport scroll while the keyboard stays the same height (iOS panning) changes nothing here.
        if (keyboard === last) return;
        last = keyboard;
        const foot = footer();
        const next = rideLift(keyboard, foot ? parseFloat(getComputedStyle(foot).paddingBottom) || 0 : 0);
        if (next === lift) return;
        const opening = next > lift;
        lift = next;
        // Read where the reader is BEFORE the floor moves (the artifact's kbShow order), then move it, then see what that did.
        const atBottom = pinnedToBottom(s.scrollHeight - s.clientHeight - s.scrollTop);
        const before = s.scrollTop;
        root.style.setProperty(LAYER_VARS.lift, `${next}px`);
        if (opening && atBottom) s.scrollTop = s.scrollHeight - s.clientHeight;
        const d = rideShift({ opening, atBottom, before, after: s.scrollTop });
        const timing = rideTiming(calm.current);
        const list = s.querySelector<HTMLElement>('.ch-ms-msgs');
        if (!d || !timing || !list) return;
        // On transform with an additive composite: useThreadAnchor.toEnd reads the list's transform, so a pin made mid-ride still lands on the end.
        const glide = msAnimate(list, [{ transform: `translateY(${d}px)` }, { transform: 'translateY(0)' }], null, { composite: 'add', rd: null, timing });
        if (glide) glide.id = KB_RIDE_ID;
      };
      apply();
      vv?.addEventListener('resize', apply);
      vv?.addEventListener('scroll', apply);
      // The app publishes the height as a style property on <html> and a class on <body>.
      const watch = typeof MutationObserver === 'undefined' ? null : new MutationObserver(apply);
      watch?.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
      watch?.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      // MOT-SEND-3: a tap on the thread's page (not a bubble, key or link) puts the field down and the keyboard follows.
      const lower = (e: MouseEvent) => {
        const field = document.activeElement;
        if (!(field instanceof HTMLTextAreaElement) || !root.contains(field)) return;
        if (e.target instanceof Element && e.target.closest(KEYBOARD_KEEPERS)) return;
        field.blur();
      };
      s.addEventListener('click', lower);
      cleanups.push(() => {
        vv?.removeEventListener('resize', apply);
        vv?.removeEventListener('scroll', apply);
        watch?.disconnect();
        s.removeEventListener('click', lower);
        root.style.removeProperty(LAYER_VARS.lift);
      });
    }

    return () => {
      sized?.disconnect();
      s.removeEventListener('scroll', flat);
      for (const c of cleanups) c();
      root.style.removeProperty(LAYER_VARS.top);
      root.style.removeProperty(LAYER_VARS.bottom);
      bar()?.classList.remove('is-flat');
    };
  }, [scroller, kind, convId]);
}
