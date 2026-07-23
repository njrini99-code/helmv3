'use client';

/**
 * Create Feed Section Component
 *
 * Workflow for creating new calendar feeds:
 * - Feed type selection with icon tiles
 * - Feed name input
 * - Optional description
 * - Team/player selection (context-based)
 * - URL generation preview
 * - Create action
 *
 * Features:
 * - Large icon tiles (touch-friendly)
 * - Visual feedback on selection
 * - Form validation
 * - Loading states
 * - Auto-generated feed names
 *
 * Fairway tokens only — renders inside CalendarFeedManager's `<Inset>`, which
 * itself mounts flush inside the live Fairway "Subscribe to your calendar"
 * Sheet, so it must read as the same app (no legacy cream/warm/amber/violet/
 * rose). Tone mapping matches FeedCard's FEED_TYPE_META exactly (team/personal
 * → accent, tournament → warning, all_events → the neutral-but-stronger
 * "info" treatment) so a feed type reads the same color here and in the list.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Calendar, Users, Trophy, Globe, Sparkles, type LucideIcon } from 'lucide-react';
import { type FeedType } from './CalendarFeedManager';
import { Button, Input, Inset, InlineNotice, type FwStatusTone } from '@/components/fairway';

interface CreateFeedSectionProps {
  onCreate: (type: FeedType, name: string) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  allowedTypes?: FeedType[];
  showNameInput?: boolean;
  className?: string;
}

interface FeedTypeOption {
  type: FeedType;
  icon: LucideIcon;
  label: string;
  description: string;
  tone: FwStatusTone;
}

const FEED_TYPE_OPTIONS: FeedTypeOption[] = [
  { type: 'team', icon: Users, label: 'Team Events', description: 'All events for your team', tone: 'accent' },
  { type: 'personal', icon: Calendar, label: 'Personal Events', description: 'Only your events', tone: 'accent' },
  { type: 'tournament', icon: Trophy, label: 'Tournaments', description: 'Tournament events only', tone: 'warning' },
  { type: 'all_events', icon: Globe, label: 'All Events', description: 'Every event on your calendar', tone: 'info' },
];

/** Selected-tile treatment per tone — mirrors StatusPill's tone→token pairing
 *  (green-forward; amber the only off-green hue; "info" stays neutral-but-
 *  stronger rather than inventing a blue/violet family). */
const TONE_SELECTED_CLASSES: Record<FwStatusTone, string> = {
  neutral: 'border-border-strong bg-surface-sunken text-text-primary',
  accent: 'border-accent-500 bg-accent-50 text-accent-700',
  success: 'border-accent-500 bg-fw-success-bg text-accent-700',
  warning: 'border-fw-warning-ring bg-fw-warning-bg text-fw-warning-ink',
  danger: 'border-fw-danger/40 bg-fw-danger-bg text-fw-danger',
  info: 'border-border-strong bg-surface-sunken text-text-primary',
};

export function CreateFeedSection({
  onCreate,
  onCancel,
  loading = false,
  allowedTypes,
  showNameInput = true,
  className,
}: CreateFeedSectionProps) {
  const [selectedType, setSelectedType] = useState<FeedType | null>(null);
  const [feedName, setFeedName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const availableOptions = allowedTypes
    ? FEED_TYPE_OPTIONS.filter((option) => allowedTypes.includes(option.type))
    : FEED_TYPE_OPTIONS;

  async function handleCreate() {
    if (!selectedType) {
      setError('Please select a feed type');
      return;
    }

    const selectedOption = availableOptions.find((option) => option.type === selectedType);
    const resolvedName = feedName.trim() || (selectedOption ? `My ${selectedOption.label}` : '');

    if (!resolvedName) {
      setError('Please enter a feed name');
      return;
    }

    setError(null);
    try {
      await onCreate(selectedType, resolvedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create feed');
    }
  }

  function handleTypeSelect(type: FeedType) {
    setSelectedType(type);
    setError(null);

    // Auto-generate feed name if empty
    if (!feedName) {
      const option = availableOptions.find((opt) => opt.type === type);
      if (option) {
        setFeedName(`My ${option.label}`);
      }
    }
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent-600" aria-hidden="true" />
          <h3 className="font-fw-sans text-body-lg font-medium tracking-[-0.012em] text-text-primary">
            Create Calendar Feed
          </h3>
        </div>
        <p className="font-fw-sans text-body-sm text-text-secondary">
          Choose what events to include in your calendar feed
        </p>
      </div>

      {/* Feed type selection */}
      <div>
        <p className="mb-3 font-fw-sans text-caption font-medium text-text-secondary">
          Feed Type
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {availableOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedType === option.type;

            return (
              // Intentional raw <button>: this is a per-tone, multi-line (icon +
              // label + description) selectable tile — Fairway's <Button> is a
              // pill-shaped single-child-span primitive (button.tsx's "CHILDREN
              // CONTRACT") that doesn't fit a flex-col tile grid, same class of
              // exception FilterPill.tsx and InlineNotice.tsx take. The full
              // interactive-state contract (focus-visible ring, active feedback,
              // disabled) is implemented inline below.
              // eslint-disable-next-line helm/no-raw-button
              <button
                key={option.type}
                type="button"
                onClick={() => handleTypeSelect(option.type)}
                disabled={loading}
                aria-pressed={isSelected}
                className={cn(
                  'flex min-h-[100px] flex-col items-center justify-center gap-2 rounded-fw-md border p-4',
                  'touch-manipulation [transition-duration:180ms]',
                  'transition-[color,background-color,border-color,transform] motion-reduce:transition-none',
                  'active:translate-y-[0.5px] motion-reduce:active:translate-y-0',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isSelected
                    ? TONE_SELECTED_CLASSES[option.tone]
                    : 'border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:bg-surface-tint',
                )}
              >
                <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
                <div className="text-center">
                  <p className="font-fw-sans text-eyebrow font-medium uppercase tracking-wide">
                    {option.label}
                  </p>
                  <p className={cn('mt-1 text-caption', isSelected ? 'opacity-80' : 'text-text-tertiary')}>
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed name */}
      {showNameInput && (
        <div>
          <label htmlFor="feed-name" className="mb-2 block font-fw-sans text-caption font-medium text-text-secondary">
            Feed Name
          </label>
          <Input
            id="feed-name"
            type="text"
            value={feedName}
            onChange={(e) => {
              setFeedName(e.target.value);
              setError(null);
            }}
            placeholder="e.g., My Team Events"
            disabled={loading}
            autoCapitalize="words"
            autoCorrect="on"
            enterKeyHint="done"
          />
          <p className="mt-1.5 font-fw-sans text-caption text-text-tertiary">
            This name will help you identify the feed in your calendar app
          </p>
        </div>
      )}

      {/* Preview URL (when type is selected) */}
      {selectedType && (
        <Inset padding="md">
          <p className="mb-2 font-fw-sans text-caption font-medium text-text-secondary">Feed URL Preview</p>
          <code className="block break-all font-mono text-caption text-text-secondary">
            webcal://helmsportslabs.com/api/calendar/{selectedType}/[token]
          </code>
          <p className="mt-2 font-fw-sans text-caption text-text-tertiary">
            The actual URL will be generated when you create the feed
          </p>
        </Inset>
      )}

      {/* Error message */}
      {error && <InlineNotice tone="danger">{error}</InlineNotice>}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-border-subtle pt-4">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="button"
          onClick={handleCreate}
          disabled={loading || !selectedType || (showNameInput && !feedName.trim())}
          busy={loading}
        >
          {loading ? 'Creating...' : 'Create Feed'}
        </Button>
      </div>
    </div>
  );
}

