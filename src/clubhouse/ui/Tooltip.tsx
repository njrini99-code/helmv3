'use client';

import { cloneElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { tipClock } from '../shell/command/tooltip-clock';
import { CH_DUR } from '../lib/motion';
import { overlayView, placeOverlay, watchOverlayView } from '../lib/overlay-place';

const GAP = 8;
const EDGE = 8;

interface TriggerProps {
  onPointerEnter?: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (e: PointerEvent<HTMLElement>) => void;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onFocus?: (e: FocusEvent<HTMLElement>) => void;
  onBlur?: (e: FocusEvent<HTMLElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  'aria-keyshortcuts'?: string;
  'aria-label'?: string;
}

/** A mouse or pen resting over a control; never a finger (touch has no hover, and a tap would flash a tip as the press lands). */
const hoverCapable = (e: PointerEvent<HTMLElement>) => e.pointerType !== 'touch' && window.matchMedia('(hover: hover)').matches;

/** Keyboard focus, not a click's: `:focus-visible` is what a ring would show for. A browser without it (or a test DOM) counts as keyboard. */
function focusIsKeyboard(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * A tooltip for one control: the control's accessible name and, when it has one, its shortcut. Opens after the pointer rests
 * (500ms the first time, at once when moving between neighbours: tooltip-clock.ts), and at once on keyboard focus. Escape,
 * a press, a scroll, the window losing focus or the control leaving the page close it. Never shown for touch.
 *
 * It wraps the control and adds handlers to it rather than drawing a wrapper, so layout is untouched. The plate is drawn in
 * the control's dialog when it has one (so it is in the top layer with it) and otherwise in `.ch-root`, in the popover
 * material (`.ch-popover`). It is `aria-hidden`: the name is already the control's `aria-label` and the shortcut is announced
 * by `aria-keyshortcuts`, so a screen reader hears each once. Nothing is drawn while it is closed.
 */
export function Tooltip({
  label,
  shortcut,
  ariaKeys,
  children,
}: {
  /** What the control is called: its accessible name. Left out, the control's own `aria-label` is used, so the two cannot differ. */
  label?: string;
  /** Its shortcut, one string per key ("⌘", "\\"), drawn as key caps. */
  shortcut?: readonly string[];
  /** The same shortcut for assistive tech (aria-keyshortcuts: "Meta+Backslash Control+Backslash"). */
  ariaKeys?: string;
  children: ReactElement<TriggerProps>;
}) {
  const [open, setOpen] = useState(false);
  /** It fades out over the press beat once it closes, rather than cutting out (OVL-07). */
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const trigger = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);
  const child = children;

  const show = useCallback(() => {
    window.clearTimeout(leaveTimer.current);
    setLeaving(false);
    openRef.current = true;
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    const was = openRef.current;
    tipClock.release(was);
    openRef.current = false;
    setOpen(false);
    if (!was) return;
    setLeaving(true);
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setLeaving(false), CH_DUR.press * 1000);
  }, []);

  // A control that leaves while its tip is up (a toast timing out, a sheet closing) takes the tip with it.
  useEffect(
    () => () => {
      window.clearTimeout(leaveTimer.current);
      tipClock.release(openRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const away = () => hide();
    document.addEventListener('scroll', away, true);
    window.addEventListener('blur', away);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('scroll', away, true);
      window.removeEventListener('blur', away);
      window.removeEventListener('resize', away);
    };
  }, [open, hide]);

  const own = child.props;
  const words = label ?? own['aria-label'];
  const props: TriggerProps = {
    onPointerEnter: (e) => {
      own.onPointerEnter?.(e);
      if (!hoverCapable(e)) return;
      trigger.current = e.currentTarget;
      tipClock.request(show, true);
    },
    onPointerLeave: (e) => {
      own.onPointerLeave?.(e);
      hide();
    },
    onPointerDown: (e) => {
      own.onPointerDown?.(e);
      hide();
    },
    onFocus: (e) => {
      own.onFocus?.(e);
      if (!focusIsKeyboard(e.currentTarget)) return;
      // Focus code handed back (a menu or dialog closing onto its trigger, lib/focus-quietly.ts) is not someone arriving on
      // the control: on a phone it showed the tip after Escape closed a menu (audit 2026-11-18).
      if (e.currentTarget.dataset.chPeekQuiet !== undefined) return;
      trigger.current = e.currentTarget;
      tipClock.request(show, false);
    },
    onBlur: (e) => {
      own.onBlur?.(e);
      hide();
    },
    onKeyDown: (e) => {
      own.onKeyDown?.(e);
      // Dismissed without being swallowed: the same Escape still closes the dialog the control sits in.
      if (e.key === 'Escape') hide();
    },
    ...(ariaKeys && !own['aria-keyshortcuts'] ? { 'aria-keyshortcuts': ariaKeys } : {}),
  };

  return (
    <>
      {cloneElement(child, props)}
      {(open || leaving) && trigger.current && words && <TipPlate anchor={trigger.current} label={words} shortcut={shortcut} leaving={!open} />}
    </>
  );
}

/** The plate itself, mounted only while open: below its control, above when the page ends first, never past the window's edge. */
function TipPlate({ anchor, label, shortcut, leaving }: { anchor: HTMLElement; label: string; shortcut?: readonly string[]; leaving: boolean }) {
  const plate = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = plate.current;
    if (!el) return;
    // Below its control, above when the page ends first, never past the window's edge (lib/overlay-place.ts); placed again if the
    // window changes under it (a rotation, the toolbar).
    const place = () => {
      const p = placeOverlay(anchor.getBoundingClientRect(), { width: el.offsetWidth, height: el.offsetHeight }, overlayView(), { align: 'center', gap: GAP, edge: EDGE });
      setPos({ left: p.left, top: p.top });
    };
    place();
    return watchOverlayView(place);
  }, [anchor, label, shortcut]);

  const host = anchor.closest('dialog[open]') ?? document.querySelector('.ch-root') ?? document.body;
  return createPortal(
    <span ref={plate} className="ch-popover ch-tip" data-ui="clubhouse" data-leaving={leaving || undefined} aria-hidden="true" style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}>
      <span className="ch-tip__label">{label}</span>
      {shortcut && shortcut.length > 0 && (
        <span className="ch-tip__keys">
          {shortcut.map((k, i) => (
            <kbd key={`${k}${i}`} className="ch-tip__kbd">
              {k}
            </kbd>
          ))}
        </span>
      )}
    </span>,
    host,
  );
}
