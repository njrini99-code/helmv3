'use client';

import { ChevronLeft, Hourglass, House, Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { BootSkeleton } from './BootSkeleton';
import { HomeSkeleton } from '../screens/home/HomeSkeleton';
import { SettingsSkeleton } from '../screens/settings/SettingsSkeleton';
import { CoachHelmSkeleton } from '../screens/coachhelm/CoachHelmSkeleton';
import { AskSkeleton } from '../screens/coachhelm/chat/AskSkeleton';
import { StatsSkeletonFor } from '../screens/stats/StatsRouteSkeleton';
import { RosterSkeleton } from '../screens/roster/RosterSkeleton';
import { QualifierDetailSkeleton, QualifierSelectionSkeleton } from '../screens/qualifiers/QualifiersSkeleton';

/**
 * Shown for an address with no Clubhouse screen for this role (CH-1301). It is the page empty's anatomy, as the route
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
          <h1 className="ch-empty-page__title">{coachOnly ? `Only coaches use ${label}` : `${label} isn’t available here`}</h1>
          <p className="ch-empty-page__body">
            {coachOnly
              ? 'Your rounds, stats and team are on Home.'
              : 'Your team, rounds and stats are on Home.'}
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

/**
 * A coach on a player's own round flow (/rounds/new, /rounds/recover, /rounds/continue/[id]) (CH-11390, GAP-R-12): the
 * page empty's anatomy, as NotRebuilt, saying whose page it is and the way back to the team's rounds.
 */
export function PlayersOnlyRounds() {
  return (
    <main className="ch-notyet" data-ch-code="CH-11390">
      <div className="ch-empty-page">
        <div className="ch-empty-page__in">
          <span className="ch-empty-page__art" aria-hidden="true">
            <span className="ch-empty-page__ic">
              <Icon icon={Lock} size={26} />
            </span>
          </span>
          <h1 className="ch-empty-page__title">Only players log rounds</h1>
          <p className="ch-empty-page__body">Your team’s rounds are in Rounds.</p>
          <div className="ch-empty-page__a">
            <Button variant="primary" leftIcon={ChevronLeft} href="/golf/dashboard/rounds">
              Back to Rounds
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

/** How long an old address may take to redirect before the page says it has nowhere to go (A30). */
export const CH_ALIAS_WAIT_MS = 2000;

/** Which screen an old address lands on (each alias layout's `redirectToClubhouse` target, nav.CH_ALIASED_ROUTES), so its wait draws that screen's skeleton. */
export type ChAliasSkeleton = 'settings-team' | 'settings-golf' | 'coachhelm' | 'ask' | 'home' | 'stats-profile' | 'stats-team' | 'roster' | 'qualifier' | 'qualifier-selection';
export function aliasSkeletonFor(pathname: string, role: string | null | undefined): ChAliasSkeleton | null {
  const path = pathname.replace(/\/$/, '').replace(/^\/golf\/dashboard/, '');
  const coach = role === 'coach';
  const player = role === 'player';
  if (path === '/team') return coach ? 'settings-team' : player ? 'settings-golf' : null;
  if (path === '/intelligence') return coach ? 'coachhelm' : null;
  if (path === '/courses') return coach ? 'home' : null;
  if (path === '/whats-new' || path === '/live') return player ? 'home' : null;
  if (/^\/roster\/[^/]+$/.test(path)) return coach ? 'stats-profile' : player ? 'roster' : null;
  if (path === '/coachhelm/genome/compare') return coach ? 'stats-team' : null;
  if (/^\/players\/[^/]+(\/.*)?$/.test(path) || /^\/coachhelm\/genome\/[^/]+$/.test(path)) return coach ? 'stats-profile' : null;
  if (path === '/coachhelm/chat') return coach ? 'ask' : player ? 'coachhelm' : null;
  if (/^\/coachhelm\/qualifying\/[^/]+$/.test(path)) return coach ? 'qualifier-selection' : player ? 'qualifier' : null;
  return null;
}

function AliasSkeleton({ which, role }: { which: ChAliasSkeleton | null; role: 'coach' | 'player' }) {
  switch (which) {
    case 'settings-team':
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      return <SettingsSkeleton role="coach" section="team" opened />;
    case 'settings-golf':
      // eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role
      return <SettingsSkeleton role="player" section="golf" opened />;
    case 'coachhelm':
      return <CoachHelmSkeleton view={role} />;
    case 'ask':
      return <AskSkeleton />;
    case 'home':
      return <HomeSkeleton />;
    case 'stats-profile':
      return <StatsSkeletonFor profile coach />;
    case 'stats-team':
      return <StatsSkeletonFor profile={false} />;
    case 'roster':
      return <RosterSkeleton />;
    case 'qualifier':
      return <QualifierDetailSkeleton />;
    case 'qualifier-selection':
      return <QualifierSelectionSkeleton />;
    default:
      // A destination this table doesn't name: the shell's plain page skeleton.
      return <BootSkeleton />;
  }
}

/**
 * Whether the alias's own segment is still on its way: the frame renders it hidden right after the wait (ClubhouseFrame),
 * and until its stream arrives that subtree holds a loading boundary's busy skeleton. While it does, the redirect is in
 * flight, not missing.
 */
function segmentPending(wait: HTMLElement | null): boolean {
  for (let n = wait?.nextElementSibling ?? null; n; n = n.nextElementSibling) {
    if (n.hasAttribute('hidden') && n.querySelector('[aria-busy="true"]')) return true;
  }
  return false;
}

/**
 * An old address Clubhouse moved (nav.isAliased) is on its way to its new screen: the redirect streams in once its
 * segment renders, so until then the canvas draws the destination's skeleton (or the shell's plain page skeleton when
 * the table above doesn't know it), never a blank canvas and never "hasn’t been rebuilt yet" on a link that is about to
 * land (A30, GAP-S-19). The wait runs CH_ALIAS_WAIT_MS and starts again while the segment is still pending (a slow
 * connection's redirect is still streaming); only a segment that rendered and did not redirect falls to the not-rebuilt
 * page, as before.
 */
export function AliasWait({ label, coachOnly = false, path, role }: { label: string; coachOnly?: boolean; path?: string; role?: string | null }) {
  const [late, setLate] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let t = 0;
    const tick = () => {
      if (segmentPending(box.current)) t = window.setTimeout(tick, CH_ALIAS_WAIT_MS);
      else setLate(true);
    };
    t = window.setTimeout(tick, CH_ALIAS_WAIT_MS);
    return () => window.clearTimeout(t);
  }, []);
  if (late) return <NotRebuilt label={label} coachOnly={coachOnly} />;
  return (
    <div ref={box} style={{ display: 'contents' }} data-ch-alias-wait="">
      <span className="ch-sr-only" role="status">
        Opening…
      </span>
      <AliasSkeleton which={path ? aliasSkeletonFor(path, role) : null} role={role === 'coach' ? 'coach' : 'player'} />
    </div>
  );
}
