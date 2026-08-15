'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import {
  IconX,
  IconExternalLink,
  IconCopy,
  IconMail,
  IconSend,
} from '@/components/icons';
import type {
  EmailRow,
  EmailEventRow,
  EmailClick,
} from '@/app/golf/actions/resend-activity';
import {
  getEmailDetail,
  getEmailClicks,
} from '@/app/golf/actions/resend-activity';
import {
  deriveStatus,
  STATUS_CONFIG,
  EVENT_CONFIG,
  formatFullTimestamp,
  formatRelative,
} from './shared';

export type FollowupRecipient = {
  email: string;
  name?: string | null;
  coach_id?: string | null;
};

interface EmailDetailPanelProps {
  resendMessageId: string | null;
  onClose: () => void;
  onSendFollowup?: (recipients: FollowupRecipient[]) => void;
}

export function EmailDetailPanel({
  resendMessageId,
  onClose,
  onSendFollowup,
}: EmailDetailPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const [email, setEmail] = useState<EmailRow | null>(null);
  const [events, setEvents] = useState<EmailEventRow[]>([]);
  const [clicks, setClicks] = useState<EmailClick[]>([]);
  const [loading, setLoading] = useState(false);

  // ESC to close
  useEffect(() => {
    if (!resendMessageId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resendMessageId, onClose]);

  useEffect(() => {
    if (!resendMessageId) {
      setEmail(null);
      setEvents([]);
      setClicks([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      const [detail, clickRows] = await Promise.all([
        getEmailDetail(resendMessageId),
        getEmailClicks(resendMessageId),
      ]);
      if (cancelled) return;
      setEmail(detail.email);
      setEvents(detail.events);
      setClicks(clickRows);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [resendMessageId]);

  const handleSendFollowup = () => {
    if (!onSendFollowup || !email) return;
    const addresses = email.to_addresses ?? [];
    if (addresses.length === 0) return;
    const recipients: FollowupRecipient[] = addresses.map((addr) => ({
      email: addr,
      name: null,
      coach_id: null,
    }));
    onSendFollowup(recipients);
  };

  return (
    <AnimatePresence>
      {resendMessageId && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
            className="fixed inset-0 bg-nav-bg/25 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ type: 'spring', damping: 30, stiffness: 300 })}
            className="fixed top-0 right-0 h-full w-full max-w-2xl z-50 bg-elevated shadow-raise overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] px-6 py-4 border-b border-border-subtle/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-fw-sm bg-accent-50 text-accent-700">
                  <IconMail size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    Email details
                  </p>
                  {resendMessageId && (
                    <p className="text-eyebrow text-text-tertiary font-mono">
                      {resendMessageId.slice(0, 18)}…
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {onSendFollowup && email && (email.to_addresses?.length ?? 0) > 0 && (
                  <Button variant="ghost"
                    onClick={handleSendFollowup}
                    className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-fw-sm text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-sunken transition-colors"
                    title="Send follow-up email to this recipient"
                  >
                    <IconSend size={14} />
                    Send follow-up
                  </Button>
                )}
                {resendMessageId && (
                  <a
                    href={`https://resend.com/emails/${resendMessageId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors"
                    title="Open in Resend"
                  >
                    <IconExternalLink size={14} />
                  </a>
                )}
                <IconButton variant="default"
                  onClick={onClose}
                  className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-text-primary hover:bg-surface-sunken transition-colors"
                  aria-label="Close"
                >
                  <IconX size={14} />
                </IconButton>
              </div>
            </div>

            {/* Body */}
            {loading ? (
              <DetailSkeleton />
            ) : !email ? (
              <NotFound />
            ) : (
              <div className="p-6 space-y-6">
                <StatusBanner email={email} />
                <Metadata email={email} />
                <ClicksSection clicks={clicks} clickCount={email.click_count} />
                <EventTimeline events={events} />
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Status banner
// ---------------------------------------------------------------------------
function StatusBanner({ email }: { email: EmailRow }) {
  const status = deriveStatus(email);
  const cfg = STATUS_CONFIG[status];

  return (
    <div
      className={cn(
        'rounded-fw-md p-4 flex items-start gap-3 border',
        status === 'bounced' || status === 'complained'
          ? 'bg-fw-danger-bg border-fw-danger/25'
          : status === 'delayed'
            ? 'bg-fw-warning-bg border-fw-warning-ring'
            : status === 'opened' || status === 'clicked' || status === 'delivered'
              ? 'bg-accent-50 border-accent-200'
              : 'bg-surface-sunken border-border-subtle'
      )}
    >
      <div className={cn('mt-0.5', cfg.color)}>{cfg.icon}</div>
      <div className="flex-1">
        <p className={cn('text-sm font-semibold', cfg.color)}>
          {cfg.label}
        </p>
        <p className="text-xs text-text-secondary mt-0.5">
          {describeStatus(email, status)}
        </p>
      </div>
    </div>
  );
}

function describeStatus(email: EmailRow, status: string): string {
  switch (status) {
    case 'complained':
      return `Recipient marked as spam ${formatRelative(email.complained_at)}`;
    case 'bounced':
      return `Delivery bounced ${formatRelative(email.bounced_at)}`;
    case 'clicked':
      return `${email.click_count} click${email.click_count === 1 ? '' : 's'} — last ${formatRelative(email.clicked_at)}`;
    case 'opened':
      return `${email.open_count} open${email.open_count === 1 ? '' : 's'} — last ${formatRelative(email.opened_at)}`;
    case 'delivered':
      return `Delivered ${formatRelative(email.delivered_at)}`;
    case 'delayed':
      return `Delivery delayed ${formatRelative(email.delivery_delayed_at)}`;
    default:
      return `Sent ${formatRelative(email.sent_at)} — awaiting delivery`;
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
function Metadata({ email }: { email: EmailRow }) {
  return (
    <div className="rounded-fw-md border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-5 space-y-4">
      <div className="grid grid-cols-[100px_1fr] gap-y-3 gap-x-4 text-sm">
        <Label>From</Label>
        <div className="text-text-primary break-all">
          {email.from_address ?? <em className="text-text-tertiary">Unknown</em>}
        </div>

        <Label>To</Label>
        <div className="text-text-primary space-y-1">
          {email.to_addresses?.length ? (
            email.to_addresses.map((addr) => (
              <div key={addr} className="flex items-center gap-1 group">
                <span className="break-all">{addr}</span>
                <CopyButton text={addr} />
              </div>
            ))
          ) : (
            <em className="text-text-tertiary">No recipients</em>
          )}
        </div>

        <Label>Subject</Label>
        <div className="text-text-primary">
          {email.subject || <em className="text-text-tertiary">(no subject)</em>}
        </div>

        <Label>Source</Label>
        <div>
          <span
            className={cn(
              'inline-block text-eyebrow font-medium px-1.5 py-0.5 rounded uppercase tracking-wide',
              email.source === 'crm'
                ? 'bg-surface-sunken text-text-secondary'
                : email.source === 'transactional'
                  ? 'bg-surface-sunken text-text-secondary'
                  : 'bg-surface-sunken text-text-tertiary'
            )}
          >
            {email.source}
          </span>
          {email.contact_log_id && (
            <span className="ml-2 text-xs text-text-tertiary">
              Contact log: {email.contact_log_id.slice(0, 8)}…
            </span>
          )}
        </div>

        <Label>Message ID</Label>
        <div className="flex items-center gap-1 text-text-secondary font-mono text-xs break-all group">
          {email.resend_message_id}
          <CopyButton text={email.resend_message_id} />
        </div>

        <Label>First seen</Label>
        <div className="text-text-secondary">
          {formatFullTimestamp(email.first_seen_at)}
        </div>

        <Label>Last event</Label>
        <div className="text-text-secondary">
          {formatFullTimestamp(email.last_event_at)}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wide pt-0.5">
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton variant="default"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface-sunken text-text-tertiary hover:text-text-secondary transition-all"
      title={copied ? 'Copied!' : 'Copy'}
      aria-label="Copy to clipboard"
    >
      <IconCopy size={11} />
    </IconButton>
  );
}

// ---------------------------------------------------------------------------
// Event timeline
// ---------------------------------------------------------------------------
function EventTimeline({ events }: { events: EmailEventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-fw-md border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-6 text-center">
        <p className="text-sm text-text-tertiary">No events recorded yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3">
        Event timeline
      </h4>
      <ol className="relative border-l-2 border-border-subtle ml-2 space-y-5">
        {events.map((ev) => {
          const cfg = EVENT_CONFIG[ev.event_type] ?? {
            label: ev.event_type,
            color: 'text-text-secondary',
            dotColor: 'bg-text-tertiary',
            icon: null,
          };

          return (
            <li key={ev.id} className="relative pl-6">
              <span
                className={cn(
                  'absolute -left-[7px] top-1 w-3 h-3 rounded-full ring-4 ring-surface',
                  cfg.dotColor
                )}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide',
                    cfg.color
                  )}
                >
                  {cfg.icon}
                  {cfg.label}
                </span>
                {ev.recipient_email && (
                  <span className="text-xs text-text-secondary truncate">
                    {ev.recipient_email}
                  </span>
                )}
              </div>
              <p
                className="text-xs text-text-tertiary mt-0.5 tabular-nums"
                title={ev.occurred_at}
              >
                {formatFullTimestamp(ev.occurred_at)}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clicks section
// ---------------------------------------------------------------------------
function parseDeviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Other';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'iPhone';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'Mac';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('linux')) return 'Linux';
  return 'Other';
}

function ClicksSection({
  clicks,
  clickCount,
}: {
  clicks: EmailClick[];
  clickCount: number;
}) {
  // No clicks at all — hide the section entirely
  if (clickCount === 0 && clicks.length === 0) return null;

  // Click count > 0 but fetch returned nothing — show neutral helper
  if (clicks.length === 0) {
    return (
      <div>
        <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3">
          Clicks
        </h4>
        <div className="rounded-fw-md border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-4">
          <p className="text-xs text-text-tertiary">Click details not captured</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">
          Clicks
        </h4>
        <span className="text-eyebrow text-text-tertiary tabular-nums">
          {clicks.length.toLocaleString()} recorded
        </span>
      </div>
      <ul className="rounded-fw-md border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] divide-y divide-border-subtle/60 overflow-hidden">
        {clicks.map((click) => {
          const device = parseDeviceLabel(click.user_agent);
          return (
            <li key={click.id} className="px-4 py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-text-secondary truncate max-w-[40%]">
                  {click.recipient_email}
                </span>
                {click.clicked_url ? (
                  <a
                    href={click.clicked_url}
                    target="_blank"
                    rel="noreferrer"
                    title={click.clicked_url}
                    className="inline-flex items-center gap-1 text-xs text-accent-700 hover:text-fw-success-ink truncate flex-1 min-w-0"
                  >
                    <IconExternalLink size={12} className="shrink-0" />
                    <span className="truncate">{click.clicked_url}</span>
                  </a>
                ) : (
                  <span className="text-xs text-text-tertiary italic flex-1 min-w-0">
                    (no URL)
                  </span>
                )}
                <span className="text-eyebrow px-1.5 py-0.5 rounded bg-surface-sunken text-text-secondary shrink-0">
                  {device}
                </span>
                <span
                  className="text-xs text-text-tertiary tabular-nums shrink-0"
                  title={click.occurred_at}
                >
                  {formatRelative(click.occurred_at)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton / not found
// ---------------------------------------------------------------------------
function DetailSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-16 bg-surface-sunken rounded-fw-md" />
      <div className="rounded-fw-md border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-5 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-20 bg-surface-sunken rounded" />
            <div className="h-4 flex-1 bg-surface-sunken rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-surface-sunken rounded" />
        ))}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="py-20 flex flex-col items-center justify-center text-center px-6">
      <div className="p-3 rounded-full bg-surface-sunken mb-3">
        <IconMail size={20} className="text-text-tertiary" />
      </div>
      <p className="text-sm font-medium text-text-secondary">Email not found</p>
      <p className="text-xs text-text-tertiary mt-1 max-w-xs">
        This message isn&apos;t in our tracked set yet. It may be a newly sent
        email still propagating, or outside the backfill window.
      </p>
    </div>
  );
}
