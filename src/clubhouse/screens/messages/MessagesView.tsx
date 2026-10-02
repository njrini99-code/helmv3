"use client";

import {
  ArrowUp,
  CalendarPlus,
  ChevronLeft,
  Download,
  Ellipsis,
  FileText,
  Frown,
  Heart,
  Info,
  Laugh,
  LogOut,
  Paperclip,
  PartyPopper,
  Pencil,
  RotateCw,
  SmilePlus,
  SquarePen,
  ThumbsUp,
  HandHeart,
  Trash2,
  Users,
  X,
  Check,
  MessageSquare,
  Search,
  BellOff,
  Megaphone,
  Plus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useThreadAnchor } from "./use-thread-anchor";
import { Avatar } from "../../ui/Avatar";
import { Badge } from "../../ui/Badge";
import { Button, IconButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Menu } from "../../ui/Menu";
import { Modal } from "../../ui/Modal";
import { InlineNotice } from "../../ui/Notices";
import { SearchField } from "../../ui/SearchField";
import { SectionBoundary } from "../../ui/SectionBoundary";
import { Segmented } from "../../ui/Segmented";
import { EmptyState, Skeleton } from "../../ui/States";
import { haptic } from "../../lib/haptics";
import { chReport, chTrail } from "../../lib/track";
import { rebuiltHref } from "../../shell/nav";
import {
  clock,
  dayLabel,
  filterConvs,
  firstName,
  railTime,
  sectionOf,
  threadItems,
  type ChAttachment,
  type ChConv,
  type ChConvFilter,
  type ChMember,
  type ChMsg,
  type ChPerson,
  type ChReaction,
  type ChReactionKey,
  type ChSearchHit,
  type ChMute,
  type ChAnnouncement,
  type ChAnnouncementDetail,
  type ChFile,
} from "./model";
import { AnnouncementPane, AnnouncementsSection } from "./announcements";
import { fileMeta, fileSize, useConversationFiles } from "./files";
// Re-exported: MessagesPhone and older callers read it from here.
export { fileSize } from "./files";
import { isMessagesFirstRun, MessagesFirstRun } from "./MessagesFirstRun";

export const REACTIONS: Array<{ key: ChReactionKey; icon: LucideIcon }> = [
  { key: "Like", icon: ThumbsUp },
  { key: "Love", icon: Heart },
  { key: "Laugh", icon: Laugh },
  { key: "Celebrate", icon: PartyPopper },
  { key: "Surprised", icon: Frown },
  { key: "Thanks", icon: HandHeart },
];
const REACTION_ICON = Object.fromEntries(
  REACTIONS.map((r) => [r.key, r.icon]),
) as Record<ChReactionKey, LucideIcon>;

export interface ChPendingAttachmentSend {
  id: string;
  text: string;
  replyToId: string | null;
  filenames: string[];
}

export interface ChAttachmentRecovery {
  text: string;
  files: File[];
  replyToId?: string | null;
  queuedText: string;
  queuedFiles: File[];
  resumed?: ChPendingAttachmentSend | null;
}

export interface ChMessagesApi {
  viewer: { userId: string; role: "coach" | "player"; name: string };
  timeZone: string;
  now: string;
  teamName: string | null;

  convs: ChConv[];
  convsLoading: boolean;
  convsError: boolean;
  refetchConvs: () => void;

  /**
   * Unsent drafts by conversation id, kept by the container so switching
   * threads never loses what was written (P007 71202). Cleared when a send lands.
   */
  drafts: Map<string, string>;
  /** Unknown attachment attempts survive leaving/reopening a conversation in this mounted session. */
  attachmentRecovery?: Map<string, ChAttachmentRecovery>;
  loadPendingAttachmentSend?: () => Promise<ChPendingAttachmentSend | null>;
  retryPendingAttachmentSend?: () => Promise<boolean | "partial" | "unknown">;

  selectedId: string | null;
  select: (id: string | null) => void;

