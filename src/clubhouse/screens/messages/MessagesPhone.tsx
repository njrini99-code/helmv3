"use client";

import Link from "next/link";
import { AnimatePresence, useIsPresent } from "motion/react";
import { Flag,
  ArrowUp,
  Bell,
  BellOff,
  ChartColumn,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  Info,
  Megaphone,
  MessageSquare,
  Pencil,
  Reply,
  SquarePen,
  Trash2,
  UserRound,
  UserMinus,
  Users,
  X,
  ListChecks,
  BellRing,
  Lock,
  Share,
  CheckCheck,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Avatar } from "../../ui/Avatar";
import { Segmented } from "../../ui/Segmented";
import { EmptyState, Skeleton } from "../../ui/States";
import { RailEmpty } from "./RailEmpty";
import { ThreadClassSub } from "./ThreadClassSub";
import { ThreadClassSection } from "./ThreadClassSection";
import { Icon } from "../../ui/Icon";
import { Button } from "../../ui/Button";
import { InlineNotice } from "../../ui/Notices";
import { Modal } from "../../ui/Modal";
import { PhoneBar, PhoneIconAction, PhoneTextAction } from "../../ui/PhoneBar";
import { SearchField } from "../../ui/SearchField";
import { SectionBoundary } from "../../ui/SectionBoundary";
import { Swap } from "../../ui/Swap";
import { Switch } from "../../ui/Switch";
import { useToast } from "../../ui/Toast";
import { haptic } from "../../lib/haptics";
import { useChReducedMotion } from "../../lib/reduced-motion";
import { chTrail } from "../../lib/track";
import { rebuiltHref } from "../../shell/nav";
import { PhoneScreen } from "../../shell/PhoneScreen";
import { PhoneTop, usePhoneStackHistory } from "../../shell/phone-chrome";
import {
  clock,
  filterConvs,
  firstName,
  groupLacksPlayer,
  isUnread,
  MESSAGE_MAX,
  sectionOf,
  threadItems,
  type ChConv,
  type ChConvFilter,
  type ChMember,
  type ChMsg,
} from "./model";
import { AnnouncementPane, AnnouncementsSection } from "./announcements";
import { isMessagesFirstRun, MessagesFirstRun } from "./MessagesFirstRun";
import { fileMeta, useConversationFiles } from "./files";
import { notePollHold, pollCardActions, PollThreadContext, type PollThreadActions } from "./polls";
import { useSeenBy, useSeenByList } from "./seen-by";
import { receiptCarrierId, seenByAccess, SEEN_BY_VISIBILITY } from "@/lib/golf/message-receipts";
import {
  AddMembersModal,
  AttachButton,
  AttachChips,
  Bubble,
  CharsLeft,
  Composer,
  ConvRow,
  DeleteMessageModal,
  EditMessageModal,
  LeaveGroupModal,
  DeleteConversationModal,
  MessageHits,
  NewDivider,
  REACTIONS,
  RemoveMemberModal,
  ThreadBelow,
  muteLabel,
  personOf,
  convAvatarId,
  convYear,
  TypingMini,
  useAddAttachments,
  useAutosize,
  useNewDivider,
  type ChMessagesApi,
} from "./MessagesView";
import { useComposerInset } from "./composer-inset";
import { useThreadAnchor } from "./use-thread-anchor";
import { useThreadDragTimes } from "./use-thread-drag-times";
import { ConversationSearch, detailsLine, MembersCard, MuteMenu, PhotosAndFiles, popIn, QuickActions, tokenBeat, useMuteAction } from "./details-v2";
import { HelloCard } from "./HelloCard";
import { HoldLift } from "./hold-lift";
import { HoldSeenRow } from "./seen-by";
import { noteTappedFace, ThreadDatePill, ThreadJumpKey, useFaceFlight, useReplyFromTyping, useSendRise, useSpringToEnd, useThreadMakeRoom } from "./thread-v2";
import { useFocusMessage } from "./use-focus-message";
import { ListPresence, PresenceRow } from "../../ui/ListPresence";
import { pluralWord } from "../../lib/plural";
import { LargeTitle } from "../../ui/LargeTitle";

/** What New message hands the thread that opens next: the text and any files picked with it. */
type FirstMessage = { text: string; files: File[] };

/** A new announcement not yet posted. */
type AnnDraft = { title: string; body: string; urgent: boolean; ack: boolean };
const NO_ANN: AnnDraft = { title: "", body: "", urgent: false, ack: true };

/**
 * Messages on the phone: the owner's design (docs/clubhouse/phone/messages.md,
 * design/handoff/mobile/m-msg.jsx). An inbox that pushes a thread, a thread
 * that pushes its details, and New message as a pushed screen, on the same
 * container, hooks, actions and catalog as desktop. Each pushed screen is a
 * history entry, so the iOS edge swipe pops it (CH-1906).
 */
export function MessagesPhone({ api }: { api: ChMessagesApi }) {
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (api.prefill) setComposing(true);
  }, [api.prefill]);
  const [announcing, setAnnouncing] = useState(false);
  const [details, setDetails] = useState(false);
  /** The first message written in New message, sent by the thread's composer once the thread opens. */
  const [firstMessage, setFirstMessage] = useState<FirstMessage | null>(null);
  // What was typed in New message and New announcement outlives Cancel and Esc, until a conversation or a post takes it
  // (wave 5 #7, as Team Hub's compose).
  const [newDraft, setNewDraft] = useState<FirstMessage>({ text: "", files: [] });
  const [annDraft, setAnnDraft] = useState<AnnDraft>(NO_ANN);
  const conv = api.convs.find((c) => c.id === api.selectedId) ?? null;
  const ann = api.announcements.find((a) => a.id === api.selectedAnnId) ?? null;
  useEffect(() => setDetails(false), [api.selectedId]);
  useEffect(() => {
    if (conv) setComposing(false);
    if (ann) setAnnouncing(false);
  }, [conv, ann]);

  const top = conv ? "thread" : ann ? "announcement" : announcing ? "announce" : composing ? "new" : null;
  const depth = (top ? 1 : 0) + (top === "thread" && details ? 1 : 0);
  const { select, selectAnn, selectedId, selectedAnnId } = api;
  const popTo = useCallback(
    (level: number) => {
      if (level < 2) setDetails(false);
      if (level < 1) {
        setComposing(false);
        setAnnouncing(false);
        if (selectedAnnId) selectAnn(null);
        if (selectedId) select(null);
      }
    },
    [select, selectAnn, selectedId, selectedAnnId],
  );
  usePhoneStackHistory(depth, popTo);

  return (
    <main className="ch-msp" aria-label="Messages">
      <PhoneTop
        title="Messages"
        start
        action={
          <PhoneIconAction
            icon={SquarePen}
            label="New message"
            onClick={() => {
              setComposing(true);
            }}
          />
        }
      />
      <div className="ch-msp-inbox" inert={depth > 0 || undefined}>
        <SectionBoundary surface="messages.rail" label="Your conversations" code="CH-7210">
          {api.redesign ? <PhoneInboxV2 api={api} onNew={() => setComposing(true)} /> : <PhoneInbox api={api} onNew={() => setComposing(true)} />}
        </SectionBoundary>
      </div>

      <AnimatePresence>
        {top === "thread" && conv && (
          <PhoneThread
            key={`thread-${conv.id}`}
            api={api}
            conv={conv}
            onBack={() => select(null)}
            onDetails={() => {
              haptic("select");
              setDetails(true);
            }}
            firstMessage={firstMessage ?? undefined}
            onFirstSent={() => setFirstMessage(null)}
            covered={details}
          />
        )}
        {top === "announcement" && ann && (
          <PhoneScreen key={`ann-${ann.id}`} labelledBy="ch-msp-ann-title" className="ch-msp-ann">
            <PhoneBar
              back={{ label: "Messages", onBack: () => selectAnn(null) }}
              title="Announcement"
              titleId="ch-msp-ann-title"
            />
            <SectionBoundary surface="messages.announcement" label="This announcement" code="CH-7211">
              <AnnouncementPane api={api} a={ann} onBack={() => selectAnn(null)} />
            </SectionBoundary>
          </PhoneScreen>
        )}
        {top === "new" && (
          <PhoneNewMessage
            key="new"
            api={api}
            onCancel={() => {
              setComposing(false);
              api.clearPrefill?.();
            }}
            onAnnounce={() => {
              setComposing(false);
              setAnnouncing(true);
            }}
            onFirstMessage={setFirstMessage}
            draft={newDraft}
            onDraft={setNewDraft}
          />
        )}
        {top === "announce" && (
          <PhoneAnnouncementForm key="announce" api={api} onCancel={() => setAnnouncing(false)} draft={annDraft} onDraft={setAnnDraft} />
        )}
        {top === "thread" && conv && details && (
          <PhoneDetails key={`details-${conv.id}`} api={api} conv={conv} onBack={() => setDetails(false)} />
        )}
      </AnimatePresence>
    </main>
  );
}

