'use client';

import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, m, useIsPresent } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogLifetime } from '../lib/dialog-lifetime';
import { chSafeAreaInsets } from '../lib/safe-area';
import { CH_PHONE_QUERY } from '../lib/phone-query';
import { haptic } from '../lib/haptics';
import { chSpring } from '../lib/motion';
import { chMenuMotion } from '../lib/menu-motion';
import { useChReducedMotion } from '../lib/reduced-motion';
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

/**
 * The phone layout peeks only by a hold, as iOS's context menu does (E-4, audit 2026-11-19): the desk's hover card,
 * anchored beside its row, covered a qualifier leaderboard's To par and Thru columns when a pointer rested on a name at
 * phone width. A real iPhone never sends a mouse; this keeps a narrow window and a pointer emulated on a phone the same.
 */
function phoneLayout(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(CH_PHONE_QUERY).matches;
}

/** GES-1: a touch that moves this far is a scroll (before a hold) or a drag (after a lift). */
const SLOP_PX = 10;
const HOVER_GRACE_MS = 160;
const CARD_W = 328;

/**
 * The hover card's width. A fitted card (a table's name cell) is the anchor's width up to the usual 328px and never
 * wider: a floor above the anchor's own width would push the excess over the figures in the next column, which is what
 * fitting is for. A narrow cell wraps the card's content and its keys instead.
 */
export function hoverCardWidth(fit: boolean, anchorWidth: number): number {
  return fit ? Math.min(CARD_W, Math.max(0, Math.floor(anchorWidth))) : CARD_W;
}

/** `up`: the press peek opened as the finger came up (a lift let go), so no lift is still to come. */
type Mode = { kind: 'press' | 'hover'; rect: DOMRect; up?: boolean } | null;

/**
 * P-4 4.7.1: a target that can be picked up. The hold ticks once (`select`, the peek's own), then `lift` decides: true and
 * the target is in hand, false and the peek opens as before. From the lift, a 10px move is a drag (`drag`; the peek
 * never opens and the tap is swallowed), and a release without moving settles it back and opens the peek.
 */
export interface PeekLift {
  /** At the hold: lift the target. Return false to fall back to the plain peek. */
  lift: (at: { x: number; y: number; pointerId: number }, rect: DOMRect) => boolean;
  /** The finger moved 10px after the lift: the drag owns the gesture from here; the peek never opens. */
  drag: (at: { x: number; y: number }) => void;
  /** The finger came up without moving: the target settles and the peek opens. */
  settle: () => void;
  /** The hold gave up before it lifted (a move past the slop, a scroll, a cancel). */
  cancel?: () => void;
}

