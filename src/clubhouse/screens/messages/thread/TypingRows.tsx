'use client';

import { useCallback, useEffect } from 'react';
import type { ChMessagesApi } from '../api/types';
import { type ChConv, firstName } from '../model';
import { Avatar } from '../../../ui/Avatar';
import { personOf } from '../person-of';
import { convAvatarId } from '../shared/conv-ui';
import { PIN_PX } from '../motion/messages-beats';

/** How long after the dots leave a message from them still counts as the reply that grew out of them (MOT-SEND-12). */
export const TYPING_REPLY_GRACE_MS = 600;
let typingShown = 0;
let typingEndedAt = Number.NEGATIVE_INFINITY;
/**
 * True while typing dots are on screen and for a beat after: a message that mounts then is the reply growing out of the dots
 * (`useReplyFromTyping`), which has its own arrival, so the list's rise is skipped for it.
 */
export function typingRecentlyShown(now: number = performance.now()): boolean {
  return typingShown > 0 || now - typingEndedAt < TYPING_REPLY_GRACE_MS;
}

/**
 * The typing bubbles at the end of the thread, phone and desktop alike (MSG-212, MSG-213): a received-style bubble with three
 * dots, one per typer, and in a group the typer's first name inside it above the dots (never a caption). A DM names no one.
 * With no typer known in a group the bubble says "Someone", never a member who isn't typing. `role="status"` per bubble.
 */
export function TypingRows({ api, conv }: { api: ChMessagesApi; conv: ChConv }) {
  useEffect(() => {
    typingShown += 1;
    return () => {
      typingShown -= 1;
      typingEndedAt = performance.now();
    };
  }, []);
  // MOT-SEND-11: the bubble grows from its tail corner only for a reader at the bottom; scrolled away, the list just makes room.
  const quiet = useCallback((el: HTMLElement | null) => {
    const scroller = el?.closest<HTMLElement>('.ch-ms-scroll');
    if (el && scroller && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > PIN_PX.arrive) el.style.animation = 'none';
  }, []);
  const ids = api.typingUserIds?.length ? api.typingUserIds : api.typingByConv?.get(conv.id)?.length ? api.typingByConv.get(conv.id)! : conv.group ? [''] : [conv.memberIds[0] ?? ''];
  return (
    <>
      {ids.map((id) => {
        const who = id ? personOf(api, id) : null;
        const name = !id ? 'Someone' : firstName(who?.name ?? conv.title);
        return (
          <div key={id} className={'ch-ms-msg is-first' + (conv.group ? ' is-group' : '')} data-ch-typing="">
            <span className="ch-ms-msg__av">
              {conv.group && <Avatar name={who?.name ?? conv.title} id={who ? (who.playerId ?? who.userId) : convAvatarId(api, conv)} size={30} />}
            </span>
            <div className="ch-ms-msg__col">
              <div ref={quiet} className={'ch-msv-typing' + (conv.group ? ' has-name' : '')} role="status" aria-label={`${name} is typing`}>
                {conv.group && <b className="ch-msv-bname">{name}</b>}
                <span className="ch-msv-typing__dots"><i /><i /><i /></span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
