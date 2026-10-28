'use client';

import { Hourglass, House, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

/**
 * Shown for any route the Clubhouse rebuild hasn't reached yet (CH-1301). It is the page empty's anatomy, as the route
 * error draws it (states audit, 2026-10-08): a medallion, the title, one or two sentences and the way back to Home,
 * with no card. `coachOnly`: a player on a page rebuilt for coaches only (Recruiting, What's new) is told it is a
 * coach's page, as Qualifiers says "Only coaches create qualifiers", not that it is coming.
 */
export function NotRebuilt({ label, coachOnly = false }: { label: string; coachOnly?: boolean }) {
  return (
    <main className="ch-notyet" data-ch-code="CH-1301">
      <div className="ch-empty-page">
        <div className="ch-empty-page__in">
          <span className="ch-empty-page__art" aria-hidden="true">
            <span className="ch-empty-page__ic">
              <Icon icon={coachOnly ? Lock : Hourglass} size={26} />
            </span>
          </span>
          <h1 className="ch-empty-page__title">{coachOnly ? `Only coaches use ${label}` : `${label} hasn’t been rebuilt yet`}</h1>
          <p className="ch-empty-page__body">
            {coachOnly
              ? 'Your rounds, stats and team are on Home.'
              : 'It’s on the list for the new GolfHelm design. Home is ready now, and each screen joins it as it’s finished.'}
          </p>
          <div className="ch-empty-page__a">
            <Button variant="primary" leftIcon={House} href="/golf/dashboard">
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

/** How long an old address may take to redirect before the page says it has nowhere to go (A30). */
export const CH_ALIAS_WAIT_MS = 2000;

/**
 * An old address Clubhouse moved (nav.isAliased) is on its way to its new screen: the redirect streams in once its
 * segment renders, so until then the canvas stays blank, with "Opening…" for a screen reader, rather than flashing
 * "hasn’t been rebuilt yet" on a link that is about to land (A30). Some aliases move one role only (a player's old
 * page moves for a coach), so if nothing has redirected after CH_ALIAS_WAIT_MS the not-rebuilt page shows as before.
 */
export function AliasWait({ label, coachOnly = false }: { label: string; coachOnly?: boolean }) {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setLate(true), CH_ALIAS_WAIT_MS);
    return () => window.clearTimeout(t);
  }, []);
  if (late) return <NotRebuilt label={label} coachOnly={coachOnly} />;
  return (
    <main className="ch-notyet" aria-busy="true">
      <span className="ch-sr-only" role="status">
        Opening…
      </span>
    </main>
  );
}
