"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  ChevronLeft,
  Download,
  Ellipsis,
  FileText,
  Heart,
  Info,
  Laugh,
  LogOut,
  Paperclip,
  PartyPopper,
  Pencil,
  Reply,
  RotateCw,
  SmilePlus,
  SquarePen,
  ThumbsUp,
  HandHeart,
  Trash2,
  Mail,
  MailOpen,
  Users,
  X,
  Check,
  MessageSquare,
  Search,
  BellOff,
  Megaphone,
  Plus,
  UserMinus,
  UserPlus,
  createLucideIcon,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m as M } from "motion/react";
import { chTween } from "../../lib/motion";
import type { ChClock } from "../../lib/clock-cookie";
import { useThreadAnchor } from "./use-thread-anchor";
import { useComposerInset } from "./composer-inset";
import { useFocusMessage } from "./use-focus-message";
import { useChReducedMotion } from "../../lib/reduced-motion";
import { Avatar } from "../../ui/Avatar";
import { Badge } from "../../ui/Badge";
import { Button, IconButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { Menu } from "../../ui/Menu";
import { useContextMenu, type ContextMenuBind } from "../../ui/ContextMenu";
import { SwipeRow } from "../../ui/SwipeRow";
import { Modal } from "../../ui/Modal";
import { InlineNotice } from "../../ui/Notices";
import { SearchField } from "../../ui/SearchField";
import { SectionBoundary } from "../../ui/SectionBoundary";
import { Segmented } from "../../ui/Segmented";
import { Swap } from "../../ui/Swap";
import { PlayerPeek } from "../../ui/PlayerPeek";
import { EmptyState, Skeleton } from "../../ui/States";
import { RailEmpty } from "./RailEmpty";
import { useToast } from "../../ui/Toast";
import { haptic } from "../../lib/haptics";
import { isNativeApp, openExternalUrl } from "@/lib/utils/capacitor";
import { usePanelSmoothScroll } from "../../lib/smooth-scroll";
import { chReport, chTrail } from "../../lib/track";
import { rebuiltHref } from "../../shell/nav";
import {
  clock,
  filterConvs,
  firstName,
  firstUnreadId,
  groupLacksPlayer,
  isUnread,
  linkParts,
  MESSAGE_MAX,
  railTime,
  searchSnippet,
  sectionOf,
  threadItems,
  untilLabel,
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
import { MessagesHead } from "./MessagesNoTeam";
import { Tooltip } from '../../ui/Tooltip';
import { ListPresence, PresenceRow } from '../../ui/ListPresence';
import { useRovingRows } from "../../lib/roving";
import { usePageKeys, type ChPageKey } from "../../shell/command/page-keys";
import { plural } from "../../lib/plural";

/** B11: the rail's keys, as the shortcuts sheet lists them. */
const RAIL_KEYS: readonly ChPageKey[] = [{ label: "Move between conversations", keys: ["Up", "Down"] }];

/** The thread's glide, longer than the page's (a conversation is read down a long column). */
const THREAD_SCROLL_DUR = 1.2;

/** Surprised (the 😮 reaction) in Lucide's face set: Lucide has no open-mouthed face, and Frown read as sad. */
const Surprised = createLucideIcon("face-surprised", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "face" }],
  ["path", { d: "M9 10V9", key: "eye-l" }],
  ["path", { d: "M15 10V9", key: "eye-r" }],
  ["circle", { cx: "12", cy: "15.5", r: "2", key: "mouth" }],
]);

