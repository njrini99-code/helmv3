'use client';

/**
 * Tells the iOS shell when a sheet or dialog is open, so it can turn off the
 * native edge swipe-back while one is (MOT-13). An edge swipe with a sheet
 * open would navigate the page underneath it. The shell also turns the
 * swipe off on the round-tracking routes by itself
 * (ios/App/App/GolfBridgeViewController.swift).
 *
 * Does nothing outside the iOS app (no `helmNav` message handler).
 */

import { useEffect } from 'react';

const OPEN_OVERLAY =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], dialog[open], [data-vaul-drawer][data-state="open"]';

interface HelmNavWindow {
  webkit?: { messageHandlers?: { helmNav?: { postMessage: (body: { overlayOpen: boolean }) => void } } };
}

export function NativeSwipeBackBridge() {
  useEffect(() => {
    const handler = (window as unknown as HelmNavWindow).webkit?.messageHandlers?.helmNav;
    if (!handler) return;
    let last: boolean | null = null;
    let frame = 0;
    const report = () => {
      frame = 0;
      const open = document.querySelector(OPEN_OVERLAY) != null;
      if (open === last) return;
      last = open;
      handler.postMessage({ overlayOpen: open });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(report);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'open'],
    });
    report();
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      handler.postMessage({ overlayOpen: false });
    };
  }, []);
  return null;
}
