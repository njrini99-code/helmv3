'use client';

import type { ChMessagesApi } from '../api/types';
import { firstName, type ChMsg, type ChPerson } from '../model';
import { PollCard } from '../polls';
import { MessageText, ReplyQuote } from './MessageText';
import { BubbleTail } from '../thread-v2';
import { Attachments } from './Attachments';

/** A message's content: the quote it replies to, then the poll, the words or the photos and files. */
export function BubbleBody({
  api,
  m,
  first,
  last,
  group,
  who,
}: {
  api: ChMessagesApi;
  m: ChMsg;
  first: boolean;
  last: boolean;
  group: boolean;
  who: ChPerson | undefined;
}) {
  return (
    <>
      {m.replyToId && <ReplyQuote api={api} replyToId={m.replyToId} />}
      {m.poll ? (
        <PollCard api={api} messageId={m.id} poll={m.poll} mine={m.mine} />
      ) : (
        m.text && (
          <div className="ch-ms-bub" data-ch-bubble="">
            {/* Redesign: the sender's name sits inside a run's first bubble (06 S-MSG.team). */}
            {!m.mine && first && group && <b className="ch-msv-bname">{firstName(who?.name ?? "Member")}</b>}
            <MessageText text={m.text} />
            {last && <BubbleTail />}
          </div>
        )
      )}
      {m.hasAttachments && (
        <Attachments load={api.attachments} id={m.id} mine={m.mine} />
      )}
    </>
  );
}
