'use client';

import type { ReactNode, RefObject } from 'react';
import { clock, firstName, type ChConv, type ChThreadItem } from '../model';
import type { ChMessagesApi } from '../api/types';
import { convAvatarId, convYear } from '../shared/conv-ui';
import { HelloCard } from '../HelloCard';
import { FAILURE_COPY, InlineNotice } from '../../../ui/Notices';
import { EmptyState, Skeleton } from '../../../ui/States';
import { ListPresence, PresenceRow } from '../../../ui/ListPresence';
import { useBusyReveal } from '../../../lib/use-busy';

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
  onStarter,
  renderBubble,
  renderTyping,
}: {
  api: ChMessagesApi;
  conv: ChConv;
  scroller: RefObject<HTMLDivElement | null>;
  className: string;
  items: ChThreadItem[];
  /** A starter chosen on the first-message card lands in the composer. */
  onStarter: (text: string) => void;
  /** One message's bubble, keyed by `it.key`. */
  renderBubble: (it: MsgItem) => ReactNode;
  /** The typing dots (drawn only while the thread has loaded). */
  renderTyping: () => ReactNode;
}) {
  // 3.5 late content: the messages that take the skeleton's place fade in over the quick beat, opacity only. The skeleton
  // itself still shows at once, without the 150 ms wait (3.9): a search hit's jump (use-focus-message.ts) looks for its row
  // the moment loading ends, so the rows must be in the page then.
  const loading = api.msgsLoading && !api.msgs.length;
  const reveal = useBusyReveal<HTMLDivElement>(loading && !api.msgsError ? 'skeleton' : 'ready');
  return (
      <div
        className={className}
        ref={scroller}
        // CH-7601: a message that arrives or is sent eases in at the end of the thread, and is announced.
        aria-live="polite"
        aria-relevant="additions"
      >
        <div className="ch-ms-msgs" ref={reveal}>
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
              body={FAILURE_COPY.page}
              onRetry={api.refetchMsgs}
            />
          ) : loading ? (
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
            <EmptyState compact kind="first-run" code="CH-7304" title="No messages yet" body={`Say hello to ${conv.group ? "the group" : firstName(conv.title)}.`} />
            )
          ) : (
            // B7, 3.5: a deleted message closes in place; one that arrives (yours or theirs) rises 8 px in at its full height,
            // and the thread above it moves up to make room (useThreadMakeRoom). The scroll stays with useThreadAnchor (no
            // FLIP), and another conversation is a new list, whose messages never arrive.
            <ListPresence key={conv.id} flip={false}>
              {items.flatMap<ReactNode>((it) =>
                it.kind === "day"
                  ? [
                      <PresenceRow as="div" key={it.key} className="ch-ms-day">
                        <span className="ch-num">{it.label}<b> {clock(it.at, api.timeZone, api.clock)}</b></span>
                      </PresenceRow>,
                    ]
                  : [
                      renderBubble(it),
                    ],
              )}
            </ListPresence>
          )}
          {/* No dots under a thread that didn't load or is still loading (states audit c9): nothing to type into yet. */}
          {api.typing && !api.msgsError && !loading && (
            renderTyping()
          )}
        </div>
      </div>
  );
}
