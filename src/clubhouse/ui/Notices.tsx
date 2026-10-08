'use client';

import { ChevronLeft, CircleAlert, House, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './Button';
import { stateTitle } from './States';
import { OFFLINE_LINE, useOfflineRetry } from './Retry';
import { CH_NAV_COACH, CH_NAV_PLAYER, routeLabel } from '../shell/nav';

/**
 * A part of the page could not load (catalog kind 2). Flush in the Ledger (lead decision under the owner's full-auto
 * brief, 2026-10-08, revised the same day; owner to confirm): it sits between the section's own rules with no fill,
 * no ring and no stripe, the icon and the title in the danger ink, the body in the secondary ink, and Try again beside
 * the words, or under them in a narrow rail and on the phone (shell.css). The title is a headline, so it shows without
 * a trailing full stop (`stateTitle`).
 */
export function InlineNotice({
  title,
  body,
  onRetry,
  retrying = false,
  covered = false,
  code,
}: {
  title: string;
  body?: ReactNode;
  onRetry?: () => void;
  /** The retry is in flight (`useRefresh().refreshing`): the control says so and does nothing on a second tap. */
  retrying?: boolean;
  /**
   * The page's PageNotice already says this part failed and carries the one Try again: only the title stays here, to
   * mark the gap under the part's heading, with no body, no button and no second alert.
   */
  covered?: boolean;
  /** Catalog number (docs/clubhouse/catalog). */
  code?: string;
}) {
  // Try again while offline would fail the same way: say so instead (CH-1905).
  const { retry, offline } = useOfflineRetry(onRetry, retrying);
  return (
    <div
      className={'ch-notice ch-notice--danger' + (covered ? ' ch-notice--covered' : '')}
      role={covered ? undefined : 'alert'}
      data-ch-code={code}
      aria-busy={retrying || undefined}
    >
      <div className="ch-notice__in">
        <Icon icon={CircleAlert} size={16} className="ch-notice__icon" />
        <div className="ch-notice__txt">
          <p className="ch-notice__title">{stateTitle(title)}</p>
          {!covered && body && <p className="ch-notice__body">{body}</p>}
          {offline && (
            <p className="ch-notice__body" data-ch-code="CH-1905">
              {OFFLINE_LINE}
            </p>
          )}
        </div>
        {!covered && onRetry && (
          <div className="ch-notice__act">
            <Button size="sm" variant="secondary" leftIcon={RotateCw} onClick={retry} disabled={retrying}>
              {retrying ? 'Trying again' : 'Try again'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** "A, B and C", the first letter raised: the parts a page notice names, as the start of a sentence. */
export function partsSentence(parts: readonly string[]): string {
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
  return list.charAt(0).toUpperCase() + list.slice(1);
}

/**
 * More than one part of a page could not load (CH-1209): the page says so once, under its head, with one Try again
 * that re-runs the whole page, and each failed part keeps its heading with a covered notice (`covered`) marking the
 * gap, without a button of its own. A single failed part keeps its own notice, so below two parts this renders
 * nothing. This is for reads the server render already knows failed: the page passes those parts, as phrases that
 * read inside a sentence ("this week’s schedule", "recent rounds"), so nothing reflows after hydration. Sections that
 * crash in the browser are told the same way by their SectionGroup instead (CH-1210, ui/SectionBoundary).
 */
export function PageNotice({
  parts,
  onRetry,
  retrying = false,
  code = 'CH-1209',
}: {
  parts: readonly string[];
  onRetry: () => void;
  retrying?: boolean;
  code?: string;
}) {
  if (parts.length < 2) return null;
  return (
    <InlineNotice
      code={code}
      title="Some of this page didn’t load"
      body={`${partsSentence(parts)} didn’t load. Everything you saved is safe, and trying again usually clears it.`}
      onRetry={onRetry}
      retrying={retrying}
    />
  );
}

export type RouteErrorKind = 'chunk' | 'stale-action' | 'transient' | 'load' | 'unknown';

const COPY: Record<RouteErrorKind, { title: string; body: string }> = {
  chunk: {
    title: 'A newer version of GolfHelm is ready',
    body: 'This page was built for an older version. Reloading picks up the new one; nothing you saved is lost.',
  },
  'stale-action': {
    title: 'This page is out of date',
    body: 'GolfHelm updated while it was open. Reload to continue where you were.',
  },
  transient: {
    title: 'GolfHelm is slow to respond',
    body: 'The server is busy for a moment. This usually clears on its own within a few seconds.',
  },
  load: {
    title: 'This page didn’t finish loading',
    body: 'The connection dropped before the data arrived. Check your signal and try again.',
  },
  unknown: {
    title: 'Something went wrong on this page',
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

/**
 * Where a route error's way back goes, by name: the route's own error boundary picks the place (`homePath`, its section
 * for a sub-screen, such as Rounds for a round), and null is Home (the dashboard, and /golf, which leads there).
 */
function placeName(path: string): string | null {
  if (path === '/' || path === '/golf' || path === '/golf/dashboard') return null;
  return [...CH_NAV_COACH, ...CH_NAV_PLAYER].find((item) => item.href === path)?.label ?? routeLabel(path);
}

/**
 * Full-page route error inside the Clubhouse canvas. Logic lives in RouteErrorBoundary. It is the page empty state in
 * the danger tone (states audit, 2026-10-08): a brick medallion on faint rings, the title, one or two sentences, Try
 * again (Reload after an update) first and the way back beside it, and the error's reference as a quiet caption under
 * them (lead decision under the owner's full-auto brief; owner to confirm). No card.
 */
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
  const reload = kind === 'chunk' || kind === 'stale-action';
  const place = homePath ? placeName(homePath) : null;
  return (
    <main className="ch-notyet" role="alert" data-ch-code={ROUTE_ERROR_CODE[kind]}>
      <div className="ch-empty-page ch-empty-page--danger">
        <div className="ch-empty-page__in">
          <span className="ch-empty-page__art" aria-hidden="true">
            <span className="ch-empty-page__ic">
              <Icon icon={CircleAlert} size={26} />
            </span>
          </span>
          <h1 className="ch-empty-page__title">{copy.title}</h1>
          <p className="ch-empty-page__body">{copy.body}</p>
          {retryCount > 0 && !isRetrying && (
            <p className="ch-empty-page__note">{retryCount === 1 ? 'Tried again once.' : `Tried again ${retryCount} times.`}</p>
          )}
          <div className="ch-empty-page__a">
            <Button variant="primary" leftIcon={RotateCw} onClick={onRetry} disabled={isRetrying} feel="commit">
              {isRetrying ? 'Trying again' : reload ? 'Reload' : 'Try again'}
            </Button>
            {homePath && (
              <Button variant="secondary" leftIcon={place ? ChevronLeft : House} href={homePath}>
                {place ? `Back to ${place}` : 'Back to Home'}
              </Button>
            )}
          </div>
          {digest && <p className="ch-empty-page__ref ch-num">Reference {digest}</p>}
          {devDetail && <pre className="ch-notyet__dev">{devDetail}</pre>}
        </div>
      </div>
    </main>
  );
}
