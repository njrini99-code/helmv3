"use client";

import { CheckCheck } from "lucide-react";
import { AnimatePresence, m as M } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { orderReceiptRows, seenBy, seenByAccess, seenByAccessibleName, seenByLabel, SEEN_BY_VISIBILITY, type ReceiptRowInput, type SeenBy } from "@/lib/golf/message-receipts";
import { chSpring, chTween } from "../../lib/motion";
import { useChReducedMotion } from "../../lib/reduced-motion";
import { Avatar } from "../../ui/Avatar";
import { Icon } from "../../ui/Icon";
import { Modal } from "../../ui/Modal";
import { InlineNotice } from "../../ui/Notices";
import { Skeleton } from "../../ui/States";
import { railTime, type ChMsg } from "./model";
import { personOf, type ChMessagesApi } from "./MessagesView";

/**
 * Seen by (premium features P-1, handoff 4.34.1): the receipt on a group message's time line, "Seen by 9 of 11".
 * Seen means the person opened this chat after the message was sent (`message-receipts.ts`). No faces anywhere (the
 * owner declined the Seen-by facepile, P007-A3), and no Nudge (owner, 2026-10-25).
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
    const opened = section === "notYet" ? (lastOpened ? `Last opened ${railTime(lastOpened, api.now, api.timeZone, api.clock)}` : "Hasn’t opened this chat") : "";
    const meta = [role === "coach" ? "Coach" : "", opened].filter(Boolean).join(" · ");
    const label = [name, role === "coach" ? "coach" : "", section === "notYet" ? opened.toLowerCase() : ""].filter(Boolean).join(", ");
    return { userId, name, role, lastOpened, seenAt: null, meta, label };
  };
  const notYet = orderReceiptRows(s.notYet.map((id) => row(id, "notYet")), "notYet");
  const seen = orderReceiptRows(s.seen.map((id) => row(id, "seen")), "seen");
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const section = (title: string, rows: Row[]) =>
    rows.length > 0 && (
      <section className="ch-seen-sec" aria-label={`${title}, ${rows.length} ${rows.length === 1 ? "person" : "people"}`}>
        <h3 className="ch-seen-sec__h ch-num">
          {title} · {rows.length}
        </h3>
        <ul className="ch-seen-sec__rows">
          {rows.map((x) => (
            <M.li key={x.userId} layout={reduced ? false : "position"} transition={chSpring("smooth", reduced)} className="ch-seen-row" aria-label={x.label}>
              <Avatar name={x.name} size={compact ? 28 : 36} />
              <span className="ch-seen-row__body">
                <span className="ch-seen-row__name">{x.name}</span>
                {x.meta && <span className="ch-seen-row__meta">{x.meta}</span>}
              </span>
            </M.li>
          ))}
        </ul>
      </section>
    );
  return (
    <div className="ch-seen-list" data-ch-code={s.seen.length === 0 ? "CH-7310" : undefined}>
      {offline && <p className="ch-seen-note">You’re offline. This may be out of date.</p>}
      {section("Not yet", notYet)}
      {section("Seen", seen)}
      <p className="ch-seen-note">
        Seen means they opened this chat after it was sent.
        {m.poll ? " Voting is in See votes." : ""}
      </p>
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
  const all = !!s && s.total > 0 && s.seen.length >= s.total;
  return (
    <Modal code="CH-7609" open={m != null} onClose={onClose} title={listTitle(s)} icon={all ? CheckCheck : undefined} description={m ? quoteOf(m) : undefined} width={440}>
      {m && <SeenByBody api={api} m={m} compact={false} />}
    </Modal>
  );
}

/**
 * Desktop: a popover anchored to the receipt (or the bubble's actions button), above it with an 8 px gap and flipped
 * below when there isn't room. It follows the anchor as the thread scrolls and closes on Esc, a click outside, the
 * anchor leaving the thread, or the conversation changing. `role="dialog"`, so the thread's Lenis lets it scroll.
 */
export function SeenByPopover({ api, m, anchor, onClose }: { api: ChMessagesApi; m: ChMsg | null; anchor: HTMLElement | null; onClose: () => void }) {
  const reduced = useChReducedMotion();
  const box = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
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
    setPos({ top, left });
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
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 2 }}
          transition={chTween("quick", reduced)}
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
    render: (api, phone) => {
      // A message deleted while the list is open closes it.
      const live = state ? api.msgs.find((x) => x.id === state.m.id && !x.deleted) ?? null : null;
      return phone ? (
        <SeenBySheet api={api} m={live} onClose={() => setState(null)} />
      ) : (
        <SeenByPopover api={api} m={live} anchor={state?.anchor ?? null} onClose={() => setState(null)} />
      );
    },
  };
}
