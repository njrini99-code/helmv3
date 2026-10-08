'use client';

import { useLayoutEffect } from 'react';

/** iOS's body size at the default Text Size, and the largest step Clubhouse follows (XXL; larger sizes cap here). */
const DEFAULT_BODY_PX = 17;
const MAX_SCALE = 23 / 17;

/**
 * The iPhone's text size as a scale (P008-C1): 1 at the default, more above it, capped at XXL. Read from WebKit's
 * `-apple-system-body` font, which follows Settings > Display & Brightness > Text Size; null where the browser has no
 * such font (every other platform, where rem and the browser's own text size do the work).
 */
export function readDynamicTypeScale(doc: Document = document): number | null {
  const probe = doc.createElement('span');
  probe.style.font = '-apple-system-body';
  if (!probe.style.font) return null;
  doc.documentElement.appendChild(probe);
  const size = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  if (!Number.isFinite(size) || size <= DEFAULT_BODY_PX) return null;
  return Math.min(MAX_SCALE, size / DEFAULT_BODY_PX);
}

/** Writes --ch-type-scale on <html> while the Clubhouse is mounted; every --ch-type-* token multiplies by it. */
export function useChDynamicType(): void {
  useLayoutEffect(() => {
    const scale = readDynamicTypeScale();
    if (scale === null) return;
    const html = document.documentElement;
    html.style.setProperty('--ch-type-scale', String(Math.round(scale * 1000) / 1000));
    return () => {
      html.style.removeProperty('--ch-type-scale');
    };
  }, []);
}
