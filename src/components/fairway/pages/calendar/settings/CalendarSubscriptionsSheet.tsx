'use client';

/**
 * ============================================================================
 * Fairway · Calendar · CalendarSubscriptionsSheet — SCREEN-BUILD-PLAN.md
 * §2.9 (S9), replacing the legacy `FairwaySubscribeSheet` (which mounted the
 * legacy `CalendarFeedManager` unchanged inside a Fairway `Sheet`).
 * ----------------------------------------------------------------------------
 * Exports `FairwayCalendarSubscriptionsSheet` with the SAME props as the
 * `FairwaySubscribeSheet` it replaces (`open`, `onOpenChange`,
 * `canManageTeamFeed`) so the coordinator can swap the import in
 * `FairwayCalendar.tsx` with no other call-site change.
 *
 * Same server actions, UNCHANGED (`src/app/golf/actions/calendar-feeds.ts`):
 * `getCalendarFeeds` / `createCalendarFeed` / `regenerateCalendarFeed` /
 * `deleteCalendarFeed`. No new action, no new table. The backend only ever
 * creates `'team'` and `'personal'` feeds (`createCalendarFeed`'s own type
 * parameter) — this sheet shows exactly those two real rows, never the
 * aspirational "Tournaments" / "All events" rows a wider design sketch
 * imagined, because nothing calls that a feed can actually deliver.
 *
 * One-way is stated up front (header description) and never implied
 * otherwise — there is no two-way sync anywhere in this stack. Tokens are
 * masked in the row (`FeedRow`/`maskFeedUrl`) and never logged.
 * ========================================================================== */

import * as React from 'react';
import { Sheet, Button, Skeleton, InlineNotice } from '@/components/fairway';
import { cn } from '@/lib/utils';
import surfaces from '../CalendarSurfaces.module.css';
import { FeedRow } from './FeedRow';
import { SubscriptionSteps } from './SubscriptionSteps';
import { useIsOnline } from '../availability/useIsOnline';
import type { CalendarFeedRow, CalendarFeedType } from './types';

let cachedActions: Promise<typeof import('@/app/golf/actions/calendar-feeds')> | null = null;
/** Code-split: only load the feed actions once this sheet is actually opened. */
function loadFeedActions() {
  if (!cachedActions) cachedActions = import('@/app/golf/actions/calendar-feeds');
  return cachedActions;
}

interface FeedTypeConfig {
  type: CalendarFeedType;
  label: string;
  description: string;
}

const FEED_TYPES: ReadonlyArray<FeedTypeConfig> = [
  { type: 'team', label: 'Team calendar', description: 'Every event on your team schedule.' },
  { type: 'personal', label: 'Personal calendar', description: 'Just the events and classes on your own schedule.' },
];

export interface FairwayCalendarSubscriptionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Coaches manage the team feed; players get a personal feed only — same
   *  gate the legacy sheet used. */
  canManageTeamFeed: boolean;
}

