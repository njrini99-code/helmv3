"use client";

import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  Bell,
  BellOff,
  BarChart3,
  CalendarPlus,
  Check,
  ChevronRight,
  Copy,
  FileText,
  Info,
  Megaphone,
  MessageSquare,
  Pencil,
  SquarePen,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Avatar } from "../../ui/Avatar";
import { EmptyState, Skeleton } from "../../ui/States";
import { Icon } from "../../ui/Icon";
import { InlineNotice } from "../../ui/Notices";
import { Modal } from "../../ui/Modal";
import { PhoneBar, PhoneIconAction, PhoneTextAction } from "../../ui/PhoneBar";
import { SearchField } from "../../ui/SearchField";
import { SectionBoundary } from "../../ui/SectionBoundary";
import { Switch } from "../../ui/Switch";
import { useToast } from "../../ui/Toast";
import { haptic } from "../../lib/haptics";
import { chTrail } from "../../lib/track";
import { rebuiltHref } from "../../shell/nav";
import { PhoneScreen } from "../../shell/PhoneScreen";
import { PhoneTop, useBackFromMore, usePhoneStackHistory } from "../../shell/phone-chrome";
import {
  clock,
  dayLabel,
  filterConvs,
  firstName,
  sectionOf,
  threadItems,
  type ChConv,
  type ChConvFilter,
  type ChMsg,
} from "./model";
import { AnnouncementPane, AnnouncementsSection } from "./announcements";
import { isMessagesFirstRun, MessagesFirstRun } from "./MessagesFirstRun";
import { fileMeta, useConversationFiles } from "./files";
import {
  AddMembersModal,
  AttachButton,
  AttachChips,
  Bubble,
  Composer,
  ConvRow,
  DeleteMessageModal,
  EditMessageModal,
  LeaveGroupModal,
  MessageHits,
  REACTIONS,
  addAttachments,
  personOf,
  type ChMessagesApi,
} from "./MessagesView";

/** What New message hands the thread that opens next: the text and any files picked with it. */
type FirstMessage = { text: string; files: File[] };

/**
 * Messages on the phone: the owner's design (docs/clubhouse/phone/messages.md,
 * design/handoff/mobile/m-msg.jsx). An inbox that pushes a thread, a thread
 * that pushes its details, and New message as a pushed screen, on the same
 * container, hooks, actions and catalog as desktop. Each pushed screen is a
 * history entry, so the iOS edge swipe pops it (CH-1906).
 */
export function MessagesPhone({ api }: { api: ChMessagesApi }) {
  const coach = api.viewer.role === "coach";
  const backFromMore = useBackFromMore();
  const [composing, setComposing] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [details, setDetails] = useState(false);
  /** The first message written in New message, sent by the thread's composer once the thread opens. */
  const [firstMessage, setFirstMessage] = useState<FirstMessage | null>(null);
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
        start={!coach}
        back={coach ? { label: "More", onBack: backFromMore } : null}
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
          <PhoneInbox api={api} onNew={() => setComposing(true)} />
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
            onCancel={() => setComposing(false)}
            onAnnounce={() => {
              setComposing(false);
              setAnnouncing(true);
            }}
            onFirstMessage={setFirstMessage}
          />
        )}
        {top === "announce" && (
          <PhoneAnnouncementForm key="announce" api={api} onCancel={() => setAnnouncing(false)} />
        )}
        {top === "thread" && conv && details && (
          <PhoneDetails key={`details-${conv.id}`} api={api} conv={conv} onBack={() => setDetails(false)} />
        )}
      </AnimatePresence>
    </main>
  );
}

/* Inbox */