/* Inbox */

/** The redesign's inbox: context line, search and New, segmented, Pinned card, Recent card (06 S-MSG). No large title on the phone. */
function PhoneInboxV2({ api, onNew }: { api: ChMessagesApi; onNew: () => void }) {
  const [filter, setFilter] = useState<ChConvFilter>(api.designFilter ?? "all");
  const [q, setQ] = useState("");
  const unread = api.convs.filter(isUnread).length;
  const list = filterConvs(api.convs, filter, q);
  // A filter or search change cuts its leaving rows in one frame (M-MSG-03b); a row leaving the list fades (M-MSG-CP-11).
  const scope = `${filter}\u0000${q}`;
  const lastScope = useRef(scope);
  const changedScope = lastScope.current !== scope;
  useEffect(() => {
    lastScope.current = scope;
  });
  const loading = (api.convsLoading && !api.convs.length) || api.annLoading;
  const context = loading ? "Loading conversations" : [`${unread} unread`, api.teamName].filter(Boolean).join(" · ");
  const pinned = (api.pins?.ids ?? []).map((id) => api.convs.find((c) => c.id === id)).filter((c): c is ChConv => !!c);
  const firstRun = isMessagesFirstRun(api);
  // A pin isn't listed twice (06 S-MSG): the Pinned card holds it unless a search or Groups is asking.
  const pinIds = new Set(pinned.map((c) => c.id));
  const recent = filter !== "groups" && !q.trim() ? list.filter((c) => !pinIds.has(c.id)) : list;
  const recentTitle = filter === "unread" ? "Unread" : filter === "groups" ? "Groups" : "Recent";
  return (
    <div className="ch-msp-page ch-msp-home ch-msv-inbox" onClickCapture={(e) => noteTappedFace(e.target)}>
      {!firstRun && (
        <div className="ch-msv-top">
          <p className="ch-msv-ctx ch-num">{context}</p>
          <div className="ch-msv-srow">
            <SearchField value={q} onChange={setQ} placeholder="Search" label="Search conversations and messages" className="ch-msv-search" />
            <button type="button" className="ch-msv-new" aria-label="New message" onClick={onNew}>
              <Icon icon={SquarePen} size={19} />
            </button>
          </div>
          <Segmented<ChConvFilter>
            redraws
            block
            label="Filter conversations"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread" },
              { value: "groups", label: "Groups" },
            ]}
          />
        </div>
      )}
      {api.convsError ? (
        <InlineNotice code="CH-7201" title="Conversations didn’t load" body="Your messages are safe. Try again." onRetry={api.refetchConvs} />
      ) : loading ? (
        <section className="ch-msv-card" role="status" aria-label="Loading conversations" data-ch-code="CH-7402">
          <div className="ch-msv-card__h" aria-hidden="true">
            <span className="ch-msv-sk" style={{ width: 64, height: 11 }} />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="ch-ms-row" aria-hidden="true" style={{ cursor: "default" }}>
              <span className="ch-msv-sk" style={{ width: 44, height: 44, borderRadius: "50%" }} />
              <span style={{ display: "grid", gap: 8 }}>
                <span className="ch-msv-sk" style={{ width: 124.2, height: 11 }} />
                <span className="ch-msv-sk" style={{ width: 210.6, height: 9 }} />
              </span>
            </div>
          ))}
        </section>
      ) : firstRun ? (
        <MessagesFirstRun redesign coach={api.viewer.role === "coach"} teamName={api.teamName ?? undefined} onNew={onNew} onTeam={api.viewer.role === "coach" ? onNew : undefined} />
      ) : (
        <div className="ch-msp-list">
          {filter !== "groups" && !q.trim() && pinned.length > 0 && (
            <section className="ch-msv-card" aria-label="Pinned">
              <h2 className="ch-msv-card__h">Pinned</h2>
              <div className="ch-msv-pins">
                {pinned.map((c) => {
                  const typers = api.typingByConv?.get(c.id);
                  const said = c.lastSenderId !== api.viewer.userId ? c.lastText : null;
                  return (
                    <button key={c.id} type="button" className="ch-msv-pin" onClick={() => api.select(c.id)}>
                      {typers?.length ? (
                        <span className="ch-msv-bubblet"><TypingMini /></span>
                      ) : said ? (
                        <span className="ch-msv-bubblet">{said}</span>
                      ) : null}
                      {c.group ? (
                        <span className="ch-ms-grp ch-msv-pin__grp"><Icon icon={c.title === api.teamName ? Flag : Users} size={31} /></span>
                      ) : (
                        <Avatar name={c.title} id={convAvatarId(api, c)} size="xl" year={convYear(api, c)} />
                      )}
                      <span className="ch-msv-pin__l">{c.title === api.teamName ? "Team" : c.group ? c.title : firstName(c.title)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          {recent.length > 0 && (
            <section className="ch-msv-card" aria-label={recentTitle}>
              <h2 className="ch-msv-card__h">
                {recentTitle} <small className="ch-num">{recent.length}</small>
              </h2>
              <ListPresence arrive="inbox" cut={changedScope}>
                {recent.map((c) => (
                  <ConvRow key={c.id} api={api} c={c} avatarSize={44} phone />
                ))}
              </ListPresence>
            </section>
          )}
          {!list.length && !q.trim() && <RailEmpty filter={filter} q={q} onClearSearch={() => setQ("")} onShowAll={() => setFilter("all")} />}
          {filter !== "groups" && <AnnouncementsSection api={api} q={q} />}
          <MessageHits api={api} q={q} nameMatches={list.length} />
        </div>
      )}
    </div>
  );
}

function PhoneInbox({ api, onNew }: { api: ChMessagesApi; onNew: () => void }) {
  const [filter, setFilter] = useState<ChConvFilter>("all");
  const [q, setQ] = useState("");
  // Conversations with something unread, not the messages added up (D-46).
  const unread = api.convs.filter(isUnread).length;
  const list = filterConvs(api.convs, filter, q);
  const sections: Array<[ReturnType<typeof sectionOf>, string]> = [
    ["today", "Today"],
    ["week", "This week"],
    ["earlier", "Earlier"],
  ];
  return (
    <div className="ch-msp-page ch-msp-home">
      <div className="ch-msp-top">
        {/* The phone's one large title (owner decision 4, 2026-10-24); the top bar holds the page's heading, so VoiceOver reads it once. */}
        <LargeTitle as="p" hidden>
          Messages
        </LargeTitle>
        {/* With nothing to search or filter the page is the first-run empty alone (board: Empty state), not controls over nothing. */}
        {!isMessagesFirstRun(api) && (
          <div className="ch-msp-tools">
            <SearchField value={q} onChange={setQ} placeholder="Search messages" label="Search conversations and messages" className="ch-msp-search" />
            <div className="ch-msp-chips" role="group" aria-label="Filter conversations">
              {/* The Qualifiers chips: a count is its own figure beside the word (space kept, so it reads "Unread 2"). */}
              {(
                [
                  ["all", "All", null],
                  ["unread", "Unread", unread],
                  ["groups", "Groups", null],
                ] as Array<[ChConvFilter, string, number | null]>
              ).map(([k, l, n]) => (
                <button
                  key={k}
                  type="button"
                  className="ch-msp-chip ch-num"
                  aria-pressed={filter === k}
                  onClick={() => {
                    if (filter !== k) haptic("select");
                    setFilter(k);
                  }}
                >
                  {l}
                  {n != null && <> <span>{n}</span></>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {api.convsError ? (
        <InlineNotice
          code="CH-7201"
          title="Conversations didn’t load"
          body="Your messages are safe. Try again."
          onRetry={api.refetchConvs}
        />
      ) : (api.convsLoading && !api.convs.length) || api.annLoading ? (
        // The loaded inbox's shape: a section under its double rule, then rows on seams, so nothing moves when it lands.
        <section className="ch-ms-sec" aria-busy="true" data-ch-code="CH-7402">
          <div className="ch-ms-sec__l">
            <Skeleton width={150} height={18} radius={6} />
          </div>
          <div className="ch-ms-sec__card">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="ch-ms-row" style={{ cursor: "default" }}>
                <Skeleton width={44} height={44} radius={22} />
                <span style={{ display: "grid", gap: 8 }}>
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="85%" height={12} />
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : isMessagesFirstRun(api) ? (
        <MessagesFirstRun coach={api.viewer.role === "coach"} onNew={onNew} />
      ) : !api.convs.length ? (
        <EmptyState
          code="CH-7301"
          compact
          icon={MessageSquare}
          title="No conversations yet"
          body={api.viewer.role === "coach" ? "Start one with a player, or create a team group." : "Message a coach or a teammate to start."}
          action={
            <Button size="sm" onClick={onNew}>
              New message
            </Button>
          }
        />
      ) : (
        // CH-7606: another filter's list settles in (base in, quick out); typing in Search filters in place.
        <Swap swapKey={filter} className="ch-msp-list">
          {sections.map(([k, l]) => {
            const rows = list.filter((c) => sectionOf(c.lastAt, api.now, api.timeZone) === k);
            if (!rows.length) return null;
            return (
              <section key={k} className="ch-ms-sec is-date" aria-label={l}>
                <h2 className="ch-ms-sec__l">{l}</h2>
                <div className="ch-ms-sec__card">
                  <ListPresence>
                    {rows.map((c) => (
                      <ConvRow key={c.id} api={api} c={c} avatarSize={44} phone />
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
        </Swap>
      )}
    </div>
  );
}

/* Thread */

const GroupMark = ({ size, flag = false }: { size: "sm" | "md" | "lg"; flag?: boolean }) => (
  <span className={`ch-msp-mark is-${size}`} aria-hidden="true">
    <Icon icon={flag ? Flag : Users} size={size === "lg" ? 28 : size === "md" ? 17 : 15} />
  </span>
);

function PhoneThread({
  api,
  conv,
  onBack,
  onDetails,
  firstMessage,
  onFirstSent,
  covered,
}: {
  api: ChMessagesApi;
  conv: ChConv;
  onBack: () => void;
  onDetails: () => void;
  firstMessage?: FirstMessage;
  onFirstSent: () => void;
  /** Details is pushed over the thread. */
  covered: boolean;
}) {
  const toast = useToast();
  const threadReduced = useChReducedMotion();
  const [acting, setActing] = useState<ChMsg | null>(null);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replySending, setReplySending] = useState(false);
  const replySendingRef = useRef(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const reply = (message: ChMsg) => {
    if (replySendingRef.current) return;
    setReplyToId(message.id);
    setActing(null);
  };
  // P-1: the message that carries the receipt, and the Seen by sheet.
  const carrierId = useMemo(
    () => receiptCarrierId(api.msgs, { viewerId: api.viewer.userId, scope: conv.group && SEEN_BY_VISIBILITY === "everyone" ? "thread" : "mine" }),
    [api.msgs, api.viewer.userId, conv.group],
  );
  const seenList = useSeenByList();
  // A coach's own group run-ends keep room for the receipt's 44 px tap box (changelog P-01).
  const seenListAccess = conv.group && seenByAccess(SEEN_BY_VISIBILITY, api.viewer.role, true).list;
  // D30: Remind and Share result reply to the poll with a prefilled draft (the coach presses Send).
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);
  const pollThread = useMemo<PollThreadActions>(
    () => ({
      replyWith: (messageId, text) => {
        if (replySendingRef.current) return;
        setReplyToId(messageId);
        setActing(null);
        setSeed({ text, nonce: Date.now() });
      },
    }),
    [],
  );
  useEffect(() => {
    if (replyToId && !acting) composerRef.current?.querySelector("textarea")?.focus();
  }, [replyToId, acting]);
  const [editing, setEditing] = useState<ChMsg | null>(null);
  // Redesign: a pick runs the dismiss first, then what was picked (07 M-MSG-11).
  const [holdClose, setHoldClose] = useState(0);
  const holdAfter = useRef<(() => void) | null>(null);
  const pickHold = (then: () => void) => {
    holdAfter.current = then;
    setHoldClose((n) => n + 1);
  };
  const [deleting, setDeleting] = useState<ChMsg | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const items = useMemo(() => threadItems(api.msgs, api.now, api.timeZone), [api.msgs, api.now, api.timeZone]);
  const newId = useNewDivider(api, conv);
  // The thread follows its end only while the reader is there (audit T25); see useThreadAnchor. A search hit holds it
  // (useFocusMessage) until the thread has come to the message and its mark has faded.
  const focusing = !!api.focusMessageId || (!!api.foundMessageId && api.msgs.some((m) => m.id === api.foundMessageId));
  const anchor = useThreadAnchor(scroller, { convId: conv.id, count: api.msgs.length, lastMine: !!api.msgs.at(-1)?.mine, typing: api.typing, paused: focusing });
  const reducedMotion = useChReducedMotion();
  useFocusMessage(scroller, { target: api.focusMessageId ?? null, loading: api.msgsLoading, count: api.msgs.length, reduced: reducedMotion, onDone: (id) => api.messageFocused?.(id), toEnd: anchor.toEnd });
  useEffect(() => {
    if (firstMessage) onFirstSent();
    // The composer has taken the first message; nothing else to hand over.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useThreadDragTimes(scroller, !!api.redesign, threadReduced);
  useThreadMakeRoom(scroller, api.msgs.length, !!api.redesign, threadReduced);
  const jumpToEnd = useSpringToEnd(scroller, anchor.toEnd, threadReduced);
  useReplyFromTyping(scroller, api.msgs.length, !!api.typing, !!api.redesign, threadReduced);
  useFaceFlight(!!api.redesign, threadReduced);
  useSendRise(scroller, api.msgs.length, !!api.redesign, threadReduced);
  const titleId = `ch-msp-thread-${conv.id}`;
  const sub = conv.group ? `${conv.memberCount} members` : conv.subtitle;
  const copy = async (m: ChMsg) => {
    try {
      await navigator.clipboard.writeText(m.text);
      haptic("success");
      toast({ title: "Copied" });
    } catch {
      haptic("error");
      toast({ tone: "error", title: "Couldn’t copy the message", body: "Try again in a moment.", code: "CH-7020" });
    }
  };
  return (
    <PollThreadContext.Provider value={pollThread}>
    <PhoneScreen labelledBy={titleId} className={"ch-msp-thread" + (seenListAccess ? " is-seen-list" : "")} keyboardAware covered={covered}>
      <PhoneBar
        lead
        titleId={titleId}
        back={{ onBack, ariaLabel: "Back to Messages" }}
        title={
          <button type="button" className="ch-msp-who" onClick={onDetails}>
            {conv.group ? <GroupMark size="sm" /> : <Avatar name={conv.title} id={convAvatarId(api, conv)} size={30} year={convYear(api, conv)} />}
            <span>
              <b>{api.redesign && !conv.group ? firstName(conv.title) : conv.title}</b>
              <em>
                <ThreadClassSub cls={api.classDay} conv={conv} other={conv.group ? undefined : personOf(api, conv.memberIds[0] ?? "")} sub={sub} where="phone" />
              </em>
            </span>
          </button>
        }
        action={<PhoneIconAction icon={Info} label="Details" onClick={onDetails} />}
      />
      <SectionBoundary surface="messages.thread" label="This conversation" code="CH-7212">
        <div className="ch-msp-scroll ch-ms-scroll" ref={scroller} aria-live="polite" aria-relevant="additions">
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
              <div style={{ display: "grid", gap: 12, paddingTop: 24 }} aria-busy="true" data-ch-code="CH-7403">
                <Skeleton width="46%" height={40} radius={18} />
                <div style={{ justifySelf: "end", width: "52%" }}>
                  <Skeleton width="100%" height={40} radius={18} />
                </div>
                <Skeleton width="38%" height={40} radius={18} />
              </div>
            ) : !api.msgs.length ? (
              api.redesign && !conv.group ? (
                <HelloCard
                  name={conv.title}
                  id={convAvatarId(api, conv)}
                  role={conv.subtitle ?? ""}
                  coach={api.viewer.role === "coach"}
                  year={convYear(api, conv)}
                  onStarter={(text) => setSeed({ text, nonce: Date.now() })}
                />
              ) : (
              <EmptyState compact code="CH-7304" title="No messages yet" body={`Say hello to ${conv.group ? "the group" : firstName(conv.title)}.`} />
              )
            ) : (
              // B7, as on desktop: a deletion closes in place and an arrival rises in at its full height, so the thread above
              // never moves (owner, 2026-10-31, as Fairway); the scroll stays with useThreadAnchor.
              <ListPresence key={conv.id} flip={false} arrive="rise">
                {items.flatMap((it) =>
                  it.kind === "day"
                    ? [
                        <PresenceRow as="div" key={it.key} className="ch-ms-day">
                          <span>{it.label}{api.redesign ? <b className="ch-num"> {clock(it.at, api.timeZone, api.clock)}</b> : null}</span>
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
                          picking={false}
                          setPicking={() => {}}
                          onEdit={() => setEditing(it.m)}
                          onDelete={() => setDeleting(it.m)}
                          onActions={it.m.deleted ? undefined : () => (notePollHold(), setActing(it.m))}
                          onReply={() => reply(it.m)}
                          carrier={it.m.id === carrierId}
                          onSeenBy={conv.group ? (m) => seenList.open(m, null) : undefined}
                        />,
                      ],
                )}
              </ListPresence>
            )}
            {/* CH-7602, as on desktop: no dots under a thread that didn't load or is still loading. */}
            {api.redesign && api.typing && !api.msgsError && !(api.msgsLoading && !api.msgs.length) && (
              (api.typingUserIds?.length ? api.typingUserIds : [conv.memberIds[0] ?? ""]).map((id) => {
                const who = personOf(api, id);
                const name = firstName(who?.name ?? conv.title);
                return (
                  <div key={id} className="ch-ms-msg is-first">
                    <span className="ch-ms-msg__av">{<Avatar name={who?.name ?? conv.title} id={who ? (who.playerId ?? who.userId) : convAvatarId(api, conv)} size="sm" />}</span>
                    <div className="ch-ms-msg__col">
                      <div className={"ch-msv-typing" + (conv.group ? " has-name" : "")} role="status" aria-label={`${name} is typing`}>
                        {conv.group && <b className="ch-msv-bname">{name}</b>}
                        <span className="ch-msv-typing__dots"><i /><i /><i /></span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {!api.redesign && api.typing && !api.msgsError && !(api.msgsLoading && !api.msgs.length) && (
              <div className="ch-ms-msg is-first">
                <span className="ch-ms-msg__av">{!conv.group && <Avatar name={conv.title} id={convAvatarId(api, conv)} size={30} />}</span>
                <div className="ch-ms-msg__col">
                  <div className="ch-ms-typing" role="status" aria-label={`${conv.group ? "Someone" : firstName(conv.title)} is typing`}>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionBoundary>
      {api.redesign ? (
        <>
          <ThreadDatePill scroller={scroller} />
          <ThreadJumpKey scroller={scroller} unseen={anchor.unseen} onJump={jumpToEnd} />
        </>
      ) : (
        <ThreadBelow anchor={anchor} />
      )}
      <div ref={composerRef} className="ch-msp-composer">
      <Composer
        key={conv.id}
        api={api}
        conv={conv}
        editing={api.redesign ? editing : null}
        onEditDone={() => setEditing(null)}
        phone
        unavailable={api.msgsError}
        initialDraft={firstMessage?.text}
        initialFiles={firstMessage?.files}
        autoSend={!!firstMessage}
        replyToId={replyToId}
        onClearReply={() => setReplyToId(null)}
        onSendingChange={(sending) => { replySendingRef.current = sending; setReplySending(sending); }}
        seed={seed}
      />
      </div>

      {api.redesign && acting && (
        <HoldLift
          key={acting.id}
          messageId={acting.id}
          mine={acting.mine}
          closeSignal={holdClose}
          onReopen={() => {
            holdAfter.current = null;
          }}
          onClosed={() => {
            const then = holdAfter.current;
            holdAfter.current = null;
            setActing(null);
            then?.();
          }}
          bar={REACTIONS.map((r) => {
            const on = (api.reactions.get(acting.id) ?? []).some((x) => x.key === r.key && x.mine);
            return (
              <button
                key={r.key}
                type="button"
                className={on ? "is-on" : undefined}
                aria-label={`${on ? "Remove" : "React"} ${r.key.toLowerCase()}`}
                aria-pressed={on}
                onClick={() => {
                  haptic("select");
                  pickHold(() => api.react(acting.id, r.key, !on));
                }}
              >
                <Icon icon={r.icon} size={22} />
              </button>
            );
          })}
        >
          {acting.poll && <PollSheetRows hold id={acting.id} done={() => pickHold(() => undefined)} />}
          <SheetRow hold icon={Reply} label="Reply" disabled={replySending} onClick={() => pickHold(() => reply(acting))} />
          {conv.group && !acting.mine && <SeenSheetRow hold api={api} m={acting} open={() => pickHold(() => seenList.open(acting, null))} />}
          {acting.text && <SheetRow hold icon={Copy} label={acting.poll ? "Copy poll" : "Copy"} onClick={() => pickHold(() => void copy(acting))} />}
          {acting.mine && acting.text && !acting.poll && <SheetRow hold icon={Pencil} label="Edit" onClick={() => pickHold(() => setEditing(acting))} />}
          {conv.group && acting.mine && <HoldSeenRow api={api} m={acting} onOpen={() => pickHold(() => seenList.open(acting, null))} />}
          {acting.mine && <hr />}
          {acting.mine && <SheetRow hold icon={Trash2} label="Delete" danger onClick={() => pickHold(() => setDeleting(acting))} />}
        </HoldLift>
      )}
      <Modal code="CH-7604" open={!api.redesign && acting != null} onClose={() => setActing(null)} title="Message">
        {acting && (
          <div className="ch-msp-acts">
            <div role="group" className="ch-msp-acts__preview" aria-label="Selected message">
              {/* Whose it is, then when (wave 5 #20): in a group the time alone doesn't say. */}
              <span className="ch-ms-msg__t ch-num">
                {acting.mine ? "You" : firstName(personOf(api, acting.senderId)?.name ?? "Member")} · {clock(acting.at, api.timeZone, api.clock)}
                {conv.group && <ActingSeenMeta api={api} m={acting} />}
              </span>
              <p>{acting.text || (acting.hasAttachments ? "Attachment" : "Message")}</p>
            </div>
            <div className="ch-msp-acts__react" role="group" aria-label="Reactions">
              {REACTIONS.map((r) => {
                const on = (api.reactions.get(acting.id) ?? []).some((x) => x.key === r.key && x.mine);
                return (
                  <button
                    key={r.key}
                    type="button"
                    className={"ch-ms-reactbar__b" + (on ? " is-on" : "")}
                    aria-label={`${on ? "Remove" : "React"} ${r.key.toLowerCase()}`}
                    aria-pressed={on}
                    onClick={() => {
                      haptic("select");
                      api.react(acting.id, r.key, !on);
                      setActing(null);
                    }}
                  >
                    <Icon icon={r.icon} size={18} />
                  </button>
                );
              })}
            </div>
            <div className="ch-msp-panel">
              {acting.poll && <PollSheetRows id={acting.id} done={() => setActing(null)} />}
              <SheetRow icon={Reply} label="Reply" disabled={replySending} onClick={() => reply(acting)} />
              {conv.group && <SeenSheetRow api={api} m={acting} open={() => (setActing(null), seenList.open(acting, null))} />}
              {acting.text && (
                <SheetRow icon={Copy} label={acting.poll ? "Copy poll" : "Copy"} onClick={() => (setActing(null), void copy(acting))} />
              )}
              {acting.mine && acting.text && !acting.poll && (
                <SheetRow icon={Pencil} label="Edit" onClick={() => (setActing(null), setEditing(acting))} />
              )}
              {acting.mine && (
                <SheetRow icon={Trash2} label="Delete" danger onClick={() => (setActing(null), setDeleting(acting))} />
              )}
            </div>
          </div>
        )}
      </Modal>
      <EditMessageModal api={api} message={api.redesign ? null : editing} onClose={() => setEditing(null)} />
      <DeleteMessageModal api={api} message={deleting} onClose={() => setDeleting(null)} />
      {seenList.render(api, true)}
    </PhoneScreen>
    </PollThreadContext.Provider>
  );
}

/** P-1 slice 6: "Seen by 9 of 11" in the long-press sheet, for a coach, between Reply and Copy. */
function SeenSheetRow({ api, m, open, hold }: { api: ChMessagesApi; m: ChMsg; open: () => void; hold?: boolean }) {
  const seen = useSeenBy(api, m);
  if (!seen?.canOpen) return null;
  return <SheetRow hold={hold} icon={CheckCheck} label={seen.label === "Sent" ? "Not seen yet" : seen.label} onClick={open} />;
}

/** P-1: a player under (a) sees the count of their own message in the sheet's preview line, never the list. */
function ActingSeenMeta({ api, m }: { api: ChMessagesApi; m: ChMsg }) {
  const seen = useSeenBy(api, m);
  if (!seen || seen.canOpen) return null;
  return <> · {seen.label}</>;
}

/** D26: a poll's own rows in the long-press sheet, from its card's live state: See votes, Remind, Close poll, Share result. */
function PollSheetRows({ id, done, hold }: { id: string; done: () => void; hold?: boolean }) {
  const a = pollCardActions(id);
  if (!a) return null;
  const run = (f: () => void) => () => {
    done();
    f();
  };
  return (
    <>
      {a.seeVotes && <SheetRow hold={hold} icon={ListChecks} label="See votes" onClick={run(a.seeVotes)} />}
      {a.remind && <SheetRow hold={hold} icon={BellRing} label={`Remind ${a.remind.count}`} onClick={run(a.remind.run)} />}
      {a.close && <SheetRow hold={hold} icon={Lock} label="Close poll" onClick={run(a.close)} />}
      {a.share && <SheetRow hold={hold} icon={Share} label="Share result" onClick={run(a.share)} />}
    </>
  );
}

function SheetRow({ icon, label, onClick, danger, disabled, hold }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean; disabled?: boolean; /** The redesign's glass menu: the word, then the icon (S-MSG.hold). */ hold?: boolean }) {
  if (hold)
    return (
      <button type="button" className={danger ? "is-danger" : undefined} onClick={onClick} disabled={disabled}>
        <span>{label}</span>
        <Icon icon={icon} size={18} />
      </button>
    );
  return (
    <button type="button" className={"ch-msp-row is-btn" + (danger ? " is-danger" : "")} onClick={onClick} disabled={disabled}>
      <span className="ch-msp-row__ic">
        <Icon icon={icon} size={16} />
      </span>
      <span className="ch-msp-row__b">
        <b>{label}</b>
      </span>
    </button>
  );
}

/* Details */

function Panel({ title, action, children, code }: { title?: string; action?: ReactNode; children: ReactNode; code?: string }) {
  return (
    <section className={"ch-msp-panel" + (title ? "" : " is-plain")} aria-label={title} data-ch-code={code}>
      {title && (
        <div className="ch-msp-panel__h">
          <h3>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function PhoneDetails({ api, conv, onBack }: { api: ChMessagesApi; conv: ChConv; onBack: () => void }) {
  const coach = api.viewer.role === "coach";
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ChMember | null>(null);
  const [muteBusy, setMuteBusy] = useState(false);
  const titleId = `ch-msp-details-${conv.id}`;
  const mine = conv.creatorId === api.viewer.userId;
  const other = !conv.group ? personOf(api, conv.memberIds[0] ?? "") : undefined;
  const creator = conv.creatorId ? personOf(api, conv.creatorId) : undefined;
  // Schedule opens Calendar's New event, as the desktop thread header does: a direct thread with a player invites that
  // player alone (`with=`, D-52); a group or a coach's thread invites nobody.
  const scheduleWith = other?.role === "player" ? other.playerId : null;
  const calendarHref = coach
    ? rebuiltHref(`/golf/dashboard/calendar?new=1${scheduleWith ? `&with=${encodeURIComponent(scheduleWith)}` : ""}`, api.viewer.role)
    : null;
  const statsHref = coach && other?.role === "player" && other.playerId ? rebuiltHref("/golf/dashboard/stats", api.viewer.role) : null;
  const muted = !!api.mute?.muted;
  // The Mute tile offers desktop's three choices (8 hours, a week, until turned back on); muted, it turns notifications
  // back on. It is the one control: the duplicate switch went (owner decision, wave 5).
  const [choosing, setChoosing] = useState(false);
  const setMute = async (on: boolean, hours: number | null) => {
    setChoosing(false);
    if (!api.mute || muteBusy) return;
    setMuteBusy(true);
    await api.setMute(on, hours);
    setMuteBusy(false);
  };
  const tiles = (calendarHref ? 1 : 0) + 1;
  const muteV2 = useMuteAction(api);
  const [searching, setSearching] = useState(false);
  const message = async (userId: string) => {
    if (!conv.group && userId === conv.memberIds[0]) return onBack();
    await api.startDirect(userId);
  };
  return (
    <PhoneScreen labelledBy={titleId} className="ch-msp-details">
      <PhoneBar back={{ label: api.redesign ? "Back" : "Chat", onBack }} title="Details" titleId={titleId} />
      <div className="ch-msp-scroll">
        <SectionBoundary surface="messages.details" label="Details" code="CH-7213">
          <div className="ch-msp-page">
            <section className="ch-msp-prof">
              {conv.group ? <GroupMark size="lg" flag={!!api.redesign && !!conv.channel} /> : <Avatar name={conv.title} id={convAvatarId(api, conv)} size={api.redesign ? 84 : 72} year={api.redesign ? convYear(api, conv) : null} />}
              <h2>{conv.title}</h2>
              <p className="ch-num">
                {api.redesign ? detailsLine(conv, api.teamName) : conv.group
                  ? `${conv.memberCount} members · created by ${mine ? "you" : creator ? firstName(creator.name) : "a coach"}`
                  : conv.subtitle}
              </p>
              {api.redesign ? (
                <QuickActions
                  api={api}
                  conv={conv}
                  mute={muteV2}
                  profileHref={statsHref && other?.playerId ? `${statsHref}?player=${encodeURIComponent(other.playerId)}` : null}
                  onSearch={() => setSearching((v) => !v)}
                  onFiles={() => document.querySelector(".ch-msp-details .ch-msv-files")?.scrollIntoView({ block: "start" })}
                  onAdd={() => setAdding(true)}
                  onLeave={() => setLeaving(true)}
                />
              ) : (
              <div className="ch-msp-tiles" style={{ ["--ch-msp-n" as string]: tiles }}>
                {calendarHref && (
                  <Link className="ch-msp-tile" href={calendarHref}>
                    <Icon icon={CalendarPlus} size={18} />
                    <span>Schedule</span>
                  </Link>
                )}
                <button
                  type="button"
                  className="ch-msp-tile"
                  aria-pressed={muted}
                  aria-haspopup={muted ? undefined : "dialog"}
                  aria-label={muted ? "Muted. Turn notifications back on" : "Mute this conversation"}
                  disabled={!api.mute || muteBusy}
                  onClick={() => {
                    if (muted) return void setMute(false, null);
                    haptic("select");
                    setChoosing(true);
                  }}
                >
                  <Icon icon={muted ? BellOff : Bell} size={18} />
                  <span>{muted ? "Muted" : "Mute"}</span>
                </button>
              </div>
              )}
            </section>

            {api.redesign && searching && <ConversationSearch api={api} conv={conv} onClose={() => setSearching(false)} onPicked={onBack} />}

            {api.classDay && !conv.group && (!api.redesign || coach) && (
              <ThreadClassSection
                cls={api.classDay}
                conv={conv}
                other={personOf(api, conv.memberIds[0] ?? "")}
                wrap={(content) => (
                  <Panel title="Class status">
                    <div className="ch-msp-pad">{content}</div>
                  </Panel>
                )}
              />
            )}

            {api.redesign ? (
              <>
                {conv.group && <MembersCard api={api} conv={conv} onMessage={(id) => void message(id)} onRemove={mine && api.removeMember ? setRemoving : undefined} />}
                {/* Schedule keeps its place on the page; the four across are the drawn four. */}
                {calendarHref && (
                  <Panel>
                    <Link className="ch-msp-row is-btn" href={calendarHref}>
                      <span className="ch-msp-row__ic">
                        <Icon icon={CalendarPlus} size={16} />
                      </span>
                      <span className="ch-msp-row__b">
                        <b>Schedule</b>
                      </span>
                      <Icon icon={ChevronRight} size={16} className="ch-msp-chev" />
                    </Link>
                  </Panel>
                )}
              </>
            ) : conv.group ? (
              <Panel
                title="Members"
                action={
                  mine ? (
                    <button type="button" className="ch-msp-link" onClick={() => setAdding(true)}>
                      Add
                    </button>
                  ) : undefined
                }
              >
                {api.membersError ? (
                  <InlineNotice code="CH-7204" title="Members didn’t load" body="Try again." onRetry={api.retryMembers} />
                ) : !api.members ? (
                  <div className="ch-msp-pad" aria-busy="true" data-ch-code="CH-7405">
                    <Skeleton height={36} />
                    <Skeleton height={36} />
                    <Skeleton height={36} />
                  </div>
                ) : (
                  api.members.map((mb) => (
                    <PersonRow
                      key={mb.userId}
                      name={mb.name}
                      id={personOf(api, mb.userId)?.playerId ?? mb.userId}
                      you={mb.userId === api.viewer.userId}
                      sub={[mb.subtitle, mb.userId === conv.creatorId ? "Admin" : null].filter(Boolean).join(" · ")}
                      onMessage={mb.userId === api.viewer.userId ? undefined : () => void message(mb.userId)}
                      // The creator removes anyone but themselves (removeGolfGroupMember), after a confirm (CH-7504).
                      onRemove={mine && api.removeMember && mb.userId !== api.viewer.userId ? () => setRemoving(mb) : undefined}
                    />
                  ))
                )}
              </Panel>
            ) : (
              <Panel title="People">
                <PersonRow name={api.viewer.name} id={personOf(api, api.viewer.userId)?.playerId ?? api.viewer.userId} you sub={coach ? "Coach" : "Player"} />
                <PersonRow name={conv.title} id={convAvatarId(api, conv)} sub={conv.subtitle} onMessage={() => void message(conv.memberIds[0] ?? "")} />
                {statsHref && other?.playerId && (
                  <Link className="ch-msp-row is-btn" href={`${statsHref}?player=${encodeURIComponent(other.playerId)}`}>
                    <span className="ch-msp-row__ic">
                      <Icon icon={ChartColumn} size={16} />
                    </span>
                    <span className="ch-msp-row__b">
                      <b>View stats</b>
                    </span>
                    <Icon icon={ChevronRight} size={16} className="ch-msp-chev" />
                  </Link>
                )}
              </Panel>
            )}

            {api.redesign ? <PhotosAndFiles api={api} conv={conv} /> : <FilesPanel api={api} conv={conv} />}

            {/* With the switch gone it can have nothing to show: then it isn't drawn. */}
            {(api.muteError || !api.mute || muted || (conv.group && !mine && !api.redesign) || api.deleteConversation) && (
              <Panel>
                {api.muteError ? (
                  <InlineNotice code="CH-7208" title="The mute setting didn’t load" body="Try again." onRetry={api.retryMute} />
                ) : !api.mute ? (
                  <div className="ch-msp-pad" aria-busy="true" data-ch-code="CH-7407">
                    <Skeleton height={30} />
                  </div>
                ) : (
                  muted && (
                    <div className="ch-msp-set">
                      <span className="ch-msp-set__note ch-num">{muteLabel(api.mute, api)}</span>
                    </div>
                  )
                )}
                {conv.group && !mine && !api.redesign && (
                  <button type="button" className="ch-msp-danger" onClick={() => setLeaving(true)}>
                    Leave group
                  </button>
                )}
                {api.deleteConversation && (
                  <button type="button" className="ch-msp-danger" onClick={() => setDeleting(true)}>
                    Delete conversation
                  </button>
                )}
              </Panel>
            )}
          </div>
        </SectionBoundary>
      </div>
      {api.redesign && muteV2.choosing && <MuteMenu anchor={muteV2.anchor} onPick={(h) => void muteV2.setMute(true, h)} onClose={() => muteV2.setChoosing(false)} />}
      <Modal
        open={choosing}
        onClose={() => setChoosing(false)}
        icon={BellOff}
        title="Mute this conversation"
        description="No email, push or bell for it. Unread messages still show here."
      >
        <div className="ch-msp-panel">
          <SheetRow icon={Clock} label="Mute 8 hours" onClick={() => void setMute(true, 8)} />
          <SheetRow icon={CalendarDays} label="Mute a week" onClick={() => void setMute(true, 24 * 7)} />
          <SheetRow icon={BellOff} label="Until I turn it on" onClick={() => void setMute(true, null)} />
        </div>
      </Modal>
      <LeaveGroupModal api={api} conv={conv} open={leaving} onClose={() => setLeaving(false)} onLeft={() => {}} />
      <DeleteConversationModal api={api} conv={conv} open={deleting} onClose={() => setDeleting(false)} onDeleted={() => {}} />
      {mine && conv.group && <AddMembersModal api={api} conv={conv} open={adding} onClose={() => setAdding(false)} />}
      {mine && conv.group && api.removeMember && <RemoveMemberModal api={api} conv={conv} member={removing} onClose={() => setRemoving(null)} />}
    </PhoneScreen>
  );
}

function PersonRow({ name, id, sub, you = false, onMessage, onRemove }: { name: string; id?: string | null; sub: string; you?: boolean; onMessage?: () => void; onRemove?: () => void }) {
  return (
    <div className="ch-msp-row">
      <Avatar name={name} id={id} size="md" />
      <span className="ch-msp-row__b">
        <b>
          {name}
          {you ? " (you)" : ""}
        </b>
        {sub && <span>{sub}</span>}
      </span>
      {onRemove && (
        <button type="button" className="ch-msp-icon is-remove" aria-label={`Remove ${name}`} onClick={onRemove}>
          <Icon icon={UserMinus} size={17} />
        </button>
      )}
      {onMessage && (
        <button type="button" className="ch-msp-icon" aria-label={`Message ${name}`} onClick={onMessage}>
          <Icon icon={MessageSquare} size={17} />
        </button>
      )}
    </div>
  );
}

/**
 * The conversation's shared files (D-48): loading (CH-7409), didn't load
 * (CH-7214), none yet (CH-7306). Tapping one opens it (CH-7021 when it will
 * not). The read and the open are `useConversationFiles`, shared with desktop.
 */
function FilesPanel({ api, conv }: { api: ChMessagesApi; conv: ChConv }) {
  const { files, failed, retry, open } = useConversationFiles(api, conv);
  return (
    <Panel
      title="Files"
      action={files && files.length > 0 ? <span className="ch-msp-count ch-num">{files.length}</span> : undefined}
    >
      {failed ? (
        <InlineNotice code="CH-7214" title="Files didn’t load" body="Your messages are safe. Try again." onRetry={retry} />
      ) : !files ? (
        <div className="ch-msp-pad" aria-busy="true" data-ch-code="CH-7409">
          <Skeleton height={36} />
        </div>
      ) : !files.length ? (
        <p className="ch-msp-none" data-ch-code="CH-7306">
          No files shared yet.
        </p>
      ) : (
        files.map((f) => (
          <button key={f.id} type="button" className="ch-msp-row is-btn" onClick={() => void open(f)}>
            <span className="ch-msp-row__ic">
              <Icon icon={FileText} size={15} />
            </span>
            <span className="ch-msp-row__b">
              <b>{f.name}</b>
              <span className="ch-num">{fileMeta(f, api)}</span>
            </span>
          </button>
        ))
      )}
    </Panel>
  );
}

/* New message */

function PhoneNewMessage({
  api,
  onCancel,
  onAnnounce,
  onFirstMessage,
  draft: kept,
  onDraft,
}: {
  api: ChMessagesApi;
  onCancel: () => void;
  onAnnounce: () => void;
  /** Hands the first message to the thread that opens next; null takes it back. */
  onFirstMessage: (first: FirstMessage | null) => void;
  /** The first message as last left, held by MessagesPhone so Cancel doesn't lose it. */
  draft: FirstMessage;
  onDraft: (draft: FirstMessage) => void;
}) {
  const coach = api.viewer.role === "coach";
  // A prefilled message (prefill.ts) arrives with its people and its group name. Its draft is quoted here and lands in
  // the new thread's composer (not this screen's first message, which Next sends): the coach presses Send there.
  const [seed] = useState(() => api.prefill ?? null);
  const [to, setTo] = useState<string[]>(() => (seed ? (coach ? seed.to : seed.to.slice(0, 1)) : []));
  const [q, setQ] = useState("");
  const [name, setName] = useState(seed?.title ?? "");
  const draft = kept.text;
  const files = kept.files;
  const setDraft = (text: string) => onDraft({ text, files });
  const setFiles = (next: File[]) => onDraft({ text: draft, files: next });
  const addFiles = useAddAttachments();
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const nameInput = useRef<HTMLInputElement | null>(null);
  // The first message box grows as the thread's does (wave 5 #4), and toasts sit above it (#1).
  const box = useRef<HTMLTextAreaElement | null>(null);
  const footer = useRef<HTMLElement | null>(null);
  useAutosize(box, draft);
  useComposerInset(footer);
  const group = coach && to.length > 1;
  const needsName = group && !name.trim();
  // A coach's group is a team broadcast: with no player in it, it would reach the whole team (groupLacksPlayer).
  const needsPlayer = group && groupLacksPlayer(api.viewer.role, to, api.directory);
  // The lane's Suggested: people with no direct thread yet; a search looks through everyone (d64).
  const direct = new Set(api.convs.filter((c) => !c.group).map((c) => c.memberIds[0]));
  const people = api.directory.filter((p) => (q.trim() ? p.name.toLowerCase().includes(q.trim().toLowerCase()) : !api.redesign || !direct.has(p.userId) || to.includes(p.userId)));
  const players = api.directory.filter((p) => p.role === "player");
  const coaches = api.directory.filter((p) => p.role === "coach");
  const seniors = players.filter((p) => p.subtitle === "Senior");
  const toggle = (id: string) => {
    haptic("select");
    // Redesign, a player: the token shows, then the conversation opens (MSG-NEW-03). A coach may pick several for a group, so Next stays.
    if (api.redesign && !coach && to[0] !== id) {
      setTo([id]);
      setBusy(true);
      window.setTimeout(() => {
        chTrail("messages start direct");
        void api.startDirect(id).then(() => setBusy(false));
      }, tokenBeat());
      return;
    }
    // Players start direct threads only (D-15): a second pick replaces the first.
    setTo((cur) => (!coach ? (cur[0] === id ? [] : [id]) : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };
  const pick = (ids: string[], groupName: string) => {
    haptic("select");
    setTo(ids);
    setName(groupName);
    setQ("");
  };
  const go = async () => {
    if (!to.length || busy) return;
    if (needsName || needsPlayer) {
      setTouched(true);
      haptic("warning");
      if (needsName) nameInput.current?.focus();
      return;
    }
    setBusy(true);
    const text = draft.trim();
    // Handed over first: the thread opens as soon as the conversation exists, and its composer sends it
    // (files through the same `api.sendFiles` the thread's attach uses, so its limits and errors apply).
    onFirstMessage(text || files.length ? { text, files } : null);
    chTrail(group ? "messages create group" : "messages start direct");
    const ok = group ? await api.createGroup(to, name.trim()) : await api.startDirect(to[0]!);
    setBusy(false);
    if (!ok) onFirstMessage(null);
    // The thread has it now; a failure leaves it here.
    else onDraft({ text: "", files: [] });
  };
  // A hardware keyboard's Esc is Cancel (audit A-28): the same pop, history step and focus return as the button. A
  // dialog or menu open over the screen takes its own Esc first, and a screen already leaving (after Next) ignores it,
  // so it cannot clear a prefill the new thread is taking.
  const present = useIsPresent();
  useEffect(() => {
    if (!present) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      if (e.target instanceof Element && e.target.closest("dialog, [role='dialog'], [role='menu']")) return;
      e.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, present]);
  const who = to.length === 1 ? firstName(personOf(api, to[0]!)?.name ?? "them") : `${to.length} people`;
  const quickGroups = coach && !q ? (
<>
              <h2 className="ch-ms-sec__l">Quick groups</h2>
              <div className="ch-msp-panel">
                <button type="button" className="ch-msp-row is-btn" onClick={onAnnounce}>
                  <span className="ch-msp-row__ic is-round">
                    <Icon icon={Megaphone} size={16} />
                  </span>
                  <span className="ch-msp-row__b">
                    <b>Announcement</b>
                    <span>Everyone on {api.teamName ?? "the team"}, with acknowledgement</span>
                  </span>
                  <Icon icon={ChevronRight} size={16} className="ch-msp-chev" />
                </button>
                {players.length > 0 && (
                  <button
                    type="button"
                    className="ch-msp-row is-btn"
                    onClick={() => pick([...players, ...coaches].map((p) => p.userId), api.teamName ?? "Whole team")}
                  >
                    <span className="ch-msp-row__ic is-round">
                      <Icon icon={Users} size={16} />
                    </span>
                    <span className="ch-msp-row__b">
                      <b>Whole team</b>
                      <span className="ch-num">
                        {players.length} {pluralWord(players.length, "player")} · {coaches.length + 1} coaches
                      </span>
                    </span>
                    <Icon icon={ChevronRight} size={16} className="ch-msp-chev" />
                  </button>
                )}
                {seniors.length > 0 && (
                  <button type="button" className="ch-msp-row is-btn" onClick={() => pick(seniors.map((p) => p.userId), "Seniors")}>
                    <span className="ch-msp-row__ic is-round">
                      <Icon icon={UserRound} size={16} />
                    </span>
                    <span className="ch-msp-row__b">
                      <b>Seniors</b>
                      <span>{seniors.map((p) => firstName(p.name)).join(", ")}</span>
                    </span>
                    <Icon icon={ChevronRight} size={16} className="ch-msp-chev" />
                  </button>
                )}
              </div>
            </>
  ) : null;
  return (
    <PhoneScreen labelledBy="ch-msp-new-title" className="ch-msp-new" keyboardAware>
      <PhoneBar
        back={{ label: "Cancel", chevron: false, onBack: onCancel }}
        title="New message"
        titleId="ch-msp-new-title"
        action={
          !api.redesign || (coach && to.length > 0) ? (
            <PhoneTextAction onClick={() => void go()} disabled={!to.length} busy={busy}>
              {busy ? "Starting…" : group ? "Create group" : "Next"}
            </PhoneTextAction>
          ) : undefined
        }
      />
      <div className="ch-msp-to">
        <span className="ch-msp-to__k" aria-hidden="true">
          {api.redesign ? "To:" : "To"}
        </span>
        <div className="ch-msp-to__f">
          {to.map((id) => (
            <button key={id} type="button" className="ch-msp-tok" ref={api.redesign ? (el) => popIn(el, 0.8, true) : undefined} aria-label={`Remove ${personOf(api, id)?.name ?? "person"}`} onClick={() => toggle(id)}>
              {firstName(personOf(api, id)?.name ?? "Member")}
              <Icon icon={X} size={12} />
            </button>
          ))}
          <input
            className="ch-msp-to__in"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={to.length || api.redesign ? "" : "Name or group"}
            aria-label="Search people"
            autoComplete="off"
          />
        </div>
      </div>
      {group && (
        <label className="ch-msp-to is-name">
          <span className="ch-msp-to__k">Name</span>
          <input
            ref={nameInput}
            className="ch-msp-to__in"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            maxLength={80}
            aria-invalid={touched && needsName}
          />
        </label>
      )}
      <div className="ch-msp-scroll">
        <div className="ch-msp-page">
          {seed?.draft && (
            <p className="ch-ms-new__draft">
              <span>Your draft, ready in the conversation to edit and send</span>
              <q>{seed.draft}</q>
            </p>
          )}
          {touched && needsName && (
            <p className="ch-field__help is-error" data-ch-code="CH-7104" role="alert">
              Name the group so players know what it’s for.
            </p>
          )}
          {touched && needsPlayer && (
            <p className="ch-field__help is-error" data-ch-code="CH-7105" role="alert">
              Choose at least one player. Coaches join the group once it exists.
            </p>
          )}
          {!api.redesign && quickGroups}
          {api.redesign && !api.directoryError && !people.length && !q ? null : (
            <h2 className={api.redesign ? "ch-msv-suggest__h" : "ch-ms-sec__l"}>{q ? "Results" : api.redesign ? "Suggested" : "People"}</h2>
          )}
          {api.directoryError ? (
            <InlineNotice code="CH-7205" title="Your team list didn’t load" body="Try again." onRetry={api.retryDirectory} />
          ) : (
            <div className="ch-msp-panel" role="listbox" aria-multiselectable={coach} aria-label="People">
              {people.map((p) => {
                const on = to.includes(p.userId);
                return (
                  <button key={p.userId} type="button" role="option" aria-selected={on} className="ch-msp-row is-btn" onClick={() => toggle(p.userId)}>
                    {api.redesign ? <Avatar name={p.name} id={p.playerId ?? p.userId} size="md" /> : <Avatar name={p.name} id={p.playerId ?? p.userId} size="lg" />}
                    <span className="ch-msp-row__b">
                      <b>{p.name}</b>
                      <span>{p.subtitle}</span>
                    </span>
                    {(!api.redesign || on) && (
                      <span className={"ch-msp-check" + (on ? " is-on" : "")} aria-hidden="true">
                        {on && <Icon icon={Check} size={14} />}
                      </span>
                    )}
                  </button>
                );
              })}
              {!people.length && (q.trim() || !api.redesign) && <p className="ch-msp-none">{q.trim() ? `No one matches “${q.trim()}”.` : "No one to message yet."}</p>}
            </div>
          )}
          {group && <p className="ch-msp-hint ch-num">Messages to {to.length} people start a new group.</p>}
          {api.redesign && quickGroups}
        </div>
      </div>
      <footer ref={footer} className="ch-ms-comp" hidden={api.redesign && !to.length}>
        <AttachChips files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
        <div className="ch-ms-comp__field">
          <AttachButton phone disabled={!to.length} onPick={(picked) => setFiles(addFiles(files, picked))} />
          <textarea
            ref={box}
            rows={1}
            aria-label={to.length ? `Message ${who}` : "Choose who to message"}
            placeholder={to.length ? `Message ${who}` : "Choose who to message"}
            value={draft}
            disabled={!to.length}
            maxLength={MESSAGE_MAX}
            onChange={(e) => setDraft(e.target.value)}
            // Return adds a line, as in the thread; Send sends.
            enterKeyHint="enter"
          />
          <button
            type="button"
            className={"ch-ms-send" + (to.length && (draft.trim() || files.length) && !busy ? " is-ready" : "")}
            onClick={() => void go()}
            disabled={!to.length || !(draft.trim() || files.length) || busy}
            aria-label="Send"
          >
            <Icon icon={ArrowUp} size={17} />
          </button>
        </div>
        <CharsLeft text={draft} />
      </footer>
    </PhoneScreen>
  );
}

/* New announcement (a coach's, from New message: D-44) */

function PhoneAnnouncementForm({ api, onCancel, draft, onDraft }: { api: ChMessagesApi; onCancel: () => void; draft: AnnDraft; onDraft: (d: AnnDraft) => void }) {
  // Held by MessagesPhone, so Cancel keeps it until the post lands (wave 5 #7).
  const { title, body, urgent, ack } = draft;
  const setTitle = (v: string) => onDraft({ ...draft, title: v });
  const setBody = (v: string) => onDraft({ ...draft, body: v });
  const setUrgent = (v: boolean) => onDraft({ ...draft, urgent: v });
  const setAck = (v: boolean) => onDraft({ ...draft, ack: v });
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const needsTitle = !title.trim();
  const needsBody = !body.trim();
  const post = async () => {
    setTouched(true);
    if (needsTitle || needsBody) {
      haptic("warning");
      return;
    }
    setBusy(true);
    const ok = await api.createAnnouncement({ title: title.trim(), body: body.trim(), urgent, ack });
    setBusy(false);
    if (ok) onDraft(NO_ANN);
  };
  return (
    <PhoneScreen labelledBy="ch-msp-announce-title" className="ch-msp-announce" keyboardAware>
      <PhoneBar
        back={{ label: "Cancel", chevron: false, onBack: onCancel }}
        title="New announcement"
        titleId="ch-msp-announce-title"
        action={
          <PhoneTextAction onClick={() => void post()} busy={busy}>
            {busy ? "Posting…" : "Post"}
          </PhoneTextAction>
        }
      />
      <div className="ch-msp-scroll">
        <div className="ch-msp-page">
          <p className="ch-msp-hint">Goes to everyone on {api.teamName ?? "the team"}. Players can acknowledge it.</p>
          <label className="ch-field">
            <span className="ch-field__label">Title</span>
            <input className="ch-input" placeholder="Bus time moved to 6:00" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={touched && needsTitle} />
            {touched && needsTitle && (
              <span className="ch-field__help is-error" data-ch-code="CH-7102">
                Give the announcement a title.
              </span>
            )}
          </label>
          <label className="ch-field">
            <span className="ch-field__label">Message</span>
            <textarea className="ch-textarea" rows={5} placeholder="What the team needs to know, and by when" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} aria-invalid={touched && needsBody} />
            {touched && needsBody && (
              <span className="ch-field__help is-error" data-ch-code="CH-7103">
                Write what the team needs to know.
              </span>
            )}
          </label>
          <div className="ch-msp-panel">
            <div className="ch-msp-set">
              <Switch checked={urgent} onChange={setUrgent} label="Urgent" />
            </div>
            <div className="ch-msp-set">
              <Switch checked={ack} onChange={setAck} label="Ask players to acknowledge" />
            </div>
          </div>
        </div>
      </div>
    </PhoneScreen>
  );
}
