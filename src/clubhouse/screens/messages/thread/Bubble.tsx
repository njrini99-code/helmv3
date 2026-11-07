'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChMsg, firstName, clock } from '../model';
import { personOf } from '../person-of';
import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent, useReducer, type KeyboardEvent } from 'react';
import { useLongPress, ReactionChip } from '../overlays/bubble-actions';
import { useToast } from '../../../ui/Toast';
import { haptic } from '../../../lib/haptics';
import { pollCardActions, PollCard } from '../polls';
import { useSeenBy, SeenByPill, SeenByReceipt, HoldSeenRow } from '../seen-by';
import type { MenuItem } from '../../../ui/Menu';
import { CheckCheck, ListChecks, BellRing, Lock, Share, Reply, Copy, Trash2, Pencil, Ellipsis } from 'lucide-react';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { Icon } from '../../../ui/Icon';
import { PresenceRow } from '../../../ui/ListPresence';
import { SenderPeek } from '../shared/conv-ui';
import { Avatar } from '../../../ui/Avatar';
import { classYearKey } from '../../../lib/class-year';
import { ReplyQuote, MessageText } from './MessageText';
import { BubbleTail } from '../thread-v2';
import { Attachments } from './Attachments';
import { REACTIONS } from '../overlays/reactions';
import { AnimatePresence, m as M } from 'motion/react';
import { chTween } from '../../../lib/motion';
import { Tooltip } from '../../../ui/Tooltip';
import { HoldLift } from '../hold-lift';

