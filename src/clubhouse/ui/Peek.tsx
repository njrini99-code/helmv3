'use client';

import type { LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogLifetime } from '../lib/dialog-lifetime';
import { haptic } from '../lib/haptics';
import { chSpring, chTween } from '../lib/motion';
import { Icon } from './Icon';

/**
 * Press-and-hold peek (owner, 2026-10-08; P003-C1's primitive). Anything that names an object can show a card of it
 * without leaving the page:
 *
 *   phone    hold about 450ms (a selection tick): the card rises over a dimmed page with the object's actions under it,
 *            the native context menu's anatomy. The tap that would have opened the row is swallowed; a scroll or a drag
 *            cancels the hold. Esc, a tap outside or an action closes it.
 *   desktop  rest the pointer on it for 400ms, or focus it from the keyboard for 600ms: a hover card beside it, with the
 *            same actions as small keys. Leaving both the target and the card, Esc or a scroll closes it.
 *
 * The target keeps its own tap or click: the peek is an addition, never the only way to an action.
 *
 *   <PeekTarget label="Theo Marchetti" card={() => <PlayerPeekCard … />} actions={[…]}>
 *     <a href=…>Theo Marchetti</a>
 *   </PeekTarget>
 */
export interface PeekAction {
  label: string;
  icon?: LucideIcon;
  href?: string | null;
  onSelect?: () => void;
}

export const PEEK_HOLD_MS = 450;
export const PEEK_HOVER_MS = 400;
export const PEEK_FOCUS_MS = 600;
const SLOP_PX = 8;
const HOVER_GRACE_MS = 160;
const CARD_W = 328;

type Mode = { kind: 'press' | 'hover'; rect: DOMRect } | null;

export function PeekTarget({
  label,
  card,
  actions = [],
  disabled = false,
  children,
}: {
  /** Names the card for VoiceOver ("Theo Marchetti"). */
  label: string;
  /** Drawn only while open. */
  card: () => ReactNode;
  actions?: PeekAction[];
  disabled?: boolean;
  children: ReactNode;
}) {
  const wrap = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<Mode>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const cardId = useId();
  const shown = actions.filter((a) => a.href || a.onSelect);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const anchor = (): DOMRect | null => {
    const el = (wrap.current?.firstElementChild as HTMLElement | null) ?? null;
    return el ? el.getBoundingClientRect() : null;
  };
  const open = useCallback((kind: 'press' | 'hover') => {
    const el = (wrap.current?.firstElementChild as HTMLElement | null) ?? null;
    if (!el) return;
    setMode({ kind, rect: el.getBoundingClientRect() });
  }, []);
  const close = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMode(null);
  }, []);
  const holdHover = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const leaveHover = () => {
    clear();
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMode((m) => (m?.kind === 'hover' ? null : m)), HOVER_GRACE_MS);
  };

  useEffect(
    () => () => {
      clear();
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  // A hover card belongs to where the target was: Esc, or a scroll that moves the target, puts it away.
  const openedAt = mode?.kind === 'hover' ? mode.rect.top : null;
  useEffect(() => {
    if (openedAt === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onScroll = () => {
      const now = anchor();
      if (!now || Math.abs(now.top - openedAt) > 4) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openedAt, close]);

  const handlers = disabled
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent) => {
          // A hold's lift may have ended on the peek, not here: its swallow never fired, and must not eat this tap.
          swallowClick.current = false;
          if (e.pointerType !== 'touch' || !e.isPrimary) return;
          start.current = { x: e.clientX, y: e.clientY };
          clear();
          timer.current = setTimeout(() => {
            timer.current = null;
            swallowClick.current = true;
            haptic('select');
            open('press');
          }, PEEK_HOLD_MS);
        },
        onPointerMove: (e: React.PointerEvent) => {
          const s = start.current;
          if (!s || !timer.current) return;
          if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP_PX) clear();
        },
        onPointerUp: () => clear(),
        onPointerCancel: () => clear(),
        onPointerEnter: (e: React.PointerEvent) => {
          if (e.pointerType !== 'mouse') return;
          holdHover();
          if (mode) return;
          clear();
          timer.current = setTimeout(() => open('hover'), PEEK_HOVER_MS);
        },
        onPointerLeave: (e: React.PointerEvent) => {
          if (e.pointerType === 'mouse') leaveHover();
        },
        onFocus: (e: React.FocusEvent) => {
          if (!(e.target as HTMLElement).matches?.(':focus-visible')) return;
          clear();
          timer.current = setTimeout(() => open('hover'), PEEK_FOCUS_MS);
        },
        onBlur: () => {
          clear();
          setMode((m) => (m?.kind === 'hover' ? null : m));
        },
        // The hold opened the peek: the tap it ends with is not a tap on the row.
        onClickCapture: (e: React.MouseEvent) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        },
        // iOS's own link callout and the desktop menu stay out of a hold the peek has taken.
        onContextMenu: (e: React.MouseEvent) => {
          if (swallowClick.current || timer.current) e.preventDefault();
        },
      };

  return (
    <>
      <span
        ref={wrap}
        className="ch-peek-target"
        data-peek-open={mode ? '' : undefined}
        aria-describedby={mode?.kind === 'hover' ? cardId : undefined}
        {...handlers}
      >
        {children}
      </span>
      {mode?.kind === 'hover' && (
        <HoverCard id={cardId} label={label} rect={mode.rect} actions={shown} onEnter={holdHover} onLeave={leaveHover} onClose={close}>
          {card()}
        </HoverCard>
      )}
      <PressPeek open={mode?.kind === 'press'} rect={mode?.rect ?? null} label={label} actions={shown} onClose={close}>
        {mode?.kind === 'press' ? card() : null}
      </PressPeek>
    </>
  );
}

