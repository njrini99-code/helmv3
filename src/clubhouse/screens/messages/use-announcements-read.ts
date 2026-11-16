'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { chReport } from '../../lib/track';
import type { ChAnnouncement } from './model';

/** GAP-S-11: an announcements read still out after this long says "Still loading…" in its section (CH-7490). */
export const CH_ANN_SLOW_AFTER = 4000;
/** …and after this long it is the failed notice with Try again (CH-7206). An answer that lands later still shows. */
export const CH_ANN_GIVE_UP_AFTER = 15_000;

/**
 * The team's announcements for Messages: the route's read when it had one, else the first read here, and again after a
 * write (acknowledge, complete, post). The read has its own wait (GAP-S-11): it never holds the conversations, it says
 * so when it is slow, and it gives up into the failed notice rather than waiting for ever. Only the newest read speaks.
 */
export function useAnnouncementsRead(read: () => Promise<ChAnnouncement[]>, preloaded: ChAnnouncement[] | null | undefined) {
  const [anns, setAnns] = useState<ChAnnouncement[]>(preloaded ?? []);
  const [annError, setAnnError] = useState(false);
  // The first read has answered (or given up): until then the section draws its own wait.
  const [annLoaded, setAnnLoaded] = useState(preloaded != null);
  const [annSlow, setAnnSlow] = useState(false);
  const newest = useRef(0);
  const loadAnns = useCallback(async () => {
    const mine = ++newest.current;
    const current = () => newest.current === mine;
    const slow = window.setTimeout(() => current() && setAnnSlow(true), CH_ANN_SLOW_AFTER);
    const giveUp = window.setTimeout(() => {
      if (!current()) return;
      chReport(new Error('announcements read timed out'), { surface: 'messages.announcements', severity: 'low' });
      setAnnSlow(false);
      setAnnError(true);
      setAnnLoaded(true);
    }, CH_ANN_GIVE_UP_AFTER);
    try {
      const rows = await read();
      if (!current()) return;
      setAnnError(false);
      setAnns(rows);
    } catch (err) {
      if (!current()) return;
      chReport(err, { surface: 'messages.announcements', severity: 'low' });
      setAnnError(true);
    } finally {
      window.clearTimeout(slow);
      window.clearTimeout(giveUp);
      if (current()) {
        setAnnSlow(false);
        setAnnLoaded(true);
      }
    }
  }, [read]);
  const preloadedRead = useRef(preloaded != null);
  useEffect(() => {
    // Read with the page: the first read is already on screen.
    if (preloadedRead.current) {
      preloadedRead.current = false;
      return;
    }
    void loadAnns();
  }, [loadAnns]);
  // Leaving the page: a read still out no longer speaks.
  useEffect(() => {
    const reads = newest;
    return () => {
      reads.current += 1;
    };
  }, []);
  return { anns, annError, annLoaded, annSlow, loadAnns };
}
