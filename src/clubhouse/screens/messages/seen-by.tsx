"use client";

import { CheckCheck, Eye } from "lucide-react";
import { AnimatePresence, m as M } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { orderReceiptRows, seenBy, seenByAccess, seenByAccessibleName, seenByLabel, SEEN_BY_VISIBILITY, type ReceiptRowInput, type SeenBy } from "@/lib/golf/message-receipts";
import { chSpring, chSpringCurve, chTween, CH_EASE } from "../../lib/motion";
import { chSupportsLinear } from "../../lib/sheet-drag";
import { useChMotionMode, useChReducedMotion } from "../../lib/reduced-motion";
import { Avatar, avatarTone } from "../../ui/Avatar";
import { initials as initialsOf } from "../../lib/format";
import { Icon } from "../../ui/Icon";
import { MsSheet } from "./overlays/MsSheet";
import { InlineNotice } from "../../ui/Notices";
import { Skeleton } from "../../ui/States";
import { clock, railTime, type ChMsg } from "./model";
import type { ChMessagesApi } from "./MessagesView";

/** The directory lookup MessagesView exports as personOf, kept here so this file only takes types from it (no import cycle). */
const personOf = (api: ChMessagesApi, userId: string) => api.directory.find((p) => p.userId === userId);

/**
 * Seen by (premium features P-1, handoff 4.34.1): the receipt under a group message, "Seen by 9 of 11".
 * Seen means the person opened this chat after the message was sent (`message-receipts.ts`). Messages v2 draws faces on the
 * receipt pill and in the message menu (MSG-215, MSG-404), but only for the viewer who may open the list (a coach, QUESTIONS
 * Q-15): a player sender sees the count and no names or faces. No Nudge (owner, 2026-10-25).
 */

/** The receipt for one message, or null when the viewer may not see a count or the read state isn't known. */
export function useSeenBy(api: ChMessagesApi, m: ChMsg): { s: SeenBy; label: string; canOpen: boolean } | null {
  const r = api.receipts;
  if (!r || m.pending || m.failed || m.deleted) return null;
  // No false zero: a read that failed with nothing held shows the time alone.
  if (r.status === "loading" || (r.status === "error" && r.marks.size === 0)) return null;
  const access = seenByAccess(SEEN_BY_VISIBILITY, api.viewer.role, m.mine);
  if (!access.count) return null;
  const s = seenBy(m.at, m.senderId, r.marks);
  const label = seenByLabel(s);
  return label ? { s, label, canOpen: access.list } : null;
}

/**
 * The inline label (4.3). The words cross-fade when the count changes (M1), the double check arrives on "Seen by
 * everyone" (M2); neither moves on first paint. The fading copies are hidden from VoiceOver: the thread scroller is a
 * polite live region for additions, so the accessible name sits on one stable node and a count change isn't announced.
 */
export function SeenByReceipt({ api, m, onOpen }: { api: ChMessagesApi; m: ChMsg; onOpen?: (anchor: HTMLElement) => void }) {
  const reduced = useChReducedMotion();
  const seen = useSeenBy(api, m);
  if (!seen) return null;
  const all = seen.s.seen.length >= seen.s.total;
  const open = seen.canOpen && onOpen ? onOpen : null;
  const name = seenByAccessibleName(seen.s, !!open);
  const words = (
    <span className="ch-ms-seen__w" aria-hidden="true">
      <AnimatePresence initial={false}>
        {all && (
          <M.span
            key="all"
            className="ch-ms-seen__all"
            initial={reduced ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, transition: chTween("quick") }}
            transition={chSpring("smooth", reduced)}
          >
            <Icon icon={CheckCheck} size={13} />
          </M.span>
        )}
      </AnimatePresence>
      <span className="ch-ms-seen__swap">
        <AnimatePresence initial={false} mode="popLayout">
          <M.span
            key={seen.label}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? undefined : { opacity: 0 }}
            transition={chTween("quick", reduced)}
          >
            {seen.label}
          </M.span>
        </AnimatePresence>
      </span>
    </span>
  );
  return (
    <>
      {" · "}
      {open ? (
        <button type="button" className="ch-ms-seen is-open" aria-label={name} data-ch-code="CH-7608" onClick={(e) => open(e.currentTarget)}>
          {words}
        </button>
      ) : (
        <span className="ch-ms-seen" data-ch-code="CH-7608">
          <span className="ch-sr-only" data-ch-code="CH-7805">
            {name}
          </span>
          {words}
        </span>
      )}
    </>
  );
}

