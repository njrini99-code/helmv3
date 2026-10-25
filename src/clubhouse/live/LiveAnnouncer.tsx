'use client';

import { useEffect, useRef, useState } from 'react';
import type { LiveMoment } from './model';

/**
 * One polite live region per page, outside the list (7). It speaks the news in batches, at most one announcement every
 * ten seconds, and only for notable results (a birdie or better, a double or worse, a lane that caught up, a posted
 * round): never a par, a bogey or a change of freshness. `enabled` is the "Announce updates" switch.
 */
export const ANNOUNCE_GAP_MS = 10_000;

export function LiveAnnouncer({ moments, enabled }: { moments: readonly LiveMoment[]; enabled: boolean }) {
  const [text, setText] = useState('');
  const spoken = useRef(new Set<string>());
  const queue = useRef<string[]>([]);
  const lastAt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const first = useRef(true);

  useEffect(() => {
    // What was already in the list when the page opened is not news.
    if (first.current) {
      first.current = false;
      for (const m of moments) spoken.current.add(m.id);
      return;
    }
    if (!enabled) return;
    for (const m of [...moments].reverse()) {
      if (spoken.current.has(m.id)) continue;
      spoken.current.add(m.id);
      queue.current.push(m.announce);
    }
    const flush = () => {
      timer.current = undefined;
      const next = queue.current.splice(0, 3);
      if (!next.length) return;
      lastAt.current = Date.now();
      setText(next.join(' '));
      if (queue.current.length) timer.current = window.setTimeout(flush, ANNOUNCE_GAP_MS);
    };
    if (queue.current.length && timer.current === undefined) {
      const wait = Math.max(0, lastAt.current + ANNOUNCE_GAP_MS - Date.now());
      timer.current = window.setTimeout(flush, wait);
    }
  }, [moments, enabled]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <div className="ch-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
