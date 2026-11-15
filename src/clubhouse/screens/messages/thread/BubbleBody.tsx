'use client';

import type { ChMessagesApi } from '../api/types';
import { firstName, type ChMsg, type ChPerson } from '../model';
import { PollCard } from '../polls';
import { MessageText } from './MessageText';
import { BubbleTail } from '../thread-v2';
import { Attachments } from './Attachments';
import { isEmojiOnly } from './model';

/** A message's content: the poll, the words or the photos and files. The quote it replies to sits above it, in the row's column (Bubble). */
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
  // MSG-204: one to three emoji and nothing else draws bare, at 40k, with no tail.
  const emoji = !m.poll && !m.edited && isEmojiOnly(m.text);
  return (
    <>
      {m.poll ? (
        <PollCard api={api} messageId={m.id} poll={m.poll} mine={m.mine} />
      ) : (
        m.text && (
          <div className={"ch-ms-bub" + (emoji ? " is-emoji" : "")} data-ch-bubble="">
            {/* Redesign: the sender's name sits inside a run's first bubble (06 S-MSG.team). */}
            {!m.mine && first && group && <b className="ch-msv-bname">{firstName(who?.name ?? "Member")}</b>}
            <MessageText text={m.text} />
            {m.edited && <span className="ch-msv-edited">Edited</span>}
            {last && !emoji && <BubbleTail />}
          </div>
        )
      )}
      {m.hasAttachments && (
        <Attachments
          load={api.attachments}
          id={m.id}
          mine={m.mine}
          from={firstName(who?.name ?? "Member")}
          caption={m.text || undefined}
          reserve={m.attachmentKind === "photo" ? "photo" : m.attachmentKind === "file" ? "file" : undefined}
        />
      )}
    </>
  );
}