function PhoneInbox({ api, onNew }: { api: ChMessagesApi; onNew: () => void }) {
  const [filter, setFilter] = useState<ChConvFilter>("all");
  const [q, setQ] = useState("");
  // Conversations with something unread, not the messages added up (D-46).
  const unread = api.convs.filter((c) => c.unread > 0).length;
  const list = filterConvs(api.convs, filter, q);
  const sections: Array<[ReturnType<typeof sectionOf>, string]> = [
    ["today", "Today"],
    ["week", "This week"],
    ["earlier", "Earlier"],
  ];
  return (
    <div className="ch-msp-page">
      {/* With nothing to search or filter the page is the first-run empty alone (board: Empty state), not controls over nothing. */}
      {!isMessagesFirstRun(api) && (
        <>
          <SearchField value={q} onChange={setQ} placeholder="Search messages" label="Search conversations and messages" className="ch-msp-search" />
          <div className="ch-msp-chips" role="group" aria-label="Filter conversations">
            {(
              [
                ["all", "All"],
                ["unread", `Unread · ${unread}`],
                ["groups", "Groups"],
              ] as Array<[ChConvFilter, string]>
            ).map(([k, l]) => (
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
              </button>
            ))}
          </div>
        </>
      )}
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
              <Skeleton width={44} height={44} radius={22} />
              <span style={{ display: "grid", gap: 7 }}>
                <Skeleton width="60%" height={13} />
                <Skeleton width="85%" height={12} />
              </span>
            </div>
          ))}
        </div>
      ) : isMessagesFirstRun(api) ? (
        <MessagesFirstRun coach={api.viewer.role === "coach"} onNew={onNew} />
      ) : !api.convs.length ? (
        <EmptyState
          code="CH-7301"
          compact
          icon={MessageSquare}
          title="No conversations yet."
          body={api.viewer.role === "coach" ? "Start one with a player, or create a team group." : "Message a coach or a teammate to start."}
          action={
            <button type="button" className="ch-btn ch-btn--secondary ch-btn--sm" onClick={onNew}>
              New message
            </button>
          }
        />
      ) : (
        <>
          {filter !== "groups" && <AnnouncementsSection api={api} q={q} />}
          {sections.map(([k, l]) => {
            const rows = list.filter((c) => sectionOf(c.lastAt, api.now, api.timeZone) === k);
            if (!rows.length) return null;
            return (
              <section key={k} className="ch-ms-sec" aria-label={l}>
                <h2 className="ch-ms-sec__l">{l}</h2>
                <div className="ch-ms-sec__card">
                  {rows.map((c) => (
                    <ConvRow key={c.id} api={api} c={c} avatarSize={44} />
                  ))}
                </div>
              </section>
            );
          })}
          {!list.length && (
            <div className="ch-ms-empty" data-ch-code="CH-7302">
              {q.trim() ? `No conversation matches “${q.trim()}”.` : "Nothing unread. You’re caught up."}
            </div>
          )}
          <MessageHits api={api} q={q} />
        </>
      )}
    </div>
  );
}

/* Thread */