export function FairwayCalendarSubscriptionsSheet({ open, onOpenChange, canManageTeamFeed }: FairwayCalendarSubscriptionsSheetProps) {
  const online = useIsOnline();
  const [feeds, setFeeds] = React.useState<CalendarFeedRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [rowErrors, setRowErrors] = React.useState<Partial<Record<CalendarFeedType, string>>>({});
  const [busyTypes, setBusyTypes] = React.useState<ReadonlySet<CalendarFeedType>>(new Set());
  const [showSteps, setShowSteps] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { getCalendarFeeds } = await loadFeedActions();
      const result = await getCalendarFeeds();
      if (result.success) {
        setFeeds(result.data ?? []);
      } else {
        setFeeds([]);
        setLoadError(result.error || 'Failed to load calendar feeds.');
      }
    } catch {
      setFeeds([]);
      setLoadError('Unable to load calendar feeds. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  React.useEffect(() => {
    if (!open) {
      setRowErrors({});
      setBusyTypes(new Set());
      setShowSteps(false);
    }
  }, [open]);

  const visibleTypes = FEED_TYPES.filter((config) => config.type !== 'team' || canManageTeamFeed);

  /** Busy-set bookkeeping shared by all three mutations. Deliberately does
   *  NOT try to unify their differing success payloads (create/regenerate
   *  return the saved feed row; delete returns nothing) into one generic
   *  helper — `ActionResult<void>`'s `data` is typed `void`, which is not
   *  assignable to `CalendarFeedRow | undefined`, so each handler below
   *  reads its own result and updates `feeds` itself. */
  const withBusy = React.useCallback(async (type: CalendarFeedType, run: () => Promise<void>) => {
    setBusyTypes((prev) => new Set(prev).add(type));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[type];
      return next;
    });
    try {
      await run();
    } finally {
      setBusyTypes((prev) => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
    }
  }, []);

  function handleCreate(type: CalendarFeedType) {
    void withBusy(type, async () => {
      try {
        const { createCalendarFeed } = await loadFeedActions();
        const result = await createCalendarFeed(type);
        if (result.success && result.data) {
          const row = result.data;
          setFeeds((prev) => [...prev.filter((feed) => feed.type !== type), row]);
        } else {
          setRowErrors((prev) => ({ ...prev, [type]: result.error || 'Could not create this feed.' }));
        }
      } catch {
        setRowErrors((prev) => ({ ...prev, [type]: 'Could not create this feed.' }));
      }
    });
  }

  function handleRegenerate(type: CalendarFeedType) {
    void withBusy(type, async () => {
      try {
        const { regenerateCalendarFeed } = await loadFeedActions();
        const result = await regenerateCalendarFeed(type);
        if (result.success && result.data) {
          const row = result.data;
          setFeeds((prev) => prev.map((feed) => (feed.type === type ? row : feed)));
        } else {
          setRowErrors((prev) => ({ ...prev, [type]: result.error || 'Could not regenerate this link.' }));
        }
      } catch {
        setRowErrors((prev) => ({ ...prev, [type]: 'Could not regenerate this link.' }));
      }
    });
  }

  function handleRemove(type: CalendarFeedType) {
    void withBusy(type, async () => {
      try {
        const { deleteCalendarFeed } = await loadFeedActions();
        const result = await deleteCalendarFeed(type);
        if (result.success) {
          setFeeds((prev) => prev.filter((feed) => feed.type !== type));
        } else {
          setRowErrors((prev) => ({ ...prev, [type]: result.error || 'Could not remove this feed.' }));
        }
      } catch {
        setRowErrors((prev) => ({ ...prev, [type]: 'Could not remove this feed.' }));
      }
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      title="Add to your calendar app"
      description="One-way — Helm stays the source of truth. Changes made in Apple Calendar, Google Calendar, or Outlook never sync back."
      className={cn('sm:mx-auto sm:max-w-xl', surfaces.scope, surfaces.panel)}
    >
      <Sheet.Body className="flex flex-col gap-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {!online ? (
          <InlineNotice tone="warning" title="You&rsquo;re offline">
            Copy still works from what&rsquo;s already loaded. Create, regenerate, and remove need a connection.
          </InlineNotice>
        ) : null}

        {loadError ? (
          <InlineNotice
            tone="danger"
            title="Couldn&rsquo;t load your feeds"
            action={
              <Button variant="secondary" size="sm" onClick={load}>
                Retry
              </Button>
            }
          >
            {loadError}
          </InlineNotice>
        ) : null}

        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading calendar feeds">
            <Skeleton className="h-24 rounded-fw-md" />
            <Skeleton className="h-24 rounded-fw-md" />
          </div>
        ) : loadError ? null : (
          <div className="space-y-3">
            {visibleTypes.map((config) => (
              <FeedRow
                key={config.type}
                label={config.label}
                description={config.description}
                feed={feeds.find((feed) => feed.type === config.type) ?? null}
                busy={busyTypes.has(config.type)}
                disabled={!online}
                error={rowErrors[config.type] ?? null}
                onCreate={() => handleCreate(config.type)}
                onRegenerate={() => handleRegenerate(config.type)}
                onRemove={() => handleRemove(config.type)}
              />
            ))}
          </div>
        )}

        <div>
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            className="justify-center"
            onClick={() => setShowSteps((s) => !s)}
            aria-expanded={showSteps}
          >
            {showSteps ? 'Hide setup steps' : 'How do I add this to my calendar app?'}
          </Button>
          {showSteps ? <SubscriptionSteps className="mt-3" /> : null}
        </div>
      </Sheet.Body>
    </Sheet>
  );
}
