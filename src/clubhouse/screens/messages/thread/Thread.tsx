'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChConv, type ChMsg, threadItems } from '../model';
import { useState, useRef, useMemo, useEffect } from 'react';
import { haptic } from '../../../lib/haptics';
import { receiptCarrierId, SEEN_BY_VISIBILITY } from '@/lib/golf/message-receipts';
import { useSeenByList } from '../seen-by';
import { type PollThreadActions, PollThreadContext } from '../polls';
import { personOf } from '../person-of';
import { rebuiltHref } from '../../../shell/nav';
import { useThreadAnchor } from '../use-thread-anchor';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useThreadMakeRoom, useSpringToEnd, useReplyFromTyping, useSendRise, ThreadDatePill, ThreadJumpKey } from '../thread-v2';
import { useFocusMessage } from '../use-focus-message';
import { usePanelSmoothScroll } from '../../../lib/smooth-scroll';
import { IconButton } from '../../../ui/Button';
import { ChevronLeft, Users, Search, CalendarPlus, Info } from 'lucide-react';
import { Icon } from '../../../ui/Icon';
import { Avatar } from '../../../ui/Avatar';
import { convAvatarId, convAvatarName } from '../shared/conv-ui';
import { ThreadClassSub } from '../ThreadClassSub';
import { Tooltip } from '../../../ui/Tooltip';
import { ConversationSearch } from '../details-v2';
import { ThreadScroller } from './ThreadScroller';
import { Bubble } from './Bubble';
import { Composer } from './Composer';
import { TypingRows } from './TypingRows';
import { useThreadLayers } from './use-thread-layers';
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
  // The same send, arrival and jump hooks as the phone (MOT-SEND-7, -12, MOT-JMP-3): the artifact runs them on both devices.
  const jumpToEnd = useSpringToEnd(scroller, anchor.toEnd, reducedMotion);
  useReplyFromTyping(scroller, api.msgs.length, !!api.typing, true, reducedMotion);
  useSendRise(scroller, api.msgs.length, true, reducedMotion);
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

  // MSG-202: "11 members" / "6 members" for a group, the person's role for a direct thread (no member names).
  const sub = conv.group ? `${conv.memberCount} members` : conv.subtitle;
  const [searching, setSearching] = useState(false);
  // MSG-202/203: the scroller runs under the glass bar and the floating composer; the bar's hairline shows once content is under it (`is-flat` at the top).
  useThreadLayers(scroller, { kind: "desk", convId: conv.id, reduced: reducedMotion });

  return (
    <PollThreadContext.Provider value={pollThread}>
    <section
      ref={section}
      className="ch-ms-thread is-layered"
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
            <Avatar name={convAvatarName(conv)} id={convAvatarId(api, conv)} size={36} />
          )}
          <div style={{ minWidth: 0 }}>
            <b>{conv.title}</b>
            <span>
              <ThreadClassSub cls={api.classDay} conv={conv} other={other} sub={sub} where="desktop" />
            </span>
          </div>
        </div>
        <div className="ch-ms-th__act">
          <IconButton icon={Search} label="Search in conversation" variant={searching ? "secondary" : "ghost"} pressed={searching} onClick={() => setSearching((v) => !v)} />
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
      <ThreadScroller
        api={api}
        conv={conv}
        scroller={scroller}
        className="ch-ms-scroll"
        items={items}
        onStarter={(text) => setSeed({ text, nonce: Date.now() })}
        renderBubble={(it) => (
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
          />
        )}
        renderTyping={() => <TypingRows api={api} conv={conv} />}
      />
      <ThreadDatePill scroller={scroller} />
      <ThreadJumpKey scroller={scroller} unseen={anchor.unseen} onJump={jumpToEnd} />
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
