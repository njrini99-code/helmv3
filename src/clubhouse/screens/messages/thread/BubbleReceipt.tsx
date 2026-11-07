'use client';

import type { ChMessagesApi } from '../api/types';
import { clock, type ChMsg } from '../model';
import { SeenByPill, SeenByReceipt } from '../seen-by';
import { AnimatePresence, m as M } from 'motion/react';
import { chTween } from '../../../lib/motion';
import { useToast } from '../../../ui/Toast';
import { AlertCircle } from 'lucide-react';
import { Icon } from '../../../ui/Icon';

/** Under a bubble: Not sent / Try again, the Seen receipt on the carrier, and "Notified anyway". */
export function BubbleReceipt({
  api,
  m,
  group,
  carrier,
  onSeenBy,
  showTime,
  reduced,
}: {
  api: ChMessagesApi;
  m: ChMsg;
  group: boolean;
  carrier: boolean;
  onSeenBy?: (m: ChMsg, anchor: HTMLElement | null) => void;
  showTime: boolean;
  reduced: boolean;
}) {
  const toast = useToast();
  return (
    <>
      {m.failed ? (
        <span
          className="ch-ms-msg__fail"
          role="alert"
          data-ch-code={m.failed === "unknown" ? "CH-7017" : "CH-7016"}
        >
          <Icon icon={AlertCircle} size={14} />
          {m.failed === "unknown"
            ? "Couldn’t confirm this message sent. Check before sending again."
            : "Not delivered ·"}
          <button
            type="button"
            onClick={() => {
              toast({ title: "Sending again" });
              api.retry(m.id);
            }}
          >
            Try again
          </button>
          <button type="button" onClick={() => api.discard(m.id)}>
            Discard
          </button>
        </span>
      ) : (
        // The lane: times live behind the drag (S-MSG.times); only your latest message keeps its receipt, as a pill (S-MSG.seen).
        group ? (
          carrier && m.mine && (
            <span className="ch-ms-seen-slot">
              <SeenByPill api={api} m={m} onOpen={onSeenBy ? (el) => onSeenBy(m, el) : undefined} />
            </span>
          )
        ) : (carrier && m.mine && m.seen) && (
          <span className={"ch-ms-msg__t ch-num" + " is-pill"}>
            {(m.seen && !group ? `Seen ${clock(m.at, api.timeZone, api.clock)}` : null)}
            {""}
            {/* OC-3: a direct thread's "Seen" sits on the carrier only (or a time revealed by a swipe), not every run-end. */}
            {""}
            {/* P-1 M3: when the receipt moves to a newer message, the old one fades out on quick (instant when reduced). */}
            <AnimatePresence initial={false}>
              {group && (carrier || showTime) && (
                <M.span key="seen" className="ch-ms-seen-slot" exit={reduced ? undefined : { opacity: 0 }} transition={chTween("quick", reduced)}>
                  <SeenByReceipt api={api} m={m} onOpen={onSeenBy ? (el) => onSeenBy(m, el) : undefined} />
                </M.span>
              )}
            </AnimatePresence>
          </span>
        )
      )}
      {/* P-10: "Notified anyway", once a push really went out. A 1:1 shows it to both sides; in a group only a coach sees it (a teammate
          reading it would learn who was in class). */}
      {m.notifiedAnyway && !m.failed && (!group || api.viewer.role === "coach") && (
        <span className="ch-ms-msg__na" data-ch-code="CH-7271">
          Notified anyway
        </span>
      )}
    </>
  );
}
