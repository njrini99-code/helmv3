'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChConv, isUnread, railTime, firstName } from '../model';
import type { ContextMenuBind } from '../../../ui/ContextMenu';
import { Icon } from '../../../ui/Icon';
import { Flag, Users, BellOff, ListChecks } from 'lucide-react';
import { Avatar } from '../../../ui/Avatar';
import { convAvatarId, convYear } from '../shared/conv-ui';
import { TypingMini, typersLine } from './TypingMini';
import { personOf } from '../person-of';
import { PresenceRow } from '../../../ui/ListPresence';

export function ConvRowButton({ api, c, avatarSize, onOpen, bind, plain = false }: { api: ChMessagesApi; c: ChConv; avatarSize: number; onOpen: () => void; bind: ContextMenuBind; plain?: boolean }) {
  const row = {
    type: "button" as const,
    className: "ch-ms-row" + (isUnread(c) ? " is-unread" : "") + (api.selectedId === c.id ? " is-sel" : ""),
    "aria-current": api.selectedId === c.id ? ("true" as const) : undefined,
    onClick: onOpen,
    ...bind,
  };
  const typers = api.typingByConv?.get(c.id);
  const body = (
    <>
      {c.group ? (
        <span className="ch-ms-grp">
          <Icon icon={c.channel ? Flag : Users} size={15} />
        </span>
      ) : (
        <Avatar name={c.title} id={convAvatarId(api, c)} size={avatarSize} year={convYear(api, c)} />
      )}
      <span className="ch-ms-row__main">
        <span className="ch-ms-row__top">
          {isUnread(c) && <i className="ch-msv-dot" aria-hidden="true" />}
          <b>{c.title}</b>
          {c.muted && <Icon icon={BellOff} size={13} className="ch-ms-row__mute" aria-label="Muted" />}
          <span className="ch-num">
            {railTime(c.lastAt, api.now, api.timeZone, api.clock)}
          </span>
        </span>
        <span className="ch-ms-row__bot">
          <span>
            {/* One inline child, so the phone's two-line clamp (a vertical -webkit-box, which blockifies each child)
                keeps the sender, the poll glyph and the text on one line (F-0052). */}
            <span className="ch-ms-row__prev">
              {typers?.length ? (
                typers.length === 1 ? (
                  <TypingMini />
                ) : (
                  typersLine(api, typers)
                )
              ) : c.lastText ? (
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
                  {/* D25: a poll reads as its glyph and question, not "Poll: …". */}
                  {c.lastIsPoll ? (
                    <>
                      <Icon icon={ListChecks} size={13} className="ch-ms-row__poll" />
                      {c.lastText.replace(/^Poll: /, "")}
                    </>
                  ) : c.lastText}
                </>
              ) : "No messages yet"}
            </span>
          </span>
          {(
            isUnread(c) ? <span className="ch-sr-only">{c.unread > 0 ? `${c.unread} unread` : "Marked unread"}</span> : null
          )}
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
