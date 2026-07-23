'use client';

/**
 * Feed Card Component
 *
 * Individual calendar feed display and management:
 * - Feed type icon with color coding
 * - Feed name and URL
 * - Copy to clipboard button
 * - Subscription instructions (collapsible)
 * - Last synced timestamp
 * - Regenerate/delete actions
 *
 * Fairway tokens only — this card renders flush inside CalendarFeedManager,
 * which itself mounts inside the live Fairway "Subscribe to your calendar"
 * Sheet, so it must read as the same app (no legacy cream/warm/amber/violet/
 * rose). Tone (which kind of feed) is carried by the StatusPill label, not by
 * a separately-colored icon chip — one signal, not two competing ones.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { SubscriptionInstructions } from './SubscriptionInstructions';
import {
  Calendar,
  Users,
  Trophy,
  Globe,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Trash2,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Surface, Inset, Button, IconButton, StatusPill, type FwStatusTone } from '@/components/fairway';

export interface CalendarFeed {
  id: string;
  name: string;
  type: 'team' | 'personal' | 'tournament' | 'all_events';
  url: string;
  created_at: string;
  last_synced_at?: string | null;
}

interface FeedCardProps {
  feed: CalendarFeed;
  onRegenerate: () => Promise<void>;
  onDelete: () => Promise<void>;
  className?: string;
}

const FEED_TYPE_META: Record<CalendarFeed['type'], { icon: LucideIcon; label: string; tone: FwStatusTone }> = {
  team: { icon: Users, label: 'Team Events', tone: 'accent' },
  personal: { icon: Calendar, label: 'Personal Events', tone: 'accent' },
  tournament: { icon: Trophy, label: 'Tournaments', tone: 'warning' },
  all_events: { icon: Globe, label: 'All Events', tone: 'info' },
};

export function FeedCard({ feed, onRegenerate, onDelete, className }: FeedCardProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const meta = FEED_TYPE_META[feed.type];
  const Icon = meta.icon;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(feed.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copy failed - button will remain in default state
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await onRegenerate();
    } catch {
      // Regenerate failed
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      // Delete failed
      setDeleting(false);
    }
  }

  return (
    <Surface padding="none" elevation="border" className={cn('overflow-hidden', className)}>
      {/* Feed header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Type icon — neutral chip; tone lives in the StatusPill below */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-fw-md bg-surface-sunken text-text-secondary ring-1 ring-border-subtle">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>

          {/* Feed info */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="font-fw-sans text-body font-medium text-text-primary">{feed.name}</h3>
              <StatusPill tone={meta.tone} size="sm" className="shrink-0">
                {meta.label}
              </StatusPill>
            </div>

            {/* Last synced */}
            {feed.last_synced_at && (
              <p className="font-fw-sans text-caption text-text-tertiary">
                Last synced {formatDistanceToNow(new Date(feed.last_synced_at), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>

        {/* Feed URL */}
        <div className="mt-3 flex items-center gap-2">
          <Inset padding="sm" className="min-w-0 flex-1">
            <code className="block truncate font-mono text-caption text-text-secondary">{feed.url}</code>
          </Inset>

          <IconButton
            variant={copied ? 'primary' : 'secondary'}
            size="sm"
            onClick={handleCopy}
            aria-label={copied ? 'URL copied' : 'Copy feed URL'}
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          </IconButton>
        </div>

        {/* Subscription instructions toggle */}
        <Button
          variant="ghost"
          size="sm"
          fullWidth
          onClick={() => setShowInstructions(!showInstructions)}
          className="mt-3 justify-center"
          aria-expanded={showInstructions}
        >
          <span className="flex w-full items-center justify-center gap-2">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span>Subscription Instructions</span>
            {showInstructions ? (
              <ChevronUp className="ml-auto h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="ml-auto h-4 w-4" aria-hidden="true" />
            )}
          </span>
        </Button>
      </div>

      {/* Subscription instructions (collapsible) */}
      {showInstructions && (
        <div className="border-t border-border-subtle px-4 pb-4">
          <SubscriptionInstructions feedUrl={feed.url} compact />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-4 py-3">
        {showDeleteConfirm ? (
          // Delete confirmation
          <>
            <p className="font-fw-sans text-caption text-text-secondary">Delete this feed?</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" busy={deleting} onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </>
        ) : (
          // Normal actions
          <>
            <p className="font-fw-sans text-caption text-text-tertiary">
              Created {formatDistanceToNow(new Date(feed.created_at), { addSuffix: true })}
            </p>
            <div className="flex items-center gap-1">
              <IconButton
                variant="ghost"
                size="sm"
                busy={regenerating}
                onClick={handleRegenerate}
                aria-label="Regenerate feed URL"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </IconButton>

              <IconButton
                variant="danger"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                aria-label="Delete feed"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </div>
          </>
        )}
      </div>
    </Surface>
  );
}
