'use client';

import type { ChMessagesApi } from '../api/types';
import { clock, type ChMsg } from '../model';
import { personOf } from '../person-of';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { PresenceRow } from '../../../ui/ListPresence';
import { SenderPeek } from '../shared/conv-ui';
import { Avatar } from '../../../ui/Avatar';
import { classYearKey } from '../../../lib/class-year';
import { BubbleHoldLift, BubbleReactBar, BubbleReactions, useBubbleActions } from '../overlays/bubble-actions';
import { BubbleBody } from './BubbleBody';
import { BubbleHoverBar } from './BubbleHoverBar';
import { BubbleReceipt } from './BubbleReceipt';

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
  carrier = false,
  onSeenBy,
}: {
  api: ChMessagesApi;
  m: ChMsg;
  first: boolean;
  last: boolean;
  group: boolean;
  /** P-1: this is the message that carries the thread's receipt (the viewer's newest confirmed one). */
  carrier?: boolean;
  /** P-1: open the Seen by list for this message (coaches), anchored to the element that asked. */
  onSeenBy?: (m: ChMsg, anchor: HTMLElement | null) => void;
  picking: boolean;
  setPicking: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Phone: the message's actions open in a sheet on a long press, in place of the hover tools. */
  onActions?: () => void;
  onReply?: () => void;
}) {
  const who = personOf(api, m.senderId);
  const act = useBubbleActions({ api, m, group, picking, setPicking, onEdit, onDelete, onActions, onReply, onSeenBy });
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
  // S-MSG.hold: Seen by has its own row on your own group message; the rest keep today's actions, Delete last.
  return (
    <PresenceRow
      as="div"
      id={`ch-ms-message-${m.id}`}
      ref={act.rowRef as never}
      data-ch-bar={act.barHeld ? "" : undefined}
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
              <Avatar
                name={who?.name ?? "Member"}
                id={who ? (who.playerId ?? who.userId) : null}
                size={30}
                year={who?.gradYear ? classYearKey(who.gradYear, new Date(api.now), api.timeZone) : null}
              />
            </SenderPeek>
          )}
        </span>
      )}
      <div className="ch-ms-msg__col">

        <div className="ch-ms-msg__line">
          <div className="ch-ms-msg__stack" {...act.press} {...act.rightClick} {...(!m.failed && !m.deleted ? { "data-ch-press-scale": ".97", onClick: act.toggleLikeOnDouble, onDoubleClick: (e: ReactMouseEvent) => e.preventDefault() } : {})}>
            <BubbleBody api={api} m={m} first={first} last={last} group={group} who={who} />
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
          {!m.failed && !m.deleted && !onActions && (
            <BubbleHoverBar
              api={api}
              m={m}
              reacts={act.reacts}
              onReply={onReply}
              onMore={() => {
                act.refreshMenu();
                act.setLifted(true);
              }}
            />
          )}

          <BubbleReactBar api={api} m={m} picking={picking} act={act} />
        </div>
        <BubbleReactions api={api} m={m} act={act} />
        <BubbleReceipt api={api} m={m} group={group} carrier={carrier} onSeenBy={onSeenBy} showTime={act.showTime} reduced={act.reduced} />
      </div>
      <span className="ch-msv-time ch-num">{clock(m.at, api.timeZone, api.clock)}</span>
      {act.lifted && <BubbleHoldLift api={api} m={m} group={group} onSeenBy={onSeenBy} act={act} />}
    </PresenceRow>
  );
}
