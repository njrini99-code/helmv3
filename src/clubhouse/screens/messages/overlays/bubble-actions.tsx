'use client';

import { chTween } from '../../../lib/motion';
import { msAnimate } from '../motion/messages-motion';
import type { ChMessagesApi } from '../api/types';
import type { ChMsg, ChReaction } from '../model';
import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { REACTIONS, REACTION_ICON } from './reactions';
import { personOf } from '../person-of';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';
import { createPortal } from 'react-dom';
import { Avatar } from '../../../ui/Avatar';
import { useToast } from '../../../ui/Toast';
import { pollCardActions } from '../polls';
import { HoldSeenRow, useSeenBy } from '../seen-by';
import type { MenuItem } from '../../../ui/Menu';
import { BellRing, CheckCheck, Copy, ListChecks, Lock, Pencil, Reply, Share, Trash2 } from 'lucide-react';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { AnimatePresence, m as M } from 'motion/react';
import { Tooltip } from '../../../ui/Tooltip';
import { HoldLift } from '../hold-lift';
import { HoldReactKeys } from './HoldKeys';
import '../../../styles/messages-overlays.css';

/* Thread */

/**
 * A reaction on a message (owner, 2026-10-08): the chip is the opposite colour of the bubble it sits under (ivory under
 * a green one, green under an ivory one), and a click opens who reacted, with a row to add or take back your own.
 */
/** MOT-RX-1: scale 0.4 to 1 on `pop` from the corner the CSS sets, once per badge. Reduce Motion: it appears (no fade). */
export function popBadge(el: HTMLElement | null, reduced = false) {
  if (!el || el.dataset.chPopped) return;
  el.dataset.chPopped = "1";
  msAnimate(el, [{ transform: "scale(.4)" }, { transform: "scale(1)" }], "pop", { reduced });
}

