'use client';

import type { ChMessagesApi } from '../api/types';
import type { ChMsg } from '../model';
import { DmReceipt, SeenByPill } from '../seen-by';
import { useToast } from '../../../ui/Toast';
import { AlertCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { playReceiptRise, receiptDelayAfter } from '../motion/messages-beats';
import { takeSendStamp } from './send-stamps';
import { Icon } from '../../../ui/Icon';

/** Under a bubble: Not sent / Try again, the Seen receipt on the carrier, and "Notified anyway". */
export function BubbleReceipt({
  api,
  m,
  group,
  carrier,
  onSeenBy,
  reduced,
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
  // MOT-SEND-8: a receipt that arrives for a message you just sent rises 4 px, 70% of the launch after the send began.
  const rise = useRef<HTMLSpanElement | null>(null);
  const receipt = !group && carrier && m.mine && !m.failed && !m.pending && !m.deleted && !m.poll;
  useEffect(() => {
    if (!receipt) return;
    const at = takeSendStamp(m.id);
    const pill = rise.current?.firstElementChild;
    if (at === null || !(pill instanceof HTMLElement)) return;
    playReceiptRise(pill, { receiptDelayMs: receiptDelayAfter(performance.now() - at) }, !!reduced);
  }, [receipt, m.id, reduced]);
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
        ) : carrier && m.mine && (
          // `display: contents`: the wrapper only finds the pill; it takes no box of its own.
          <span ref={rise} style={{ display: "contents" }}>
            <DmReceipt api={api} m={m} />
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
