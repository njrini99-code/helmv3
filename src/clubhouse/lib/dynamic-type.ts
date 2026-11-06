'use client';

import { useLayoutEffect } from 'react';

/** iOS's body size at the default Text Size, and the largest step Clubhouse follows (XXL; larger sizes cap here). */
const DEFAULT_BODY_PX = 17;
const MAX_SCALE = 23 / 17;
/** The smallest step followed: below it Clubhouse's 12px floor would break. */
const MIN_SCALE = 14 / 17;

/**
 * The iPhone's text size as a scale (P008-C1): 1 at the default, less below it, more above it, capped at XXL. Read from WebKit's
 * `-apple-system-body` font, which follows Settings > Display & Brightness > Text Size; null where the browser has no
 * such font (every other platform, where rem and the browser's own text size do the work).
 */
export function readDynamicTypeScale(doc: Document = document): number | null {
  // A Mac's -apple-system-body is 13px whatever the setting, so only a touch screen's says anything about Text Size.
  if (!doc.defaultView?.matchMedia?.('(pointer: coarse)').matches) return null;
  const probe = doc.createElement('span');
  probe.style.font = '-apple-system-body';
  if (!probe.style.font) return null;
  doc.documentElement.appendChild(probe);
  const size = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  if (!Number.isFinite(size) || size === DEFAULT_BODY_PX) return null;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, size / DEFAULT_BODY_PX));
}

/** Writes --ch-type-scale on <html> while the Clubhouse is mounted; every --ch-type-* token multiplies by it. */
export function useChDynamicType(): void {
  useLayoutEffect(() => {
    const html = document.documentElement;
    // Again on coming back and on a resize: iOS fires one when Text Size changes, and the home-screen app stays open across it (MOB-SHELL-11).
    const read = () => {
      if (document.visibilityState === 'hidden') return;
      const scale = readDynamicTypeScale();
      if (scale === null) html.style.removeProperty('--ch-type-scale');
      else html.style.setProperty('--ch-type-scale', String(Math.round(scale * 1000) / 1000));
    };
    read();
    document.addEventListener('visibilitychange', read);
    window.addEventListener('resize', read);
    return () => {
      document.removeEventListener('visibilitychange', read);
      window.removeEventListener('resize', read);
      html.style.removeProperty('--ch-type-scale');
    };
  }, []);
}