const GroupMark = ({ size }: { size: "sm" | "md" | "lg" }) => (
  <span className={`ch-msp-mark is-${size}`} aria-hidden="true">
    <Icon icon={Users} size={size === "lg" ? 28 : size === "md" ? 17 : 15} />
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
  const [acting, setActing] = useState<ChMsg | null>(null);
  const [editing, setEditing] = useState<ChMsg | null>(null);
  const [deleting, setDeleting] = useState<ChMsg | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const items = useMemo(() => threadItems(api.msgs, api.now, api.timeZone), [api.msgs, api.now, api.timeZone]);
  useLayoutEffect(() => {
    const s = scroller.current;
    if (s) s.scrollTop = s.scrollHeight;
  }, [conv.id, api.msgs.length, api.typing]);
  useEffect(() => {
    if (firstMessage) onFirstSent();
    // The composer has taken the first message; nothing else to hand over.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const titleId = `ch-msp-thread-${conv.id}`;
  const sub = conv.group ? `${conv.memberCount} members` : conv.subtitle;
  const copy = async (m: ChMsg) => {
    try {
      await navigator.clipboard.writeText(m.text);
      haptic("success");
      toast({ title: "Copied" });
    } catch {
      haptic("error");
      toast({ tone: "error", title: "Couldn't copy the message", body: "Try again in a moment.", code: "CH-7020" });
    }
  };
  return (
    <PhoneScreen labelledBy={titleId} className="ch-msp-thread" keyboardAware covered={covered}>
      <PhoneBar
        lead
        titleId={titleId}
        back={{ onBack, ariaLabel: "Back to Messages" }}
        title={
          <button type="button" className="ch-msp-who" onClick={onDetails}>
            {conv.group ? <GroupMark size="sm" /> : <Avatar name={conv.title} size={30} />}
            <span>
              <b>{conv.title}</b>
              <em>{sub}</em>
            </span>
          </button>
        }
        action={<PhoneIconAction icon={Info} label="Details" onClick={onDetails} />}
      />
      <SectionBoundary surface="messages.thread" label="This conversation" code="CH-7212">
        <div className="ch-msp-scroll ch-ms-scroll" ref={scroller} aria-live="polite" aria-relevant="additions">
          <div className="ch-ms-msgs">
            {api.msgsError ? (
              <InlineNotice
                code="CH-7202"
                title="This conversation didn't load."
                body="Nothing was lost. Try again; the error has been reported."
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
              <div className="ch-ms-empty" data-ch-code="CH-7304">
                No messages yet. Say hello to {conv.group ? "the group" : firstName(conv.title)}.
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
                    picking={false}
                    setPicking={() => {}}
                    onEdit={() => setEditing(it.m)}
                    onDelete={() => setDeleting(it.m)}
                    onActions={it.m.deleted ? undefined : () => setActing(it.m)}
                  />
                ),
              )
            )}
            {api.typing && (
              <div className="ch-ms-msg is-first">
                <span className="ch-ms-msg__av">{!conv.group && <Avatar name={conv.title} size={30} />}</span>
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
      <Composer
        key={conv.id}
        api={api}
        conv={conv}
        phone
        initialDraft={firstMessage?.text}
        initialFiles={firstMessage?.files}
        autoSend={!!firstMessage}
      />

      <Modal code="CH-7604" open={acting != null} onClose={() => setActing(null)} title="Message">
        {acting && (
          <div className="ch-msp-acts">
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
              {acting.text && (
                <SheetRow icon={Copy} label="Copy" onClick={() => (setActing(null), void copy(acting))} />
              )}
              {acting.mine && acting.text && (
                <SheetRow icon={Pencil} label="Edit" onClick={() => (setActing(null), setEditing(acting))} />
              )}
              {acting.mine && (
                <SheetRow icon={Trash2} label="Delete" danger onClick={() => (setActing(null), setDeleting(acting))} />
              )}
            </div>
          </div>
        )}
      </Modal>
      <EditMessageModal api={api} message={editing} onClose={() => setEditing(null)} />
      <DeleteMessageModal api={api} message={deleting} onClose={() => setDeleting(null)} />
    </PhoneScreen>
  );
}

function SheetRow({ icon, label, onClick, danger }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={"ch-msp-row is-btn" + (danger ? " is-danger" : "")} onClick={onClick}>
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
    <section className="ch-msp-panel" aria-label={title} data-ch-code={code}>
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
  const [adding, setAdding] = useState(false);
  const [muteBusy, setMuteBusy] = useState(false);
  const titleId = `ch-msp-details-${conv.id}`;
  const mine = conv.creatorId === api.viewer.userId;
  const other = !conv.group ? personOf(api, conv.memberIds[0] ?? "") : undefined;
  const creator = conv.creatorId ? personOf(api, conv.creatorId) : undefined;
  const calendarHref = coach ? rebuiltHref("/golf/dashboard/calendar?new=1", api.viewer.role) : null;
  const statsHref = coach && other?.role === "player" && other.playerId ? rebuiltHref("/golf/dashboard/stats", api.viewer.role) : null;
  const muted = !!api.mute?.muted;
  // Mute lasts until it is turned off (D-47).
  const toggleMute = async () => {
    if (!api.mute || muteBusy) return;
    setMuteBusy(true);
    await api.setMute(!muted, null);
    setMuteBusy(false);
  };
  const tiles = (calendarHref ? 1 : 0) + 1;
  const message = async (userId: string) => {
    if (!conv.group && userId === conv.memberIds[0]) return onBack();
    await api.startDirect(userId);
  };
  return (
    <PhoneScreen labelledBy={titleId} className="ch-msp-details">
      <PhoneBar back={{ label: "Chat", onBack }} title="Details" titleId={titleId} />
      <div className="ch-msp-scroll">
        <SectionBoundary surface="messages.details" label="Details" code="CH-7213">
          <div className="ch-msp-page">
            <section className="ch-msp-prof">
              {conv.group ? <GroupMark size="lg" /> : <Avatar name={conv.title} size={72} />}
              <h2>{conv.title}</h2>
              <p className="ch-num">
                {conv.group
                  ? `${conv.memberCount} members · created by ${mine ? "you" : creator ? firstName(creator.name) : "a coach"}`
                  : conv.subtitle}
              </p>
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
                  aria-label={muted ? "Muted. Turn notifications back on" : "Mute this conversation"}
                  disabled={!api.mute || muteBusy}
                  onClick={() => void toggleMute()}
                >
                  <Icon icon={muted ? BellOff : Bell} size={18} />
                  <span>{muted ? "Muted" : "Mute"}</span>
                </button>
              </div>
            </section>

            {conv.group ? (
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
                  <InlineNotice code="CH-7204" title="Members didn't load." body="Try again; the error has been reported." onRetry={api.retryMembers} />
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
                      you={mb.userId === api.viewer.userId}
                      sub={[mb.subtitle, mb.userId === conv.creatorId ? "Admin" : null].filter(Boolean).join(" · ")}
                      onMessage={mb.userId === api.viewer.userId ? undefined : () => void message(mb.userId)}
                    />
                  ))
                )}
              </Panel>
            ) : (
              <Panel title="People">
                <PersonRow name={api.viewer.name} you sub={coach ? "Coach" : "Player"} />
                <PersonRow name={conv.title} sub={conv.subtitle} onMessage={() => void message(conv.memberIds[0] ?? "")} />
                {statsHref && other?.playerId && (
                  <Link className="ch-msp-row is-btn" href={`${statsHref}?player=${encodeURIComponent(other.playerId)}`}>
                    <span className="ch-msp-row__ic">
                      <Icon icon={BarChart3} size={16} />
                    </span>
                    <span className="ch-msp-row__b">
                      <b>View stats</b>
                    </span>
                    <Icon icon={ChevronRight} size={16} className="ch-msp-chev" />
                  </Link>
                )}
              </Panel>
            )}

            <FilesPanel api={api} conv={conv} />

            <Panel>
              {api.muteError ? (
                <InlineNotice code="CH-7208" title="The mute setting didn't load." body="Try again; the error has been reported." onRetry={api.retryMute} />
              ) : !api.mute ? (
                <div className="ch-msp-pad" aria-busy="true" data-ch-code="CH-7407">
                  <Skeleton height={30} />
                </div>
              ) : (
                <div className="ch-msp-set">
                  <Switch checked={muted} onChange={() => void toggleMute()} label="Mute notifications" busy={muteBusy} />
                  {muted && api.mute.until && (
                    <span className="ch-msp-set__note ch-num">
                      Until {dayLabel(api.mute.until, api.now, api.timeZone).replace("Today", "today")} · {clock(api.mute.until, api.timeZone)}
                    </span>
                  )}
                </div>
              )}
              {conv.group && !mine && (
                <button type="button" className="ch-msp-danger" onClick={() => setLeaving(true)}>
                  Leave group
                </button>
              )}
            </Panel>
          </div>
        </SectionBoundary>
      </div>
      <LeaveGroupModal api={api} conv={conv} open={leaving} onClose={() => setLeaving(false)} onLeft={() => {}} />
      {mine && conv.group && <AddMembersModal api={api} conv={conv} open={adding} onClose={() => setAdding(false)} />}
    </PhoneScreen>
  );
}

