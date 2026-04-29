'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { IconMail, IconCheckCircle2 } from '@/components/icons';
import { listReplies, markReplyRead, type CrmReply } from '@/app/golf/actions/crm-replies';

// ============================================================================
// ReplyThread — vertical thread view: most recent reply at top, original
// outbound contact_log entry as a footer. Marks the most recent reply as
// read on first render.
// ============================================================================

interface ReplyThreadProps {
  /** A single reply OR a thread id. If a single reply is passed, we still
      fetch the rest of the thread by thread_id so all sibling messages are
      shown. */
  reply: CrmReply;
  /** Optional callback fired after the reply is marked read. */
  onRead?: (reply: CrmReply) => void;
}

function relTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

export function ReplyThread({ reply, onRead }: ReplyThreadProps) {
  const [thread, setThread] = useState<CrmReply[]>([reply]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch full thread when a thread_id is present.
  useEffect(() => {
    if (!reply.thread_id) {
      setThread([reply]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listReplies({ threadId: reply.thread_id })
      .then((rows) => {
        if (cancelled) return;
        // listReplies returns DESC by received_at — newest first. If for some
        // reason the requested reply isn't in the result (e.g. thread_id was
        // null at insert), seed with at least the passed reply.
        setThread(rows.length > 0 ? rows : [reply]);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load thread';
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reply]);

  // Mark unread reply as read on first render.
  useEffect(() => {
    if (reply.is_read) return;
    let cancelled = false;
    markReplyRead(reply.id)
      .then((updated) => {
        if (cancelled) return;
        setThread((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        onRead?.(updated);
      })
      .catch(() => {
        // Non-fatal — UI continues to work, the read flag just lags.
      });
    return () => {
      cancelled = true;
    };
    // We deliberately only fire on the originally-passed reply, not on every
    // thread update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reply.id]);

  const sorted = useMemo(() => {
    return [...thread].sort((a, b) => b.received_at.localeCompare(a.received_at));
  }, [thread]);

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading && sorted.length <= 1 && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white/60 border border-warm-200/60 skeleton-shimmer" />
          ))}
        </div>
      )}

      {sorted.map((r, idx) => (
        <article
          key={r.id}
          className={cn(
            'rounded-xl border bg-white/70 backdrop-blur-xl px-4 py-3 transition-colors',
            idx === 0 ? 'border-primary-200 shadow-glass-sm' : 'border-warm-200/60',
          )}
        >
          <header className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <IconMail size={14} className="text-warm-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-warm-900 truncate">
                  {r.from_address}
                </span>
                {!r.is_read && (
                  <span className="px-1.5 py-0.5 rounded-full bg-primary-50 border border-primary-200 text-[10px] font-medium text-primary-700">
                    Unread
                  </span>
                )}
                {r.is_read && idx === 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-warm-500">
                    <IconCheckCircle2 size={10} /> Read
                  </span>
                )}
              </div>
              {r.subject && (
                <p className="text-xs text-warm-700 mt-0.5 truncate">{r.subject}</p>
              )}
            </div>
            <time className="text-[11px] text-warm-500 flex-shrink-0">
              {relTime(r.received_at)}
            </time>
          </header>

          <div className="text-sm text-warm-800 whitespace-pre-wrap break-words">
            {r.body_text ? (
              r.body_text
            ) : r.body_html ? (
              <span className="text-xs italic text-warm-500">
                (HTML-only message — view raw payload to inspect)
              </span>
            ) : (
              <span className="text-xs italic text-warm-500">(empty body)</span>
            )}
          </div>

          {r.to_addresses.length > 0 && (
            <p className="text-[11px] text-warm-500 mt-2 truncate">
              To: {r.to_addresses.join(', ')}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
