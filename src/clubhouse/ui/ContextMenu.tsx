'use client';

import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CH_POP, chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { MenuItems, menuKeyDown, type MenuItem } from './Menu';

const W = 232;
const EDGE = 8;
/** Where a right-click menu is for: a pointer that hovers, on the desktop layout. A phone's long press and a touch keep their own gestures. */
const DESKTOP = '(hover: hover) and (min-width: 821px)';
/** Text the person can edit keeps the browser's own menu (cut, paste, spelling). */
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/** The two handlers a row takes to open its menu. Spread them on the row. */
export interface ContextMenuBind {
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
}

interface Open<T> {
  target: T;
  x: number;
  y: number;
  /** Opened from the keyboard: the first row takes focus, as in a button's menu. */
  keyboard: boolean;
  /** What had focus, so Escape and a pick give it back. */
  opener: HTMLElement | null;
  host: Element;
}

/**
 * A right-click menu for the rows of one list. The menu is the shared one (`Menu`'s surface, rows and keys): it opens at
 * the pointer, or beside the focused row from Shift+F10 or the Menu key, and holds the same rows as the row's own
 * kebab or tap actions, so a screen passes the items it already builds.
 *
 * The list owns one menu: `bind(target)` goes on each row and `menu` is rendered once beside the list.
 *
 * It stays out of the way: Shift+right-click, a text field, and a phone or touch (no hover) keep the browser's menu.
 * Closes on Escape, a pick, a press elsewhere, a scroll, a resize or the window losing focus.
 */
export function useContextMenu<T>({ label, items }: { label: (target: T) => string; items: (target: T) => MenuItem[] }): { bind: (target: T) => ContextMenuBind; menu: ReactNode } {
  const [open, setOpen] = useState<Open<T> | null>(null);
  // Nothing is drawn, not even the presence that eases a menu out, until the list's first right-click (a long inbox has a hook per row).
  const [used, setUsed] = useState(false);
  // The same value as `open`, for `close`, which reads it without being a state updater (those run twice under StrictMode).
  const current = useRef<Open<T> | null>(null);
  const place = useCallback((target: T, x: number, y: number, keyboard: boolean, from: HTMLElement) => {
    const next: Open<T> = { target, x, y, keyboard, opener: document.activeElement instanceof HTMLElement ? document.activeElement : null, host: from.closest('dialog[open]') ?? document.querySelector('.ch-root') ?? document.body };
    current.current = next;
    setUsed(true);
    setOpen(next);
  }, []);
  const close = useCallback((focus = true) => {
    const was = current.current;
    current.current = null;
    setOpen(null);
    // After the menu has left the page's focus order.
    if (was && focus) requestAnimationFrame(() => was.opener?.isConnected && was.opener.focus({ preventScroll: true }));
  }, []);

  const bind = useCallback(
    (target: T): ContextMenuBind => ({
      onContextMenu: (e) => {
        if (e.shiftKey || !window.matchMedia(DESKTOP).matches) return;
        if (e.target instanceof Element && e.target.closest(EDITABLE)) return;
        e.preventDefault();
        place(target, e.clientX, e.clientY, false, e.currentTarget);
      },
      onKeyDown: (e) => {
        if (!((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') || e.altKey || e.ctrlKey || e.metaKey) return;
        if (!window.matchMedia(DESKTOP).matches) return;
        if (e.target instanceof Element && e.target.closest(EDITABLE)) return;
        e.preventDefault();
        const r = (e.target instanceof HTMLElement ? e.target : e.currentTarget).getBoundingClientRect();
        place(target, r.left + Math.min(r.width / 2, 28), r.bottom - 4, true, e.currentTarget);
      },
    }),
    [place],
  );

  const menu = open ? (
    <ContextMenuSurface key="ctx" at={open} label={label(open.target)} items={items(open.target)} onClose={close} />
  ) : null;
  // The menu leaves with an exit; AnimatePresence needs to see it go.
  return { bind, menu: used ? <ContextMenuHost>{menu}</ContextMenuHost> : null };
}

/** Holds the presence so the menu eases out. Rendered in place; the surface itself is portaled. */
function ContextMenuHost({ children }: { children: ReactNode }) {
  return <AnimatePresence>{children}</AnimatePresence>;
}

function ContextMenuSurface<T>({ at, label, items, onClose }: { at: Open<T>; label: string; items: MenuItem[]; onClose: (focus?: boolean) => void }) {
  const id = useId();
  const reduced = useChReducedMotion();
  const list = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number; origin: string } | null>(null);

  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const fit = () => {
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const h = el.scrollHeight || el.offsetHeight || 200;
      const left = Math.max(EDGE, Math.min(at.x, window.innerWidth - W - EDGE));
      // Opens down from the pointer; flips up when it would run off the bottom and there is more room above.
      const below = Math.max(0, bottom - at.y - EDGE);
      const above = Math.max(0, at.y - EDGE);
      const up = h > below && above > below;
      const maxHeight = up ? above : below;
      const top = Math.max(EDGE, up ? at.y - Math.min(h, maxHeight) : at.y);
      // B16: it grows from the pointer's corner, the bottom one when it flipped up (and the right when pushed in from the edge).
      setPos({ left, top, maxHeight, origin: `${up ? 'bottom' : 'top'} ${left < at.x - W / 2 ? 'right' : 'left'}` });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [at.x, at.y, items.length]);

  useEffect(() => {
    const away = (e: Event) => {
      if (e.target instanceof Node && list.current?.contains(e.target)) return;
      onClose(false);
    };
    const onDown = (e: MouseEvent) => away(e);
    // Another right-click closes this menu; the row it lands on opens its own in the same event.
    const onOther = (e: MouseEvent) => away(e);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('contextmenu', onOther, true);
    document.addEventListener('scroll', away, true);
    window.addEventListener('blur', away);
    const frame = requestAnimationFrame(() => {
      const first = list.current?.querySelector<HTMLElement>('[role="menuitem"],[role="menuitemradio"]');
      // A mouse-opened menu starts with nothing lit (as a native one); the arrows take it from there.
      (at.keyboard ? first : list.current)?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('contextmenu', onOther, true);
      document.removeEventListener('scroll', away, true);
      window.removeEventListener('blur', away);
    };
  }, [at.keyboard, onClose]);

  return createPortal(
    <m.div
      ref={list}
      id={id}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className="ch-menu ch-popover ch-cmd-ctx"
      data-ui="clubhouse"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, maxHeight: pos?.maxHeight, width: W, transformOrigin: pos?.origin ?? 'top left' }}
      initial={reduced ? { opacity: 0 } : CH_POP.initial}
      animate={reduced ? { opacity: 1 } : CH_POP.animate}
      exit={reduced ? { opacity: 0 } : CH_POP.exit}
      transition={chTween('quick', reduced)}
      onKeyDown={(e) =>
        menuKeyDown(e, list.current, {
          onEscape: () => onClose(true),
          // Tab leaves the menu where it was opened and carries on from there.
          onTab: () => {
            at.opener?.focus({ preventScroll: true });
            onClose(false);
          },
        })
      }
    >
      <MenuItems items={items} onClose={onClose} />
    </m.div>,
    at.host,
  );
}
