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
 * Features:
 * - One-click copy URL
 * - Visual feedback on copy
 * - Confirmation before delete
 * - Loading states for actions
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
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import '@/styles/calendar-tokens.css';

export interface CalendarFeed {
  id: string;
  name: string;
  type: 'team' | 'personal' | 'tournament' | 'all_events';
  url: string;
  created_at: string;
  last_synced_at?: string | null;
}

export interface FeedCardProps {
  feed: CalendarFeed;
  onRegenerate: () => Promise<void>;
  onDelete: () => Promise<void>;
  className?: string;
}

const FEED_TYPE_CONFIGS = {
  team: {
    icon: Users,
    label: 'Team Events',
    colorClass: 'text-primary-700',
    bgClass: 'bg-primary-50',
    borderClass: 'border-primary-200',
  },
  personal: {
    icon: Calendar,
    label: 'Personal Events',
    colorClass: 'text-primary-700',
    bgClass: 'bg-primary-50',
    borderClass: 'border-primary-200',
  },
  tournament: {
    icon: Trophy,
    label: 'Tournaments',
    colorClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  all_events: {
    icon: Globe,
    label: 'All Events',
    colorClass: 'text-violet-700',
    bgClass: 'bg-violet-50',
    borderClass: 'border-violet-200',
  },
};

export function FeedCard({ feed, onRegenerate, onDelete, className }: FeedCardProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const config = FEED_TYPE_CONFIGS[feed.type];
  const Icon = config.icon;

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
    setLoading(true);
    try {
      await onRegenerate();
    } catch {
      // Regenerate failed
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      await onDelete();
    } catch {
      // Delete failed
      setLoading(false);
    }
  }

  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-warm-200 overflow-hidden',
        'hover:border-warm-300 transition-all',
        className
      )}
    >
      {/* Feed header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Type icon */}
          <div
            className={cn(
              'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
              config.bgClass,
              'border',
              config.borderClass
            )}
          >
            <Icon className={cn('w-5 h-5', config.colorClass)} />
          </div>

          {/* Feed info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-semibold text-warm-900">{feed.name}</h3>
              <span
                className={cn(
                  'shrink-0 px-2 py-0.5 rounded-full text-xs font-medium',
                  config.bgClass,
                  config.colorClass
                )}
              >
                {config.label}
              </span>
            </div>

            {/* Last synced */}
            {feed.last_synced_at && (
              <p className="text-xs text-warm-500">
                Last synced {formatDistanceToNow(new Date(feed.last_synced_at), { addSuffix: true })}
              </p>
            )}
          </div>
        </div>

        {/* Feed URL */}
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-warm-50 border border-warm-200">
              <code className="text-xs text-warm-600 truncate block font-mono">
                {feed.url}
              </code>
            </div>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                'shrink-0 p-2.5 rounded-lg font-medium text-sm transition-all',
                copied
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
              )}
              title="Copy URL"
              aria-label={copied ? 'URL copied' : 'Copy feed URL'}
            >
              {copied ? (
                <Check className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Copy className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Subscription instructions toggle */}
        <button
          type="button"
          onClick={() => setShowInstructions(!showInstructions)}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg
                   bg-warm-50 hover:bg-warm-100 active:bg-warm-200 text-warm-700 text-sm font-medium
                   transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Subscription Instructions</span>
          {showInstructions ? (
            <ChevronUp className="w-4 h-4 ml-auto" />
          ) : (
            <ChevronDown className="w-4 h-4 ml-auto" />
          )}
        </button>
      </div>

      {/* Subscription instructions (collapsible) */}
      {showInstructions && (
        <div className="px-4 pb-4 border-t border-warm-100">
          <SubscriptionInstructions feedUrl={feed.url} compact />
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-warm-200 bg-warm-50 flex items-center justify-between gap-2">
        {showDeleteConfirm ? (
          // Delete confirmation
          <>
            <p className="text-xs text-warm-600">Delete this feed?</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-white text-warm-700 border border-warm-200
                         hover:bg-warm-50 active:bg-warm-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium
                         bg-rose-600 text-white hover:bg-rose-700
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </>
        ) : (
          // Normal actions
          <>
            <p className="text-xs text-warm-500">
              Created {formatDistanceToNow(new Date(feed.created_at), { addSuffix: true })}
            </p>
            <div className="flex items-center gap-2">
              {/* Regenerate button */}
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={loading}
                className={cn(
                  'p-2 rounded-lg transition-all',
                  'text-warm-600 hover:text-warm-900 hover:bg-warm-100 active:bg-warm-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  loading && 'animate-spin'
                )}
                title="Regenerate URL"
                aria-label="Regenerate feed URL"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
              </button>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading}
                className="p-2 rounded-lg transition-colors
                         text-rose-600 hover:text-rose-700 hover:bg-rose-50
                         disabled:opacity-50 disabled:cursor-not-allowed"
                title="Delete feed"
                aria-label="Delete feed"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Compact Feed Card (for lists/grids)
 */
export function CompactFeedCard({
  feed,
  onClick,
}: {
  feed: CalendarFeed;
  onClick?: () => void;
}) {
  const config = FEED_TYPE_CONFIGS[feed.type];
  const Icon = config.icon;
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(feed.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copy failed - button remains in default state
    }
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border border-warm-200',
        'hover:border-warm-300 hover:bg-warm-50 active:bg-warm-100 transition-all',
        onClick && 'cursor-pointer'
      )}
    >
      <div className={cn('shrink-0 w-8 h-8 rounded-lg flex items-center justify-center', config.bgClass)}>
        <Icon className={cn('w-4 h-4', config.colorClass)} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-warm-900 truncate">{feed.name}</p>
        <p className="text-xs text-warm-500">{config.label}</p>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          'shrink-0 p-2 rounded-lg transition-colors',
          copied
            ? 'bg-primary-100 text-primary-700'
            : 'bg-warm-100 text-warm-600 hover:bg-warm-200'
        )}
        aria-label={copied ? 'URL copied' : 'Copy feed URL'}
      >
        {copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
    </div>
  );
}