function PersonRow({ name, sub, you = false, onMessage }: { name: string; sub: string; you?: boolean; onMessage?: () => void }) {
  return (
    <div className="ch-msp-row">
      <Avatar name={name} size={36} />
      <span className="ch-msp-row__b">
        <b>
          {name}
          {you ? " (you)" : ""}
        </b>
        {sub && <span>{sub}</span>}
      </span>
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
        <InlineNotice code="CH-7214" title="Files didn't load." body="Your messages are fine. Try again; the error has been reported." onRetry={retry} />
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
}: {
  api: ChMessagesApi;
  onCancel: () => void;
  onAnnounce: () => void;
  /** Hands the first message to the thread that opens next; null takes it back. */
  onFirstMessage: (first: FirstMessage | null) => void;
}) {
  const coach = api.viewer.role === "coach";
  const [to, setTo] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const nameInput = useRef<HTMLInputElement | null>(null);
  const group = coach && to.length > 1;
  const needsName = group && !name.trim();
  const people = api.directory.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const players = api.directory.filter((p) => p.role === "player");
  const coaches = api.directory.filter((p) => p.role === "coach");
  const seniors = players.filter((p) => p.subtitle === "Senior");
  const toggle = (id: string) => {
    haptic("select");
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
    if (needsName) {
      setTouched(true);
      haptic("warning");
      nameInput.current?.focus();
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
  };
  const who = to.length === 1 ? firstName(personOf(api, to[0]!)?.name ?? "them") : `${to.length} people`;
  return (
    <PhoneScreen labelledBy="ch-msp-new-title" className="ch-msp-new" keyboardAware>
      <PhoneBar
        back={{ label: "Cancel", chevron: false, onBack: onCancel }}
        title="New message"
        titleId="ch-msp-new-title"
        action={
          <PhoneTextAction onClick={() => void go()} disabled={!to.length} busy={busy}>
            {group ? "Create group" : "Next"}
          </PhoneTextAction>
        }
      />
      <div className="ch-msp-to">
        <span className="ch-msp-to__k" aria-hidden="true">
          To
        </span>
        <div className="ch-msp-to__f">
          {to.map((id) => (
            <button key={id} type="button" className="ch-msp-tok" aria-label={`Remove ${personOf(api, id)?.name ?? "person"}`} onClick={() => toggle(id)}>
              {firstName(personOf(api, id)?.name ?? "Member")}
              <Icon icon={X} size={12} />
            </button>
          ))}
          <input
            className="ch-msp-to__in"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={to.length ? "" : "Name or group"}
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
          {touched && needsName && (
            <p className="ch-field__help is-error" data-ch-code="CH-7104" role="alert">
              Name the group so players know what it&apos;s for.
            </p>
          )}
          {coach && !q && (
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
                        {players.length} {players.length === 1 ? "player" : "players"} · {coaches.length + 1} coaches
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
          )}
          <h2 className="ch-ms-sec__l">{q ? "Results" : "People"}</h2>
          {api.directoryError ? (
            <InlineNotice code="CH-7205" title="Your team list didn't load." body="Try again; the error has been reported." onRetry={api.retryDirectory} />
          ) : (
            <div className="ch-msp-panel" role="listbox" aria-multiselectable={coach} aria-label="People">
              {people.map((p) => {
                const on = to.includes(p.userId);
                return (
                  <button key={p.userId} type="button" role="option" aria-selected={on} className="ch-msp-row is-btn" onClick={() => toggle(p.userId)}>
                    <Avatar name={p.name} size={40} />
                    <span className="ch-msp-row__b">
                      <b>{p.name}</b>
                      <span>{p.subtitle}</span>
                    </span>
                    <span className={"ch-msp-check" + (on ? " is-on" : "")} aria-hidden="true">
                      {on && <Icon icon={Check} size={14} />}
                    </span>
                  </button>
                );
              })}
              {!people.length && <p className="ch-msp-none">{q.trim() ? `No one matches “${q.trim()}”.` : "No one to message yet."}</p>}
            </div>
          )}
          {group && <p className="ch-msp-hint ch-num">Messages to {to.length} people start a new group.</p>}
        </div>
      </div>
      <footer className="ch-ms-comp">
        <AttachChips files={files} onRemove={(i) => setFiles((s) => s.filter((_, j) => j !== i))} />
        <div className="ch-ms-comp__field">
          <AttachButton phone disabled={!to.length} onPick={(picked) => setFiles((s) => addAttachments(s, picked))} />
          <textarea
            rows={1}
            aria-label={to.length ? `Message ${who}` : "Choose who to message"}
            placeholder={to.length ? `Message ${who}` : "Choose who to message"}
            value={draft}
            disabled={!to.length}
            onChange={(e) => setDraft(e.target.value)}
            enterKeyHint="send"
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
      </footer>
    </PhoneScreen>
  );
}

/* New announcement (a coach's, from New message: D-44) */

function PhoneAnnouncementForm({ api, onCancel }: { api: ChMessagesApi; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [ack, setAck] = useState(true);
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
    await api.createAnnouncement({ title: title.trim(), body: body.trim(), urgent, ack });
    setBusy(false);
  };
  return (
    <PhoneScreen labelledBy="ch-msp-announce-title" className="ch-msp-announce" keyboardAware>
      <PhoneBar
        back={{ label: "Cancel", chevron: false, onBack: onCancel }}
        title="New announcement"
        titleId="ch-msp-announce-title"
        action={
          <PhoneTextAction onClick={() => void post()} busy={busy}>
            Post
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
