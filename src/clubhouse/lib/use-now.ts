'use client';

import { useEffect, useState } from 'react';

/**
 * The current time, after hydration only. Server and first client render get
 * null, so relative labels ("Tomorrow", "Now") never mismatch during hydration.
 * Ticks once a minute.
 */
export function useNow(intervalMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
