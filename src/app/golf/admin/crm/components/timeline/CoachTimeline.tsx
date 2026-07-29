'use client';

import { useEffect, useState } from 'react';
import { IconMessageSquare } from '@/components/icons';
import type { TimelineItem as TimelineItemType } from '@/app/golf/admin/crm/types/foundations';
import { getCoachTimeline } from '@/app/golf/actions/crm-timeline';
import { TimelineItem } from './TimelineItem';
import { EmptyState } from '@/components/fairway';

interface CoachTimelineProps {
  coachId: string;
  /** Optional: cap items rendered (also caps the server fetch). Defaults 100. */
  limit?: number;
  /** Optional: ISO cutoff. Defaults to 90 days ago. */
  since?: string;
  /** Bumps to force a refetch (e.g. after logging a contact). */
  refreshKey?: number;
}

export function CoachTimeline({ coachId, limit, since, refreshKey }: CoachTimelineProps) {
  const [items, setItems] = useState<TimelineItemType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getCoachTimeline(coachId, { limit, since })
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load timeline';
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [coachId, limit, since, refreshKey]);

  if (loading) {
    return (
      <ul className="relative pl-6">
        <span aria-hidden="true" className="absolute left-[11px] top-0 bottom-0 w-px bg-surface-sunken" />
        {[0, 1, 2].map((i) => (
          <li key={i} className="relative pb-5">
            <span className="absolute left-[-13px] top-0.5 w-[22px] h-[22px] rounded-full bg-surface-sunken skeleton-shimmer" />
            <div className="ml-4 space-y-1.5 pt-0.5">
              <div className="h-3 w-32 bg-surface-sunken rounded skeleton-shimmer" />
              <div className="h-3 w-48 bg-surface-sunken rounded skeleton-shimmer" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <div className="py-6 text-center">
        <p className="text-xs text-fw-danger-ink">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        variant="subtle"
        icon={<IconMessageSquare size={18} />}
        title="No activity yet"
        description="Try logging a contact or creating a task."
      />
    );
  }

  return (
    <ul className="relative pl-6">
      <span aria-hidden="true" className="absolute left-[11px] top-0 bottom-0 w-px bg-surface-sunken" />
      {items.map((item) => (
        <TimelineItem key={item.id} item={item} />
      ))}
    </ul>
  );
}
