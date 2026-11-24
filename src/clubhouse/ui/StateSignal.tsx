'use client';

import { useEffect } from 'react';
import { chSignal } from '../lib/signal';

/**
 * E4 (Bridge plan §4.2): a numbered state (an empty, filtered, locked or failed page or section) counted once each time
 * it is drawn. It draws nothing, so a server-rendered state (States.tsx is server-safe) can carry it.
 */
export function StateSignal({ code }: { code: string }) {
  useEffect(() => {
    chSignal({ kind: 'state', code });
  }, [code]);
  return null;
}