/** Up to five faces; a new one pops in as a read arrives (M-MSG-17a), never on first paint. */
export function SeenFaces({ api, ids, size, max }: { api: ChMessagesApi; ids: readonly string[]; size: number; max: number }) {
  const reduced = useChReducedMotion();
  if (!ids.length) return null;
  return (
    <span className="ch-msv-faces" aria-hidden="true">
      <AnimatePresence initial={false}>
        {ids.slice(0, max).map((id) => (
          <M.span key={id} className="ch-msv-faces__f" initial={reduced ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={chSpring("pop", reduced)}>
            {/* The lane's faces are 16 and 20 with 7 and 8 type, under Avatar's steps: the same coin, drawn at the lane's size (listed for the owner). */}
            <span className="ch-avatar" data-tone={avatarTone(personOf(api, id)?.playerId ?? id)} style={{ ["--ch-av-size" as string]: `${size}px`, ["--ch-av-type" as string]: `${size <= 16 ? 7 : 8}px` }} aria-hidden="true">
              {initialsOf(personOf(api, id)?.name ?? "Member")}
            </span>
          </M.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

/** S-MSG.holdseen: the hold menu's row on your own group message: who read it, faces and a count. */
export function HoldSeenRow({ api, m, onOpen }: { api: ChMessagesApi; m: ChMsg; onOpen: () => void }) {
  const seen = useSeenBy(api, m);
  if (!seen?.canOpen) return null;
  return (
    <>
      <hr />
      <button type="button" role="menuitem" className="ch-msv-seenrow" onClick={onOpen}>
        <span className="ch-msv-seenrow__t">
          Seen by
          <Icon icon={Eye} size={19} />
        </span>
        <SeenFaces api={api} ids={seen.s.seen} size={20} max={6} />
        <small className="ch-num">{seen.s.seen.length} of {seen.s.total} · {seen.s.notYet.length} not yet</small>
      </button>
    </>
  );
}

/**
 * The receipt under your latest message in a group (MSG-215): a paper pill with up to five overlapping 16 px faces and "Seen by n of
 * m" or "Seen by everyone"; a tap opens the list (a coach). Nobody has read it yet: a plain "Delivered" pill, not a button. A viewer
 * who may not open the list (a player) sees the count and no faces.
 */
export function SeenByPill({ api, m, onOpen }: { api: ChMessagesApi; m: ChMsg; onOpen?: (anchor: HTMLElement) => void }) {
  const seen = useSeenBy(api, m);
  if (!seen) return null;
  const n = seen.s.seen.length;
  const words = n === 0 ? "Delivered" : n < seen.s.total ? <>Seen by <b className="ch-num">{n}</b> of {seen.s.total}</> : "Seen by everyone";
  const open = n > 0 && seen.canOpen && onOpen ? onOpen : null;
  const name = seenByAccessibleName(seen.s, !!open);
  const faces = seen.canOpen ? <SeenFaces api={api} ids={seen.s.seen} size={16} max={5} /> : null;
  return open ? (
    <button type="button" className="ch-msv-seen" aria-label={name} data-ch-code="CH-7608" onClick={(e) => open(e.currentTarget)}>
      {faces}
      <span aria-hidden="true">{words}</span>
    </button>
  ) : (
    <span className="ch-msv-seen" data-ch-code="CH-7608">
      {faces}
      <span className="ch-sr-only" data-ch-code="CH-7805">{name}</span>
      <span aria-hidden="true">{words}</span>
    </span>
  );
}

/**
 * The receipt under your latest message in a direct thread (MSG-214, MOT-SEND-10): "Delivered", then "Seen 8:15 AM", the words
 * crossfading over 180 ms. The time is the reader's, shown to a coach from the read marks; a player (or no mark yet) reads plain "Seen"
 * (Q-44). Renders nothing for a pending, failed, deleted or poll message.
 */
export function DmReceipt({ api, m }: { api: ChMessagesApi; m: ChMsg }) {
  const reduced = useChReducedMotion();
  if (m.pending || m.failed || m.deleted || m.poll) return null;
  let label = "Delivered";
  if (m.seen) {
    const marks = api.receipts?.marks;
    const readAt = marks && api.viewer.role === "coach" ? (seenBy(m.at, m.senderId, marks).seen.map((id) => marks.get(id)).find((t): t is string => !!t) ?? null) : null;
    label = readAt ? `Seen ${clock(readAt, api.timeZone, api.clock)}` : "Seen";
  }
  return (
    <span className="ch-msv-seen is-dm" data-ch-code="CH-7608" role="status">
      <AnimatePresence initial={false} mode="popLayout">
        <M.span key={label} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduced ? undefined : { opacity: 0 }} transition={chTween("quick", reduced)}>
          {label}
        </M.span>
      </AnimatePresence>
    </span>
  );
}

/** The quoted first line under the list's title: the message's text, "Attachment", or a poll's question. */
function quoteOf(m: ChMsg): string {
  if (m.poll) return m.poll.question;
  const line = m.text.split("\n").map((l) => l.trim()).find(Boolean);
  return line ? `“${line}”` : m.hasAttachments ? "Attachment" : "Message";
}

/** The list's title: "Seen by 9 of 11", "Not seen yet", "Seen by everyone"; "Seen by" alone until it's known. */
function listTitle(s: SeenBy | null): string {
  if (!s) return "Seen by";
  if (s.seen.length === 0) return "Not seen yet";
  if (s.seen.length >= s.total) return "Seen by everyone";
  return `Seen by ${s.seen.length} of ${s.total}`;
}

type Row = ReceiptRowInput & { meta: string; label: string };

/** Who has seen a message and who hasn't (4.4), shared by the phone sheet and the desktop popover. Names only. */
function SeenByBody({ api, m, compact }: { api: ChMessagesApi; m: ChMsg; compact: boolean }) {
  const reduced = useChReducedMotion();
  const r = api.receipts;
  const s = r && r.marks.size ? seenBy(m.at, m.senderId, r.marks) : null;
  // A polite status inside the open list only, coalesced over 2 s: "Eli Brandt has seen it."
  const [status, setStatus] = useState("");
  const shown = useRef<Set<string> | null>(null);
  const pendingNew = useRef<string[]>([]);
  const timer = useRef<number | null>(null);
  const seenKey = s ? s.seen.join(",") : "";
  useEffect(() => {
    if (!s) return;
    if (!shown.current) {
      shown.current = new Set(s.seen);
      return;
    }
    const fresh = s.seen.filter((id) => !shown.current!.has(id));
    for (const id of fresh) shown.current.add(id);
    if (!fresh.length) return;
    pendingNew.current.push(...fresh);
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      const ids = pendingNew.current;
      pendingNew.current = [];
      timer.current = null;
      setStatus(ids.length === 1 ? `${personOf(api, ids[0]!)?.name ?? "Member"} has seen it.` : `${ids.length} more people have seen it.`);
    }, 2000);
  }, [seenKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
  // M6: a row that changes place (Not yet to Seen) springs there on the compositor, measured against the list, not
  // Motion's shared layout (lib/slide-plate.ts: layoutId was dropped for jank, owner 2026-10-15).
  const listEl = useRef<HTMLDivElement | null>(null);
  const rowTops = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const el = listEl.current;
    if (!el) return;
    const base = el.getBoundingClientRect().top;
    const before = rowTops.current;
    const now = new Map<string, number>();
    el.querySelectorAll<HTMLElement>("[data-user]").forEach((row) => now.set(row.dataset.user!, row.getBoundingClientRect().top - base));
    rowTops.current = now;
    if (reduced || !before.size) return;
    const curve = chSpringCurve("smooth");
    el.querySelectorAll<HTMLElement>("[data-user]").forEach((row) => {
      const was = before.get(row.dataset.user!);
      const dy = was == null ? 0 : was - now.get(row.dataset.user!)!;
      if (Math.abs(dy) < 0.5 || typeof row.animate !== "function") return;
      row.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: curve.ms, easing: chSupportsLinear() ? curve.linear : `cubic-bezier(${CH_EASE.join(",")})` });
    });
  });

  if (r?.status === "error" && !r.marks.size) {
    return (
      <div data-ch-code="CH-7218">
        <InlineNotice title="Couldn’t load who’s seen this" body="Try again in a moment." onRetry={r.retry} />
      </div>
    );
  }
  if (!s) {
    return (
      <div className="ch-seen-list" aria-busy="true" data-ch-code="CH-7411">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ch-seen-row">
            <Skeleton width={compact ? 28 : 36} height={compact ? 28 : 36} radius={compact ? 14 : 18} />
            <Skeleton width="60%" />
          </div>
        ))}
      </div>
    );
  }
  const nowMs = Date.parse(api.now);
  const row = (userId: string, section: "notYet" | "seen"): Row => {
    const p = personOf(api, userId);
    const name = p?.name ?? "Member";
    const role: Row["role"] = p?.role === "coach" ? "coach" : p?.role === "player" ? "player" : "member";
    const raw = r!.marks.get(userId) ?? null;
    // A forged future last_read_at is shown as now (changelog P-01): never "Last opened tomorrow".
    const lastOpened = raw && Number.isFinite(nowMs) && Date.parse(raw) > nowMs ? api.now : raw;
    const meta = section === "notYet" ? "Hasn’t opened this chat" : lastOpened ? railTime(lastOpened, api.now, api.timeZone, api.clock) : "Just now";
    return { userId, name, role, lastOpened, seenAt: null, meta, label: [name, meta.toLowerCase()].filter(Boolean).join(", ") };
  };
  const notYet = orderReceiptRows(s.notYet.map((id) => row(id, "notYet")), "notYet");
  // The list reads top to bottom in the order they opened it (MSG-405: Maya 7:06, Owen 7:08, ...).
  const seen = s.seen.map((id) => row(id, "seen")).sort((a, b) => String(a.lastOpened).localeCompare(String(b.lastOpened)));
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  // M6: a person moving from Not yet to Seen glides to their new place (one layout id across both sections, on smooth,
  // which keeps its velocity when retargeted); the meta and the section counts cross-fade on quick (M1's swap); a section
  // left empty folds its height away on the same spring. All instant under reduced motion and Animations off.
  const fade = (key: string, text: string) => (
    <span className="ch-seen-swap">
      <AnimatePresence initial={false} mode="popLayout">
        <M.span key={key} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduced ? undefined : { opacity: 0 }} transition={chTween("quick", reduced)}>
          {text}
        </M.span>
      </AnimatePresence>
    </span>
  );
  const section = (id: string, title: string, rows: Row[]) =>
    rows.length > 0 && (
      <M.section
        key={id}
        className="ch-seen-sec"
        aria-label={`${title}, ${rows.length} ${rows.length === 1 ? "person" : "people"}`}
        style={{ overflow: "hidden" }}
        exit={reduced ? undefined : { height: 0, opacity: 0 }}
        transition={chSpring("smooth", reduced)}
      >
        <h3 className="ch-seen-sec__h ch-num">
          <><span>{title}</span>{fade(String(rows.length), String(rows.length))}</>
        </h3>
        <ul className="ch-seen-sec__rows">
          {rows.map((x) => (
            <li key={x.userId} data-user={x.userId} className="ch-seen-row" aria-label={x.label}>
              {compact ? <Avatar name={x.name} size="sm" /> : <Avatar name={x.name} size={32} />}
              <span className="ch-seen-row__body">
                <span className="ch-seen-row__name">{x.name}</span>
                {x.role !== "member" && <small className="ch-seen-row__role">{x.role === "coach" ? "Coach" : "Player"}</small>}
              </span>
              {x.meta && <span className="ch-seen-row__meta">{fade(x.meta, x.meta)}</span>}
            </li>
          ))}
        </ul>
      </M.section>
    );
  return (
    <div ref={listEl} className={"ch-seen-list" + " is-v2"} data-ch-code={s.seen.length === 0 ? "CH-7310" : undefined}>
      {offline && <p className="ch-seen-note">You’re offline. This may be out of date.</p>}
      <AnimatePresence initial={false}>
        <>
            {section("seen", "Seen", seen)}
            {section("notYet", "Not seen yet", notYet)}
          </>
      </AnimatePresence>

      <span className="ch-sr-only" role="status">
        {status}
      </span>
    </div>
  );
}

