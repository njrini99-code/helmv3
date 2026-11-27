'use client';

import { useEffect } from 'react';
import { chSignal } from '../lib/signal';

/**
 * E4 (Bridge plan §4.2): a numbered state (an empty, filtered, locked or failed page or section) counted once each time
 * it is drawn. It draws nothing, so a server-rendered state (States.tsx is server-safe) can carry it.
 *
 * `failure`: the page's one read failed (the danger empty, CH-1211 or the page's own code). The Bridge stores a failed
 * load as a failure (plan §4.5), with its row and timeline, not only as a count.
 */
export function StateSignal({ code, failure = false }: { code: string; failure?: boolean }) {
  useEffect(() => {
    chSignal(failure ? { kind: 'state', code, outcome: 'failure' } : { kind: 'state', code });
  }, [code, failure]);
  return null;
}
