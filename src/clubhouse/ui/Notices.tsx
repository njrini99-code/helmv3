'use client';

import { CircleAlert, RotateCw } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './Button';
import { haptic } from '../lib/haptics';
import { isOffline } from '../lib/use-action';

export function InlineNotice({
  title,
  body,
  onRetry,
  retrying = false,
  code,
}: {
  title: string;
  body?: ReactNode;
  onRetry?: () => void;
  /** The retry is in flight (`useRefresh().refreshing`): the control says so and does nothing on a second tap. */
  retrying?: boolean;
  /** Catalog number (docs/clubhouse/catalog). */
  code?: string;
}) {
  // Try again while offline would fail the same way: say so instead (CH-1905).
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!offline) return;
    const back = () => setOffline(false);
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [offline]);
  const retry = () => {
    if (retrying) return;
    if (isOffline()) {
      haptic('warning');
      setOffline(true);
      return;
    }
    onRetry?.();
  };
  return (
    <div className="ch-notice ch-notice--danger" role="alert" data-ch-code={code} aria-busy={retrying || undefined}>
      <Icon icon={CircleAlert} size={16} className="ch-notice__icon" />
      <div className="ch-notice__txt">
        <p className="ch-notice__title">{title}</p>
        {body && <p className="ch-notice__body">{body}</p>}
        {offline && (
          <p className="ch-notice__body" data-ch-code="CH-1905">
            You&apos;re offline. Reconnect, then try again.
          </p>
        )}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" leftIcon={RotateCw} onClick={retry} disabled={retrying}>
          {retrying ? 'Trying again' : 'Try again'}
        </Button>
      )}
    </div>
  );
}

export type RouteErrorKind = 'chunk' | 'stale-action' | 'transient' | 'load' | 'unknown';

const COPY: Record<RouteErrorKind, { title: string; body: string }> = {
  chunk: {
    title: 'A newer version of GolfHelm is ready.',
    body: 'This page was built for an older version. Reloading picks up the new one; nothing you saved is lost.',
  },
  'stale-action': {
    title: 'This page is out of date.',
    body: 'GolfHelm updated while it was open. Reload to continue where you were.',
  },
  transient: {
    title: 'GolfHelm is slow to respond.',
    body: 'The server is busy for a moment. This usually clears on its own within a few seconds.',
  },
  load: {
    title: 'This page didn’t finish loading.',
    body: 'The connection dropped before the data arrived. Check your signal and try again.',
  },
  unknown: {
    title: 'Something went wrong on this page.',
    body: 'It has been reported automatically, with the details needed to fix it.',
  },
};

/** Catalog numbers of the full-page error views (docs/clubhouse/catalog/shell.md). */
const ROUTE_ERROR_CODE: Record<RouteErrorKind, string> = {
  chunk: 'CH-1202',
  'stale-action': 'CH-1203',
  transient: 'CH-1204',
  load: 'CH-1205',
  unknown: 'CH-1206',
};

/** Full-page route error inside the Clubhouse canvas. Logic lives in RouteErrorBoundary. */
export function RouteErrorView({
  kind,
  isRetrying,
  retryCount,
  onRetry,
  homePath,
  digest,
  devDetail,
}: {
  kind: RouteErrorKind;
  isRetrying: boolean;
  retryCount: number;
  onRetry: () => void;
  homePath?: string;
  digest?: string;
  devDetail?: string;
}) {
  const copy = COPY[kind];
  return (
    <main className="ch-notyet" role="alert" data-ch-code={ROUTE_ERROR_CODE[kind]}>
      <div className="ch-notyet__card ch-sheet">
        <span className="ch-empty__icon ch-well-soft">
          <Icon icon={CircleAlert} size={18} />
        </span>
        <h1 className="ch-notyet__title ch-display">{copy.title}</h1>
        <p className="ch-notyet__body">{copy.body}</p>
        {retryCount > 0 && !isRetrying && (
          <p className="ch-notyet__meta">{retryCount === 1 ? 'Tried again once.' : `Tried again ${retryCount} times.`}</p>
        )}
        <div className="ch-notyet__actions">
          {homePath && (
            <Button variant="secondary" href="/golf/dashboard">
              Back to Home
            </Button>
          )}
          <Button variant="primary" leftIcon={RotateCw} onClick={onRetry} disabled={isRetrying} feel="commit">
            {isRetrying ? 'Trying again' : kind === 'chunk' || kind === 'stale-action' ? 'Reload' : 'Try again'}
          </Button>
        </div>
        {digest && <p className="ch-notyet__meta ch-num">Reference {digest}</p>}
        {devDetail && <pre className="ch-notyet__dev">{devDetail}</pre>}
      </div>
    </main>
  );
}