export function Bubble({
  api,
  m,
  first,
  last,
  group,
  picking,
  setPicking,
  onEdit,
  onDelete,
  onActions,
  onReply,
  carrier = false,
  onSeenBy,
}: {
  api: ChMessagesApi;
  m: ChMsg;
  first: boolean;
  last: boolean;
  group: boolean;
  /** P-1: this is the message that carries the thread's receipt (the viewer's newest confirmed one). */
  carrier?: boolean;
  /** P-1: open the Seen by list for this message (coaches), anchored to the element that asked. */
  onSeenBy?: (m: ChMsg, anchor: HTMLElement | null) => void;
  picking: boolean;
  setPicking: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Phone: the message's actions open in a sheet on a long press, in place of the hover tools. */
  onActions?: () => void;
  onReply?: () => void;
}) {
  const who = personOf(api, m.senderId);
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
  const press = useLongPress(m.failed ? undefined : (onActions ?? (() => setBarHeld(true))), onActions ? (direction) => {
    if (direction === "right") onReply?.();
    else setShowTime(true);
  } : undefined);
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
        : seenItem;
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
  if (m.deleted) {
    return (
      <div
        id={`ch-ms-message-${m.id}`}
        className={
          "ch-ms-msg" +
          (group ? " is-group" : "") +
          (m.mine ? " is-mine" : "") +
          (first ? " is-first" : "") +
          (last ? " is-last" : "")
        }
      >
        {!m.mine && <span className="ch-ms-msg__av" />}
        <div className="ch-ms-msg__col">
          <div className="ch-ms-bub is-deleted">Message deleted</div>
        </div>
      </div>
    );
  }
  // S-MSG.hold: Seen by has its own row on your own group message; the rest keep today's actions, Delete last.
  const holdRows = menuItems.flatMap((item) => (item.kind === "separator" || (group && m.mine && item.label === "Seen by") ? [] : [item]));
  const holdRow = (item: (typeof holdRows)[number]) => (
    <button key={item.label} type="button" className={item.danger ? "is-danger" : undefined} onClick={() => { if (item.onSelect) liftPick(item.onSelect); }}>
      <span>{item.label}</span>
      {item.icon && <Icon icon={item.icon} size={18} />}
    </button>
  );
  return (
    <PresenceRow
      as="div"
      id={`ch-ms-message-${m.id}`}
      ref={rowRef as never}
      data-ch-bar={barHeld ? "" : undefined}
      className={
        "ch-ms-msg" +
        (group ? " is-group" : "") +
        (m.mine ? " is-mine" : "") +
        (first ? " is-first" : "") +
        (last ? " is-last" : "") +
        (m.failed ? " is-failed" : "") +
        (api.foundMessageId === m.id ? " is-found" : "")
      }
    >
      {!m.mine && (
        <span className="ch-ms-msg__av">
          {last && (
            <SenderPeek api={api} who={who}>
              <Avatar
                name={who?.name ?? "Member"}
                id={who ? (who.playerId ?? who.userId) : null}
                size={30}
                year={who?.gradYear ? classYearKey(who.gradYear, new Date(api.now), api.timeZone) : null}
              />
            </SenderPeek>
          )}
        </span>
      )}
      <div className="ch-ms-msg__col">

        <div className="ch-ms-msg__line">
          <div className="ch-ms-msg__stack" {...press} {...rightClick} {...(!m.failed && !m.deleted ? { "data-ch-press-scale": ".97", onClick: toggleLikeOnDouble, onDoubleClick: (e: ReactMouseEvent) => e.preventDefault() } : {})}>
            {m.replyToId && <ReplyQuote api={api} replyToId={m.replyToId} />}
            {m.poll ? (
              <PollCard api={api} messageId={m.id} poll={m.poll} mine={m.mine} />
            ) : (
              m.text && (
                <div className="ch-ms-bub">
                  {/* Redesign: the sender's name sits inside a run's first bubble (06 S-MSG.team). */}
                  {!m.mine && first && group && <b className="ch-msv-bname">{firstName(who?.name ?? "Member")}</b>}
                  <MessageText text={m.text} />
                  {last && <BubbleTail />}
                </div>
              )
            )}
            {m.hasAttachments && (
              <Attachments load={api.attachments} id={m.id} mine={m.mine} />
            )}
          </div>
          {onActions && !m.failed && (
            <button
              type="button"
              className="ch-sr-only ch-sr-only--focusable"
              data-ch-code="CH-7804"
              onClick={onActions}
            >
              Message actions
            </button>
          )}
          {!m.failed && !m.deleted && !onActions && (
            <div className="ch-msv-hoverbar" role="toolbar" aria-label="Message actions">
              {REACTIONS.filter((r) => r.key === "Like" || r.key === "Love" || r.key === "Laugh").map((r) => {
                const on = reacts.some((x) => x.key === r.key && x.mine);
                return (
                  <button
                    key={r.key}
                    type="button"
                    aria-label={`${on ? "Remove" : "React"} ${r.key.toLowerCase()}`}
                    aria-pressed={on}
                    onClick={() => {
                      haptic("select");
                      api.react(m.id, r.key, !on);
                    }}
                  >
                    <Icon icon={r.icon} size={14.4} />
                  </button>
                );
              })}
              {onReply && (
                <button type="button" aria-label="Reply" onClick={onReply}>
                  <Icon icon={Reply} size={14.4} />
                </button>
              )}
              <button
                type="button"
                aria-label="More message actions"
                onClick={() => {
                  refreshMenu();
                  setLifted(true);
                }}
              >
                <Icon icon={Ellipsis} size={14.4} />
              </button>
            </div>
          )}

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
        </div>
        {reacts.length > 0 && (
          <div className={"ch-ms-reacts" + (m.mine ? " on-mine" : " on-theirs")}>
            {reacts.map((r) => (
              <ReactionChip key={r.key} api={api} messageId={m.id} r={r} arriving={drawn.current} />
            ))}
          </div>
        )}
        {m.failed ? (
          <span
            className="ch-ms-msg__fail"
            role="alert"
            data-ch-code={m.failed === "unknown" ? "CH-7017" : "CH-7016"}
          >
            {m.failed === "unknown"
              ? "Couldn’t confirm this message sent. Check before sending again."
              : "Not sent."}
            <button
              type="button"
              onClick={() => api.retry(m.id)}
            >
              Try again
            </button>
            <button type="button" onClick={() => api.discard(m.id)}>
              Discard
            </button>
          </span>
        ) : (
          // The lane: times live behind the drag (S-MSG.times); only your latest message keeps its receipt, as a pill (S-MSG.seen).
          group ? (
            carrier && m.mine && (
              <span className="ch-ms-seen-slot">
                <SeenByPill api={api} m={m} onOpen={onSeenBy ? (el) => onSeenBy(m, el) : undefined} />
              </span>
            )
          ) : (carrier && m.mine && m.seen) && (
            <span className={"ch-ms-msg__t ch-num" + " is-pill"}>
              {(m.seen && !group ? `Seen ${clock(m.at, api.timeZone, api.clock)}` : null)}
              {""}
              {/* OC-3: a direct thread's "Seen" sits on the carrier only (or a time revealed by a swipe), not every run-end. */}
              {""}
              {/* P-1 M3: when the receipt moves to a newer message, the old one fades out on quick (instant when reduced). */}
              <AnimatePresence initial={false}>
                {group && (carrier || showTime) && (
                  <M.span key="seen" className="ch-ms-seen-slot" exit={reduced ? undefined : { opacity: 0 }} transition={chTween("quick", reduced)}>
                    <SeenByReceipt api={api} m={m} onOpen={onSeenBy ? (el) => onSeenBy(m, el) : undefined} />
                  </M.span>
                )}
              </AnimatePresence>
            </span>
          )
        )}
        {/* P-10: "Notified anyway", once a push really went out. A 1:1 shows it to both sides; in a group only a coach sees it (a teammate
            reading it would learn who was in class). */}
        {m.notifiedAnyway && !m.failed && (!group || api.viewer.role === "coach") && (
          <span className="ch-ms-msg__na" data-ch-code="CH-7271">
            Notified anyway
          </span>
        )}
      </div>
      <span className="ch-msv-time ch-num">{clock(m.at, api.timeZone, api.clock)}</span>
      {lifted && (
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
          bar={REACTIONS.map((r) => {
            const on = reacts.some((x) => x.key === r.key && x.mine);
            return (
              <button
                key={r.key}
                type="button"
                className={on ? "is-on" : undefined}
                aria-label={`${on ? "Remove" : "React"} ${r.key.toLowerCase()}`}
                aria-pressed={on}
                onClick={() => {
                  haptic("select");
                  liftPick(() => api.react(m.id, r.key, !on));
                }}
              >
                <Icon icon={r.icon} size={22} />
              </button>
            );
          })}
        >
          {holdRows.filter((item) => !item.danger).map(holdRow)}
          {/* S-MSG.holdseen: your own message in a group gets who read it, faces and all, between hairlines. */}
          {group && m.mine && onSeenBy && <HoldSeenRow api={api} m={m} onOpen={() => liftPick(() => onSeenBy(m, actionsBtn.current))} />}
          {holdRows.some((item) => item.danger) && <hr />}
          {holdRows.filter((item) => item.danger).map(holdRow)}
        </HoldLift>
      )}
    </PresenceRow>
  );
}