function ActionKey({ a, onDone, className }: { a: PeekAction; onDone: () => void; className: string }) {
  const body = (
    <>
      <span>{a.label}</span>
      {a.icon && <Icon icon={a.icon} size={16} />}
    </>
  );
  const pick = () => {
    haptic('press');
    a.onSelect?.();
    onDone();
  };
  return a.href ? (
    <Link href={a.href} className={className} role="menuitem" onClick={pick}>
      {body}
    </Link>
  ) : (
    <button type="button" className={className} role="menuitem" onClick={pick}>
      {body}
    </button>
  );
}

function HoverCard({
  id,
  label,
  rect,
  actions,
  onEnter,
  onLeave,
  onClose,
  children,
}: {
  id: string;
  label: string;
  rect: DOMRect;
  actions: PeekAction[];
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const h = card.current?.offsetHeight ?? 200;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - CARD_W - 8));
    const below = rect.bottom + 8;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, rect.top - 8 - h) : below;
    setPos({ left, top });
  }, [rect]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <m.div
      ref={card}
      id={id}
      data-ui="clubhouse"
      data-ch-code="CH-1831"
      className="ch-hovercard"
      role="dialog"
      aria-label={label}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: CARD_W }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={chTween('quick')}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      {children}
      {actions.length > 0 && (
        <div className="ch-hovercard__acts" role="menu" aria-label={`${label} actions`}>
          {actions.map((a) => (
            <ActionKey key={a.label} a={a} onDone={onClose} className="ch-hovercard__act" />
          ))}
        </div>
      )}
    </m.div>,
    // Inside the Clubhouse root when there is one, so the card has its fonts; fixed, so it never clips.
    document.querySelector('.ch-root') ?? document.body,
  );
}

function PressPeek({
  open,
  rect,
  label,
  actions,
  onClose,
  children,
}: {
  open: boolean;
  rect: DOMRect | null;
  label: string;
  actions: PeekAction[];
  onClose: () => void;
  children: ReactNode;
}) {
  const { ref, reduced, retainContent } = useDialogLifetime(open, {
    direction: 'center',
    surfaceSelector: '.ch-peek__panel',
    focusSelector: '.ch-peek__panel',
  });
  const panel = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  // The peek opens under a finger that is still down: the lift (and the click it makes) belongs to the hold, so neither
  // the backdrop nor an action under the finger answers until that finger has come up.
  const settled = useRef(false);
  useEffect(() => {
    if (!open) return;
    settled.current = false;
    let tick = 0;
    const settle = () => {
      tick = window.setTimeout(() => {
        settled.current = true;
      }, 0);
    };
    window.addEventListener('pointerup', settle, { capture: true, once: true });
    window.addEventListener('pointercancel', settle, { capture: true, once: true });
    return () => {
      window.clearTimeout(tick);
      window.removeEventListener('pointerup', settle, { capture: true });
      window.removeEventListener('pointercancel', settle, { capture: true });
    };
  }, [open]);
  // The card opens where the held row was, kept on screen: under the row when there is room, else lifted to fit.
  useLayoutEffect(() => {
    if (!open || !rect) return;
    const h = panel.current?.offsetHeight ?? 320;
    const margin = 16;
    const safeTop = margin + 44;
    setTop(Math.max(safeTop, Math.min(rect.top, window.innerHeight - h - margin - 24)));
  }, [open, rect]);
  return (
    // The click is only the backdrop dismiss; Esc arrives through onCancel.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className="ch-peek"
      aria-label={label}
      data-ch-code="CH-1830"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && settled.current) onClose();
      }}
      onClickCapture={(e) => {
        if (settled.current) return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {retainContent(
        open && (
          <m.div
            ref={panel}
            className="ch-peek__panel"
            tabIndex={-1}
            style={{ top: top ?? undefined }}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={chSpring('smooth', reduced)}
          >
            <div className="ch-peek__card">{children}</div>
            {actions.length > 0 && (
              <div className="ch-peek__menu" role="menu" aria-label={`${label} actions`}>
                {actions.map((a) => (
                  <ActionKey key={a.label} a={a} onDone={onClose} className="ch-peek__act" />
                ))}
              </div>
            )}
          </m.div>
        ),
      )}
    </dialog>
  );
}
