'use client';

import { useSyncExternalStore } from 'react';

/**
 * --ch-type-k in CSS pixels: the root font size over 16, times the iPhone's Text Size (--ch-type-scale on <html>, which the
 * shell writes in a layout effect after the calendar's first render). A block that counts its lines in script measures with
 * it, so the count follows the type the CSS draws and a larger Text Size never pushes a block's time line out of it.
 */
let cached: { key: string; k: number } | null = null;

function subscribe(onChange: () => void): () => void {
  const watch = new MutationObserver(onChange);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  return () => watch.disconnect();
}

function snapshot(): number {
  const root = document.documentElement;
  const key = root.style.getPropertyValue('--ch-type-scale');
  if (cached?.key === key) return cached.k;
  const scale = parseFloat(key) || 1;
  const rem = parseFloat(getComputedStyle(root).fontSize) || 16;
  cached = { key, k: (rem / 16) * scale };
  return cached.k;
}

/** The server draws at the default size (k = 1); the client takes the reader's size on hydration. */
export function useChTypeK(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 1);
}
