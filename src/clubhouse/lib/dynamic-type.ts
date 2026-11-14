'use client';

import { useLayoutEffect } from 'react';
import { typeScaleFor, typeScaleValue } from './type-scale';

/**
 * The iPhone's text size as a scale (P008-C1): more than 1 above the default, capped at XXL; null at and under it (F-0014:
 * never under 1, so no phone step draws under its size). Read from WebKit's
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
  return typeScaleFor(size);
}

/**
 * Writes --ch-type-scale on <html> while the Clubhouse is mounted; every --ch-type-* token multiplies by it. On a hard load
 * TypeScaleScript (root <head>) has already stamped the same value before first paint, so this changes nothing at
 * hydration; on a soft navigation it is the first to write, before paint (a layout effect).
 */
export function useChDynamicType(): void {
  useLayoutEffect(() => {
    const html = document.documentElement;
    // Again on coming back and on a resize: iOS fires one when Text Size changes, and the home-screen app stays open across it (MOB-SHELL-11).
    const read = () => {
      if (document.visibilityState === 'hidden') return;
      const scale = readDynamicTypeScale();
      if (scale === null) html.style.removeProperty('--ch-type-scale');
      else html.style.setProperty('--ch-type-scale', typeScaleValue(scale));
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
