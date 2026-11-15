'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { haptic } from '../../../lib/haptics';
import { CTX_HOLD_MS } from '../../../ui/ContextMenu';
import type { ContextMenuBind } from '../../../ui/ContextMenu';
import type { MenuItem } from '../../../ui/Menu';
import { GlassMenu, type GlassAnchor } from '../overlays/GlassMenu';

/** A right click means something where there is a hover pointer on the desktop layout; a phone's long press and a touch keep their own gestures. */
const DESKTOP = '(hover: hover) and (min-width: 821px)';
/** Text the person can edit keeps the browser's own menu (cut, paste, spelling). */
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
/** A finger that moves further than this before the hold fires is scrolling or swiping, not holding. */
const HOLD_SLOP_PX = 10;

/**
 * An inbox row's and a pinned face's menu on C's `GlassMenu` (MSG-111, MOT-X-8): 236 wide, unfolding from the corner nearest
 * the row on `lift` and leaving on a 160 ms fade, with a dimmed Pin as an `aria-disabled` row. The same gestures as the shared
 * context menu it replaces (`ui/ContextMenu.tsx`): a right click, Shift+F10 or the Menu key, and on the phone a 500 ms long
 * press whose tap never lands on the row. `openAt` opens it from a control of the row's own (the VoiceOver button), and
 * `cancelHold` is for a parent that takes the pointer over (a SwipeRow claiming a sideways drag).
 */
export function useRowMenu<T>({
  label,
  items,
  touchHold = false,
}: {
  label: (target: T) => string;
  /** The rows for a target; `anchor` is where the menu hangs, for an item that opens something beside it (Mute…). */
  items: (target: T, anchor: GlassAnchor) => MenuItem[];
  touchHold?: boolean;
}): { bind: (target: T) => ContextMenuBind; menu: ReactNode; openAt: (target: T, anchor: GlassAnchor) => void; cancelHold: () => void } {
  // The menu stays mounted after it closes so it can fade out, with the rows of the target it opened for; nothing is drawn until
  // the first ask (a long inbox has a hook per row).
  const [state, setState] = useState<{ target: T; anchor: GlassAnchor; open: boolean } | null>(null);
  const show = useCallback((target: T, anchor: GlassAnchor) => setState({ target, anchor, open: true }), []);
  const close = useCallback(() => setState((s) => (s ? { ...s, open: false } : s)), []);

  const hold = useRef<{ timer: number | null; x: number; y: number; fired: boolean; onScroll: (() => void) | null }>({ timer: null, x: 0, y: 0, fired: false, onScroll: null });
  const cancelHold = useCallback(() => {
    const h = hold.current;
    if (h.timer != null) window.clearTimeout(h.timer);
    h.timer = null;
    if (h.onScroll) document.removeEventListener('scroll', h.onScroll, true);
    h.onScroll = null;
  }, []);
  useEffect(() => cancelHold, [cancelHold]);

  const bind = useCallback(
    (target: T): ContextMenuBind => ({
      ...(touchHold
        ? {
            onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
              cancelHold();
              hold.current.fired = false;
              if (e.pointerType === 'mouse' || !e.isPrimary) return;
              hold.current.x = e.clientX;
              hold.current.y = e.clientY;
              const rowEl = e.currentTarget;
              // A scroll anywhere (the list moving under the finger) is not a hold.
              hold.current.onScroll = () => cancelHold();
              document.addEventListener('scroll', hold.current.onScroll, true);
              hold.current.timer = window.setTimeout(() => {
                cancelHold();
                hold.current.fired = true;
                haptic('press');
                show(target, rowEl);
              }, CTX_HOLD_MS);
            },
            onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
              if (hold.current.timer == null) return;
              if (Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > HOLD_SLOP_PX) cancelHold();
            },
            onPointerUp: () => cancelHold(),
            onPointerCancel: () => cancelHold(),
            onClickCapture: (e: ReactMouseEvent<HTMLElement>) => {
              if (!hold.current.fired) return;
              hold.current.fired = false;
              e.preventDefault();
              e.stopPropagation();
            },
          }
        : {}),
      onContextMenu: (e) => {
        // A touch's own long-press menu (Android, some WebViews) gives way to ours.
        if (touchHold && (hold.current.timer != null || hold.current.fired)) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey || !window.matchMedia(DESKTOP).matches) return;
        if (e.target instanceof Element && e.target.closest(EDITABLE)) return;
        e.preventDefault();
        show(target, { x: e.clientX, y: e.clientY });
      },
      onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
        if (!((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.target instanceof Element && e.target.closest(EDITABLE)) return;
        // On the phone only a row that takes a hold has a keyboard path (an iPad's or iPhone's keyboard).
        if (!window.matchMedia(DESKTOP).matches && !touchHold) return;
        e.preventDefault();
        show(target, e.target instanceof HTMLElement ? e.target : e.currentTarget);
      },
    }),
    [show, touchHold, cancelHold],
  );

  const menu = state ? <GlassMenu open={state.open} anchor={state.anchor} items={items(state.target, state.anchor)} label={label(state.target)} onClose={close} /> : null;
  return { bind, menu, openAt: show, cancelHold };
}
