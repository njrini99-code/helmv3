'use client';

import { AnimatePresence, m } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { haptic } from '../lib/haptics';
import { CH_POP, chTween } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';

export type MenuItem =
  | { kind?: 'item'; label: string; icon?: LucideIcon; onSelect?: () => void; href?: string; danger?: boolean; checked?: boolean }
  | { kind: 'separator' };

const W = 232;

/**
 * Popover menu: fixed-positioned in a portal so it never clips inside a
 * scrolling canvas, flips up near the bottom edge, and closes on pick, Esc,
 * outside click or scroll. Full keyboard: arrows, Home/End, Enter, Esc
 * (focus returns to the trigger).
 */
export function Menu({
  trigger,
  items,
  align = 'end',
  label,
}: {
  trigger: (props: { ref: (el: HTMLButtonElement | null) => void; onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu'; 'aria-controls': string }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  label: string;
}) {
  const id = useId();
  const reduced = useChReducedMotion();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const keyboard = document.body.classList.contains('keyboard-open')
        ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')) || 0 : 0;
      const viewport = window.visualViewport;
      const bottom = Math.min(window.innerHeight - keyboard, viewport ? viewport.offsetTop + viewport.height : window.innerHeight);
      const h = list.current?.scrollHeight || list.current?.offsetHeight || 200;
      let left = align === 'end' ? r.right - W : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - W - 8));
      const above = Math.max(0, Math.min(r.top, bottom - 8) - 14);
      const below = Math.max(0, bottom - Math.max(8, r.bottom) - 14);
      const up = h > below && above > below;
      const maxHeight = up ? above : below;
      const top = Math.max(8, Math.min(up ? r.top - Math.min(h, maxHeight) - 6 : r.bottom + 6, bottom - 8 - Math.min(h, maxHeight)));
      setPos({ left, top, maxHeight });
    };
    place();
    const onScroll = (e: Event) => {
      // Native fields may horizontally scroll their text on blur without moving the anchor.
      if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select')) return;
      if (list.current && e.target instanceof Node && list.current.contains(e.target)) return;
      // A scroll that closes the list while focus is in it would drop focus to <body>: hand it back to the trigger.
      if (list.current?.contains(document.activeElement)) btn.current?.focus({ preventScroll: true });
      close(false);
    };
    const keyboardChanges = new MutationObserver(place);
    keyboardChanges.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    keyboardChanges.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    window.visualViewport?.addEventListener('resize', place);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      keyboardChanges.disconnect();
      window.visualViewport?.removeEventListener('resize', place);
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open, align, close]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    const frame = requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[role="menuitem"],[role="menuitemradio"]')?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close]);

  const onKey = (e: React.KeyboardEvent) =>
    menuKeyDown(e, list.current, {
      onEscape: () => close(),
      // The list is portaled to the end of the page, so Tab from it fell to <body> as it closed (audit A-27): put focus
      // back on the trigger first, and the key's own move carries on from there in the page's order.
      onTab: () => {
        btn.current?.focus({ preventScroll: true });
        close(false);
      },
    });

  return (
    <>
      {trigger({
        ref: (el) => {
          btn.current = el;
        },
        onClick: () => setOpen((o) => !o),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        'aria-controls': id,
      })}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && (
              <m.div
                ref={list}
                id={id}
                role="menu"
                aria-label={label}
                className="ch-menu ch-popover"
                data-ui="clubhouse"
                style={{ left: pos?.left ?? -9999, top: pos?.top, maxHeight: pos?.maxHeight, width: W }}
                initial={reduced ? { opacity: 0 } : CH_POP.initial}
                animate={reduced ? { opacity: 1 } : CH_POP.animate}
                exit={reduced ? { opacity: 0 } : CH_POP.exit}
                transition={chTween('quick', reduced)}
                onKeyDown={onKey}
              >
                <MenuItems items={items} onClose={close} />
              </m.div>
            )}
          </AnimatePresence>,
          btn.current?.closest('dialog[open]') ?? document.querySelector('.ch-root') ?? document.body,
        )}
    </>
  );
}

/** The keys a menu list answers to: arrows, Home and End move between rows, Escape and Tab hand back to the opener. */
export function menuKeyDown(e: React.KeyboardEvent, list: HTMLElement | null, on: { onEscape: () => void; onTab: () => void }): void {
  const els = Array.from(list?.querySelectorAll<HTMLElement>('[role="menuitem"],[role="menuitemradio"]') ?? []);
  const i = els.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'Escape') {
    e.preventDefault();
    on.onEscape();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    els[(i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length]?.focus();
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    els[e.key === 'Home' ? 0 : els.length - 1]?.focus();
  } else if (e.key === 'Tab') {
    on.onTab();
  }
}

/**
 * The rows of a menu, shared by the button's Menu and the right-click ContextMenu so they cannot drift: a link closes the
 * list without taking focus (the page is changing), a button closes it, gives focus back and runs its action.
 */
export function MenuItems({ items, onClose }: { items: MenuItem[]; onClose: (focus?: boolean) => void }) {
  const first = items.findIndex((item) => item.kind !== 'separator');
  return (
    <>
      {items.map((it, i) => {
        if (it.kind === 'separator') return <div key={`s${i}`} className="ch-menu__sep" role="separator" />;
        const content = (
          <>
            {it.icon && <Icon icon={it.icon} size={15} />}
            <span>{it.label}</span>
          </>
        );
        const cls = 'ch-menu__item' + (it.danger ? ' is-danger' : '');
        const role = it.checked !== undefined ? 'menuitemradio' : 'menuitem';
        if (it.href) {
          return (
            <Link key={it.label} href={it.href} role={role} aria-checked={it.checked} className={cls} tabIndex={i === first ? 0 : -1} onClick={() => {
              // A link item can also note something as it opens (the rounds library notes the round, so the review's Back is a step back).
              it.onSelect?.();
              onClose(false);
            }}>
              {content}
            </Link>
          );
        }
        return (
          <button
            key={it.label}
            type="button"
            role={role}
            aria-checked={it.checked}
            className={cls}
            tabIndex={i === first ? 0 : -1}
            onClick={() => {
              haptic('select');
              onClose();
              it.onSelect?.();
            }}
          >
            {content}
          </button>
        );
      })}
    </>
  );
}
