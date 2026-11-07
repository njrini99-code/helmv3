'use client';

import type { ReactNode, RefObject } from 'react';
import { clock, firstName, type ChConv, type ChThreadItem } from '../model';
import type { ChMessagesApi } from '../api/types';
import { convAvatarId, convYear } from '../shared/conv-ui';
import { HelloCard } from '../HelloCard';
import { InlineNotice } from '../../../ui/Notices';
import { EmptyState, Skeleton } from '../../../ui/States';
import { ListPresence, PresenceRow } from '../../../ui/ListPresence';
import { NewDivider } from './NewDivider';

type MsgItem = Extract<ChThreadItem, { kind: 'msg' }>;

/**
 * The scrolling column both threads share (desktop `Thread`, phone `PhoneThread`): the stale and error notices, the
 * loading skeleton, the first-message card, the day markers and bubbles, and the typing dots. A thread passes what
 * differs: the scroller's class, how a bubble is wired, and how the typers draw.
 */
export function ThreadScroller({
  api,
  conv,
  scroller,
  className,
  items,
  newId,
  onStarter,
  renderBubble,
  renderTyping,
}: {
  api: ChMessagesApi;
  conv: ChConv;
  scroller: RefObject<HTMLDivElement | null>;
  className: string;
  items: ChThreadItem[];
  /** The message the "New" divider sits before. */
  newId: string | null;
  /** A starter chosen on the first-message card lands in the composer. */
  onStarter: (text: string) => void;
  /** One message's bubble, keyed by `it.key`. */
  renderBubble: (it: MsgItem) => ReactNode;
  /** The typing dots (drawn only while the thread has loaded). */
  renderTyping: () => ReactNode;
}) {
  return (
      <div
        className={className}
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
              <HelloCard name={conv.title} id={convAvatarId(api, conv)} role={conv.subtitle ?? ""} coach={api.viewer.role === "coach"} year={convYear(api, conv)} onStarter={onStarter} />
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
                      renderBubble(it),
                    ],
              )}
            </ListPresence>
          )}
          {/* No dots under a thread that didn't load or is still loading (states audit c9): nothing to type into yet. */}
          {api.typing && !api.msgsError && !(api.msgsLoading && !api.msgs.length) && (
            renderTyping()
          )}
        </div>
      </div>
  );
}
