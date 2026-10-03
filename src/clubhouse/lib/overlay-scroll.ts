'use client';

import { useLayoutEffect } from 'react';

/** One lock per document, held until the last nested or exiting overlay leaves. */
const locks = new WeakMap<Document, { count: number; restore: () => void }>();

export function acquireOverlayScroll(doc: Document = document): () => void {
  const current = locks.get(doc);
  if (current) current.count += 1;
  else {
    const win = doc.defaultView;
    if (!win) return () => {};
    const body = doc.body;
    const html = doc.documentElement;
    const x = win.scrollX;
    const y = win.scrollY;
    const route = win.location.pathname + win.location.search;
    const fields = ['position', 'top', 'left', 'width', 'overflow', 'padding-right', 'box-sizing'] as const;
    const saved = fields.map((key) => [key, body.style.getPropertyValue(key), body.style.getPropertyPriority(key)] as const);
    const htmlOverflow = html.style.overflow;
    const gap = Math.max(0, win.innerWidth - html.clientWidth);
    const padding = parseFloat(win.getComputedStyle(body).paddingRight) || 0;
    const canvases = Array.from(doc.querySelectorAll<HTMLElement>('.ch-canvas')).map((el) => ({ el, overflow: el.style.overflow, top: el.scrollTop, left: el.scrollLeft }));
    // Freeze at the current visual position. Unlike overflow alone this also stops
    // iOS document rubber-banding behind fixed sheets, without translating the page.
    body.style.position = 'fixed';
    body.style.top = `${-y}px`;
    body.style.left = `${-x}px`;
    body.style.width = '100%';
    body.style.boxSizing = 'border-box';
    body.style.overflow = 'hidden';
    if (gap) body.style.paddingRight = `${padding + gap}px`;
    html.style.overflow = 'hidden';
    canvases.forEach(({ el }) => { el.style.overflow = 'hidden'; });
    locks.set(doc, { count: 1, restore: () => {
      const sameRoute = route === win.location.pathname + win.location.search;
      saved.forEach(([key, value, priority]) => {
        if (value) body.style.setProperty(key, value, priority);
        else body.style.removeProperty(key);
      });
      html.style.overflow = htmlOverflow;
      canvases.forEach(({ el, overflow, top, left }) => {
        el.style.overflow = overflow;
        el.scrollTop = sameRoute ? top : 0;
        el.scrollLeft = sameRoute ? left : 0;
      });
      win.scrollTo({ left: sameRoute ? x : 0, top: sameRoute ? y : 0, behavior: 'instant' });
    } });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const lock = locks.get(doc);
    if (!lock || --lock.count > 0) return;
    locks.delete(doc);
    lock.restore();
  };
}

export function useOverlayScrollLock(active = true): void {
  useLayoutEffect(() => active ? acquireOverlayScroll() : undefined, [active]);
}

/** Render inside an AnimatePresence child so the lock also covers its exit. */
export function OverlayScrollLock({ active = true }: { active?: boolean }) {
  useOverlayScrollLock(active);
  return null;
}
