'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CH_DUR, CH_EASE, chSpringCurve } from './motion';
import { acquireOverlayScroll } from './overlay-scroll';
import { useChReducedMotion } from './reduced-motion';
import { chSupportsLinear, chThrownExit, takeSheetFling } from './sheet-drag';
import { chFocusQuietly } from './focus-quietly';

/** Pauses the opening animations on `dialog` (its scrim) and `surface` until two frames have painted. */
function holdRise(dialog: HTMLElement, surface: HTMLElement | null) {
  const held = surface && surface !== dialog ? [dialog, surface] : [dialog];
  for (const el of held) el.setAttribute('data-ch-hold', '');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const el of held) el.removeAttribute('data-ch-hold');
    }),
  );
}

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
  /** Where a leaving surface stood when it was opened again mid-exit, so it goes back up from there. */
  const caught = useRef<{ transform: string; opacity: string } | null>(null);
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
      // Opened again while it was leaving (motion pass 2026-10-22): it turns round where it is and goes back to rest on
      // the spring it rose on, as an iOS sheet does, rather than snap open from part way down.
      const back = caught.current;
      caught.current = null;
      if (back && surface?.animate && dialog.open && !reduced && back.transform !== 'none') {
        const curve = chSpringCurve('smooth');
        surface.animate([back, { transform: 'none', opacity: '1' }], direction !== 'center' && chSupportsLinear()
          ? { duration: curve.ms, easing: curve.linear }
          : { duration: CH_DUR.base * 1000, easing: `cubic-bezier(${CH_EASE.join(', ')})` });
      }
      if (!dialog.open) {
        opener.current = document.activeElement;
        // The rise (and the scrim's fade) wait, paused at their first frame, until the sheet has painted: its CSS
        // animation's clock starts when its style lands, so the frames spent laying out a long sheet were taken off the
        // start of the rise and it jumped up from part way (phone, owner 2026-10-15: "needs to be smoother"). Two
        // frames later it plays from the bottom, on the compositor.
        holdRise(dialog, surface);
        dialog.showModal();
        // A field that asked for focus (autoFocus) keeps it; otherwise the named element (a title) takes it.
        const active = document.activeElement;
        const typing = active instanceof HTMLElement && dialog.contains(active) && active.matches('input, textarea, select, [contenteditable="true"]');
        if (focusSelector && !typing) dialog.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
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
      if (target instanceof HTMLElement && target.isConnected && !target.closest('[inert]')) chFocusQuietly(target);
    };
    dialog.setAttribute('data-closing', '');
    if (surface) surface.inert = true;
    if (reduced || !surface?.animate) { finish(); return; }
    const exitTransform = direction === 'left' ? 'translateX(-100%)' : direction === 'bottom' ? 'translateY(100%)' : 'translateY(6px) scale(.98)';
    const computed = getComputedStyle(surface);
    // A sheet or drawer leaves on the smooth spring it rose on, ending as it leaves sight, as the bell and the account
    // sheet do (popup audit 2026-10-13): thrown shut, at the throw's speed (CH-1611); closed any other way, from rest.
    // A centred dialog, or a browser without linear(), takes the base ease-out.
    const fling = direction === 'center' ? 0 : takeSheetFling(dialog) || takeSheetFling(surface);
    const travel = direction === 'left' ? surface.offsetWidth : surface.offsetHeight;
    const thrown = direction !== 'center' && travel > 0 && chSupportsLinear() ? chThrownExit(fling, travel) : null;
    // From where the throw has it by the exit's first frame (when it was at rest, not mid rise).
    const lead = thrown && computed.transform === 'none' ? thrown.lead : 0;
    const from = lead ? (direction === 'left' ? `translateX(${-lead}px)` : `translateY(${lead}px)`) : computed.transform;
    const exit = surface.animate([
      { transform: from, opacity: computed.opacity },
      { transform: exitTransform, opacity: direction === 'center' ? 0 : 1 },
    ], thrown
      ? { duration: thrown.ms, easing: thrown.linear, fill: 'forwards' }
      : { duration: CH_DUR.base * 1000, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
    exit.onfinish = finish;
    return () => {
      active = false;
      exit.onfinish = null;
      // Reopened mid-exit: keep where it is before the exit lets go of it, for the way back up (above).
      if (openRef.current && exit.playState === 'running') {
        const now = getComputedStyle(surface);
        caught.current = { transform: now.transform, opacity: now.opacity };
      }
      exit.cancel();
    };
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
