'use client';

import { RotateCw } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '../ui/Icon';
import { useChClock } from '../lib/use-clock';
import { LIVE_COPY } from './copy';
import { clockText } from './model';
import type { LiveFeed } from './use-live-rounds';

/**
 * How far to trust the feed (4.3, 4.12): "Live · updated 4:12 PM" while polling succeeds, "Connecting" before the first
 * answer, "No signal" with Try again when a read failed, and "Paused" with the time of what is on screen when the device is
 * offline. The generalised form of the qualifier board's Live chip. The dot is static (D-33). The time is set after
 * hydration only, so the server's paint never disagrees with the reader's clock.
 *
 * `failed`: the page itself says the feed failed and it holds nothing from before (CH-16604, F-0012). The chip then says
 * what the page says, in the page's words, and leaves Try again to the page's notice (one retry on the screen); it said
 * "Connecting" over a page that said it could not refresh. The notice is the announcement, so the chip is not a second one.
 */
export function FreshnessChip({ feed, failed = false, updatedAt, onRefresh }: { feed: LiveFeed; failed?: boolean; updatedAt: number | null; onRefresh: () => void | Promise<void> }) {
  const hours = useChClock();
  const [refreshing, start] = useTransition();
  const [stamped, setStamped] = useState<number | null>(null);
  useEffect(() => setStamped(updatedAt ?? Date.now()), [updatedAt]);
  const at = stamped != null ? clockText(new Date(stamped).toISOString(), hours) : null;

  if (failed) {
    return (
      <span className="ch-lv-chip" data-feed="failed">
        {LIVE_COPY.cantRefresh}
      </span>
    );
  }
  if (feed === 'paused') {
    return (
      <span className="ch-lv-chip" data-feed="paused" role="status">
        <span>No signal</span>
        <button type="button" className="ch-lv-chip__retry" disabled={refreshing} aria-busy={refreshing || undefined} onClick={() => start(async () => void (await onRefresh()))}>
          <Icon icon={RotateCw} size={13} />
          {refreshing ? 'Trying…' : 'Try again'}
        </button>
      </span>
    );
  }
  if (feed === 'offline') {
    return (
      <span className="ch-lv-chip" data-feed="offline" role="status">
        {at ? `Paused · ${at}` : 'Paused'}
      </span>
    );
  }
  return (
    <span className="ch-lv-chip" data-feed={feed}>
      {feed === 'live' && <span className="ch-lv-dot" aria-hidden="true" />}
      {feed === 'live' ? (at ? `Live · updated ${at}` : 'Live') : 'Connecting'}
    </span>
  );
}

/** The head line of the Home card when the feed is not healthy (CH-16604, CH-16605); null while it is. */
export function feedProblem(feed: LiveFeed): { code: 'CH-16604' | 'CH-16605'; text: string } | null {
  if (feed === 'paused') return { code: 'CH-16604', text: LIVE_COPY.cantRefresh };
  if (feed === 'offline') return { code: 'CH-16605', text: LIVE_COPY.offline };
  return null;
}
