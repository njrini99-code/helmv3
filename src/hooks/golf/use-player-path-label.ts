'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPlayerDisplayName } from '@/app/golf/actions/stats-data';

const PLAYER_PATH_PATTERNS = [
  /^\/golf\/dashboard\/stats\/players\/([^/]+)/,
  /^\/golf\/dashboard\/roster\/([^/]+)/,
] as const;

export function extractPlayerIdFromPath(pathname: string): string | null {
  for (const pattern of PLAYER_PATH_PATTERNS) {
    const match = pathname.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Resolves a display name for coach player drill-down routes (stats + roster). */
export function usePlayerPathLabel(pathname: string) {
  const playerId = useMemo(() => extractPlayerIdFromPath(pathname), [pathname]);
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) {
      setName(null);
      return;
    }
    let cancelled = false;
    getPlayerDisplayName(playerId)
      .then((resolved) => {
        if (!cancelled) setName(resolved);
      })
      .catch(() => {
        if (!cancelled) setName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return { playerId, name };
}