export const REACTIONS: Array<{ key: ChReactionKey; icon: LucideIcon }> = [
  { key: "Like", icon: ThumbsUp },
  { key: "Love", icon: Heart },
  { key: "Laugh", icon: Laugh },
  { key: "Celebrate", icon: PartyPopper },
  { key: "Surprised", icon: Surprised },
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
  /** Coaches by golf_coaches.id, for an announcement's signature (P007-A1). */
  signers?: Record<string, { name: string; title: string }>;
  timeZone: string;
  /** The device's clock for message times; a test's partial api leaves it out and times read in 12 hours. */
  clock?: ChClock;
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
  /**
   * Hides a conversation from the viewer's own inbox (CH-7025 when it fails): the open one's details, or any row's
   * menu and the phone's trailing swipe (owner decision 14). Null until the database supports it.
   */
  deleteConversation: ((conversationId: string) => Promise<boolean>) | null;
  /** The open group's creator only: who on the team isn't in it yet, and adding one (D-47). */
  addCandidates: () => Promise<ChMember[] | null>;
  addMember: (userId: string, name: string) => Promise<boolean>;
  /**
   * The open group's creator only, never on their own row (removeGolfGroupMember, as Fairway's group details allow):
   * after a confirm (CH-7504) the row leaves at once and comes back if the server refuses (CH-7024). Absent in the
   * preview.
   */
  removeMember?: (userId: string, name: string) => Promise<boolean>;
  /** The open conversation's shared files, newest first (D-48). */
  files: (conversationId: string) => Promise<ChFile[] | null>;

  directory: ChPerson[];
  directoryError: boolean;
  retryDirectory: () => void;
  startDirect: (userId: string) => Promise<boolean>;
  createGroup: (userIds: string[], title: string) => Promise<boolean>;
  /** A prefilled message (prefill.ts) waiting for New message: who it's to (user ids), the draft and the group's name. */
  prefill?: { to: string[]; draft: string; title: string } | null;
  clearPrefill?: () => void;

  searchMessages: (q: string) => Promise<ChSearchHit[] | null>;
  openHit: (hit: ChSearchHit) => void;
  /** A search hit the open thread should go to (useFocusMessage); the end-anchor is paused while it is set. */
  focusMessageId?: string | null;
  /** The hit the thread came to, marked for a moment (FOUND_FOR_MS). */
  foundMessageId?: string | null;
  /** The thread came to the hit (its id), or gave up on one outside the loaded history (null). */
  messageFocused?: (id: string | null) => void;

  mute: ChMute | null;
  muteError: boolean;
  retryMute: () => void;
  setMute: (muted: boolean, hours: number | null) => Promise<boolean>;
  /** Any conversation's mute, read when a row's Mute sheet opens (owner decision 14); null when it didn't load. */
  muteOf: (conversationId: string) => Promise<ChMute | null>;
  /** Mutes or unmutes any conversation by id, from a row's menu; the open one's `mute` follows. */
  muteConversation: (conversationId: string, muted: boolean, hours: number | null) => Promise<boolean>;
  /**
   * A row's Mark as read / Mark as unread (owner decision 14). Read clears the server's count (markGolfMessagesAsRead);
   * unread is this device's own mark (marked-unread.ts), cleared when the conversation opens.
   */
  setRead: (conversationId: string, read: boolean) => Promise<boolean>;

  announcements: ChAnnouncement[];
  /** The first announcements read hasn't answered: the list waits, so they don't push it down when they land (CLS). */
  annLoading?: boolean;
  annError: boolean;
  refetchAnns: () => void;
  selectedAnnId: string | null;
  selectAnn: (id: string | null) => void;
  announcementDetail: (id: string) => Promise<ChAnnouncementDetail | null>;
  /**
   * A signed link to an announcement's attached document (getPreviewUrl), asked for at the tap; `url: null` when it
   * can't be had (`noContent`: the document has no stored file). Absent in the preview, which opens its fixture's `url`.
   */
  openAnnouncementDocument?: (documentId: string) => Promise<{ url: string | null; noContent?: boolean }>;
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

/** B19: a direct conversation's coin takes the other person's tone, from the id their coin has everywhere (a player's
 *  player id, else a coach's user id); a group has none. */
export const convAvatarId = (api: ChMessagesApi, c: ChConv): string | null => {
  if (c.group) return null;
  const other = c.memberIds.find((id) => id !== api.viewer.userId);
  return other ? (personOf(api, other)?.playerId ?? other) : null;
};

/**
 * P003-C1: for the coach, a player's avatar and name in a thread peek at the player, from the team directory Messages
 * already holds. The bubble keeps its own hold (message actions); coaches and people off the roster don't peek.
 */
function SenderPeek({ api, who, children }: { api: ChMessagesApi; who: ChPerson | undefined; children: ReactNode }) {
  if (api.viewer.role !== "coach" || who?.role !== "player" || !who.playerId) return <>{children}</>;
  return <PlayerPeek player={{ id: who.playerId, name: who.name, sub: who.subtitle || null }}>{children}</PlayerPeek>;
}

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
          title="Message search didn’t load"
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
        <EmptyState compact kind="filtered" code="CH-7303" title={`No messages mention “${term}”`} />
      ) : (
        <div className="ch-ms-sec__card">
          {hits.slice(0, 20).map((h) => {
            // The row is one line: it opens just before the match, which is marked (wave 5 #11).
            const cut = searchSnippet(h.text, term);
            return (
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
                    {railTime(h.at, api.now, api.timeZone, api.clock)}
                  </span>
                </span>
                <span className="ch-ms-row__bot">
                  <span>
                    <em>{h.senderName}: </em>
                    {cut.before}
                    {cut.match && <mark className="ch-ms-hit">{cut.match}</mark>}
                    {cut.after}
                  </span>
                </span>
              </span>
            </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** One conversation in the list: the desktop rail and the phone inbox. */
export function ConvRow({ api, c, avatarSize = 36, phone = false }: { api: ChMessagesApi; c: ChConv; avatarSize?: number; phone?: boolean }) {
  const open = () => {
    haptic("select");
    chTrail("messages open conversation");
    api.select(c.id);
  };
  const unread = isUnread(c);
  // The row's own sheets, mounted once first asked for, so a long inbox doesn't hold two dialogs per row.
  const [muting, setMuting] = useState<boolean | null>(null);
  const [deleting, setDeleting] = useState<boolean | null>(null);
  const toggleRead = () => {
    chTrail(unread ? "messages mark read" : "messages mark unread");
    void api.setRead(c.id, unread);
  };
  const askDelete = api.deleteConversation ? () => setDeleting(true) : null;
  // Owner decision 14: the row's actions, each on this row's conversation whether or not it is the open one. Right-click
  // and Shift+F10 on the desktop; on the phone a 500ms long press, a keyboard's Shift+F10 or the VoiceOver button below
  // open the same rows as a sheet (ui/ContextMenu.tsx). The phone's swipes repeat Mark as read/unread and Delete.
  const ctx = useContextMenu<ChConv>({
    label: (row) => `Actions for ${row.title}`,
    title: (row) => row.title,
    touchHold: phone,
    items: () => [
      { label: "Open conversation", icon: MessageSquare, onSelect: open },
      { label: unread ? "Mark as read" : "Mark as unread", icon: unread ? MailOpen : Mail, onSelect: toggleRead },
      { label: "Mute…", icon: BellOff, onSelect: () => setMuting(true) },
      ...(askDelete ? [{ kind: "separator" as const }, { label: "Delete", icon: Trash2, danger: true, onSelect: askDelete }] : []),
    ],
  });
  const sheets = (
    <>
      {ctx.menu}
      {muting != null && <RowMuteModal api={api} c={c} open={muting} onClose={() => setMuting(false)} />}
      {deleting != null && <DeleteConversationModal api={api} conv={c} open={deleting} onClose={() => setDeleting(false)} onDeleted={() => {}} />}
    </>
  );
  if (!phone) {
    return (
      <>
        <ConvRowButton api={api} c={c} avatarSize={avatarSize} onOpen={open} bind={ctx.bind(c)} />
        {sheets}
      </>
    );
  }
  return (
    <>
      <SwipeRow
        className="ch-ms-swipe"
        onClaim={ctx.cancelHold}
        leading={{ label: unread ? "Read" : "Unread", icon: unread ? MailOpen : Mail, tone: "accent", run: toggleRead }}
        trailing={askDelete && { label: "Delete", icon: Trash2, tone: "danger", run: askDelete }}
      >
        <ConvRowButton api={api} c={c} avatarSize={avatarSize} onOpen={open} bind={ctx.bind(c)} plain />
        {/* VoiceOver and a keyboard can't swipe or hold: the same actions, one control away (shown when focused). */}
        <span className="ch-sr-only ch-sr-only--focusable">
          <button type="button" onClick={() => ctx.openSheet(c)}>
            Actions for {c.title}
          </button>
        </span>
      </SwipeRow>
      {sheets}
    </>
  );
}

/**
 * Mute or unmute one conversation from its row (owner decision 14): reads that conversation's mute as it opens, then
 * offers desktop's three lengths, or Unmute when it is already muted.
 */
function RowMuteModal({ api, c, open, onClose }: { api: ChMessagesApi; c: ChConv; open: boolean; onClose: () => void }) {
  const [state, setState] = useState<ChMute | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const muteOf = api.muteOf;
  useEffect(() => {
    if (!open) return;
    let live = true;
    setState(null);
    void muteOf(c.id).then((m) => {
      if (live) setState(m ?? "failed");
    });
    return () => {
      live = false;
    };
  }, [open, attempt, c.id, muteOf]);
  const set = async (muted: boolean, hours: number | null) => {
    setBusy(true);
    const ok = await api.muteConversation(c.id, muted, hours);
    setBusy(false);
    if (ok) onClose();
  };
  const muted = state != null && state !== "failed" && state.muted;
  return (
    <Modal
      code="CH-7607"
      open={open}
      onClose={onClose}
      icon={BellOff}
      title={muted ? `${c.title} is muted` : `Mute ${c.title}`}
      description={muted ? undefined : "No email, push or bell for it. Unread messages still show here."}
    >
      {state === "failed" ? (
        <InlineNotice code="CH-7208" title="The mute setting didn’t load" body="Try again." onRetry={() => setAttempt((n) => n + 1)} />
      ) : !state ? (
        <div aria-busy="true" data-ch-code="CH-7407">
          <Skeleton height={30} />
        </div>
      ) : state.muted ? (
        <div className="ch-ms-mute">
          <span>
            <Icon icon={BellOff} size={15} />
            {muteLabel(state, api)}
          </span>
          <Button size="sm" busy={busy} onClick={() => void set(false, null)}>
            Unmute
          </Button>
        </div>
      ) : (
        <div className="ch-ms-mute__opts">
          <Button size="sm" disabled={busy} onClick={() => void set(true, 8)}>
            Mute 8 hours
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void set(true, 24 * 7)}>
            Mute a week
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void set(true, null)}>
            Until I turn it on
          </Button>
        </div>
      )}
    </Modal>
  );
}

function ConvRowButton({ api, c, avatarSize, onOpen, bind, plain = false }: { api: ChMessagesApi; c: ChConv; avatarSize: number; onOpen: () => void; bind: ContextMenuBind; plain?: boolean }) {
  const row = {
    type: "button" as const,
    className: "ch-ms-row" + (isUnread(c) ? " is-unread" : "") + (api.selectedId === c.id ? " is-sel" : ""),
    "aria-current": api.selectedId === c.id ? ("true" as const) : undefined,
    onClick: onOpen,
    ...bind,
  };
  const body = (
    <>
      {c.group ? (
        <span className="ch-ms-grp">
          <Icon icon={Users} size={15} />
        </span>
      ) : (
        <Avatar name={c.title} id={convAvatarId(api, c)} size={avatarSize} />
      )}
      <span className="ch-ms-row__main">
        <span className="ch-ms-row__top">
          <b>{c.title}</b>
          <span className="ch-num">
            {railTime(c.lastAt, api.now, api.timeZone, api.clock)}
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
          {c.unread > 0 ? (
            <span role="img"
              className="ch-ms-count ch-num"
              aria-label={`${c.unread} unread`}
            >
              {c.unread}
            </span>
          ) : c.markedUnread ? (
            // Marked unread with nothing new in it: a dot, not a count it doesn't have.
            <span role="img" className="ch-ms-count is-dot" aria-label="Marked unread" />
          ) : null}
        </span>
      </span>
    </>
  );
  // On the phone the swipe wrapper is the list's row (its arrivals and departures); the button sits inside it.
  if (plain) return <button {...row}>{body}</button>;
  return (
    // B7: the row itself arrives, leaves and moves (a conversation with a new message slides to the top of its day).
    <PresenceRow as="button" {...row}>
      {body}
    </PresenceRow>
  );
}

function Rail({ api, onNew }: { api: ChMessagesApi; onNew: () => void }) {
  const body = useRef<HTMLDivElement | null>(null);
  usePanelSmoothScroll(body);
  // B11: ↑ and ↓ walk the conversations; the rail is one Tab stop.
  useRovingRows(body, ".ch-ms-row");
  usePageKeys("Messages", RAIL_KEYS);
  const [filter, setFilter] = useState<ChConvFilter>("all");
  const [q, setQ] = useState("");
  const unread = api.convs.filter(isUnread).length;
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
          <Tooltip>
            <button
              type="button"
              className="ch-btn ch-btn--secondary ch-iconbtn"
              aria-label="New message"
              onClick={onNew}
            >
              <Icon icon={SquarePen} size={16} />
            </button>
          </Tooltip>
        </div>
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="Search people and messages"
          label="Search conversations and messages"
        />
        <Segmented<ChConvFilter> redraws
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
      <div className="ch-ms-rail__body" ref={body}>
        {api.convsError ? (
          // The rail's full width (states audit c9): at the body's inset its body wrapped to a narrow column.
          <div className="ch-ms-rail__notice">
            <InlineNotice
              code="CH-7201"
              title="Conversations didn’t load"
              body="Your messages are safe. Try again."
              onRetry={api.refetchConvs}
            />
          </div>
        ) : (api.convsLoading && !api.convs.length) || api.annLoading ? (
          <div className="ch-ms-sec__card" aria-busy="true" data-ch-code="CH-7402">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="ch-ms-row" style={{ cursor: "default" }}>
                <Skeleton width={36} height={36} radius={18} />
                <span style={{ display: "grid", gap: 8 }}>
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
            title="No conversations yet"
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
            {sections.map(([k, l]) => {
              const rows = list.filter(
                (c) => sectionOf(c.lastAt, api.now, api.timeZone) === k,
              );
              if (!rows.length) return null;
              return (
                <section key={k} className="ch-ms-sec" aria-label={l}>
                  <div className="ch-ms-sec__l">{l}</div>
                  <div className="ch-ms-sec__card">
                    <ListPresence>
                      {rows.map((c) => (
                        <ConvRow key={c.id} api={api} c={c} />
                      ))}
                    </ListPresence>
                  </div>
                </section>
              );
            })}
            {!list.length && <RailEmpty filter={filter} q={q} onClearSearch={() => setQ("")} onShowAll={() => setFilter("all")} />}
            {/* Messages first; the team's announcements fold under them (owner, 2026-10-16). */}
            {filter !== "groups" && <AnnouncementsSection api={api} q={q} />}
            <MessageHits api={api} q={q} />
          </>
        )}
      </div>
    </aside>
  );
}

/* Thread */

/**
 * A reaction on a message (owner, 2026-10-08): the chip is the opposite colour of the bubble it sits under (ivory under
 * a green one, green under an ivory one), and a click opens who reacted, with a row to add or take back your own.
 */
function ReactionChip({ api, messageId, r }: { api: ChMessagesApi; messageId: string; r: ChReaction }) {
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
        ref={btn}
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
        {r.count}
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

/** A photo in a message: shown in the thread, a click opens the full file. One that won't load falls back to the file chip. */
function ImageAttachment({ f }: { f: ChAttachment }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <a className="ch-ms-bub ch-ms-bub--file" href={f.url ?? undefined} target="_blank" rel="noreferrer">
        <span className="ch-ms-file__ic">
          <Icon icon={FileText} size={16} />
        </span>
        <span style={{ minWidth: 0 }}>
          <b>{f.name}</b>
          <span>{fileSize(f.size)}</span>
        </span>
        <Icon icon={Download} size={15} />
      </a>
    );
  }
  return (
    <a className="ch-ms-img" href={f.url ?? undefined} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`}>
      {/* A plain img on purpose: a signed storage URL, sized by the thread, not an optimised asset. */}
      <img src={f.url ?? undefined} alt={f.name} loading="lazy" decoding="async" onError={() => setBroken(true)} />
    </a>
  );
}

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
          <b>Attachment didn’t load</b>
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
      {files.map((f) =>
        f.mime.startsWith("image/") && f.url ? (
          <ImageAttachment key={f.id} f={f} />
        ) : (
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
        ),
      )}
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
  return (
    <PresenceRow
      as="div"
      id={`ch-ms-message-${m.id}`}
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
              <Avatar name={who?.name ?? "Member"} id={who ? (who.playerId ?? who.userId) : null} size={30} />
            </SenderPeek>
          )}
        </span>
      )}
      <div className="ch-ms-msg__col">
        {!m.mine && first && group && (
          <SenderPeek api={api} who={who}>
            <span className="ch-ms-msg__who">
              {firstName(who?.name ?? "Member")}
            </span>
          </SenderPeek>
        )}
        <div className="ch-ms-msg__line">
          <div className="ch-ms-msg__stack" {...press} {...rightClick}>
            {m.replyToId && <ReplyQuote api={api} replyToId={m.replyToId} />}
            {m.text && (
              <div className="ch-ms-bub">
                <MessageText text={m.text} />
              </div>
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
          {!m.failed && !onActions && (
            <div className="ch-ms-msg__tools">
              <Tooltip>
                <button
                  ref={reactBtn}
                  type="button"
                  className="ch-ms-tool"
                  aria-label="React"
                  aria-haspopup="menu"
                  aria-expanded={picking}
                  onClick={() => setPicking(!picking)}
                >
                  <Icon icon={SmilePlus} size={15} />
                </button>
              </Tooltip>
              {onReply && (
                <Tooltip>
                  <button type="button" className="ch-ms-tool" aria-label="Reply" onClick={onReply}>
                    <Icon icon={Reply} size={15} />
                  </button>
                </Tooltip>
              )}
              {m.mine && (
                <Menu
                  label="Message actions"
                  align={m.mine ? "end" : "start"}
                  items={[
                    // An attachment-only message has no text to edit (as the phone's sheet: wave 5 #8).
                    ...(m.text ? [{ label: "Edit", icon: Pencil, onSelect: onEdit }] : []),
                    {
                      label: "Delete",
                      icon: Trash2,
                      danger: true,
                      onSelect: onDelete,
                    },
                  ]}
                  trigger={(p) => (
                    <Tooltip>
                      <button
                        type="button"
                        className="ch-ms-tool"
                        aria-label="More message actions"
                        {...p}
                      >
                        <Icon icon={Ellipsis} size={15} />
                      </button>
                    </Tooltip>
                  )}
                />
              )}
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
              <ReactionChip key={r.key} api={api} messageId={m.id} r={r} />
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
          (last || showTime) && (
            <span className="ch-ms-msg__t ch-num">
              {clock(m.at, api.timeZone, api.clock)}
              {m.edited ? " · Edited" : ""}
              {m.mine && !group && m.seen ? " · Seen" : ""}
            </span>
          )
        )}
      </div>
    </PresenceRow>
  );
}

/**
 * A message's text with its web links as links (wave 5 #13): React nodes, never HTML, and only http(s) (linkParts). In
 * the iOS app a link opens in the in-app browser (openExternalUrl), not inside the app's own web view.
 */
function MessageText({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((p, i) =>
        typeof p === "string" ? (
          p
        ) : (
          <a
            key={i}
            className="ch-ms-link"
            href={p.href}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => {
              if (!isNativeApp()) return;
              e.preventDefault();
              void openExternalUrl(p.href);
            }}
          >
            {p.text}
          </a>
        ),
      )}
    </>
  );
}

/** A parent outside the loaded history remains an honest unavailable reference. */
export function ReplyQuote({ api, replyToId }: { api: ChMessagesApi; replyToId: string }) {
  const reduced = useChReducedMotion();
  const parent = api.msgs.find((m) => m.id === replyToId);
  const name = parent ? (parent.mine ? "You" : personOf(api, parent.senderId)?.name ?? "Member") : "Reply";
  return (
    <button type="button" className="ch-ms-quote" aria-label={`Reply to ${name}`} disabled={!parent}
      onClick={() => document.getElementById(`ch-ms-message-${replyToId}`)?.scrollIntoView({
        block: "center",
        behavior: reduced ? "instant" : "smooth",
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

/** Adds picked files up to the limit, and says so when some don't fit rather than dropping them silently (CH-7106). */
export function useAddAttachments() {
  const toast = useToast();
  return useCallback(
    (cur: File[], picked: File[]) => {
      const next = addAttachments(cur, picked);
      const dropped = cur.length + picked.length - next.length;
      if (dropped > 0) {
        haptic("warning");
        toast({
          tone: "error",
          title: `Up to ${MAX_ATTACHMENTS} files per message`,
          body: `${dropped === 1 ? "1 file wasn’t" : `${dropped} files weren’t`} added. Send these, then attach the rest.`,
          code: "CH-7106",
        });
      }
      return next;
    },
    [toast],
  );
}

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
        <span key={`${f.name}${i}`} className="ch-ms-to__c" title={f.name}>
          <Icon icon={FileText} size={13} />
          <span className="ch-ms-to__n">{f.name}</span>
          <Tooltip>
            <button
              type="button"
              aria-label={`Remove ${f.name}`}
              disabled={disabled}
              onClick={() => onRemove(i)}
            >
              <Icon icon={X} size={12} />
            </button>
          </Tooltip>
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

/** A composer's textarea grows with what is written, up to its CSS max-height (132px when it has none). */
export function useAutosize(ta: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const t = ta.current;
    if (!t) return;
    t.style.height = "auto";
    const style = getComputedStyle(t);
    const cap = Number.parseFloat(style.maxHeight) || 132;
    const border = style.boxSizing === "border-box"
      ? (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0)
      : 0;
    t.style.height = `${Math.min(t.scrollHeight + border, cap)}px`;
  }, [ta, value]);
}

/** Within this of MESSAGE_MAX a composer counts down, so the limit never stops typing (or cuts a paste) unannounced. */
const COUNT_FROM = 300;

/** "N left" near the limit (wave 5 #21); nothing before it. Only the limit itself is announced, not each keystroke. */
export function CharsLeft({ text }: { text: string }) {
  const left = MESSAGE_MAX - text.length;
  if (left > COUNT_FROM) return null;
  return left <= 0 ? (
    <span className="ch-ms-comp__left is-out" role="status">
      No characters left
    </span>
  ) : (
    <span className="ch-ms-comp__left ch-num">{left} left</span>
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
  unavailable = false,
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
  /** The conversation did not load (CH-7202): there is nothing to reply into, so the composer says so and stays off. */
  unavailable?: boolean;
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
  const footer = useRef<HTMLElement | null>(null);
  const typingTimer = useRef<number | null>(null);
  const ready = (draft.trim() || files.length || resumed) && !sending && !checking && !checkFailed && !unavailable;
  const addFiles = useAddAttachments();
  useAutosize(ta, draft);
  // Toasts sit above this composer, however tall it grows (wave 5 #1).
  useComposerInset(footer);

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
    <footer ref={footer} className="ch-ms-comp" aria-busy={checking || sending || undefined}>
      {checkFailed && <InlineNotice code="CH-7217" title="Couldn’t check a pending send" body="Try again before sending another message." onRetry={() => setCheckAttempt((n) => n + 1)} />}
      {unconfirmed && <InlineNotice code="CH-7023" title="Couldn’t confirm this send" body="This send is unconfirmed. Retry send checks the original request; editing stays locked until its outcome is known." />}
      {effectiveParent && (
        <div className="ch-ms-comp__reply">
          <ReplyQuote api={api} replyToId={effectiveParent} />
          <IconButton icon={X} label="Cancel reply" onClick={() => { setRecoveredParent(null); onClearReply?.(); }} disabled={sending || unconfirmed || checking || checkFailed || unavailable} />
        </div>
      )}
      {resumed && !files.length && <div role="group" className="ch-ms-to" aria-label="Pending attachments">{resumed.filenames.map((name, i) => <span key={`${name}-${i}`} className="ch-ms-to__c"><Icon icon={FileText} size={13} />{name}</span>)}</div>}
      {missingFiles.length > 0 && <div role="status" className="ch-ms-to" aria-label="Attachments to choose again">Choose these files again: {missingFiles.map((name, i) => <span key={`${name}-${i}`} className="ch-ms-to__c">{name}<Tooltip><button type="button" aria-label={`Dismiss ${name}`} onClick={() => setMissingFiles((now) => now.filter((_, j) => j !== i))}><Icon icon={X} size={12} /></button></Tooltip></span>)}</div>}
      <AttachChips
        disabled={unconfirmed || checking || checkFailed || unavailable}
        files={files}
        onRemove={(i) => setFiles((s) => s.filter((_, j) => j !== i))}
      />
      <div className="ch-ms-comp__field">
        <AttachButton
          phone={phone}
          disabled={unconfirmed || checking || checkFailed || unavailable}
          onPick={(picked) => { setFiles(addFiles(filesRef.current, picked)); setMissingFiles((names) => names.filter((name) => !picked.some((file) => file.name === name))); }}
        />
        <textarea
          ref={ta}
          rows={1}
          // CH-7802: desktop Enter sends; phone Return adds a line and the Send button sends.
          aria-label={`Message ${label}`}
          placeholder={unavailable ? "Replies are off until this loads" : `Message ${label}`}
          value={draft}
          readOnly={unconfirmed || checking || checkFailed || unavailable}
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
          maxLength={MESSAGE_MAX}
          enterKeyHint={phone ? "enter" : "send"}
        />
        <Tooltip>
          <button
            type="button"
            className={"ch-ms-send" + (ready ? " is-ready" : "")}
            onClick={() => void send()}
            disabled={!ready}
            aria-label={unconfirmed ? "Retry send" : "Send"}
          >
            <Icon icon={unconfirmed ? RotateCw : ArrowUp} size={17} />
          </button>
        </Tooltip>
      </div>
      {unavailable ? (
        <span className="ch-ms-comp__hint">
          This conversation didn’t load, so you can’t send yet. Try again above.
        </span>
      ) : !phone ? (
        <span className="ch-ms-comp__hint">
          Enter to send · Shift + Enter for a new line
          <CharsLeft text={draft} />
        </span>
      ) : (
        <CharsLeft text={draft} />
      )}
    </footer>
  );
}

/**
 * The "New" divider (wave 5 #17): placed once as a thread opens, before the first message that was unread then, so it
 * stays put as more arrive and as the open marks them read. The unread count is the one the conversation had on opening.
 */
export function useNewDivider(api: ChMessagesApi, conv: ChConv): string | null {
  const [mark, setMark] = useState<{ convId: string; unread: number; id?: string | null }>({ convId: conv.id, unread: conv.unread });
  if (mark.convId !== conv.id) setMark({ convId: conv.id, unread: conv.unread });
  else if (mark.id === undefined && !api.msgsLoading && api.msgs.length) setMark({ ...mark, id: firstUnreadId(api.msgs, mark.unread) });
  return mark.convId === conv.id ? (mark.id ?? null) : null;
}

/** Where the divider sits, before its message. */
export function NewDivider() {
  return (
    <PresenceRow as="div" className="ch-ms-day is-new" role="separator" aria-label="New messages">
      <span>New</span>
    </PresenceRow>
  );
}

/**
 * Under the thread, over its end: "N new messages" when some arrived while reading up (audit T25), else Jump to latest
 * once the reader is away from the end with nothing new (wave 5 #17). Either takes them down.
 */
export function ThreadBelow({ anchor }: { anchor: { unseen: number; atEnd: boolean; toEnd: () => void } }) {
  if (anchor.unseen > 0) {
    return (
      <button type="button" className="ch-ms-below" onClick={anchor.toEnd}>
        {plural(anchor.unseen, "new message")}
      </button>
    );
  }
  if (anchor.atEnd) return null;
  return (
    <button type="button" className="ch-ms-below is-jump" onClick={anchor.toEnd}>
      <Icon icon={ArrowDown} size={15} />
      Jump to latest
    </button>
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
  // Reply, as the phone's (wave 5 #10): the quote rides on the composer until the send lands or it is cancelled. It
  // belongs to the conversation it was picked in, so switching threads leaves it behind.
  const [replying, setReplying] = useState<{ convId: string; id: string } | null>(null);
  const replyToId = replying?.convId === conv.id ? replying.id : null;
  const sendingRef = useRef(false);
  const section = useRef<HTMLElement | null>(null);
  const reply = (m: ChMsg) => {
    if (sendingRef.current) return;
    haptic("select");
    setReplying({ convId: conv.id, id: m.id });
  };
  useEffect(() => {
    if (replyToId) section.current?.querySelector<HTMLTextAreaElement>(".ch-ms-comp textarea")?.focus();
  }, [replyToId]);
  const newId = useNewDivider(api, conv);
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

  // The thread follows its end only while the reader is there (audit T25); see useThreadAnchor. A search hit holds it
  // (useFocusMessage) until the thread has come to the message and its mark has faded.
  const focusing = !!api.focusMessageId || (!!api.foundMessageId && api.msgs.some((m) => m.id === api.foundMessageId));
  const anchor = useThreadAnchor(scroller, { convId: conv.id, count: api.msgs.length, lastMine: !!api.msgs.at(-1)?.mine, typing: api.typing, paused: focusing });
  const reducedMotion = useChReducedMotion();
  useFocusMessage(scroller, { target: api.focusMessageId ?? null, loading: api.msgsLoading, count: api.msgs.length, reduced: reducedMotion, onDone: (id) => api.messageFocused?.(id), toEnd: anchor.toEnd });
  // The thread eases like the page does, with a longer glide (a conversation is read down a long column); desktop,
  // wheel only: a trackpad stays native.
  usePanelSmoothScroll(scroller, { duration: THREAD_SCROLL_DUR });
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
      ref={section}
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
            <Avatar name={conv.title} id={convAvatarId(api, conv)} size={38} />
          )}
          <div style={{ minWidth: 0 }}>
            <b>{conv.title}</b>
            <span>{sub}</span>
          </div>
        </div>
        <div className="ch-ms-th__act">
          {calendarHref && api.viewer.role === "coach" && (
            <Tooltip>
              <a
                className="ch-btn ch-btn--ghost ch-iconbtn"
                href={calendarHref}
                aria-label="Schedule"
              >
                <Icon icon={CalendarPlus} size={16} />
              </a>
            </Tooltip>
          )}
          <Tooltip>
            <button
              type="button"
              className={
                "ch-btn ch-iconbtn " +
                (detailsOpen ? "ch-btn--secondary" : "ch-btn--ghost")
              }
              aria-label="Details"
              aria-pressed={detailsOpen}
              onClick={() => {
                haptic("select");
                setDetails(!detailsOpen);
              }}
            >
              <Icon icon={conv.group ? Users : Info} size={16} />
            </button>
          </Tooltip>
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
              title="This conversation may be out of date"
              body="It didn’t refresh. What’s here is what was last loaded. Try again."
              onRetry={api.refetchMsgs}
            />
          )}
          {api.msgsError ? (
            <InlineNotice
              code="CH-7202"
              title="This conversation didn’t load"
              body="Nothing was lost. Try again."
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
            <EmptyState compact code="CH-7304" title="No messages yet" body={`Say hello to ${conv.group ? "the group" : firstName(conv.title)}.`} />
          ) : (
            // B7: a message that arrives or is deleted opens or closes in place; the thread's scroll stays with
            // useThreadAnchor (no FLIP), and another conversation is a new list, whose messages never arrive.
            <ListPresence key={conv.id} flip={false}>
              {items.flatMap((it) =>
                it.kind === "day"
                  ? [
                      <PresenceRow as="div" key={it.key} className="ch-ms-day">
                        <span>{it.label}</span>
                      </PresenceRow>,
                    ]
                  : [
                      ...(it.m.id === newId ? [<NewDivider key={`new-${it.key}`} />] : []),
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
                        onReply={() => reply(it.m)}
                      />,
                    ],
              )}
            </ListPresence>
          )}
          {/* No dots under a thread that didn't load or is still loading (states audit c9): nothing to type into yet. */}
          {api.typing && !api.msgsError && !(api.msgsLoading && !api.msgs.length) && (
            <div className="ch-ms-msg is-first" /* CH-7602: the typing dots */>
              {/* The realtime hook says someone is typing, not who: a direct thread knows, a group doesn't. */}
              <span className="ch-ms-msg__av">{!conv.group && <Avatar name={conv.title} id={convAvatarId(api, conv)} size={30} />}</span>
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
      <ThreadBelow anchor={anchor} />
      <Composer
        key={conv.id}
        api={api}
        conv={conv}
        unavailable={api.msgsError}
        replyToId={replyToId}
        onClearReply={() => setReplying(null)}
        onSendingChange={(sending) => {
          sendingRef.current = sending;
        }}
      />

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
  // Nothing changed is nothing to save: Save would only mark it Edited (wave 5 #9).
  const same = !!message && text.trim() === message.text.trim();
  return (
    <Modal
      open={message != null}
      onClose={onClose}
      icon={Pencil}
      title="Edit message"
      initialFocus=".ch-modal__body textarea"
      description="Everyone in the conversation sees it marked as edited."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!text.trim() || same}
            onClick={async () => {
              if (!message || same) return;
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
        maxLength={MESSAGE_MAX}
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
      description="It’s removed for everyone in the conversation. This can’t be undone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            feel="warning"
            busy={busy}
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
    >
      {/* Which message, quoted and clamped to three lines (wave 5 #14). */}
      {message && (
        <blockquote className="ch-ms-delq">
          {message.text || (message.hasAttachments ? "Attachment" : "Message")}
        </blockquote>
      )}
    </Modal>
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
            busy={busy}
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

/** Delete a conversation from your own inbox, after a confirm (CH-7503). Everyone else keeps theirs. */
export function DeleteConversationModal({ api, conv, open, onClose, onDeleted }: { api: ChMessagesApi; conv: ChConv; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      code="CH-7503"
      open={open}
      onClose={onClose}
      icon={Trash2}
      title={`Delete ${conv.title}?`}
      description="It leaves your inbox. The other people keep their copy, and it comes back if someone sends a new message."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep conversation
          </Button>
          <Button
            variant="danger"
            feel="warning"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              const ok = (await api.deleteConversation?.(conv.id)) ?? false;
              setBusy(false);
              if (ok) {
                onClose();
                onDeleted();
              }
            }}
          >
            {busy ? "Deleting…" : "Delete conversation"}
          </Button>
        </>
      }
    />
  );
}

/**
 * The group's creator removes someone from it, after a confirm (CH-7504), as Fairway's group details allow. Remove fires
 * the warning haptic (D-70); a refusal puts the row back and says so (CH-7024).
 */
export function RemoveMemberModal({ api, conv, member, onClose }: { api: ChMessagesApi; conv: ChConv; member: ChMember | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const first = firstName(member?.name ?? "them");
  // The safe choice names who stays (wave 5 #19).
  const keep = member ? `Keep ${first}` : "Keep them";
  return (
    <Modal
      code="CH-7504"
      open={member != null}
      onClose={onClose}
      icon={UserMinus}
      title={`Remove ${first} from ${conv.title}?`}
      description={`${first} stops getting its messages. You can add them back from Add.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {keep}
          </Button>
          <Button
            variant="danger"
            feel="warning"
            busy={busy}
            disabled={!api.removeMember}
            onClick={async () => {
              if (!member || !api.removeMember) return;
              setBusy(true);
              // The row leaves as the sheet closes; a refusal brings it back with a toast.
              onClose();
              await api.removeMember(member.userId, member.name);
              setBusy(false);
            }}
          >
            {busy ? "Removing…" : "Remove"}
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
      description="Players and coaches on the team who aren’t in this group."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {failed ? (
        <InlineNotice
          code="CH-7215"
          title="The team list didn’t load"
          body="Try again."
          onRetry={() => setAttempt((n) => n + 1)}
        />
      ) : !people ? (
        <div style={{ display: "grid", gap: 8 }} aria-busy="true" data-ch-code="CH-7410">
          <Skeleton height={30} />
          <Skeleton height={30} />
          <Skeleton height={30} />
        </div>
      ) : !people.length ? (
        <p className="ch-ms-quiet" data-ch-code="CH-7307">
          Everyone on the team is already in this group.
        </p>
      ) : (
        <div role="group" className="ch-ms-pick" aria-label="People to add">
          {people.map((p) => {
            const done = added.includes(p.userId);
            return (
              <div key={p.userId} className="ch-pp__row">
                <Avatar name={p.name} id={personOf(api, p.userId)?.playerId ?? p.userId} size="sm" />
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
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ChMember | null>(null);
  const mayAdd = conv.group && conv.creatorId === api.viewer.userId;
  // Remove is the creator's too, on anyone but themselves (removeGolfGroupMember; Leave group is the creator's own way).
  const mayRemove = mayAdd && !!api.removeMember;
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
          <Avatar name={conv.title} id={convAvatarId(api, conv)} size="xl" ring />
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
              title="Members didn’t load"
              body="Try again."
              onRetry={api.retryMembers}
            />
          ) : !api.members ? (
            <div
              style={{ display: "grid", gap: 8 }}
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
                <Avatar name={mb.name} id={personOf(api, mb.userId)?.playerId ?? mb.userId} size={30} />
                <span style={{ minWidth: 0 }}>
                  <b>
                    {mb.name}
                    {mb.userId === api.viewer.userId ? " (you)" : ""}
                  </b>
                  <span>{mb.subtitle}</span>
                </span>
                {mb.userId === conv.creatorId ? (
                  <Badge tone="neutral">Admin</Badge>
                ) : mayRemove && mb.userId !== api.viewer.userId ? (
                  <button type="button" className="ch-btn ch-btn--sm ch-btn--ghost" aria-label={`Remove ${mb.name}`} onClick={() => setRemoving(mb)}>
                    Remove
                  </button>
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
      {api.deleteConversation && (
        <div className="ch-ms-det__sec">
          <Button variant="danger" leftIcon={Trash2} onClick={() => setDeleting(true)}>
            Delete conversation
          </Button>
        </div>
      )}
      <LeaveGroupModal api={api} conv={conv} open={leaving} onClose={() => setLeaving(false)} onLeft={onClose} />
      <DeleteConversationModal api={api} conv={conv} open={deleting} onClose={() => setDeleting(false)} onDeleted={onClose} />
      {mayAdd && <AddMembersModal api={api} conv={conv} open={adding} onClose={() => setAdding(false)} />}
      {mayRemove && <RemoveMemberModal api={api} conv={conv} member={removing} onClose={() => setRemoving(null)} />}
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
          title="Files didn’t load"
          body="Your messages are safe. Try again."
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

/** "Muted until tomorrow · 2:40 PM", or until turned back on (wave 5 #2: a week from now read "today"). */
export const muteLabel = (m: ChMute, api: Pick<ChMessagesApi, "now" | "timeZone" | "clock">) =>
  m.until ? `Muted until ${untilLabel(m.until, api.now, api.timeZone)} · ${clock(m.until, api.timeZone, api.clock)}` : "Muted until you turn it back on";

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
          title="The mute setting didn’t load"
          body="Try again."
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
            {muteLabel(m, api)}
          </span>
          <Button
            size="sm"
            busy={busy}
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
  // The announcement's own title: its draft (with the message and the two switches) outlives Cancel, Esc and the
  // backdrop until a post lands, as Team Hub's compose does (wave 5 #7). A group's name is the prefill's or empty.
  const [annTitle, setAnnTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const prefill = api.prefill ?? null;
  useEffect(() => {
    if (!open) return;
    // A prefilled message (prefill.ts) opens with its people chosen and, for a group, its name.
    // Players start direct threads only (D-15): theirs keeps the first person.
    const group = !!prefill && prefill.to.length > 1 && api.viewer.role === "coach";
    setMode(group ? "group" : "direct");
    setTo(prefill ? (group ? prefill.to : prefill.to.slice(0, 1)) : []);
    setQ("");
    setTitle(prefill?.title ?? "");
    setTouched(false);
  }, [open, prefill, api.viewer.role]);
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
  const needsTitle = coachGroup ? !title.trim() : announce && !annTitle.trim();
  const needsBody = announce && !body.trim();
  // A coach's group is a team broadcast: with no player in it, it would reach the whole team (groupLacksPlayer).
  const needsPlayer = mode === "group" && groupLacksPlayer(api.viewer.role, to, api.directory);
  const canGo = announce
    ? !needsTitle && !needsBody
    : mode === "direct"
      ? to.length === 1
      : to.length >= 1 && !needsTitle && !needsPlayer;
  const go = async () => {
    setTouched(true);
    if (!canGo) {
      haptic("warning");
      return;
    }
    setBusy(true);
    const ok = announce
      ? await api.createAnnouncement({
          title: annTitle.trim(),
          body: body.trim(),
          urgent,
          ack,
        })
      : mode === "direct"
        ? await api.startDirect(to[0]!)
        : await api.createGroup(to, title.trim());
    setBusy(false);
    if (ok && announce) {
      setAnnTitle("");
      setBody("");
      setUrgent(false);
      setAck(true);
    }
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
          <Button variant="primary" busy={busy} onClick={() => void go()}>
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
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
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
                    Name the group so players know what it’s for.
                  </span>
                )}
              </label>
            )}
            {prefill?.draft && (
              <p className="ch-ms-new__draft">
                <span>Your draft, ready in the conversation to edit and send</span>
                <q>{prefill.draft}</q>
              </p>
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
                      <Avatar name={p?.name ?? "Member"} id={p?.playerId ?? id} size={20} />
                      {firstName(p?.name ?? "Member")}
                      <Tooltip>
                        <button
                          type="button"
                          aria-label={`Remove ${p?.name ?? "member"}`}
                          onClick={() => toggle(id)}
                        >
                          <Icon icon={X} size={12} />
                        </button>
                      </Tooltip>
                    </span>
                  );
                })}
              </div>
            )}
            {api.directoryError ? (
              <InlineNotice
                code="CH-7205"
                title="Your team list didn’t load"
                body="Try again."
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
                      <Avatar name={p.name} id={p.playerId ?? p.userId} size="sm" />
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
                  : needsPlayer
                    ? "Choose at least one player. Coaches join the group once it exists."
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
  useEffect(() => {
    if (api.prefill) setCompose(true);
  }, [api.prefill]);
  const { clearPrefill } = api;
  const closeCompose = useCallback(() => {
    setCompose(false);
    clearPrefill?.();
  }, [clearPrefill]);
  // CH-7605: going from one open thread or announcement to another settles the new one in (base in, quick out). The
  // first one a visit opens (the newest thread, or a link's) appears at once.
  const paneKey = ann ? `a:${ann.id}` : conv ? `c:${conv.id}` : null;
  const [pane, setPane] = useState({ key: paneKey, turn: 0 });
  if (pane.key !== paneKey) setPane({ key: paneKey, turn: pane.key === null ? pane.turn : pane.turn + 1 });

  if (isMessagesFirstRun(api) && !conv && !ann) {
    return (
      // Under the page's framed head, as every page's first-run empty (states audit c4, c9); its one action is the empty's.
      <main data-view="desktop" className="ch-ms ch-ms--first" data-canopy="">
        <MessagesHead
          brief={
            api.viewer.role === "coach"
              ? "Conversations with your players and staff, and the team’s announcements."
              : "Conversations with your coaches and teammates, and the team’s announcements."
          }
        />
        <MessagesFirstRun coach={api.viewer.role === "coach"} onNew={() => setCompose(true)} />
        <NewMessage api={api} open={compose} onClose={closeCompose} />
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
      <Swap swapKey={pane.turn} className="ch-ms-pane">
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
                  ? "Pick a conversation"
                  : "Start your first conversation"
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
      </Swap>
      {conv && details && (
        <SectionBoundary
          surface="messages.details"
          label="Details"
          code="CH-7213"
        >
          <Details api={api} conv={conv} onClose={() => setDetails(false)} />
        </SectionBoundary>
      )}
      <NewMessage api={api} open={compose} onClose={closeCompose} />
    </main>
  );
}
