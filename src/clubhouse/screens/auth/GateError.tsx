'use client';

import { routeErrorWords, type RouteErrorViewProps } from '../../ui/Notices';
import { AuthNotice } from './AuthNotice';
import { GateFrame } from './GateFrame';
import { GateKey } from './gate-fields';

/** Where a page outside the dashboard leads back to, by name. */
function backFor(homePath: string | undefined): { href: string; label: string } | null {
  if (!homePath) return null;
  if (homePath === '/golf/login') return { href: homePath, label: 'Sign in' };
  return { href: homePath, label: 'Home' };
}

/**
 * A GolfHelm page that crashed outside the Clubhouse shell (the sign-in room's pages, onboarding, a join link, or the
 * shell itself): the same room as the page that failed, the route error's own words and number (CH-1202 to CH-1206,
 * CH-1290, catalog/shell.md), and Try again (Reload after an update). `RouteErrorBoundary` classifies, logs and
 * recovers; this only draws. Every non-admin `error.tsx` under `src/app/golf` hands it in as `outsideShell`.
 */
export function GateError({ kind, isRetrying, retryCount, onRetry, homePath, route, digest, devDetail }: RouteErrorViewProps) {
  const words = routeErrorWords(kind, route);
  const reload = kind === 'chunk' || kind === 'stale-action';
  return (
    <GateFrame label={words.title} say={{ title: 'GolfHelm for college golf.', line: 'Rounds, stats, travel and qualifiers in one place' }} back={backFor(homePath)} viewKey="error">
      <div className="ch-au-form" role="alert" data-ch-code={words.code}>
        <h1>{words.title}</h1>
        <div className="ch-au-err">
          <AuthNotice tone="danger">{words.body}</AuthNotice>
        </div>
        {retryCount > 0 && !isRetrying && <p className="ch-au-sub">{retryCount === 1 ? 'Tried again once.' : `Tried again ${retryCount} times.`}</p>}
        <GateKey idle={reload ? 'Reload' : 'Try again'} working="Trying again…" busy={isRetrying} type="button" onClick={onRetry} />
        {digest && <p className="ch-au-sub ch-num">Reference {digest}</p>}
        {devDetail && <pre className="ch-au-sub">{devDetail}</pre>}
      </div>
    </GateFrame>
  );
}

/**
 * GolfHelm's 404 outside the dashboard shell (CH-1306): a join link, onboarding or any `/golf` address that isn't a
 * page, drawn in the sign-in room with the shell's own words. The dashboard keeps `ClubhouseNotFound` in the shell.
 */
export function GateNotFound() {
  return (
    <GateFrame label="Page not found" say={{ title: 'GolfHelm for college golf.', line: 'Rounds, stats, travel and qualifiers in one place' }} back={{ href: '/golf', label: 'Home' }} viewKey="not-found">
      <div className="ch-au-form" data-ch-code="CH-1306">
        <h1>We couldn’t find that</h1>
        <p className="ch-au-sub">It may have been deleted, or the link is wrong. Everything else is where you left it.</p>
        <div className="ch-au-submit">
          <a href="/golf" className="ch-btn ch-btn--primary ch-btn--lg">
            Back to Home
          </a>
        </div>
      </div>
    </GateFrame>
  );
}
