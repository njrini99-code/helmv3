'use client';

import { CH_FADE_MS, chSpringCurve } from '../../../lib/motion';
import type { ChMessagesApi } from '../api/types';
import type { ChReaction } from '../model';
import { useState, useRef, useLayoutEffect, useEffect, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { REACTIONS, REACTION_ICON } from './reactions';
import { personOf } from '../person-of';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';
import { createPortal } from 'react-dom';
import { Avatar } from '../../../ui/Avatar';

/* Thread */

/**
 * A reaction on a message (owner, 2026-10-08): the chip is the opposite colour of the bubble it sits under (ivory under
 * a green one, green under an ivory one), and a click opens who reacted, with a row to add or take back your own.
 */
/** M-MSG-13: 0.4 to 1 on `pop`, from the corner the CSS sets; a fade under Reduce Motion. Once per badge. */
function popBadge(el: HTMLElement | null) {
  if (!el || el.dataset.chPopped) return;
  el.dataset.chPopped = "1";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS, easing: "linear" });
    return;
  }
  const c = chSpringCurve("pop");
  el.animate([{ transform: "scale(.4)" }, { transform: "scale(1)" }], { duration: c.ms, easing: c.linear });
}

export function ReactionChip({ api, messageId, r, arriving = false }: { api: ChMessagesApi; messageId: string; r: ChReaction; /** Redesign: a badge added after the bubble drew pops from its corner (M-MSG-13). */ arriving?: boolean }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const label = REACTIONS.find((x) => x.key === r.key)?.key ?? r.key;
  const people = (r.userIds ?? []).map((id) => ({ id, name: id === api.viewer.userId ? "You" : personOf(api, id)?.name ?? "Member" }));
  people.sort((a, b) => (a.id === api.viewer.userId ? -1 : b.id === api.viewer.userId ? 1 : a.name.localeCompare(b.name)));

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const b = btn.current!.getBoundingClientRect();
      const h = card.current?.offsetHeight ?? 160;
      const w = 248;
      const left = Math.max(8, Math.min(b.left, window.innerWidth - w - 8));
      const above = b.top - h - 8;
      setPos({ left, top: above >= 8 ? above : Math.min(b.bottom + 8, window.innerHeight - h - 8) });
    };
    place();
    const close = (e: Event) => {
      if (card.current && e.target instanceof Node && card.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("resize", place);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", close, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!card.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <>
      <button
        ref={(el) => {
          btn.current = el;
          if (arriving) popBadge(el);
        }}
        type="button"
        className={"ch-ms-react ch-num" + (r.mine ? " is-mine" : "")}
        aria-label={`${label}, ${r.count}${r.mine ? ", including you" : ""}. Show who reacted`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          haptic("select");
          setOpen((o) => !o);
        }}
      >
        <Icon icon={REACTION_ICON[r.key]} size={12} />
        {r.count > 1 ? r.count : null}
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          open ? (
            <div
              ref={card}
              role="dialog"
              aria-label={`${label}, ${r.count} ${r.count === 1 ? "person" : "people"}`}
              className="ch-rx"
              data-ui="clubhouse"
              style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
            >
              <header className="ch-rx__head">
                <span className="ch-rx__glyph" aria-hidden="true">
                  <Icon icon={REACTION_ICON[r.key]} size={15} />
                </span>
                <b>{label}</b>
                <span className="ch-rx__n ch-num">{r.count}</span>
              </header>
              <div className="ch-rx__list">
                {people.map((p) => (
                  <div key={p.id} className="ch-rx__row">
                    <Avatar name={p.name === "You" ? api.viewer.name : p.name} size="sm" />
                    <span>{p.name}</span>
                  </div>
                ))}
                {people.length === 0 && <p className="ch-rx__none">{r.count} {r.count === 1 ? "person" : "people"}</p>}
              </div>
              <button
                type="button"
                className="ch-rx__act"
                onClick={() => {
                  haptic("select");
                  api.react(messageId, r.key, !r.mine);
                  setOpen(false);
                }}
              >
                {r.mine ? "Take back your reaction" : `React with ${label}`}
              </button>
            </div>
          ) : null,
          document.querySelector(".ch-root") ?? document.body,
        )}
    </>
  );
}

/**
 * Long press (the phone's stand-in for desktop's hover tools): 450ms without
 * moving opens the message's actions, with a press tick (CH-7704). A right
 * click or the context-menu key does the same.
 */
export function useLongPress(onFire: (() => void) | undefined, onSwipe?: (direction: "left" | "right") => void) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []); // Cancel a pending press when the thread closes.
  if (!onFire) return {};
  return {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      clear();
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        clear();
        haptic("press");
        onFire();
      }, 450);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > 10) {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = null;
        // Vertical movement belongs to the native scroll view.
        if (Math.abs(e.clientY - o.y) > 24) {
          origin.current = null;
          (e.currentTarget as HTMLElement).style.transform = '';
        } else if (o.x >= 24 && onSwipe && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          // The bubble follows the finger up to the distance that replies, so the swipe shows it's working.
          const dx = e.clientX - o.x;
          (e.currentTarget as HTMLElement).style.transform = `translateX(${Math.max(-64, Math.min(64, dx))}px)`;
        }
      }
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const o = origin.current;
      const el = e.currentTarget as HTMLElement;
      if (el.style.transform) {
        el.style.transition = 'transform var(--ch-dur-quick) var(--ch-ease)';
        el.style.transform = '';
        window.setTimeout(() => {
          el.style.transition = '';
        }, 200);
      }
      if (o && o.x >= 24 && onSwipe && Math.abs(e.clientX - o.x) >= 60 && Math.abs(e.clientY - o.y) <= 24) {
        haptic("select");
        onSwipe(e.clientX > o.x ? "right" : "left");
      }
      clear();
    },
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: (e: ReactMouseEvent) => {
      e.preventDefault();
      clear();
      onFire();
    },
  };
}
