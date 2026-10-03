'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CH_DUR } from './motion';
import { acquireOverlayScroll } from './overlay-scroll';
import { useChReducedMotion } from './reduced-motion';

/** Native modal lifetime shared by custom bars, action sheets and drawers. */
export function useDialogLifetime(open: boolean, {
  direction = 'bottom',
  surfaceSelector,
  focusSelector,
}: {
  direction?: 'bottom' | 'left' | 'center';
  surfaceSelector?: string;
  focusSelector?: string;
} = {}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const openRef = useRef(open);
  const content = useRef<ReactNode>(null);
  const [retained, setRetained] = useState(open);
  const reduced = useChReducedMotion();
  openRef.current = open;
  const present = open || retained;

  useLayoutEffect(() => {
    if (!present) return;
    const dialog = ref.current;
    const release = acquireOverlayScroll();
    return () => {
      // Native focus restoration must happen while the underlying page is locked,
      // including route unmounts and nested dialogs released in either order.
      dialog?.close();
      release();
    };
  }, [present]);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const surface = surfaceSelector ? dialog.querySelector<HTMLElement>(surfaceSelector) : dialog;
    if (open) {
      setRetained(true);
      dialog.removeAttribute('data-closing');
      dialog.style.translate = '';
      dialog.style.transition = '';
      if (surface) {
        surface.inert = false;
        surface.style.translate = '';
        surface.style.transition = '';
      }
      if (!dialog.open) {
        opener.current = document.activeElement;
        dialog.showModal();
        if (focusSelector) dialog.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
      }
      return;
    }
    if (!dialog.open) return;
    let active = true;
    const finish = () => {
      if (!active || openRef.current) return;
      dialog.close();
      setRetained(false);
      const target = opener.current;
      if (target instanceof HTMLElement && target.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true });
    };
    dialog.setAttribute('data-closing', '');
    if (surface) surface.inert = true;
    if (reduced || !surface?.animate) { finish(); return; }
    const exitTransform = direction === 'left' ? 'translateX(-100%)' : direction === 'bottom' ? 'translateY(100%)' : 'translateY(6px) scale(.98)';
    const computed = getComputedStyle(surface);
    const exit = surface.animate([
      { transform: computed.transform, opacity: computed.opacity },
      { transform: exitTransform, opacity: direction === 'center' ? 0 : 1 },
    ], { duration: CH_DUR.base * 1000, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
    exit.onfinish = finish;
    return () => { active = false; exit.onfinish = null; exit.cancel(); };
  }, [open, reduced, direction, surfaceSelector, focusSelector]);

  // A caller can clear its selected object immediately on dismiss. Retain the
  // last open subtree as well as the dialog, so the exit never becomes empty.
  const retainContent = (next: ReactNode) => {
    if (open) content.current = next;
    else if (!present) content.current = null;
    return present ? content.current : null;
  };
  return { ref, present, reduced, retainContent };
}