/** Phone: a bottom sheet (4.4). */
export function SeenBySheet({ api, m, onClose }: { api: ChMessagesApi; m: ChMsg | null; onClose: () => void }) {
  const r = api.receipts;
  const s = m && r && r.marks.size ? seenBy(m.at, m.senderId, r.marks) : null;
  const full = m ? (m.poll ? m.poll.question : m.text || "Attachment") : "";
  const cut = full.length > 46 ? `${full.slice(0, 46)}…` : full;
  return (
    <MsSheet code="CH-7609" open={m != null} onClose={onClose} title="Seen by" description={s ? `${s.seen.length} of ${s.total} · ${cut}` : cut} className="ch-msv-sheet">
      {m && <SeenByBody api={api} m={m} compact={false} />}
    </MsSheet>
  );
}

/**
 * Desktop: a popover anchored to the receipt (or the bubble's actions button), above it with an 8 px gap and flipped
 * below when there isn't room. It follows the anchor as the thread scrolls and closes on Esc, a click outside, the
 * anchor leaving the thread, or the conversation changing. `role="dialog"`, so the thread's Lenis lets it scroll.
 */
export function SeenByPopover({ api, m, anchor, onClose }: { api: ChMessagesApi; m: ChMsg | null; anchor: HTMLElement | null; onClose: () => void }) {
  // M4: Reduce Motion keeps the fade and drops the lift; Animations off is instant.
  const mode = useChMotionMode();
  const reduced = mode !== "full";
  const box = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const r = api.receipts;
  const s = m && r && r.marks.size ? seenBy(m.at, m.senderId, r.marks) : null;
  const all = !!s && s.total > 0 && s.seen.length >= s.total;
  const place = () => {
    const el = box.current;
    if (!anchor || !el) return;
    const a = anchor.getBoundingClientRect();
    const h = el.offsetHeight;
    const w = el.offsetWidth || 320;
    const above = a.top - 8 - h;
    const top = above >= 8 ? above : Math.min(a.bottom + 8, window.innerHeight - h - 8);
    const left = Math.max(8, Math.min(a.right - w, window.innerWidth - w - 8));
    setPos({ top, left, above: above >= 8 });
    const scroller = anchor.closest(".ch-ms-thread__scroll, [data-lenis-prevent], .ch-ms-thread");
    if (scroller) {
      const sr = scroller.getBoundingClientRect();
      if (a.bottom < sr.top || a.top > sr.bottom) onClose();
    }
  };
  useLayoutEffect(() => {
    if (!m) return;
    place();
    box.current?.querySelector<HTMLElement>(".ch-seen-pop__title")?.focus({ preventScroll: true });
  }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!m) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        anchor?.focus({ preventScroll: true });
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [m?.id, anchor]); // eslint-disable-line react-hooks/exhaustive-deps
  if (typeof document === "undefined") return null;
  const root = document.querySelector(".ch-root") ?? document.body;
  return createPortal(
    <AnimatePresence>
      {m && (
        <M.div
          ref={box}
          key={m.id}
          role="dialog"
          aria-labelledby="ch-seen-pop-title"
          aria-describedby="ch-seen-pop-quote"
          className="ch-seen-pop"
          data-ch-code="CH-7609"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, transformOrigin: pos?.above === false ? "right top" : "right bottom" }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 2 }}
          transition={chTween("quick", mode === "off")}
        >
          <div className="ch-seen-pop__head">
            <h2 id="ch-seen-pop-title" className="ch-seen-pop__title" tabIndex={-1}>
              {all && <Icon icon={CheckCheck} size={15} />}
              {listTitle(s)}
            </h2>
            <p id="ch-seen-pop-quote" className="ch-seen-pop__quote">
              {quoteOf(m)}
            </p>
          </div>
          <div className="ch-seen-pop__list">
            <SeenByBody api={api} m={m} compact />
          </div>
        </M.div>
      )}
    </AnimatePresence>,
    root,
  );
}

/** One place that opens the list: the sheet on a phone, the popover on desktop. */
export function useSeenByList(): {
  open: (m: ChMsg, anchor: HTMLElement | null) => void;
  render: (api: ChMessagesApi, phone: boolean) => ReactNode;
} {
  const [state, setState] = useState<{ m: ChMsg; anchor: HTMLElement | null } | null>(null);
  return {
    open: (m, anchor) => setState({ m, anchor }),
    render: (api) => {
      // A message deleted while the list is open closes it.
      const live = state ? api.msgs.find((x) => x.id === state.m.id && !x.deleted) ?? null : null;
      return (
        <SeenBySheet api={api} m={live} onClose={() => setState(null)} />
      );
    },
  };
}