export function ReactionChip({ api, messageId, r, arriving = false }: { api: ChMessagesApi; messageId: string; r: ChReaction; /** Redesign: a badge added after the bubble drew pops from its corner (M-MSG-13). */ arriving?: boolean }) {
  const reduced = useChReducedMotion();
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
          // A badge that was there when its row first drew never pops: without this mark, the first re-render of the row (a send, a
          // receipt) popped every badge already on the screen.
          if (el && !arriving) el.dataset.chPopped = "1";
          else if (arriving) popBadge(el, reduced);
        }}
        type="button"
        className={"ch-ms-react ch-num" + (r.mine ? " is-mine" : "")}
        title={people.length ? `${label}: ${people.map((p) => p.name).join(", ")}` : label}
        aria-label={`${label}, ${r.count}${r.mine ? ", including you" : ""}. Show who reacted`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          haptic("select");
          setOpen((o) => !o);
        }}
      >
        <Icon icon={REACTION_ICON[r.key]} size={14} />
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
export const HOLD_MS = 450;
/** MOT-HOLD-1: a finger that moves more than this many px before the hold lets the bubble go (the press returns in 280 ms). */
export const HOLD_SLOP_PX = 8;

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
      // MSG-401: the hold is a phone gesture. A mouse on the desktop layout right-clicks, or uses Enter, Space and the hover bar.
      if (e.pointerType === "mouse" && !onSwipe) return;
      clear();
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        clear();
        haptic("press");
        onFire();
      }, HOLD_MS);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > HOLD_SLOP_PX) {
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

export interface BubbleActionArgs {
  api: ChMessagesApi;
  m: ChMsg;
  group: boolean;
  picking: boolean;
  setPicking: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Phone: the message's actions open in a sheet on a long press, in place of the hover tools. */
  onActions?: () => void;
  onReply?: () => void;
  /** P-1: open the Seen by list for this message (coaches), anchored to the element that asked. */
  onSeenBy?: (m: ChMsg, anchor: HTMLElement | null) => void;
}

/**
 * Everything a message does when it is held, right-clicked, hovered or double-tapped (package C's half of the old
 * Bubble): the lift, the long press, the menu rows, the reaction bar's keyboard, double-tap Like. Its hooks run in the
 * order they always did; Bubble calls it once, unconditionally, before its deleted early return.
 */
export function useBubbleActions({ api, m, group, picking, setPicking, onEdit, onDelete, onActions, onReply, onSeenBy }: BubbleActionArgs) {
  // Redesign, desktop: right click and More open the same lift the phone's hold does (MSG-HOLD, MSG-THREAD-13).
  const [lifted, setLifted] = useState(false);
  const [liftClose, setLiftClose] = useState(0);
  const liftAfter = useRef<(() => void) | null>(null);
  const liftPick = (then: () => void) => {
    liftAfter.current = then;
    setLiftClose((n) => n + 1);
  };
  const drawn = useRef(false);
  useEffect(() => {
    drawn.current = true;
  }, []);
  const [showTime, setShowTime] = useState(false);
  // The desk layout on a finger (a landscape iPhone, an iPad) has no sheet and no hover: a long press holds the bar open.
  const [barHeld, setBarHeld] = useState(false);
  const rowRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!barHeld) return;
    const away = (e: PointerEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setBarHeld(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [barHeld]);
  const longPress = useLongPress(m.failed ? undefined : (onActions ?? (() => setBarHeld(true))), onActions ? (direction) => {
    if (direction === "right") onReply?.();
    else setShowTime(true);
  } : undefined);
  // MSG-008, MSG-401: the bubble is a tab stop. Enter or Space (or the menu key) on it opens the same lift a hold or a right click
  // does; focus comes back to it when the lift closes. Only when the key is the bubble's own, never a link or a button inside it.
  const press = m.failed || m.deleted
    ? longPress
    : {
        ...longPress,
        tabIndex: 0,
        role: "group" as const,
        "aria-haspopup": "dialog" as const,
        "data-ch-msg-focus": "",
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " " || e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
            e.preventDefault();
            if (onActions) onActions();
            else {
              refreshMenu();
              setLifted(true);
            }
          }
        },
      };
  // Desktop (no actions sheet): a right click opens the reaction bar, as the React button does (the board's gesture).
  const rightClick =
    !onActions && !m.failed
      ? {
          onContextMenu: (e: ReactMouseEvent) => {
            e.preventDefault();
            setLifted(true);
          },
        }
      : {};
  // D26 (changelog: one menu for every message): own messages keep Edit and Delete; a poll offers See votes, Remind,
  // Close poll and Share result by role and state, then Reply, Copy poll and Delete; anyone else's text, Reply and Copy.
  const toast = useToast();
  const [, refreshMenu] = useReducer((n: number) => n + 1, 0);
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(m.text);
      haptic("success");
      toast({ title: "Copied" });
    } catch {
      haptic("error");
      toast({ tone: "error", title: "Couldn’t copy the message", body: "Try again in a moment.", code: "CH-7020" });
    }
  };
  const pollActs = m.poll ? pollCardActions(m.id) : null;
  // P-1 slice 6: "Seen by" for a coach on any message in a group (theirs or anyone's).
  const actionsBtn = useRef<HTMLButtonElement | null>(null);
  const seenInfo = useSeenBy(api, m);
  const seenItem: MenuItem[] = group && onSeenBy && seenInfo?.canOpen ? [{ label: "Seen by", icon: CheckCheck, onSelect: () => onSeenBy(m, actionsBtn.current) }] : [];
  const menuItems: MenuItem[] = m.poll
    ? [
        ...(pollActs?.seeVotes ? [{ label: "See votes", icon: ListChecks, onSelect: pollActs.seeVotes }] : []),
        ...(pollActs?.remind ? [{ label: `Remind ${pollActs.remind.count}`, icon: BellRing, onSelect: pollActs.remind.run }] : []),
        ...(pollActs?.close ? [{ label: "Close poll", icon: Lock, onSelect: pollActs.close }] : []),
        ...(pollActs?.share ? [{ label: "Share result", icon: Share, onSelect: pollActs.share }] : []),
        ...seenItem,
        ...(onReply ? [{ label: "Reply", icon: Reply, onSelect: onReply }] : []),
        { label: "Copy poll", icon: Copy, onSelect: () => void copyText() },
        ...(m.mine ? [{ label: "Delete", icon: Trash2, danger: true, onSelect: onDelete }] : []),
      ]
    : m.mine
      ? [
          ...(onReply ? [{ label: "Reply", icon: Reply, onSelect: onReply }] : []),
          ...(m.text ? [{ label: "Copy", icon: Copy, onSelect: () => void copyText() }] : []),
          // An attachment-only message has no text to edit (as the phone's sheet: wave 5 #8).
          ...(m.text ? [{ label: "Edit", icon: Pencil, onSelect: onEdit }] : []),
          ...seenItem,
          { label: "Delete", icon: Trash2, danger: true, onSelect: onDelete },
        ]
      : m.text
        ? [...seenItem, ...(onReply ? [{ label: "Reply", icon: Reply, onSelect: onReply }] : []), { label: "Copy", icon: Copy, onSelect: () => void copyText() }]
        : // Someone else's photo or file: nothing to copy, but it can be replied to, as your own can.
          [...seenItem, ...(onReply ? [{ label: "Reply", icon: Reply, onSelect: onReply }] : [])];
  const reacts = api.reactions.get(m.id) ?? [];
  // Redesign: two taps within 300ms toggle Like, once (MSG-HOLD-06).
  const lastTap = useRef(0);
  const toggleLikeOnDouble = (e: { target: EventTarget | null }) => {
    // A double tap on a link, a poll or a photo is about that thing, not a like.
    if (e.target instanceof Element && e.target.closest('a,button,input,label,[role="button"],.ch-ms-poll,.ch-ms-quote,img')) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      haptic("select");
      api.react(m.id, "Like", !reacts.some((r) => r.key === "Like" && r.mine));
    } else lastTap.current = now;
  };
  const reduced = useChReducedMotion();
  const reactBtn = useRef<HTMLButtonElement | null>(null);
  const bar = useRef<HTMLDivElement | null>(null);
  // CH-7603: the bar takes focus as it opens, so the keyboard lands on its first reaction (audit A-26).
  useEffect(() => {
    if (picking) bar.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [picking]);
  const closeBar = (refocus: boolean) => {
    setPicking(false);
    if (refocus) reactBtn.current?.focus({ preventScroll: true });
  };
  const onBarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(bar.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      closeBar(true);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      items[(i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // As the shared Menu does (A-27): focus goes back to React first, so Tab or Shift+Tab carries on from there in
      // the thread's order (Shift+Tab landed on the filter at the top of the page).
      closeBar(true);
    }
  };
  const holdRows = menuItems.flatMap((item) => (item.kind === "separator" || (group && m.mine && item.label === "Seen by") ? [] : [item]));
  return {
    lifted,
    setLifted,
    liftClose,
    liftAfter,
    liftPick,
    drawn,
    showTime,
    barHeld,
    rowRef,
    press,
    rightClick,
    refreshMenu,
    actionsBtn,
    reacts,
    toggleLikeOnDouble,
    reduced,
    bar,
    onBarKey,
    closeBar,
    holdRows,
  };
}

export type BubbleActions = ReturnType<typeof useBubbleActions>;

/** The reaction bar a desktop bubble pops from its edge (CH-7603). */
export function BubbleReactBar({ api, m, picking, act }: { api: ChMessagesApi; m: ChMsg; picking: boolean; act: BubbleActions }) {
  const { bar, onBarKey, closeBar, reduced, reacts } = act;
  return (
    <AnimatePresence>
      {picking && (
        <M.div
          ref={bar}
          className="ch-ms-reactbar"
          role="menu"
          aria-label="Reactions"
          aria-orientation="horizontal"
          onKeyDown={onBarKey}
          /* CH-7603: it pops from the bubble, rising from its edge (quick; a fade alone when motion is reduced). */
          style={{ transformOrigin: m.mine ? "bottom right" : "bottom left" }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(4px) scale(0.96)" }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, transform: "translateY(0px) scale(1)" }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, transform: "translateY(2px) scale(0.98)" }}
          transition={chTween("quick", reduced)}
        >
          {REACTIONS.map((r, i) => {
            const on = reacts.some((x) => x.key === r.key && x.mine);
            return (
              <Tooltip key={r.key}>
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={i === 0 ? 0 : -1}
                  className={"ch-ms-reactbar__b" + (on ? " is-on" : "")}
                  aria-label={`${on ? "Remove" : "React"} ${r.key.toLowerCase()}`}
                  onClick={() => {
                    haptic("select");
                    api.react(m.id, r.key, !on);
                    // Focus goes back to React, not to <body> as the bar leaves.
                    closeBar(true);
                  }}
                >
                  <Icon icon={r.icon} size={16} />
                </button>
              </Tooltip>
            );
          })}
        </M.div>
      )}
    </AnimatePresence>
  );
}

/** The reaction badges under a bubble. */
export function BubbleReactions({ api, m, act }: { api: ChMessagesApi; m: ChMsg; act: BubbleActions }) {
  const { reacts, drawn } = act;
  return (
    <>
      {reacts.length > 0 && (
        <div className={"ch-ms-reacts" + (m.mine ? " on-mine" : " on-theirs")}>
          {reacts.map((r) => (
            <ReactionChip key={r.key} api={api} messageId={m.id} r={r} arriving={drawn.current} />
          ))}
        </div>
      )}
    </>
  );
}

/** The held bubble's lift: reaction bar, menu rows, Seen by. */
export function BubbleHoldLift({
  api,
  m,
  group,
  onSeenBy,
  act,
}: {
  api: ChMessagesApi;
  m: ChMsg;
  group: boolean;
  onSeenBy?: (m: ChMsg, anchor: HTMLElement | null) => void;
  act: BubbleActions;
}) {
  const { liftClose, liftAfter, liftPick, setLifted, reacts, holdRows, actionsBtn } = act;
  const holdRow = (item: (typeof holdRows)[number]) => (
    <button key={item.label} type="button" role="menuitem" className={item.danger ? "is-danger" : undefined} onClick={() => { if (item.onSelect) liftPick(item.onSelect); }}>
      <span>{item.label}</span>
      {item.icon && <Icon icon={item.icon} size={19} />}
    </button>
  );
  return (
    <HoldLift
      messageId={m.id}
      mine={m.mine}
      closeSignal={liftClose}
      onReopen={() => {
        liftAfter.current = null;
      }}
      onClosed={() => {
        const then = liftAfter.current;
        liftAfter.current = null;
        setLifted(false);
        then?.();
      }}
      bar={<HoldReactKeys reacts={reacts} onPick={(key, on) => liftPick(() => api.react(m.id, key, on))} />}
    >
      {holdRows.filter((item) => !item.danger).map(holdRow)}
      {/* S-MSG.holdseen: your own message in a group gets who read it, faces and all, between hairlines. */}
      {group && m.mine && onSeenBy && <HoldSeenRow api={api} m={m} onOpen={() => liftPick(() => onSeenBy(m, actionsBtn.current))} />}
      {holdRows.some((item) => item.danger) && <hr />}
      {holdRows.filter((item) => item.danger).map(holdRow)}
    </HoldLift>
  );
}
