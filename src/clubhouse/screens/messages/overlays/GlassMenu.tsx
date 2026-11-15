'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../../ui/Icon';
import type { MenuItem } from '../../../ui/Menu';
import { haptic } from '../../../lib/haptics';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { MS_BEATS, msAnimate, sheetCloseCurve } from '../motion/messages-motion';
import '../../../styles/messages-overlays.css';

/** MSG-410: a menu is 236 wide; 8 px from the screen's edge; flips above when it would pass the bottom 40 and there are 60 above. */
export const GLASS_MENU_W = 236;
const EDGE = 8;
const GAP = 8;
const BOTTOM_SAFE = 40;
const TOP_ROOM = 60;

/** Where a menu hangs from: an element (the trigger), a rectangle, or a point (a long press, a right click). */
export type GlassAnchor = HTMLElement | DOMRect | { x: number; y: number };

const rectOf = (a: GlassAnchor): DOMRect => {
  if (typeof HTMLElement !== 'undefined' && a instanceof HTMLElement) return a.getBoundingClientRect();
  if ('x' in a && 'y' in a && !('width' in a)) return new DOMRect(a.x, a.y, 0, 0);
  return a as DOMRect;
};

export interface GlassPlacement {
  top: number;
  left: number;
  /** Opens upward: the menu grows from its bottom-left corner. */
  up: boolean;
}

/**
 * MSG-410 placement: below the anchor with an 8 px gap and the left edge clamped 8 px in; above it instead when it would pass the
 * bottom 40 and there is 60 above. Pure, so the rule is tested without a layout engine.
 */
export function placeGlassMenu(r: { top: number; bottom: number; left: number }, menu: { w: number; h: number }, view: { w: number; h: number }): GlassPlacement {
  const up = r.bottom + GAP + menu.h > view.h - BOTTOM_SAFE && r.top - GAP - menu.h > TOP_ROOM;
  return {
    up,
    top: up ? r.top - GAP - menu.h : r.bottom + GAP,
    left: Math.max(EDGE, Math.min(r.left, view.w - menu.w - EDGE)),
  };
}

/**
 * The Messages popover menu (MSG-410, MSG-111, MSG-603): the message menu's glass at 236 wide, anchored to a trigger or a point,
 * unfolding 0.8 to 1 from the corner nearest the anchor on `lift`, leaving by a 160 ms fade. Items are the shared `MenuItem`s:
 * `danger` paints red, `caption` is a second quieter line, and `disabled` is `aria-disabled` (dimmed, focusable, never picks).
 * Arrow keys, Home / End, Escape and Tab behave as a menu's do; focus returns to the trigger when it closes.
 */
export function GlassMenu({
  open,
  anchor,
  items,
  label,
  onClose,
  className,
}: {
  open: boolean;
  anchor: GlassAnchor | null;
  items: MenuItem[];
  /** The menu's accessible name ("Actions for Maya"). */
  label: string;
  onClose: () => void;
  className?: string;
}) {
  const reduced = useChReducedMotion();
  const menu = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(open);
  const [place, setPlace] = useState<GlassPlacement | null>(null);
  const leaving = useRef<Animation | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;

  // Mount on open; keep mounted through the fade out.
  useEffect(() => {
    if (open) setShown(true);
  }, [open]);

  useLayoutEffect(() => {
    const at = anchorRef.current;
    if (!open || !shown || !at || !menu.current) return;
    trigger.current = typeof HTMLElement !== 'undefined' && at instanceof HTMLElement ? at : null;
    const r = rectOf(at);
    const el = menu.current;
    const next = placeGlassMenu(r, { w: el.offsetWidth || GLASS_MENU_W, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight });
    setPlace(next);
    // Unfold from the corner nearest the anchor; a reopen while it leaves picks up the live frame (interrupts never jump).
    const was = leaving.current;
    leaving.current = null;
    // Read the live frame first (live), then let the old fade go: cancelling it first would snap the menu back to full.
    msAnimate(el, [{ transform: 'scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], 'lift', { live: !!was, reduced });
    if (was) {
      was.onfinish = null;
      was.cancel();
    }
    const first = el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placed once per opening; the anchor is read from a ref so an inline point never replays it
  }, [open, shown]);

  // Closing: a 160 ms fade from where it is, then out of the DOM.
  useEffect(() => {
    if (open || !shown || !menu.current) return;
    const el = menu.current;
    const anim = msAnimate(el, [{ opacity: 1 }, { opacity: 0 }], null, { live: true, fill: 'forwards', reduced, timing: { ms: MS_BEATS.fillInk, easing: sheetCloseCurve.easing } });
    if (!anim) {
      setShown(false);
      setPlace(null);
      return;
    }
    leaving.current = anim;
    anim.onfinish = () => {
      if (leaving.current === anim) leaving.current = null;
      setShown(false);
      setPlace(null);
    };
  }, [open, shown, reduced]);

  const close = useCallback(
    (refocus: boolean) => {
      closeRef.current();
      if (refocus) trigger.current?.focus?.({ preventScroll: true });
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  if (!shown || !anchor || typeof document === 'undefined') return null;

  const move = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const rows = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      rows[(i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus({ preventScroll: true });
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      rows[e.key === 'Home' ? 0 : rows.length - 1]?.focus({ preventScroll: true });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      close(true);
    }
  };

  const pick = (it: Extract<MenuItem, { label: string }>) => {
    if (it.disabled) return;
    haptic(it.feel ?? 'select');
    close(false);
    it.onSelect?.();
  };

  return createPortal(
    <div className={'ch-mso-pop' + (open ? '' : ' is-leaving')} data-ch-ms-v2="on" data-ch-code="CH-7603">
      {/* A transparent scrim: any tap outside closes the menu and does nothing else. */}
      <div className="ch-mso-pop__scrim" aria-hidden="true" onPointerDown={(e) => { e.preventDefault(); close(true); }} />
      <div
        ref={menu}
        role="menu"
        tabIndex={-1}
        aria-label={label}
        className={'ch-mso-menu' + (className ? ` ${className}` : '')}
        onKeyDown={move}
        style={{ top: place?.top ?? -9999, left: place?.left ?? -9999, transformOrigin: place?.up ? '0 100%' : '0 0' }}
      >
        {items.map((it, i) => {
          if (it.kind === 'separator') return <hr key={`s${i}`} />;
          const off = !!it.disabled;
          return (
            <button
              key={`${it.label}-${i}`}
              type="button"
              role="menuitem"
              aria-disabled={off || undefined}
              className={(it.danger ? 'is-danger' : '') + (off ? ' is-off' : '') + (it.caption ? ' has-caption' : '') || undefined}
              onClick={() => pick(it)}
            >
              <span className="ch-mso-menu__t">
                {it.label}
                {it.caption && <small>{it.caption}</small>}
              </span>
              {it.icon && <Icon icon={it.icon} size={19} />}
            </button>
          );
        })}
      </div>
    </div>,
    document.querySelector('.ch-root') ?? document.body,
  );
}
