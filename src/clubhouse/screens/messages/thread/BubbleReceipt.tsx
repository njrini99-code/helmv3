'use client';

import type { ChMessagesApi } from '../api/types';
import type { ChMsg } from '../model';
import { DmReceipt, SeenByPill } from '../seen-by';
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
}: {
  api: ChMessagesApi;
  m: ChMsg;
  group: boolean;
  carrier: boolean;
  onSeenBy?: (m: ChMsg, anchor: HTMLElement | null) => void;
  showTime?: boolean;
  reduced?: boolean;
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
        ) : carrier && m.mine && <DmReceipt api={api} m={m} />
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