  msgs: ChMsg[];
  msgsLoading: boolean;
  msgsError: boolean;
  /** The thread's refresh failed while an earlier copy is shown (CH-7216). */
  msgsStale?: boolean;
  refetchMsgs: () => void;
  typing: boolean;
  onTyping: (on: boolean) => void;
  send: (text: string, replyToId?: string | null) => Promise<boolean>;
  sendFiles: (text: string, files: File[], replyToId?: string | null) => Promise<boolean | "partial" | "unknown">;
  retry: (id: string) => void;
  discard: (id: string) => void;
  edit: (id: string, text: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;

  reactions: Map<string, ChReaction[]>;
  react: (messageId: string, key: ChReactionKey, active: boolean) => void;
  attachments: (messageId: string) => Promise<ChAttachment[] | null>;

  members: ChMember[] | null;
  membersError: boolean;
  retryMembers: () => void;
  leave: () => Promise<boolean>;
  /** The open group's creator only: who on the team isn't in it yet, and adding one (D-47). */
  addCandidates: () => Promise<ChMember[] | null>;
  addMember: (userId: string, name: string) => Promise<boolean>;
  /** The open conversation's shared files, newest first (D-48). */
  files: (conversationId: string) => Promise<ChFile[] | null>;

  directory: ChPerson[];
  directoryError: boolean;
  retryDirectory: () => void;
  startDirect: (userId: string) => Promise<boolean>;
  createGroup: (userIds: string[], title: string) => Promise<boolean>;

  searchMessages: (q: string) => Promise<ChSearchHit[] | null>;
  openHit: (hit: ChSearchHit) => void;

  mute: ChMute | null;
  muteError: boolean;
  retryMute: () => void;
  setMute: (muted: boolean, hours: number | null) => Promise<boolean>;

  announcements: ChAnnouncement[];
  /** The first announcements read hasn't answered: the list waits, so they don't push it down when they land (CLS). */
  annLoading?: boolean;
  annError: boolean;
  refetchAnns: () => void;
  selectedAnnId: string | null;
  selectAnn: (id: string | null) => void;
  announcementDetail: (id: string) => Promise<ChAnnouncementDetail | null>;
  acknowledge: (id: string) => Promise<boolean>;
  completeTask: (announcementId: string, taskId: string) => Promise<boolean>;
  createAnnouncement: (a: {
    title: string;
    body: string;
    urgent: boolean;
    ack: boolean;
  }) => Promise<boolean>;
}

export const personOf = (api: ChMessagesApi, userId: string) =>
  api.directory.find((p) => p.userId === userId);

/* Rail */

export function MessageHits({ api, q }: { api: ChMessagesApi; q: string }) {
  const [hits, setHits] = useState<ChSearchHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const search = api.searchMessages;
  const term = q.trim();
  useEffect(() => {
    if (term.length < 2) {
      setHits(null);
      return;
    }
    let live = true;
    setFailed(false);
    const t = window.setTimeout(() => {
      search(term)
        .then((r) => live && (r ? setHits(r) : setFailed(true)))
        .catch(() => live && setFailed(true));
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [search, term, attempt]);
  if (term.length < 2) return null;
  return (
    <section
      className="ch-ms-sec"
      aria-label="Messages matching your search"
      // CH-7802: results are announced as they arrive.
      aria-live="polite"
    >
      <div className="ch-ms-sec__l">In messages</div>
      {failed ? (
        <InlineNotice
          code="CH-7203"
          title="Message search didn't load."
          body="Conversations above still match by name."
          onRetry={() => setAttempt((a) => a + 1)}
        />
      ) : !hits ? (
        <div className="ch-ms-sec__card" aria-busy="true" data-ch-code="CH-7404">
          <div className="ch-ms-row" style={{ cursor: "default" }}>
            <span />
            <Skeleton width="80%" height={13} />
          </div>
        </div>
      ) : !hits.length ? (
        <div className="ch-ms-empty" data-ch-code="CH-7303">
          No messages mention “{term}”.
        </div>
      ) : (
        <div className="ch-ms-sec__card">
          {hits.slice(0, 20).map((h) => (
            <button
              key={h.messageId}
              type="button"
              className="ch-ms-row is-hit"
              onClick={() => {
                // CH-7703: a tick on picking a reaction, a filter or a conversation.
                haptic("select");
                chTrail("messages open search hit");
                api.openHit(h);
              }}
            >
              <span className="ch-ms-grp">
                <Icon icon={Search} size={14} />
              </span>
              <span className="ch-ms-row__main">
                <span className="ch-ms-row__top">
                  <b>{h.conversationName}</b>
                  <span className="ch-num">
                    {railTime(h.at, api.now, api.timeZone)}
                  </span>
                </span>
                <span className="ch-ms-row__bot">
                  <span>
                    <em>{h.senderName}: </em>
                    {h.text}
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** One conversation in the list: the desktop rail and the phone inbox. */
export function ConvRow({ api, c, avatarSize = 36 }: { api: ChMessagesApi; c: ChConv; avatarSize?: number }) {
  return (
    <button
      type="button"
      className={
        "ch-ms-row" +
        (c.unread ? " is-unread" : "") +
        (api.selectedId === c.id ? " is-sel" : "")
      }
      aria-current={
        api.selectedId === c.id ? "true" : undefined
      }
      onClick={() => {
        haptic("select");
        chTrail("messages open conversation");
        api.select(c.id);
      }}
    >
      {c.group ? (
        <span className="ch-ms-grp">
          <Icon icon={Users} size={15} />
        </span>
      ) : (
        <Avatar name={c.title} size={avatarSize} />
      )}
      <span className="ch-ms-row__main">
        <span className="ch-ms-row__top">
          <b>{c.title}</b>
          <span className="ch-num">
            {railTime(c.lastAt, api.now, api.timeZone)}
          </span>
        </span>
        <span className="ch-ms-row__bot">
          <span>
            {c.lastText ? (
              <>
                {c.lastSenderId &&
                  (c.group ||
                    c.lastSenderId === api.viewer.userId) && (
                    <em>
                      {c.lastSenderId === api.viewer.userId
                        ? "You"
                        : firstName(
                            personOf(api, c.lastSenderId)
                              ?.name ?? "Member",
                          )}
                      :{" "}
                    </em>
                  )}
                {c.lastText}
              </>
            ) : (
              "No messages yet"
            )}
          </span>
          {c.unread > 0 && (
            <span
              className="ch-ms-count ch-num"
              aria-label={`${c.unread} unread`}
            >
              {c.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function Rail({ api, onNew }: { api: ChMessagesApi; onNew: () => void }) {
  const [filter, setFilter] = useState<ChConvFilter>("all");
  const [q, setQ] = useState("");
  const unread = api.convs.filter((c) => c.unread > 0).length;
  const list = filterConvs(api.convs, filter, q);
  const sections: Array<[ReturnType<typeof sectionOf>, string]> = [
    ["today", "Today"],
    ["week", "This week"],
    ["earlier", "Earlier"],
  ];
  return (
    <aside className="ch-ms-rail" aria-label="Conversations">
      <div className="ch-ms-rail__head">
        <div className="ch-ms-rail__title">
          <h1>Messages</h1>
          <button
            type="button"
            className="ch-btn ch-btn--secondary ch-iconbtn"
            aria-label="New message"
            title="New message"
            onClick={onNew}
          >
            <Icon icon={SquarePen} size={16} />
          </button>
        </div>
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search people and messages"
          label="Search conversations and messages"
        />
        <Segmented<ChConvFilter>
          size="sm"
          label="Filter conversations"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: `Unread · ${unread}` },
            { value: "groups", label: "Groups" },
          ]}
        />
      </div>
      <div className="ch-ms-rail__body">
        {api.convsError ? (
          <InlineNotice
            code="CH-7201"
            title="Conversations didn't load."
            body="Your messages are safe. Try again; the error has been reported."
            onRetry={api.refetchConvs}
          />
        ) : (api.convsLoading && !api.convs.length) || api.annLoading ? (
          <div className="ch-ms-sec__card" aria-busy="true" data-ch-code="CH-7402">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="ch-ms-row" style={{ cursor: "default" }}>
                <Skeleton width={36} height={36} radius={18} />
                <span style={{ display: "grid", gap: 7 }}>
                  <Skeleton width="60%" height={13} />
                  <Skeleton width="85%" height={12} />
                </span>
              </div>
            ))}
          </div>
        ) : !api.convs.length ? (
          <EmptyState
            code="CH-7301"
            compact
            icon={MessageSquare}
            title="No conversations yet."
            body={
              api.viewer.role === "coach"
                ? "Start one with a player, or create a team group."
                : "Message a coach or a teammate to start."
            }
            action={
              <Button size="sm" leftIcon={SquarePen} onClick={onNew}>
                New message
              </Button>
            }
          />
        ) : (
          <>
            {filter !== "groups" && <AnnouncementsSection api={api} q={q} />}
            {sections.map(([k, l]) => {
              const rows = list.filter(
                (c) => sectionOf(c.lastAt, api.now, api.timeZone) === k,
              );
              if (!rows.length) return null;
              return (
                <section key={k} className="ch-ms-sec" aria-label={l}>
                  <div className="ch-ms-sec__l">{l}</div>
                  <div className="ch-ms-sec__card">
                    {rows.map((c) => (
                      <ConvRow key={c.id} api={api} c={c} />
                    ))}
                  </div>
                </section>
              );
            })}
            {!list.length && (
              <div className="ch-ms-empty" data-ch-code="CH-7302">
                {q.trim()
                  ? `No conversation matches “${q.trim()}”.`
                  : "Nothing unread. You’re caught up."}
              </div>
            )}
            <MessageHits api={api} q={q} />
          </>
        )}
      </div>
    </aside>
  );
}

/* Thread */

export function Attachments({
  load,
  id,
  mine,
}: {
  load: ChMessagesApi["attachments"];
  id: string;
  mine: boolean;
}) {
  const [files, setFiles] = useState<ChAttachment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setFailed(false);
    load(id)
      .then((a) => live && (a ? setFiles(a) : setFailed(true)))
      .catch((err) => {
        chReport(err, { surface: "messages.attachments", severity: "low" });
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [load, id, attempt]);
  if (failed) {
    return (
      <button
        type="button"
        className="ch-ms-bub ch-ms-bub--file"
        data-ch-code="CH-7209"
        onClick={() => setAttempt((a) => a + 1)}
      >
        <span className="ch-ms-file__ic">
          <Icon icon={RotateCw} size={15} />
        </span>
        <span>
          <b>Attachment didn&apos;t load</b>
          <span>Tap to try again</span>
        </span>
      </button>
    );
  }
  if (!files)
    return (
      <span aria-busy="true" data-ch-code="CH-7408">
        <Skeleton width={240} height={54} radius={14} />
      </span>
    );
  return (
    <>
      {files.map((f) => (
        <a
          key={f.id}
          className="ch-ms-bub ch-ms-bub--file"
          href={f.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!f.url}
        >
          <span className="ch-ms-file__ic">
            <Icon icon={FileText} size={16} />
          </span>
          <span style={{ minWidth: 0 }}>
            <b>{f.name}</b>
            <span>{fileSize(f.size)}</span>
          </span>
          <Icon icon={Download} size={15} />
          {mine && <span className="ch-sr-only">Sent by you</span>}
        </a>
      ))}
    </>
  );
}

/**
 * Long press (the phone's stand-in for desktop's hover tools): 450ms without
 * moving opens the message's actions, with a press tick (CH-7704). A right
 * click or the context-menu key does the same.
 */
function useLongPress(onFire: (() => void) | undefined, onSwipe?: (direction: "left" | "right") => void) {
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
        if (Math.abs(e.clientY - o.y) > 24) origin.current = null;
      }
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const o = origin.current;
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
}: {
  api: ChMessagesApi;
  m: ChMsg;
  first: boolean;
  last: boolean;
  group: boolean;
  picking: boolean;
  setPicking: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Phone: the message's actions open in a sheet on a long press, in place of the hover tools. */
  onActions?: () => void;
  onReply?: () => void;
}) {
  const who = personOf(api, m.senderId);
  const [showTime, setShowTime] = useState(false);
  const press = useLongPress(m.failed ? undefined : onActions, onActions ? (direction) => {
    if (direction === "right") onReply?.();
    else setShowTime(true);
  } : undefined);
  // Desktop (no actions sheet): a right click opens the reaction bar, as the React button does (the board's gesture).
  const rightClick =
    !onActions && !m.failed
      ? {
          onContextMenu: (e: ReactMouseEvent) => {
            e.preventDefault();
            setPicking(true);
          },
        }
      : {};
  const reacts = api.reactions.get(m.id) ?? [];
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
  return (
    <div
      id={`ch-ms-message-${m.id}`}
      className={
        "ch-ms-msg" +
        (group ? " is-group" : "") +
        (m.mine ? " is-mine" : "") +
        (first ? " is-first" : "") +
        (last ? " is-last" : "") +
        (m.failed ? " is-failed" : "")
      }
    >
      {!m.mine && (
        <span className="ch-ms-msg__av">
          {last && <Avatar name={who?.name ?? "Member"} size={30} />}
        </span>
      )}
      <div className="ch-ms-msg__col">
        {!m.mine && first && group && (
          <span className="ch-ms-msg__who">
            {firstName(who?.name ?? "Member")}
          </span>
        )}
        <div className="ch-ms-msg__line">
          <div className="ch-ms-msg__stack" {...press} {...rightClick}>
            {m.replyToId && <ReplyQuote api={api} replyToId={m.replyToId} />}
            {m.text && <div className="ch-ms-bub">{m.text}</div>}
            {m.hasAttachments && (
              <Attachments load={api.attachments} id={m.id} mine={m.mine} />
            )}
          </div>
          {onActions && !m.failed && (
            <button
              type="button"
              className="ch-sr-only"
              data-ch-code="CH-7804"
              onClick={onActions}
            >
              Message actions
            </button>
          )}
          {!m.failed && !onActions && (
            <div className="ch-ms-msg__tools">
              <button
                type="button"
                className="ch-ms-tool"
                aria-label="React"
                aria-expanded={picking}
                onClick={() => setPicking(!picking)}
              >
                <Icon icon={SmilePlus} size={15} />
              </button>
              {m.mine && (
                <Menu
                  label="Message actions"
                  align={m.mine ? "end" : "start"}
                  items={[
                    { label: "Edit", icon: Pencil, onSelect: onEdit },
                    {
                      label: "Delete",
                      icon: Trash2,
                      danger: true,
                      onSelect: onDelete,
                    },
                  ]}
                  trigger={(p) => (
                    <button
                      type="button"
                      className="ch-ms-tool"
                      aria-label="More message actions"
                      {...p}
                    >
                      <Icon icon={Ellipsis} size={15} />
                    </button>
                  )}
                />
              )}
            </div>
          )}
          {picking && (
            <div className="ch-ms-reactbar" role="menu" aria-label="Reactions" /* CH-7603: it pops from the bubble */>
              {REACTIONS.map((r) => {
                const on = reacts.some((x) => x.key === r.key && x.mine);
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="menuitem"
                    className={"ch-ms-reactbar__b" + (on ? " is-on" : "")}
                    aria-label={`${on ? "Remove" : "React"} ${r.key.toLowerCase()}`}
                    onClick={() => {
                      haptic("select");
                      api.react(m.id, r.key, !on);
                      setPicking(false);
                    }}
                  >
                    <Icon icon={r.icon} size={16} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {reacts.length > 0 && (
          <div className="ch-ms-reacts">
            {reacts.map((r) => (
              <button
                key={r.key}
                type="button"
                className={"ch-ms-react ch-num" + (r.mine ? " is-mine" : "")}
                aria-label={`${r.key}, ${r.count}${r.mine ? ", including you" : ""}`}
                aria-pressed={r.mine}
                onClick={() => {
                  haptic("select");
                  api.react(m.id, r.key, !r.mine);
                }}
              >
                <Icon icon={REACTION_ICON[r.key]} size={12} />
                {r.count}
              </button>
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
              ? "Couldn’t confirm this sent. Check before sending again."
              : "Not sent."}
            <button
              type="button"
              onClick={() => api.retry(m.id)}
            >
              Retry
            </button>
            <button type="button" onClick={() => api.discard(m.id)}>
              Discard
            </button>
          </span>
        ) : (
          (last || showTime) && (
            <span className="ch-ms-msg__t ch-num">
              {clock(m.at, api.timeZone)}
              {m.edited ? " · Edited" : ""}
              {m.mine && !group && m.seen ? " · Seen" : ""}
            </span>
          )
        )}
      </div>
    </div>
  );
}

/** A parent outside the loaded history remains an honest unavailable reference. */
export function ReplyQuote({ api, replyToId }: { api: ChMessagesApi; replyToId: string }) {
  const parent = api.msgs.find((m) => m.id === replyToId);
  const name = parent ? (parent.mine ? "You" : personOf(api, parent.senderId)?.name ?? "Member") : "Reply";
  return (
    <button type="button" className="ch-ms-quote" aria-label={`Reply to ${name}`} disabled={!parent}
      onClick={() => document.getElementById(`ch-ms-message-${replyToId}`)?.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      })}>
      <b>{name}</b>
      <span>{!parent ? "Original message unavailable" : parent.deleted ? "Message deleted" : parent.text || (parent.hasAttachments ? "Attachment" : "Message")}</span>
    </button>
  );
}

/** At most this many files ride on one message. */
const MAX_ATTACHMENTS = 10;
export const addAttachments = (cur: File[], picked: File[]) =>
  [...cur, ...picked].slice(0, MAX_ATTACHMENTS);

/** The picked files as removable chips above a composer. */
export function AttachChips({
  files,
  onRemove,
  disabled = false,
}: {
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  if (!files.length) return null;
  return (
    <div className="ch-ms-to">
      {files.map((f, i) => (
        <span key={`${f.name}${i}`} className="ch-ms-to__c">
          <Icon icon={FileText} size={13} />
          {f.name}
          <button
            type="button"
            aria-label={`Remove ${f.name}`}
            disabled={disabled}
            onClick={() => onRemove(i)}
          >
            <Icon icon={X} size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * A composer's attach button and its hidden file picker. The type and size
 * limits are not checked here; they are checked when the files send
 * (`api.sendFiles`, CH-7101).
 */
export function AttachButton({
  phone = false,
  disabled,
  onPick,
}: {
  /** Phone: the design's "+", not the paperclip. */
  phone?: boolean;
  disabled?: boolean;
  onPick: (picked: File[]) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <IconButton
        icon={phone ? Plus : Paperclip}
        label="Attach a file"
        size="sm"
        disabled={disabled}
        onClick={() => input.current?.click()}
      />
      <input
        ref={input}
        type="file"
        disabled={disabled}
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) onPick(picked);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function Composer({
  api,
  conv,
  phone = false,
  initialDraft,
  initialFiles,
  autoSend = false,
  replyToId,
  onClearReply,
  onSendingChange,
}: {
  api: ChMessagesApi;
  conv: ChConv;
  /** Phone: the design's "+" attach button, and no keyboard hint. */
  phone?: boolean;
  /** A first message written before the conversation existed (the phone's New message). */
  initialDraft?: string;
  /** Files picked with that first message. */
  initialFiles?: File[];
  /** Send `initialDraft` and `initialFiles` as soon as the thread opens; a failure leaves them in the box (CH-7004). */
  autoSend?: boolean;
  replyToId?: string | null;
  onClearReply?: () => void;
  onSendingChange?: (sending: boolean) => void;
}) {
  const recovery = api.attachmentRecovery?.get(conv.id);
  const [unconfirmed, setUnconfirmed] = useState(!!recovery);
  const [resumed, setResumed] = useState<ChPendingAttachmentSend | null>(recovery?.resumed ?? null);
  const [checking, setChecking] = useState(!!api.loadPendingAttachmentSend);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [recoveredParent, setRecoveredParent] = useState(recovery?.replyToId ?? null);
  const effectiveParent = recoveredParent ?? replyToId;
  const queued = useRef({ text: recovery?.queuedText ?? "", files: recovery?.queuedFiles ?? [] as File[] });
  const [draft, setDraftState] = useState(recovery?.text ?? initialDraft ?? api.drafts.get(conv.id) ?? "");
  const setDraft = (text: string) => {
    setDraftState(text);
    if (text) api.drafts.set(conv.id, text);
    else api.drafts.delete(conv.id);
  };
  const [files, setFiles] = useState<File[]>(recovery?.files ?? initialFiles ?? []);
  const filesRef = useRef(files);
  filesRef.current = files;
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const typingTimer = useRef<number | null>(null);
  const ready = (draft.trim() || files.length || resumed) && !sending && !checking && !checkFailed;

  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 132)}px`;
  }, [draft]);

  useEffect(() => {
    if (!api.loadPendingAttachmentSend) return;
    let mounted = true;
    setChecking(true);
    setCheckFailed(false);
    onSendingChange?.(true);
    void api.loadPendingAttachmentSend().then((pending) => {
      if (!mounted) return;
      if (pending) {
        const cached = api.attachmentRecovery?.get(conv.id);
        if (!cached) queued.current = { text: api.drafts.get(conv.id) ?? draft, files: filesRef.current };
        setResumed(pending);
        setUnconfirmed(true);
        setRecoveredParent(pending.replyToId);
        setDraftState(pending.text);
        setFiles(cached?.files ?? []);
        api.attachmentRecovery?.set(conv.id, {
          text: pending.text, files: cached?.files ?? [], replyToId: pending.replyToId,
          queuedText: queued.current.text, queuedFiles: queued.current.files, resumed: pending,
        });
      }
      setChecking(false);
      onSendingChange?.(!!pending || !!recovery);
    }).catch(() => {
      if (!mounted) return;
      setChecking(false);
      setCheckFailed(true);
      // A failed check cannot prove a previous write absent: leave normal Send locked.
      onSendingChange?.(true);
    });
    return () => { mounted = false; };
  }, [conv.id, checkAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!ready || sendingRef.current) return;
    sendingRef.current = true;
    const text = draft.trim();
    const pending = files;
    const parentId = effectiveParent;
    const recoveredRequest = resumed;
    setSending(true);
    onSendingChange?.(true);
    // Recovery retries clear the visible original, while the later ordinary draft stays durable.
    if (unconfirmed || recoveredRequest) setDraftState("");
    else setDraft("");
    setFiles([]);
    api.onTyping(false);
    chTrail("messages send");
    const ok = recoveredRequest
      ? await (api.retryPendingAttachmentSend?.() ?? Promise.resolve("unknown" as const))
      : pending.length
      ? await (parentId ? api.sendFiles(text, pending, parentId) : api.sendFiles(text, pending))
      : await (parentId ? api.send(text, parentId) : api.send(text));
    sendingRef.current = false;
    setSending(false);
    if (ok === "unknown") {
      if (!unconfirmed) queued.current = { text: api.drafts.get(conv.id) ?? "", files: filesRef.current };
      api.attachmentRecovery?.set(conv.id, { text, files: pending, replyToId: parentId, queuedText: queued.current.text, queuedFiles: queued.current.files, resumed: recoveredRequest });
      setUnconfirmed(true);
      setRecoveredParent(parentId ?? null);
      setDraftState(text);
      // Persist only the later ordinary draft; the uncertain original belongs to its stored operation.
      if (queued.current.text) api.drafts.set(conv.id, queued.current.text);
      else api.drafts.delete(conv.id);
      setFiles(pending);
      onSendingChange?.(true);
      haptic("warning");
      ta.current?.blur();
      return;
    }
    api.attachmentRecovery?.delete(conv.id);
    setUnconfirmed(false);
    setResumed(null);
    if (recoveredRequest && ok !== true) {
      setMissingFiles(recoveredRequest.filenames.filter((name) => !pending.some((file) => file.name === name)));
    }
    if (unconfirmed) {
      setDraft(queued.current.text);
      setFiles(queued.current.files);
      queued.current = { text: "", files: [] };
    }
    onSendingChange?.(false);
    // Text failures retain their parent in the failed bubble; attachment failures stay in this composer.
    if (ok === true || (!pending.length && !recoveredRequest)) { setRecoveredParent(null); onClearReply?.(); }
    if (ok === true) haptic("success");
    else if (ok === "partial") {
      // The text was delivered; recover only the unsaved files, never duplicate that text.
      haptic("warning");
      setFiles((now) => [...pending, ...now]);
    } else {
      haptic("error");
      // A failed text stays in the thread as its own bubble, marked, with Retry (same id, so never a duplicate) and
      // Discard: putting it back in the box as well made a second send under a new id easy (owner 2026-10-01). A failed
      // attachment send has no bubble, so its text and files go back in the box, in front of anything typed since,
      // never over it (MSG-26). The drafts map mirrors the box and outlives it when the thread was switched meanwhile.
      if (pending.length || recoveredRequest) {
        const since = api.drafts.get(conv.id) ?? "";
        setDraft(since ? (text ? `${text}\n${since}` : since) : text);
        setFiles((now) => [...pending, ...now]);
      }
    }
    ta.current?.focus();
  };
  useEffect(() => {
    if (recovery && !api.loadPendingAttachmentSend) onSendingChange?.(true);
    // Restore the parent action lock when an unresolved composer remounts.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const autoRequested = useRef(autoSend && !!(initialDraft?.trim() || initialFiles?.length));
  const autoSent = useRef(false);
  useEffect(() => {
    if (!autoRequested.current || autoSent.current || checking || checkFailed || unconfirmed || resumed) return;
    autoSent.current = true;
    void send();
    // Keep the handed-over first message until the pending-send check permits it.
  }, [checking, checkFailed, unconfirmed, resumed]); // eslint-disable-line react-hooks/exhaustive-deps
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!phone && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };
  const label = conv.group ? conv.title : firstName(conv.title);
  return (
    <footer className="ch-ms-comp" aria-busy={checking || sending || undefined}>
      {checkFailed && <InlineNotice code="CH-7217" title="Couldn’t check a pending send" body="Try again before sending another message." onRetry={() => setCheckAttempt((n) => n + 1)} />}
      {unconfirmed && <InlineNotice code="CH-7023" title="Couldn't confirm this send" body="This send is unconfirmed. Retry send checks the original request; editing stays locked until its outcome is known." />}
      {effectiveParent && (
        <div className="ch-ms-comp__reply">
          <ReplyQuote api={api} replyToId={effectiveParent} />
          <IconButton icon={X} label="Cancel reply" onClick={() => { setRecoveredParent(null); onClearReply?.(); }} disabled={sending || unconfirmed || checking || checkFailed} />
        </div>
      )}
      {resumed && !files.length && <div className="ch-ms-to" aria-label="Pending attachments">{resumed.filenames.map((name, i) => <span key={`${name}-${i}`} className="ch-ms-to__c"><Icon icon={FileText} size={13} />{name}</span>)}</div>}
      {missingFiles.length > 0 && <div role="status" className="ch-ms-to" aria-label="Attachments to choose again">Choose these files again: {missingFiles.map((name, i) => <span key={`${name}-${i}`} className="ch-ms-to__c">{name}<button type="button" aria-label={`Dismiss ${name}`} onClick={() => setMissingFiles((now) => now.filter((_, j) => j !== i))}><Icon icon={X} size={12} /></button></span>)}</div>}
      <AttachChips
        disabled={unconfirmed || checking || checkFailed}
        files={files}
        onRemove={(i) => setFiles((s) => s.filter((_, j) => j !== i))}
      />
      <div className="ch-ms-comp__field">
        <AttachButton
          phone={phone}
          disabled={unconfirmed || checking || checkFailed}
          onPick={(picked) => { setFiles((s) => addAttachments(s, picked)); setMissingFiles((names) => names.filter((name) => !picked.some((file) => file.name === name))); }}
        />
        <textarea
          ref={ta}
          rows={1}
          // CH-7802: desktop Enter sends; phone Return adds a line and the Send button sends.
          aria-label={`Message ${label}`}
          placeholder={`Message ${label}`}
          value={draft}
          readOnly={unconfirmed || checking || checkFailed}
          onChange={(e) => {
            setDraft(e.target.value);
            api.onTyping(true);
            if (typingTimer.current) window.clearTimeout(typingTimer.current);
            typingTimer.current = window.setTimeout(
              () => api.onTyping(false),
              2500,
            );
          }}
          onKeyDown={onKey}
          enterKeyHint={phone ? "enter" : "send"}
        />
        <button
          type="button"
          className={"ch-ms-send" + (ready ? " is-ready" : "")}
          onClick={() => void send()}
          disabled={!ready}
          aria-label={unconfirmed ? "Retry send" : "Send"}
        >
          <Icon icon={unconfirmed ? RotateCw : ArrowUp} size={17} />
        </button>
      </div>
      {!phone && (
        <span className="ch-ms-comp__hint">
          Enter to send · Shift + Enter for a new line
        </span>
      )}
    </footer>
  );
}

function Thread({
  api,
  conv,
  detailsOpen,
  setDetails,
  onBack,
}: {
  api: ChMessagesApi;
  conv: ChConv;
  detailsOpen: boolean;
  setDetails: (v: boolean) => void;
  onBack: () => void;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChMsg | null>(null);
  const [deleting, setDeleting] = useState<ChMsg | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const items = useMemo(
    () => threadItems(api.msgs, api.now, api.timeZone),
    [api.msgs, api.now, api.timeZone],
  );
  // Schedule opens Calendar's New event editor (D-47). A direct thread with a
  // player invites that player alone (`with=`, D-52); a group or coach thread none.
  const other = !conv.group ? personOf(api, conv.memberIds[0] ?? "") : undefined;
  const scheduleWith = other?.role === "player" ? other.playerId : null;
  const calendarHref = rebuiltHref(
    `/golf/dashboard/calendar?new=1${scheduleWith ? `&with=${encodeURIComponent(scheduleWith)}` : ""}`,
    api.viewer.role,
  );

  // The thread follows its end only while the reader is there (audit T25); see useThreadAnchor.
  const anchor = useThreadAnchor(scroller, { convId: conv.id, count: api.msgs.length, lastMine: !!api.msgs.at(-1)?.mine, typing: api.typing });
  useEffect(() => setPicking(null), [conv.id]);
  useEffect(() => {
    if (!picking) return;
    const close = (e: Event) =>
      !(e.target as HTMLElement | null)?.closest?.(
        ".ch-ms-reactbar, .ch-ms-tool",
      ) && setPicking(null);
    const esc = (e: globalThis.KeyboardEvent) =>
      e.key === "Escape" && setPicking(null);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [picking]);

  const sub = conv.group
    ? `${conv.memberCount} members${
        conv.memberIds.length
          ? ` · ${conv.memberIds
              .slice(0, 3)
              .map((id) => firstName(personOf(api, id)?.name ?? "Member"))
              .join(", ")}${conv.memberIds.length > 3 ? " and more" : ""}`
          : ""
      }`
    : conv.subtitle;

  return (
    <section
      className="ch-ms-thread"
      aria-label={`Conversation with ${conv.title}`}
    >
      <header className="ch-ms-th">
        <div className="ch-ms-th__who">
          <span className="ch-ms-back">
            <IconButton
              icon={ChevronLeft}
              label="All conversations"
              onClick={onBack}
            />
          </span>
          {conv.group ? (
            <span className="ch-ms-grp is-lg">
              <Icon icon={Users} size={17} />
            </span>
          ) : (
            <Avatar name={conv.title} size={38} />
          )}
          <div style={{ minWidth: 0 }}>
            <b>{conv.title}</b>
            <span>{sub}</span>
          </div>
        </div>
        <div className="ch-ms-th__act">
          {calendarHref && api.viewer.role === "coach" && (
            <a
              className="ch-btn ch-btn--ghost ch-iconbtn"
              href={calendarHref}
              aria-label="Schedule"
              title="Schedule"
            >
              <Icon icon={CalendarPlus} size={16} />
            </a>
          )}
          <button
            type="button"
            className={
              "ch-btn ch-iconbtn " +
              (detailsOpen ? "ch-btn--secondary" : "ch-btn--ghost")
            }
            aria-label="Details"
            aria-pressed={detailsOpen}
            title="Details"
            onClick={() => {
              haptic("select");
              setDetails(!detailsOpen);
            }}
          >
            <Icon icon={conv.group ? Users : Info} size={16} />
          </button>
        </div>
      </header>
      <div
        className="ch-ms-scroll"
        ref={scroller}
        // CH-7601: a message that arrives or is sent eases in at the end of the thread, and is announced.
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="ch-ms-msgs">
          {api.msgsStale && (
            <InlineNotice
              code="CH-7216"
              title="This conversation may be out of date."
              body="It didn't refresh. What's here is what was last loaded. Try again; the error has been reported."
              onRetry={api.refetchMsgs}
            />
          )}
          {api.msgsError ? (
            <InlineNotice
              code="CH-7202"
              title="This conversation didn't load."
              body="Nothing was lost. Try again; the error has been reported."
              onRetry={api.refetchMsgs}
            />
          ) : api.msgsLoading && !api.msgs.length ? (
            <div
              style={{ display: "grid", gap: 12, paddingTop: 24 }}
              aria-busy="true"
              data-ch-code="CH-7403"
            >
              <Skeleton width="46%" height={40} radius={18} />
              <div style={{ justifySelf: "end", width: "52%" }}>
                <Skeleton width="100%" height={40} radius={18} />
              </div>
              <Skeleton width="38%" height={40} radius={18} />
            </div>
          ) : !api.msgs.length ? (
            <div className="ch-ms-empty" data-ch-code="CH-7304">
              No messages yet. Say hello to{" "}
              {conv.group ? "the group" : firstName(conv.title)}.
            </div>
          ) : (
            items.map((it) =>
              it.kind === "day" ? (
                <div key={it.key} className="ch-ms-day">
                  <span>{it.label}</span>
                </div>
              ) : (
                <Bubble
                  key={it.key}
                  api={api}
                  m={it.m}
                  first={it.first}
                  last={it.last}
                  group={conv.group}
                  picking={picking === it.m.id}
                  setPicking={(v) => setPicking(v ? it.m.id : null)}
                  onEdit={() => setEditing(it.m)}
                  onDelete={() => setDeleting(it.m)}
                />
              ),
            )
          )}
          {api.typing && (
            <div className="ch-ms-msg is-first" /* CH-7602: the typing dots */>
              {/* The realtime hook says someone is typing, not who: a direct thread knows, a group doesn't. */}
              <span className="ch-ms-msg__av">{!conv.group && <Avatar name={conv.title} size={30} />}</span>
              <div className="ch-ms-msg__col">
                <div
                  className="ch-ms-typing"
                  role="status"
                  aria-label={`${conv.group ? "Someone" : firstName(conv.title)} is typing`}
                >
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {anchor.unseen > 0 && (
        <button type="button" className="ch-ms-below" onClick={anchor.toEnd}>
          {anchor.unseen === 1 ? "1 new message" : `${anchor.unseen} new messages`}
        </button>
      )}
      <Composer key={conv.id} api={api} conv={conv} />

      <EditMessageModal api={api} message={editing} onClose={() => setEditing(null)} />
      <DeleteMessageModal api={api} message={deleting} onClose={() => setDeleting(null)} />
    </section>
  );
}

/** Edit your own message (desktop modal; a sheet on the phone). */
export function EditMessageModal({ api, message, onClose }: { api: ChMessagesApi; message: ChMsg | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (message) setText(message.text);
  }, [message]);
  return (
    <Modal
      open={message != null}
      onClose={onClose}
      icon={Pencil}
      title="Edit message"
      description="Everyone in the conversation sees it marked as edited."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !text.trim()}
            onClick={async () => {
              if (!message) return;
              setBusy(true);
              const ok = await api.edit(message.id, text.trim());
              setBusy(false);
              if (ok) onClose();
            }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <textarea
        className="ch-textarea"
        rows={4}
        aria-label="Message"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </Modal>
  );
}

/** Delete your own message, after a confirm (CH-7501). */
export function DeleteMessageModal({ api, message, onClose }: { api: ChMessagesApi; message: ChMsg | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      code="CH-7501"
      open={message != null}
      onClose={onClose}
      icon={Trash2}
      title="Delete this message?"
      description="It's removed for everyone in the conversation. This can't be undone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            feel="warning"
            disabled={busy}
            onClick={async () => {
              if (!message) return;
              setBusy(true);
              const ok = await api.remove(message.id);
              setBusy(false);
              if (ok) onClose();
            }}
          >
            {busy ? "Deleting…" : "Delete message"}
          </Button>
        </>
      }
    />
  );
}

/** Leave a group you didn't create, after a confirm (CH-7502). */
export function LeaveGroupModal({ api, conv, open, onClose, onLeft }: { api: ChMessagesApi; conv: ChConv; open: boolean; onClose: () => void; onLeft: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      code="CH-7502"
      open={open}
      onClose={onClose}
      icon={LogOut}
      title={`Leave ${conv.title}?`}
      description="You stop getting its messages. Someone in the group can add you back."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Stay
          </Button>
          <Button
            variant="danger"
            feel="warning"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await api.leave();
              setBusy(false);
              if (ok) {
                onClose();
                onLeft();
              }
            }}
          >
            {busy ? "Leaving…" : "Leave group"}
          </Button>
        </>
      }
    />
  );
}

/**
 * The group's creator adds teammates or coaches who aren't in it yet (D-47),
 * on desktop and phone: the candidates load when it opens (CH-7410), a failed
 * load says so with Try again (CH-7215), nobody left says so (CH-7307), and a
 * failed add is toasted (CH-7018).
 */
export function AddMembersModal({ api, conv, open, onClose }: { api: ChMessagesApi; conv: ChConv; open: boolean; onClose: () => void }) {
  const [people, setPeople] = useState<ChMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = api.addCandidates;
  useEffect(() => {
    if (!open) return;
    let live = true;
    setPeople(null);
    setFailed(false);
    setAdded([]);
    load()
      .then((r) => live && (r ? setPeople(r) : setFailed(true)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, attempt, load]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={UserPlus}
      title={`Add to ${conv.title}`}
      description="Players and coaches on the team who aren't in this group."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {failed ? (
        <InlineNotice
          code="CH-7215"
          title="The team list didn't load."
          body="Try again; the error has been reported."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : !people ? (
        <div style={{ display: "grid", gap: 10 }} aria-busy="true" data-ch-code="CH-7410">
          <Skeleton height={30} />
          <Skeleton height={30} />
          <Skeleton height={30} />
        </div>
      ) : !people.length ? (
        <p className="ch-ms-quiet" data-ch-code="CH-7307">
          Everyone on the team is already in this group.
        </p>
      ) : (
        <div className="ch-ms-pick" aria-label="People to add">
          {people.map((p) => {
            const done = added.includes(p.userId);
            return (
              <div key={p.userId} className="ch-pp__row">
                <Avatar name={p.name} size={28} />
                <span className="ch-pp__name">
                  <b>{p.name}</b>
                  <span>{p.subtitle}</span>
                </span>
                <button
                  type="button"
                  className={"ch-btn ch-btn--sm " + (done ? "ch-btn--ghost" : "ch-btn--secondary")}
                  disabled={done || busy === p.userId}
                  aria-label={done ? `${p.name} added` : `Add ${p.name}`}
                  onClick={async () => {
                    setBusy(p.userId);
                    const ok = await api.addMember(p.userId, p.name);
                    setBusy(null);
                    if (ok) setAdded((a) => [...a, p.userId]);
                  }}
                >
                  {done ? "Added" : busy === p.userId ? "Adding…" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* Details */

function Details({
  api,
  conv,
  onClose,
}: {
  api: ChMessagesApi;
  conv: ChConv;
  onClose: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const mayAdd = conv.group && conv.creatorId === api.viewer.userId;
  const other = !conv.group
    ? personOf(api, conv.memberIds[0] ?? "")
    : undefined;
  const statsHref = rebuiltHref("/golf/dashboard/stats", api.viewer.role);
  return (
    <aside
      className="ch-ms-det"
      aria-label={conv.group ? "Group details" : "Details"}
    >
      <div className="ch-ms-det__head">
        <b>{conv.group ? "Group details" : "Details"}</b>
        <IconButton
          icon={X}
          label="Close details"
          size="sm"
          onClick={onClose}
        />
      </div>
      <div className="ch-ms-det__hero">
        {conv.group ? (
          <span className="ch-ms-grp is-xl">
            <Icon icon={Users} size={22} />
          </span>
        ) : (
          <Avatar name={conv.title} size={64} ring />
        )}
        <b>{conv.title}</b>
        <span>
          {conv.group ? `Group · ${conv.memberCount} members` : conv.subtitle}
        </span>
      </div>
      <MuteControl api={api} />
      {!conv.group &&
        other?.role === "player" &&
        other.playerId &&
        api.viewer.role === "coach" &&
        statsHref && (
          <div className="ch-ms-det__sec">
            <Button
              size="sm"
              href={`${statsHref}?player=${encodeURIComponent(other.playerId)}`}
            >
              View stats
            </Button>
          </div>
        )}
      {conv.group && (
        <div className="ch-ms-det__sec">
          <div className="ch-ms-det__l">
            <span>{conv.memberCount} members</span>
            {mayAdd && (
              <Button size="sm" variant="ghost" leftIcon={UserPlus} onClick={() => setAdding(true)}>
                Add
              </Button>
            )}
          </div>
          {api.membersError ? (
            <InlineNotice
              code="CH-7204"
              title="Members didn't load."
              body="Try again; the error has been reported."
              onRetry={api.retryMembers}
            />
          ) : !api.members ? (
            <div
              style={{ display: "grid", gap: 10 }}
              aria-busy="true"
              data-ch-code="CH-7405"
            >
              <Skeleton height={30} />
              <Skeleton height={30} />
              <Skeleton height={30} />
            </div>
          ) : (
            api.members.map((mb) => (
              <div key={mb.userId} className="ch-ms-mem">
                <Avatar name={mb.name} size={30} />
                <span style={{ minWidth: 0 }}>
                  <b>
                    {mb.name}
                    {mb.userId === api.viewer.userId ? " (you)" : ""}
                  </b>
                  <span>{mb.subtitle}</span>
                </span>
                {mb.userId === conv.creatorId ? (
                  <Badge tone="neutral">Admin</Badge>
                ) : (
                  <span />
                )}
              </div>
            ))
          )}
        </div>
      )}
      <FilesSection api={api} conv={conv} />
      {conv.group && conv.creatorId !== api.viewer.userId && (
        <div className="ch-ms-det__sec">
          <Button
            variant="danger"
            leftIcon={LogOut}
            onClick={() => setLeaving(true)}
          >
            Leave group
          </Button>
        </div>
      )}
      <LeaveGroupModal api={api} conv={conv} open={leaving} onClose={() => setLeaving(false)} onLeft={onClose} />
      {mayAdd && <AddMembersModal api={api} conv={conv} open={adding} onClose={() => setAdding(false)} />}
    </aside>
  );
}

/**
 * The conversation's shared files (D-48), newest first: loading (CH-7409),
 * didn't load (CH-7214), none yet (CH-7306). A row opens the file (CH-7021 when
 * it will not). The phone's Files panel reads through the same hook.
 */
function FilesSection({ api, conv }: { api: ChMessagesApi; conv: ChConv }) {
  const { files, failed, retry, open } = useConversationFiles(api, conv);
  return (
    <div className="ch-ms-det__sec">
      <div className="ch-ms-det__l">
        <span>Files</span>
        {files && files.length > 0 && <span className="ch-num">{files.length}</span>}
      </div>
      {failed ? (
        <InlineNotice
          code="CH-7214"
          title="Files didn't load."
          body="Your messages are fine. Try again; the error has been reported."
          onRetry={retry}
        />
      ) : !files ? (
        <div aria-busy="true" data-ch-code="CH-7409">
          <Skeleton height={34} />
        </div>
      ) : !files.length ? (
        <p className="ch-ms-det__none" data-ch-code="CH-7306">
          No files shared yet.
        </p>
      ) : (
        files.map((f) => (
          <button
            key={f.id}
            type="button"
            className="ch-ms-fil"
            onClick={() => void open(f)}
          >
            <span className="ch-ms-file__ic">
              <Icon icon={FileText} size={15} />
            </span>
            <span style={{ minWidth: 0 }}>
              <b>{f.name}</b>
              <span className="ch-num">{fileMeta(f, api)}</span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function MuteControl({ api }: { api: ChMessagesApi }) {
  const [busy, setBusy] = useState(false);
  const m = api.mute;
  const set = async (muted: boolean, hours: number | null) => {
    setBusy(true);
    await api.setMute(muted, hours);
    setBusy(false);
  };
  return (
    <div className="ch-ms-det__sec">
      <div className="ch-ms-det__l">
        <span>Notifications</span>
      </div>
      {api.muteError ? (
        <InlineNotice
          code="CH-7208"
          title="The mute setting didn't load."
          body="Try again; the error has been reported."
          onRetry={api.retryMute}
        />
      ) : !m ? (
        <div aria-busy="true" data-ch-code="CH-7407">
          <Skeleton height={30} />
        </div>
      ) : m.muted ? (
        <div className="ch-ms-mute">
          <span>
            <Icon icon={BellOff} size={15} />
            {m.until
              ? `Muted until ${dayLabel(m.until, api.now, api.timeZone).replace("Today", "today")} · ${clock(m.until, api.timeZone)}`
              : "Muted until you turn it back on"}
          </span>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void set(false, null)}
          >
            Unmute
          </Button>
        </div>
      ) : (
        <>
          <p className="ch-ms-quiet">
            No email, push or bell for this conversation. Unread messages still
            show here.
          </p>
          <div className="ch-ms-mute__opts">
            <Button size="sm" disabled={busy} onClick={() => void set(true, 8)}>
              Mute 8 hours
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void set(true, 24 * 7)}
            >
              Mute a week
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void set(true, null)}
            >
              Until I turn it on
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* New message */

function NewMessage({
  api,
  open,
  onClose,
}: {
  api: ChMessagesApi;
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"direct" | "group" | "announce">("direct");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [ack, setAck] = useState(true);
  const [to, setTo] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setMode("direct");
    setTo([]);
    setQ("");
    setTitle("");
    setBody("");
    setUrgent(false);
    setAck(true);
    setTouched(false);
  }, [open]);
  const coachGroup = mode === "group" && api.viewer.role === "coach";
  // A coach's group can include other coaches (D-45): they're added right after it's created.
  const people = api.directory.filter((p) =>
    p.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const toggle = (id: string) => {
    haptic("select");
    setTo(
      mode === "direct"
        ? [id]
        : to.includes(id)
          ? to.filter((x) => x !== id)
          : [...to, id],
    );
  };
  const announce = mode === "announce";
  const needsTitle = (coachGroup || announce) && !title.trim();
  const needsBody = announce && !body.trim();
  const canGo = announce
    ? !needsTitle && !needsBody
    : mode === "direct"
      ? to.length === 1
      : to.length >= 1 && !needsTitle;
  const go = async () => {
    setTouched(true);
    if (!canGo) {
      haptic("warning");
      return;
    }
    setBusy(true);
    const ok = announce
      ? await api.createAnnouncement({
          title: title.trim(),
          body: body.trim(),
          urgent,
          ack,
        })
      : mode === "direct"
        ? await api.startDirect(to[0]!)
        : await api.createGroup(to, title.trim());
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      icon={announce ? Megaphone : SquarePen}
      title={announce ? "New announcement" : "New message"}
      description={
        announce
          ? `Goes to everyone on ${api.teamName ?? "the team"}. Players can acknowledge it.`
          : `Only players and coaches${api.teamName ? ` on ${api.teamName}` : " on your team"} can be messaged.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void go()}>
            {busy
              ? announce
                ? "Posting…"
                : "Starting…"
              : announce
                ? "Post announcement"
                : mode === "group"
                  ? "Create group"
                  : "Start conversation"}
          </Button>
        </>
      }
    >
      <div className="ch-ms-new">
        {api.viewer.role === "coach" && (
          <Segmented<"direct" | "group" | "announce">
            label="Message type"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setTo([]);
              setTouched(false);
            }}
            options={[
              { value: "direct", label: "Direct" },
              { value: "group", label: "Group" },
              { value: "announce", label: "Announcement" },
            ]}
          />
        )}
        {announce ? (
          <>
            <label className="ch-field">
              <span className="ch-field__label">Title</span>
              <input
                className="ch-input"
                placeholder="Bus time moved to 6:00"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                aria-invalid={touched && needsTitle}
              />
              {touched && needsTitle && (
                <span className="ch-field__help is-error" data-ch-code="CH-7102">
                  Give the announcement a title.
                </span>
              )}
            </label>
            <label className="ch-field">
              <span className="ch-field__label">Message</span>
              <textarea
                className="ch-textarea"
                rows={4}
                placeholder="What the team needs to know, and by when"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={5000}
                aria-invalid={touched && needsBody}
              />
              {touched && needsBody && (
                <span className="ch-field__help is-error" data-ch-code="CH-7103">
                  Write what the team needs to know.
                </span>
              )}
            </label>
            <div className="ch-ms-mute__opts" style={{ gap: 24 }}>
              <label className="ch-switch">
                <input
                  type="checkbox"
                  checked={urgent}
                  onChange={(e) => (
                    haptic("select"),
                    setUrgent(e.target.checked)
                  )}
                />
                <span className="ch-switch__t" aria-hidden="true" />
                Urgent
              </label>
              <label className="ch-switch">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => (haptic("select"), setAck(e.target.checked))}
                />
                <span className="ch-switch__t" aria-hidden="true" />
                Ask players to acknowledge
              </label>
            </div>
          </>
        ) : (
          <>
            {coachGroup && (
              <label className="ch-field">
                <span className="ch-field__label">Group name</span>
                <input
                  className="ch-input"
                  placeholder="Pinehurst travel"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  aria-invalid={touched && needsTitle}
                />
                {touched && needsTitle && (
                  <span className="ch-field__help is-error" data-ch-code="CH-7104">
                    Name the group so players know what it&apos;s for.
                  </span>
                )}
              </label>
            )}
            <SearchField
              value={q}
              onChange={setQ}
              placeholder="Find a player or coach"
              label="Find people"
            />
            {mode === "group" && to.length > 0 && (
              <div className="ch-ms-to">
                {to.map((id) => {
                  const p = personOf(api, id);
                  return (
                    <span key={id} className="ch-ms-to__c">
                      <Avatar name={p?.name ?? "Member"} size={20} />
                      {firstName(p?.name ?? "Member")}
                      <button
                        type="button"
                        aria-label={`Remove ${p?.name ?? "member"}`}
                        onClick={() => toggle(id)}
                      >
                        <Icon icon={X} size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {api.directoryError ? (
              <InlineNotice
                code="CH-7205"
                title="Your team list didn't load."
                body="Try again; the error has been reported."
                onRetry={api.retryDirectory}
              />
            ) : (
              <div
                className="ch-ms-pick"
                role="listbox"
                aria-multiselectable={mode === "group"}
                aria-label="People"
              >
                {people.map((p) => {
                  const on = to.includes(p.userId);
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className="ch-pp__row"
                      onClick={() => toggle(p.userId)}
                    >
                      <Avatar name={p.name} size={28} />
                      <span className="ch-pp__name">
                        <b>{p.name}</b>
                        <span>{p.subtitle}</span>
                      </span>
                      {mode === "group" ? (
                        <span className={"ch-pp__box" + (on ? " is-on" : "")}>
                          {on && <Icon icon={Check} size={12} />}
                        </span>
                      ) : on ? (
                        <Icon icon={Check} size={15} />
                      ) : (
                        <span />
                      )}
                    </button>
                  );
                })}
                {!people.length && (
                  <div className="ch-pp__empty">
                    {q.trim()
                      ? `No one matches “${q.trim()}”.`
                      : "No one to message yet."}
                  </div>
                )}
              </div>
            )}
            {touched && !canGo && !needsTitle && (
              <span className="ch-field__help is-error" data-ch-code="CH-7105">
                {mode === "direct"
                  ? "Choose who to message."
                  : "Choose at least one person."}
              </span>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function MessagesDesktop({ api }: { api: ChMessagesApi }) {
  const [details, setDetails] = useState(false);
  const [compose, setCompose] = useState(false);
  const conv = api.convs.find((c) => c.id === api.selectedId) ?? null;
  const ann = api.announcements.find((a) => a.id === api.selectedAnnId) ?? null;
  useEffect(() => setDetails(false), [api.selectedId]);

  if (isMessagesFirstRun(api) && !conv && !ann) {
    return (
      <main data-view="desktop" className="ch-ms ch-ms--first">
        <MessagesFirstRun coach={api.viewer.role === "coach"} onNew={() => setCompose(true)} />
        <NewMessage api={api} open={compose} onClose={() => setCompose(false)} />
      </main>
    );
  }

  return (
    <main
      data-view="desktop"
      className={
        "ch-ms" +
        (conv || ann ? " has-open" : "") +
        (details && conv ? " has-details" : "")
      }
    >
      <SectionBoundary
        surface="messages.rail"
        label="Your conversations"
        code="CH-7210"
      >
        <Rail api={api} onNew={() => setCompose(true)} />
      </SectionBoundary>
      {ann ? (
        <SectionBoundary
          surface="messages.announcement"
          label="This announcement"
          code="CH-7211"
        >
          <AnnouncementPane
            api={api}
            a={ann}
            onBack={() => api.selectAnn(null)}
          />
        </SectionBoundary>
      ) : conv ? (
        <SectionBoundary
          surface="messages.thread"
          label="This conversation"
          code="CH-7212"
        >
          <Thread
            api={api}
            conv={conv}
            detailsOpen={details}
            setDetails={setDetails}
            onBack={() => api.select(null)}
          />
        </SectionBoundary>
      ) : (
        <section className="ch-ms-thread is-empty">
          <EmptyState
            code="CH-7305"
            icon={MessageSquare}
            title={
              api.convs.length
                ? "Pick a conversation."
                : "Start your first conversation."
            }
            body={
              api.convs.length
                ? "Threads open here, with replies as they arrive."
                : "Message a player, a coach or the whole team."
            }
            action={
              <Button
                variant="primary"
                leftIcon={SquarePen}
                onClick={() => setCompose(true)}
              >
                New message
              </Button>
            }
          />
        </section>
      )}
      {conv && details && (
        <SectionBoundary
          surface="messages.details"
          label="Details"
          code="CH-7213"
        >
          <Details api={api} conv={conv} onClose={() => setDetails(false)} />
        </SectionBoundary>
      )}
      <NewMessage api={api} open={compose} onClose={() => setCompose(false)} />
    </main>
  );
}
