'use client';

import { cloneElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { tipClock } from '../shell/command/tooltip-clock';

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
  /** What the control is called: its accessible name. */
  label: string;
  /** Its shortcut, one string per key ("⌘", "\\"), drawn as key caps. */
  shortcut?: readonly string[];
  /** The same shortcut for assistive tech (aria-keyshortcuts: "Meta+Backslash Control+Backslash"). */
  ariaKeys?: string;
  children: ReactElement<TriggerProps>;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);
  const child = children;

  const show = useCallback(() => {
    openRef.current = true;
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    tipClock.release(openRef.current);
    openRef.current = false;
    setOpen(false);
  }, []);

  // A control that leaves while its tip is up (a toast timing out, a sheet closing) takes the tip with it.
  useEffect(() => () => tipClock.release(openRef.current), []);

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
      {open && trigger.current && <TipPlate anchor={trigger.current} label={label} shortcut={shortcut} />}
    </>
  );
}

/** The plate itself, mounted only while open: below its control, above when the page ends first, never past the window's edge. */
function TipPlate({ anchor, label, shortcut }: { anchor: HTMLElement; label: string; shortcut?: readonly string[] }) {
  const plate = useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = plate.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(EDGE, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - EDGE));
    const below = r.bottom + GAP;
    const top = below + h + EDGE > window.innerHeight ? Math.max(EDGE, r.top - GAP - h) : below;
    setPos({ left, top });
  }, [anchor, label, shortcut]);

  const host = anchor.closest('dialog[open]') ?? document.querySelector('.ch-root') ?? document.body;
  return createPortal(
    <span ref={plate} className="ch-popover ch-tip" data-ui="clubhouse" aria-hidden="true" style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}>
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
