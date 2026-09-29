'use client';

import { CircleAlert, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './Button';

export function InlineNotice({
  title,
  body,
  onRetry,
}: {
  title: string;
  body?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="ch-notice ch-notice--danger" role="alert">
      <Icon icon={CircleAlert} size={16} className="ch-notice__icon" />
      <div className="ch-notice__txt">
        <p className="ch-notice__title">{title}</p>
        {body && <p className="ch-notice__body">{body}</p>}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" leftIcon={RotateCw} onClick={onRetry}>
          Try again
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
    <main className="ch-notyet" role="alert">
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
