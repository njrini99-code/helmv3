'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChConv, type ChMsg, threadItems, firstName, clock } from '../model';
import { useState, useRef, useMemo, useEffect } from 'react';
import { haptic } from '../../../lib/haptics';
import { receiptCarrierId, SEEN_BY_VISIBILITY } from '@/lib/golf/message-receipts';
import { useSeenByList } from '../seen-by';
import { type PollThreadActions, PollThreadContext } from '../polls';
import { useNewDivider, NewDivider } from './NewDivider';
import { personOf } from '../person-of';
import { rebuiltHref } from '../../../shell/nav';
import { useThreadAnchor } from '../use-thread-anchor';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useThreadMakeRoom, ThreadJumpKey } from '../thread-v2';
import { useFocusMessage } from '../use-focus-message';
import { usePanelSmoothScroll } from '../../../lib/smooth-scroll';
import { IconButton } from '../../../ui/Button';
import { ChevronLeft, Users, Search, CalendarPlus, Info } from 'lucide-react';
import { Icon } from '../../../ui/Icon';
import { Avatar } from '../../../ui/Avatar';
import { convAvatarId, convYear } from '../shared/conv-ui';
import { ThreadClassSub } from '../ThreadClassSub';
import { Tooltip } from '../../../ui/Tooltip';
import { ConversationSearch } from '../details-v2';
import { InlineNotice } from '../../../ui/Notices';
import { Skeleton, EmptyState } from '../../../ui/States';
import { HelloCard } from '../HelloCard';
import { ListPresence, PresenceRow } from '../../../ui/ListPresence';
import { Bubble } from './Bubble';
import { Composer } from './Composer';
import { EditMessageModal, DeleteMessageModal } from '../overlays/message-modals';

/** The thread's glide, longer than the page's (a conversation is read down a long column). */
const THREAD_SCROLL_DUR = 1.2;

export function Thread({
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
  // D30: Remind and Share result reply to the poll with a prefilled draft.
  const [seed, setSeed] = useState<{ text: string; nonce: number } | null>(null);
  // P-1: the message that carries the receipt, and the Seen by popover.
  const carrierId = useMemo(
    () => receiptCarrierId(api.msgs, { viewerId: api.viewer.userId, scope: conv.group && SEEN_BY_VISIBILITY === "everyone" ? "thread" : "mine" }),
    [api.msgs, api.viewer.userId, conv.group],
  );
  const seenList = useSeenByList();
  const pollThread = useMemo<PollThreadActions>(
    () => ({
      replyWith: (messageId, text) => {
        if (sendingRef.current) return;
        setReplying({ convId: conv.id, id: messageId });
        setSeed({ text, nonce: Date.now() });
      },
    }),
    [conv.id],
  );
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
  useThreadMakeRoom(scroller, api.msgs.length, true, reducedMotion);
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
  // Redesign: the bar's hairline shows once there is content under it (M-MSG-04b).
  const barEl = useRef<HTMLElement | null>(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => barEl.current?.classList.toggle("is-under", el.scrollTop >= 2);
    on();
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, []);

  const typistId = api.typingUserIds?.[0] ?? api.typingByConv?.get(conv.id)?.[0];
  const typist = typistId ? personOf(api, typistId) : undefined;
  return (
    <PollThreadContext.Provider value={pollThread}>
    <section
      ref={section}
      className="ch-ms-thread"
      aria-label={`Conversation with ${conv.title}`}
    >
      <header className="ch-ms-th" ref={barEl}>
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
            <Avatar name={conv.title} id={convAvatarId(api, conv)} size={36} />
          )}
          <div style={{ minWidth: 0 }}>
            <b>{conv.title}</b>
            <span>
              <ThreadClassSub cls={api.classDay} conv={conv} other={other} sub={sub} where="desktop" />
            </span>
          </div>
        </div>
        <div className="ch-ms-th__act">
          <IconButton icon={Search} label="Search this conversation" variant={searching ? "secondary" : "ghost"} pressed={searching} onClick={() => setSearching((v) => !v)} />
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
      {searching && (
        <div className="ch-msv-barsearch">
          <ConversationSearch api={api} conv={conv} onClose={() => setSearching(false)} />
        </div>
      )}
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
            !conv.group ? (
              <HelloCard name={conv.title} id={convAvatarId(api, conv)} role={conv.subtitle ?? ""} coach={api.viewer.role === "coach"} year={convYear(api, conv)} onStarter={(text) => setSeed({ text, nonce: Date.now() })} />
            ) : (
            <EmptyState compact code="CH-7304" title="No messages yet" body={`Say hello to ${conv.group ? "the group" : firstName(conv.title)}.`} />
            )
          ) : (
            // B7: a deleted message closes in place; one that arrives rises in at its full height, so the thread above it
            // never moves (owner, 2026-10-31, as Fairway's thread does). The scroll stays with useThreadAnchor (no FLIP), and
            // another conversation is a new list, whose messages never arrive.
            <ListPresence key={conv.id} flip={false} arrive="rise">
              {items.flatMap((it) =>
                it.kind === "day"
                  ? [
                      <PresenceRow as="div" key={it.key} className="ch-ms-day">
                        <span>{it.label}<b className="ch-num"> {clock(it.at, api.timeZone, api.clock)}</b></span>
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
                        carrier={it.m.id === carrierId}
                        onSeenBy={conv.group ? (m, el) => seenList.open(m, el) : undefined}
                      />,
                    ],
              )}
            </ListPresence>
          )}
          {/* No dots under a thread that didn't load or is still loading (states audit c9): nothing to type into yet. */}
          {api.typing && !api.msgsError && !(api.msgsLoading && !api.msgs.length) && (
            <div className={"ch-ms-msg is-first" + (conv.group ? " is-group" : "")} /* CH-7602: the typing dots */>
              {/* The realtime hook says someone is typing, not who: a direct thread knows; the redesign's group reads the typers. */}
              <span className="ch-ms-msg__av">
                {(conv.group && typist) && <Avatar name={typist ? typist.name : conv.title} id={typist ? (typist.playerId ?? typist.userId) : convAvatarId(api, conv)} size={30} />}
              </span>
              <div className="ch-ms-msg__col">
                <div className={"ch-msv-typing" + (conv.group ? " has-name" : "")} role="status" aria-label={`${conv.group ? (typist ? firstName(typist.name) : "Someone") : firstName(conv.title)} is typing`}>
                    {conv.group && typist && <b className="ch-msv-bname">{firstName(typist.name)}</b>}
                    <span className="ch-msv-typing__dots"><i /><i /><i /></span>
                  </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <ThreadJumpKey scroller={scroller} unseen={anchor.unseen} onJump={anchor.toEnd} />
      <Composer
        key={conv.id}
        api={api}
        conv={conv}
        editing={editing}
        onEditDone={() => setEditing(null)}
        unavailable={api.msgsError}
        replyToId={replyToId}
        onClearReply={() => setReplying(null)}
        onSendingChange={(sending) => {
          sendingRef.current = sending;
        }}
        seed={seed}
      />

      <EditMessageModal api={api} message={null} onClose={() => setEditing(null)} />
      <DeleteMessageModal api={api} message={deleting} onClose={() => setDeleting(null)} />
      {seenList.render(api, false)}
    </section>
    </PollThreadContext.Provider>
  );
}
