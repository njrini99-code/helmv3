'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChConv, type ChMsg, threadItems, firstName, clock } from '../model';
import type { FirstMessage } from '../details/phone-types';
import { useToast } from '../../../ui/Toast';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { useState, useRef, useMemo, useEffect } from 'react';
import { receiptCarrierId, SEEN_BY_VISIBILITY, seenByAccess } from '@/lib/golf/message-receipts';
import { useSeenByList, HoldSeenRow } from '../seen-by';
import { type PollThreadActions, PollThreadContext, notePollHold } from '../polls';
import { useNewDivider } from './NewDivider';
import { useThreadAnchor } from '../use-thread-anchor';
import { useFocusMessage } from '../use-focus-message';
import { useThreadDragTimes } from '../use-thread-drag-times';
import { useThreadMakeRoom, useSpringToEnd, useReplyFromTyping, useFaceFlight, useSendRise, ThreadDatePill, ThreadJumpKey } from '../thread-v2';
import { haptic } from '../../../lib/haptics';
import { PhoneScreen } from '../../../shell/PhoneScreen';
import { PhoneBar, PhoneIconAction } from '../../../ui/PhoneBar';
import { GroupMark, convAvatarId, convYear } from '../shared/conv-ui';
import { Avatar } from '../../../ui/Avatar';
import { ThreadClassSub } from '../ThreadClassSub';
import { personOf } from '../person-of';
import { Info, Reply, Copy, Pencil, Trash2 } from 'lucide-react';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { ThreadScroller } from './ThreadScroller';
import { Bubble } from './Bubble';
import { Composer } from './Composer';
import { HoldLift } from '../hold-lift';
import { REACTIONS } from '../overlays/reactions';
import { Icon } from '../../../ui/Icon';
import { PollSheetRows, SheetRow, SeenSheetRow, ActingSeenMeta } from '../overlays/sheet-rows';
import { Modal } from '../../../ui/Modal';
import { EditMessageModal, DeleteMessageModal } from '../overlays/message-modals';

export function PhoneThread({
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
  useThreadDragTimes(scroller, true, threadReduced);
  useThreadMakeRoom(scroller, api.msgs.length, true, threadReduced);
  const jumpToEnd = useSpringToEnd(scroller, anchor.toEnd, threadReduced);
  useReplyFromTyping(scroller, api.msgs.length, !!api.typing, true, threadReduced);
  useFaceFlight(true, threadReduced);
  useSendRise(scroller, api.msgs.length, true, threadReduced);
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
            {conv.group ? <GroupMark size="md" flag={!!conv.channel} /> : <Avatar name={conv.title} id={convAvatarId(api, conv)} size="md" year={convYear(api, conv)} />}
            <span>
              <b>{!conv.group ? firstName(conv.title) : conv.title}</b>
              <em>
                <ThreadClassSub cls={api.classDay} conv={conv} other={conv.group ? undefined : personOf(api, conv.memberIds[0] ?? "")} sub={sub} where="phone" />
              </em>
            </span>
          </button>
        }
        action={<PhoneIconAction icon={Info} label="Details" onClick={onDetails} />}
      />
      <SectionBoundary surface="messages.thread" label="This conversation" code="CH-7212">
        <ThreadScroller
          api={api}
          conv={conv}
          scroller={scroller}
          className="ch-msp-scroll ch-ms-scroll"
          items={items}
          newId={newId}
          onStarter={(text) => setSeed({ text, nonce: Date.now() })}
          renderBubble={(it) => (
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
          />
          )}
          renderTyping={() =>
          (api.typingUserIds?.length ? api.typingUserIds : conv.group ? [""] : [conv.memberIds[0] ?? ""]).map((id) => {
            const who = id ? personOf(api, id) : null;
            // No typer known in a group: say so, never a member who isn't typing (MSG-4).
            const name = !id ? "Someone" : firstName(who?.name ?? conv.title);
            return (
              <div key={id} className={"ch-ms-msg is-first" + (conv.group ? " is-group" : "")}>
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
          }
        />
      </SectionBoundary>
      <>
          <ThreadDatePill scroller={scroller} />
          <ThreadJumpKey scroller={scroller} unseen={anchor.unseen} onJump={jumpToEnd} />
        </>
      <div ref={composerRef} className="ch-msp-composer">
      <Composer
        key={conv.id}
        api={api}
        conv={conv}
        editing={editing}
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

      {acting && (
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
      <Modal code="CH-7604" open={false} onClose={() => setActing(null)} title="Message">
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
      <EditMessageModal api={api} message={null} onClose={() => setEditing(null)} />
      <DeleteMessageModal api={api} message={deleting} onClose={() => setDeleting(null)} />
      {seenList.render(api, true)}
    </PhoneScreen>
    </PollThreadContext.Provider>
  );
}
