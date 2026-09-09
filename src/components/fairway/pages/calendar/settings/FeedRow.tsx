'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FeedRow — S9 "Calendar subscriptions" one feed
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.9. Unlike the legacy `FeedCard` (which prints the
 * full feed URL — token included — directly into the DOM), this row masks
 * the token: the copy button still copies the REAL url via the clipboard,
 * but nothing on screen shows the whole secret, and it is never logged.
 *
 * Regenerate and Remove use the same inline confirm-swap the legacy card
 * used for delete: the row keeps its height (SCREEN-BUILD-PLAN §2.9
 * "Regenerate requires a confirm and keeps the row height") instead of
 * opening a second overlay on top of the sheet.
 * ========================================================================== */

import * as React from 'react';
import { Calendar, Check, Copy, RefreshCw, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconButton, Surface, Inset } from '@/components/fairway';
import { fwHaptic } from '@/lib/fairway/haptics';
import { formatShortDate } from '@/lib/golf/format-date';
import type { CalendarFeedRow, CalendarFeedType } from './types';

/** Masks the token segment of a feed URL: keeps the origin + path visible
 *  (so the row still reads as a real, specific link) but replaces the
 *  middle of the secret token with dots — the token itself is never fully
 *  shown, logged, or put in analytics. */
export function maskFeedUrl(url: string): string {
  const mask = (token: string) =>
    token.length > 8 ? `${token.slice(0, 4)}${'•'.repeat(6)}${token.slice(-4)}` : '•'.repeat(Math.max(token.length, 6));
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/');
    const lastIndex = segments.length - 1;
    if (segments[lastIndex]) segments[lastIndex] = mask(segments[lastIndex]);
    return `${parsed.origin}${segments.join('/')}`;
  } catch {
    return url.replace(/[^/]+$/, mask);
  }
}

const TYPE_ICON: Record<CalendarFeedType, typeof Calendar> = {
  team: Users,
  personal: Calendar,
};

export interface FeedRowProps {
  label: string;
  description: string;
  feed: CalendarFeedRow | null;
  /** A create/regenerate/remove call is in flight for this row. */
  busy: boolean;
  /** Offline — mutations disabled, Copy still works from cached data. */
  disabled?: boolean;
  error: string | null;
  onCreate: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
}

export function FeedRow({ label, description, feed, busy, disabled, error, onCreate, onRegenerate, onRemove }: FeedRowProps) {
  const [copied, setCopied] = React.useState(false);
  const [confirm, setConfirm] = React.useState<'regenerate' | 'remove' | null>(null);
  const copyTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => { if (copyTimeout.current) clearTimeout(copyTimeout.current); }, []);
  React.useEffect(() => { setConfirm(null); }, [feed?.id]);

  const Icon = feed ? TYPE_ICON[feed.type] : (label.toLowerCase().includes('team') ? Users : Calendar);

  async function handleCopy() {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed.url);
      setCopied(true);
      fwHaptic('light');
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard write failed (permissions, insecure context) — button
      // stays in its default state; nothing to fabricate here.
    }
  }

  return (
    <Surface padding="none" elevation="border" className={cn('overflow-hidden rounded-card border-transparent', 'border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]')}>
      <div className="flex items-start gap-3 p-4">
        <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full', 'bg-surface-sunken text-text-secondary')}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-fw-sans text-body font-medium text-text-primary">{label}</p>
          <p className="font-fw-sans text-caption text-text-secondary">{description}</p>

          {feed ? (
            <>
              <Inset padding="sm" className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-caption text-text-secondary">
                  {maskFeedUrl(feed.url)}
                </code>
                <IconButton
                  variant={copied ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={handleCopy}
                  aria-label={copied ? 'Link copied' : 'Copy calendar link'}
                >
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                </IconButton>
              </Inset>

              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="font-fw-sans text-caption text-text-tertiary">Added {formatShortDate(feed.created_at)}</p>
                {confirm === 'regenerate' ? (
                  <span className="flex items-center gap-2">
                    <span className="font-fw-sans text-caption text-text-secondary">Get a new link? The old one stops working.</span>
                    <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
                    <Button variant="primary" size="sm" busy={busy} onClick={() => { setConfirm(null); onRegenerate(); }}>Regenerate</Button>
                  </span>
                ) : confirm === 'remove' ? (
                  <span className="flex items-center gap-2">
                    <span className="font-fw-sans text-caption text-text-secondary">Remove this feed?</span>
                    <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
                    <Button variant="danger" size="sm" busy={busy} onClick={() => { setConfirm(null); onRemove(); }}>Remove</Button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <IconButton
                      variant="ghost"
                      size="sm"
                      busy={busy}
                      disabled={disabled}
                      onClick={() => setConfirm('regenerate')}
                      aria-label="Regenerate link"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden />
                    </IconButton>
                    <IconButton
                      variant="danger"
                      size="sm"
                      busy={busy}
                      disabled={disabled}
                      onClick={() => setConfirm('remove')}
                      aria-label="Remove feed"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </IconButton>
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="font-fw-sans text-caption text-text-tertiary">Not added yet</p>
              <Button variant="primary" size="sm" busy={busy} disabled={disabled} onClick={onCreate}>
                Create link
              </Button>
            </div>
          )}

          {error ? (
            <p role="alert" className={'mt-2 font-fw-sans text-caption font-medium text-fw-danger-ink'}>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}
