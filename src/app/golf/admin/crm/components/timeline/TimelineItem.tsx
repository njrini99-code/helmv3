'use client';

import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  IconMessageSquare,
  IconMessage,
  IconMail,
  IconCalendar,
  IconFileText,
  IconCheckCircle2,
  IconMonitor,
  IconExternalLink,
} from '@/components/icons';
import type { TimelineItem as TimelineItemType } from '@/app/golf/admin/crm/types/foundations';
import { TIMELINE_CONFIG, type TimelineIconKey } from './timeline-config';

// Map icon keys to their resolved components. Keeping this here (rather than
// in timeline-config.ts) means the config file stays JSX-free and importable
// from server contexts if ever needed.
const ICON_MAP: Record<TimelineIconKey, typeof IconMail> = {
  IconMessageSquare,
  IconMessage,
  IconMail,
  IconCalendar,
  IconFileText,
  IconCheckCircle2,
  IconMonitor,
};

interface TimelineItemProps {
  item: TimelineItemType;
}

export function TimelineItem({ item }: TimelineItemProps) {
  const cfg = TIMELINE_CONFIG[item.source];
  const Icon = ICON_MAP[cfg.iconKey];

  // Defensive — date-fns throws on invalid Date, swallow & fall back.
  const relTime = useMemo(() => {
    try {
      return formatDistanceToNow(new Date(item.occurred_at), { addSuffix: true });
    } catch {
      return '';
    }
  }, [item.occurred_at]);

  // Build a small metadata footer per source.
  const meta = item.metadata ?? {};
  const metaBits: string[] = [];

  if (item.source === 'crm_event') {
    if (typeof meta.location === 'string' && meta.location) metaBits.push(meta.location);
    if (typeof meta.status === 'string' && meta.status) metaBits.push(meta.status);
    if (typeof meta.outcome === 'string' && meta.outcome) metaBits.push(meta.outcome);
  } else if (item.source === 'task') {
    if (typeof meta.status === 'string' && meta.status) metaBits.push(meta.status);
    if (typeof meta.kind === 'string' && meta.kind) metaBits.push(meta.kind);
    if (typeof meta.priority === 'string' && meta.priority && meta.priority !== 'normal') {
      metaBits.push(`priority: ${meta.priority}`);
    }
    if (typeof meta.due_at === 'string' && meta.due_at) {
      try {
        const d = new Date(meta.due_at);
        metaBits.push(`due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
      } catch { /* noop */ }
    }
  } else if (item.source === 'email_event') {
    if (typeof meta.recipient_email === 'string' && meta.recipient_email) {
      metaBits.push(meta.recipient_email);
    }
  } else if (item.source === 'note') {
    if (meta.is_pinned === true) metaBits.push('pinned');
  } else if (item.source === 'reply') {
    // Who actually replied matters — a reply can arrive from an assistant or a
    // secondary address rather than the coach's address of record.
    if (typeof meta.from_address === 'string' && meta.from_address) {
      metaBits.push(meta.from_address);
    }
    // Unread is the state a rep is scanning for, so it is said explicitly. Read
    // is the resting state and needs no label.
    if (meta.is_read === false) metaBits.push('unread');
  }

  const meetingUrl =
    item.source === 'crm_event' && typeof meta.meeting_url === 'string' && meta.meeting_url
      ? meta.meeting_url
      : null;

  return (
    <li className="relative pb-5">
      {/* Dot */}
      <span
        className={cn(
          'absolute left-[-13px] top-0.5 w-[22px] h-[22px] rounded-full flex items-center justify-center bg-surface ring-2',
          cfg.ringColor,
        )}
        aria-hidden="true"
      >
        <Icon size={11} className={cfg.color} />
      </span>

      {/* Body */}
      <div className="ml-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {item.title}
          </span>
          <span className="text-xs text-text-tertiary tabular-nums flex-shrink-0">
            {relTime}
          </span>
        </div>

        {item.body && (
          <p className="text-xs text-text-tertiary mt-0.5 leading-relaxed whitespace-pre-wrap break-words">
            {item.body}
          </p>
        )}

        {(metaBits.length > 0 || meetingUrl) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-eyebrow text-text-tertiary">
            {metaBits.map((bit, i) => (
              <span key={i}>{bit}</span>
            ))}
            {meetingUrl && (
              <a
                href={meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent-700 hover:text-text-secondary"
              >
                <IconExternalLink size={10} /> Join meeting
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