export function PeekTarget({
  label,
  card,
  actions = [],
  disabled = false,
  within,
  lift,
  children,
}: {
  /** Names the card for VoiceOver ("Theo Marchetti"). */
  label: string;
  /**
   * A selector for the closest ancestor the hover card stays under (for a table's name cell: '[role="cell"]'). The
   * card then opens below that box, no wider than it (a narrow cell wraps the card instead), so it can't cover the figures beside it.
   */
  within?: string;
  /** Drawn only while open. */
  card: () => ReactNode;
  actions?: PeekAction[];
  disabled?: boolean;
  /** P-4: the hold picks the target up instead of opening the peek (a coach's movable event). */
  lift?: PeekLift;
  children: ReactNode;
}) {
  const wrap = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<Mode>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  /** From a lift to the end of its touch: `held` until a 10px move makes it `drag`. */
  const lifted = useRef<{ x: number; y: number; phase: 'held' | 'drag' } | null>(null);
  const liftRef = useRef(lift);
  liftRef.current = lift;
  const cardId = useId();
  const shown = actions.filter((a) => a.href || a.onSelect);

  const unscroll = useRef<(() => void) | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    unscroll.current?.();
    unscroll.current = null;
  };
  /** The hold gave up before lifting: the target's owner hears of it. */
  const giveUp = () => {
    const was = !!timer.current;
    clear();
    if (was) liftRef.current?.cancel?.();
  };
  const anchorEl = useCallback((): HTMLElement | null => {
    const el = (wrap.current?.firstElementChild as HTMLElement | null) ?? null;
    return el && within ? (el.closest(within) as HTMLElement | null) ?? el : el;
  }, [within]);
  const anchor = useCallback((): DOMRect | null => anchorEl()?.getBoundingClientRect() ?? null, [anchorEl]);
  const open = useCallback(
    (kind: 'press' | 'hover', up = false) => {
      const el = (wrap.current?.firstElementChild as HTMLElement | null) ?? null;
      if (!el) return;
      // The press sheet keeps the target's own box; only the hover card follows `within`.
      const box = kind === 'hover' ? anchorEl() ?? el : el;
      setMode({ kind, rect: box.getBoundingClientRect(), up });
    },
    [anchorEl],
  );
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
  }, [openedAt, close, anchor]);

  const handlers = disabled
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent) => {
          // A hold's lift may have ended on the peek, not here: its swallow never fired, and must not eat this tap.
          swallowClick.current = false;
          lifted.current = null;
          if (e.pointerType !== 'touch' || !e.isPrimary) return;
          start.current = { x: e.clientX, y: e.clientY };
          const pointerId = e.pointerId;
          clear();
          timer.current = setTimeout(() => {
            timer.current = null;
            unscroll.current?.();
            unscroll.current = null;
            swallowClick.current = true;
            haptic('select');
            const el = (wrap.current?.firstElementChild as HTMLElement | null) ?? null;
            const s = start.current;
            const l = liftRef.current;
            if (l && el && s && l.lift({ x: s.x, y: s.y, pointerId }, el.getBoundingClientRect())) {
              lifted.current = { x: s.x, y: s.y, phase: 'held' };
              return;
            }
            open('press');
          }, PEEK_HOLD_MS);
          // GES-23: a scroll before the lift is the page's (scroll wins). Removed at the lift: the drag scrolls itself.
          const onScroll = () => giveUp();
          window.addEventListener('scroll', onScroll, true);
          unscroll.current = () => window.removeEventListener('scroll', onScroll, true);
        },
        onPointerMove: (e: React.PointerEvent) => {
          const l = lifted.current;
          if (l) {
            if (l.phase === 'held' && Math.hypot(e.clientX - l.x, e.clientY - l.y) >= SLOP_PX) {
              l.phase = 'drag';
              liftRef.current?.drag({ x: e.clientX, y: e.clientY });
            }
            return;
          }
          const s = start.current;
          if (!s || !timer.current) return;
          if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP_PX) giveUp();
        },
        onPointerUp: () => {
          const l = lifted.current;
          lifted.current = null;
          if (l?.phase === 'held') {
            liftRef.current?.settle();
            open('press', true);
            return;
          }
          giveUp();
        },
        // A cancel after the lift is the drag owner's to read; it neither settles nor opens the peek.
        onPointerCancel: () => {
          lifted.current = null;
          giveUp();
        },
        onPointerEnter: (e: React.PointerEvent) => {
          if (e.pointerType !== 'mouse' || phoneLayout()) return;
          holdHover();
          if (mode) return;
          clear();
          timer.current = setTimeout(() => open('hover'), PEEK_HOVER_MS);
        },
        onPointerLeave: (e: React.PointerEvent) => {
          if (e.pointerType === 'mouse') leaveHover();
        },
        onFocus: (e: React.FocusEvent) => {
          const target = e.target as HTMLElement;
          if (!target.matches?.(':focus-visible')) return;
          if (target.closest?.('[data-ch-peek-quiet]') || phoneLayout()) return;
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
      {/* It leaves on a fade rather than vanishing (OVL-10). */}
      <AnimatePresence>
        {mode?.kind === 'hover' && (
          <HoverCard key="hover" id={cardId} label={label} rect={mode.rect} fit={!!within} actions={shown} onEnter={holdHover} onLeave={leaveHover} onClose={close}>
            {card()}
          </HoverCard>
        )}
      </AnimatePresence>
      <PressPeek open={mode?.kind === 'press'} up={!!mode?.up} rect={mode?.rect ?? null} label={label} actions={shown} onClose={close}>
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

/** The open dialog on top, if any: the last one opened is last in the top layer. */
function topOpenDialog(): HTMLDialogElement | null {
  const open = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  return open[open.length - 1] ?? null;
}

function HoverCard({
  id,
  label,
  rect,
  fit,
  actions,
  onEnter,
  onLeave,
  onClose,
  children,
}: {
  id: string;
  label: string;
  rect: DOMRect;
  /** The card is held to the anchor's width instead of its usual 328px. */
  fit: boolean;
  actions: PeekAction[];
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const reduced = useChReducedMotion();
  // On its way out it takes no pointer or focus: a pass over the leaving card never holds it open again.
  const present = useIsPresent();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const w = hoverCardWidth(fit, rect.width);
  useLayoutEffect(() => {
    const h = card.current?.offsetHeight ?? 200;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    const below = rect.bottom + 8;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, rect.top - 8 - h) : below;
    setPos({ left, top });
  }, [rect, w]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <m.div
      ref={card}
      id={id}
      data-ui="clubhouse"
      data-ch-code="CH-1831"
      className={fit ? 'ch-hovercard ch-hovercard--fit' : 'ch-hovercard'}
      role="dialog"
      aria-label={label}
      inert={!present || undefined}
      // As a menu (S3.5, motion spec 15 Nov 3.4): 180 in from .96 at the corner nearest its anchor, 110 out.
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: w, transformOrigin: pos && pos.top < rect.top ? 'bottom left' : 'top left' }}
      {...chMenuMotion(reduced)}
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
    // Inside an open dialog when the card's anchor is in one, or it would draw under the top layer and its keys sit in what
    // the dialog has made inert (OVL-10); else inside the Clubhouse root, so the card has its fonts. Fixed, so it never clips.
    topOpenDialog() ?? document.querySelector('.ch-root') ?? document.body,
  );
}

function PressPeek({
  open,
  up = false,
  rect,
  label,
  actions,
  onClose,
  children,
}: {
  open: boolean;
  /** It opened as the finger came up (P-4: a lift let go): there is no lift still to come, its keys answer at once. */
  up?: boolean;
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
    settled.current = up;
    if (up) return;
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
  }, [open, up]);
  // The card opens where the held row was, kept on screen: under the row when there is room, else lifted to fit.
  useLayoutEffect(() => {
    if (!open || !rect) return;
    const h = panel.current?.offsetHeight ?? 320;
    const margin = 16;
    // Under the notch or the status bar, by the real inset (OVL-09), not a fixed 60px.
    const safeTop = chSafeAreaInsets().top + 8;
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
            // A transform string, not framer's scale, so the pop runs on the compositor with its opacity (motion audit 2026-10-12).
            initial={reduced ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.94)' }}
            animate={{ opacity: 1, transform: 'scale(1)' }}
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
