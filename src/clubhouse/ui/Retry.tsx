'use client';

import { RotateCw } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from './Button';
import { haptic } from '../lib/haptics';
import { isOffline } from '../lib/use-action';
import { useRefresh } from '../lib/use-refresh';

/** CH-1905: Try again while offline would fail the same way, so it says this instead. */
export const OFFLINE_LINE = 'You’re offline. Reconnect, then try again.';

const onConnection = (change: () => void) => {
  window.addEventListener('online', change);
  window.addEventListener('offline', change);
  return () => {
    window.removeEventListener('online', change);
    window.removeEventListener('offline', change);
  };
};

/**
 * The browser says it has no network, kept current by the `online` and `offline` events (what the offline banner hears,
 * CH-1901). False on the server and while hydrating, so the first client frame matches the server's.
 */
export function useIsOffline(): boolean {
  return useSyncExternalStore(onConnection, isOffline, () => false);
}

/**
 * Try again for a failed read, shared by the notice (InlineNotice) and the page failure (EmptyState tone="danger"). A
 * tap while the retry is in flight does nothing; a tap while offline shows the offline line (CH-1905) until the
 * connection comes back, instead of retrying.
 */
export function useOfflineRetry(onRetry: (() => void) | undefined, busy: boolean): { retry: () => void; offline: boolean } {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!offline) return;
    const back = () => setOffline(false);
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [offline]);
  const retry = () => {
    if (busy) return;
    if (isOffline()) {
      haptic('warning');
      setOffline(true);
      return;
    }
    onRetry?.();
  };
  return { retry, offline };
}

/**
 * The page failure's actions (EmptyState size="page" tone="danger", CH-1211): Try again first, re-running the page's
 * server render, then the page's own actions. Offline, the offline line shows above them (CH-1905), where the route
 * error shows its note.
 */
export function PageRetry({ children }: { children?: ReactNode }) {
  const { refresh, refreshing } = useRefresh();
  const { retry, offline } = useOfflineRetry(refresh, refreshing);
  return (
    <>
      {offline && (
        <p className="ch-empty-page__note" data-ch-code="CH-1905">
          {OFFLINE_LINE}
        </p>
      )}
      <div className="ch-empty-page__a">
        <Button data-ctl="CTL-P000-037" variant="primary" leftIcon={RotateCw} onClick={retry} busy={refreshing}>
          {refreshing ? 'Trying again…' : 'Try again'}
        </Button>
        {children}
      </div>
    </>
  );
}
