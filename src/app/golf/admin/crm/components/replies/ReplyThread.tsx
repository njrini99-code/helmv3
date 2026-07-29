'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { IconMail, IconCheckCircle2, IconUser, IconSend, IconExternalLink } from '@/components/icons';
import {
  listReplies,
  markReplyRead,
  getReplyContext,
  type CrmReply,
  type ReplyContext,
} from '@/app/golf/actions/crm-replies';
import { buildGmailSearchUrl, extractGmailId, buildReplyMailto } from './reply-links';
import { Button } from '@/components/ui/button';

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
  /** Optional handler for the "Open coach" action-row button. Hidden
      entirely when omitted or when the reply has no linked coach_id. */
  onOpenCoach?: (coachId: string) => void;
}

function relTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

export function ReplyThread({ reply, onRead, onOpenCoach }: ReplyThreadProps) {
  const [thread, setThread] = useState<CrmReply[]>([reply]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ReplyContext | null>(null);

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

  // Fetch the outbound contact_log entry this reply is answering, if any.
  // Degrades to nothing (context stays null) on error or when the reply has
  // no linked coach — this is a supplementary line, not critical path.
  useEffect(() => {
    if (!reply.coach_id) {
      setContext(null);
      return;
    }
    let cancelled = false;
    getReplyContext(reply.coach_id, reply.received_at)
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reply.coach_id, reply.received_at]);

  const sorted = useMemo(() => {
    return [...thread].sort((a, b) => b.received_at.localeCompare(a.received_at));
  }, [thread]);

  // Action row targets the most recent message in the thread (falls back to
  // the originally-passed reply before the thread fetch resolves).
  const topReply = sorted[0] ?? reply;
  const gmailSearchId = extractGmailId(topReply.raw_payload) ?? topReply.message_id;
  const gmailUrl = buildGmailSearchUrl(gmailSearchId);
  const mailtoHref = buildReplyMailto(topReply.from_address, topReply.subject);

  return (
    <div className="space-y-3">
      {/* Compact action row — open the linked coach, reply by email, or jump
          to the message in Gmail. Every action degrades independently: "Open
          coach" only renders when both a handler and a coach_id exist, and
          "Open in Gmail" only renders when we have something to search on. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {onOpenCoach && reply.coach_id && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => onOpenCoach(reply.coach_id!)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-fw-sm text-caption font-medium min-h-0"
          >
            {/* Layout-only overrides above; ghost variant already supplies
                text-text-secondary / hover states via Button's variants map. */}
            <IconUser size={12} /> Open coach
          </Button>
        )}
        <a
          href={mailtoHref}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-fw-sm text-caption font-medium text-text-secondary hover:text-text-primary hover:bg-surface-sunken transition-colors"
        >
          <IconSend size={12} /> Reply
        </a>
        {gmailUrl && (
          <a
            href={gmailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-fw-sm text-caption font-medium text-text-secondary hover:text-text-primary hover:bg-surface-sunken transition-colors"
          >
            <IconExternalLink size={12} /> Open in Gmail
          </a>
        )}
      </div>

      {error && (
        <p className="text-xs text-fw-danger-ink bg-fw-danger-bg border border-fw-danger/25 rounded-fw-sm px-3 py-2">
          {error}
        </p>
      )}

      {loading && sorted.length <= 1 && (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 rounded-fw-md bg-surface border border-border-subtle skeleton-shimmer" />
          ))}
        </div>
      )}

      {sorted.map((r, idx) => (
        <article
          key={r.id}
          className={cn(
            'rounded-fw-md border border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] px-4 py-3 transition-colors',
            idx === 0 ? 'border-accent-200 shadow-flat' : 'border-border-subtle',
          )}
        >
          <header className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <IconMail size={14} className="text-text-tertiary flex-shrink-0" />
                <span className="text-sm font-semibold text-text-primary truncate">
                  {r.from_address}
                </span>
                {!r.is_read && (
                  <span className="px-1.5 py-0.5 rounded-full bg-accent-50 border border-accent-200 text-eyebrow font-medium text-accent-700">
                    Unread
                  </span>
                )}
                {r.is_read && idx === 0 && (
                  <span className="inline-flex items-center gap-1 text-eyebrow text-text-tertiary">
                    <IconCheckCircle2 size={10} /> Read
                  </span>
                )}
              </div>
              {r.subject && (
                <p className="text-xs text-text-secondary mt-0.5 truncate">{r.subject}</p>
              )}
            </div>
            <time className="text-eyebrow text-text-tertiary flex-shrink-0">
              {relTime(r.received_at)}
            </time>
          </header>

          <div className="text-sm text-text-primary whitespace-pre-wrap break-words">
            {r.body_text ? (
              r.body_text
            ) : r.body_html ? (
              <span className="text-xs italic text-text-tertiary">
                (HTML-only message — view raw payload to inspect)
              </span>
            ) : (
              <span className="text-xs italic text-text-tertiary">(empty body)</span>
            )}
          </div>

          {r.to_addresses.length > 0 && (
            <p className="text-eyebrow text-text-tertiary mt-2 truncate">
              To: {r.to_addresses.join(', ')}
            </p>
          )}
        </article>
      ))}

      {context && (
        <p className="px-1 text-caption text-text-tertiary">
          In reply to: {context.subject ?? 'your prior outreach'} · sent {relTime(context.contactDate)}
        </p>
      )}
    </div>
  );
}
