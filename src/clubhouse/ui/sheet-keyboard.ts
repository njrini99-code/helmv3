'use client';

import { useEffect } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';

/** How much of the page the keyboard covers, or 0: a pinch-zoom shrinks the visible area too, and it isn't a keyboard. */
export function keyboardCover(layoutHeight: number, visibleHeight: number, scale: number): number {
  const cover = layoutHeight - visibleHeight;
  return scale <= 1.01 && cover > 120 ? Math.round(cover) : 0;
}

/**
 * Safari never tells the page the keyboard's height, and the native app's provider does: while a sheet is open this
 * says the same two things that provider says, so the sheet sits on the keyboard and its field and Save stay in view (MOB-PRAC-3).
 */
export function useSheetKeyboardFit(open: boolean): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv || isNativeApp() || !window.matchMedia?.('(pointer: coarse)').matches) return;
    const root = document.documentElement;
    const fit = () => {
      const cover = keyboardCover(root.clientHeight, vv.height, vv.scale);
      document.body.classList.toggle('keyboard-open', cover > 0);
      if (cover > 0) root.style.setProperty('--keyboard-height', `${cover}px`);
      else root.style.removeProperty('--keyboard-height');
    };
    vv.addEventListener('resize', fit);
    fit();
    return () => {
      vv.removeEventListener('resize', fit);
      document.body.classList.remove('keyboard-open');
      root.style.removeProperty('--keyboard-height');
    };
  }, [open]);
}
