'use client';

import { Database, Lock, SearchX } from 'lucide-react';
import { Button } from '../../ui/Button';
import { NoTeam } from '../../ui/NoTeam';
import { EmptyState } from '../../ui/States';
import { TourFailed, TourHead, TourMain, TourPhoneTop, useTourPhone } from './parts';
import { useTourPaths } from './paths';

/**
 * The page-level states a Tournaments route draws instead of a view (base-owned, catalog serials 02 to 05):
 *   not_set_up  the held migrations are not applied, so there is nothing to read yet (CH-16302): never an empty season
 *               and never a crash;
 *   no_team     the signed-in coach or player is not on a team (CH-16303);
 *   not_found   the event is not this team's, or is gone (CH-16304);
 *   coach_only  a player on a coach's page: the form, the lineup, compare, history, the link inbox (CH-16305);
 *   failed      the page's one read failed: every view's page failure (CH-16201), drawn by the route.
 */
export type TourNoticeKind = 'not_set_up' | 'no_team' | 'not_found' | 'coach_only' | 'failed';

const TITLE_ID = 'ch-tour-notice-title';

export function TourNotice({ kind, coach = true, title = 'Tournaments', phone: forced }: { kind: TourNoticeKind; coach?: boolean; title?: string; phone?: boolean }) {
  const phone = useTourPhone(forced);
  const paths = useTourPaths();
  if (kind === 'failed') return <TourFailed view="home" phone={phone} id={TITLE_ID} eyebrow="Tournaments" title={title} />;
  const back = (label: string) => (
    <Button size="sm" href={paths.home()}>
      {label}
    </Button>
  );
  return (
    <TourMain view="home" phone={phone} labelledBy={TITLE_ID} className="ch-tour-ph">
      <TourPhoneTop phone={phone} title="Tournaments" />
      <TourHead id={TITLE_ID} phone={phone} eyebrow="Team" title="Tournaments" />
      {kind === 'not_set_up' ? (
        <EmptyState
          size="page"
          code="CH-16302"
          icon={Database}
          title="Tournaments aren’t set up yet"
          body={coach ? 'Your events, lineups and results show here once Tournaments is set up for your team. Nothing is missing: there is nothing saved here yet.' : 'Your team’s events show here once your coach’s Tournaments is set up.'}
        />
      ) : kind === 'no_team' ? (
        <NoTeam code="CH-16303" coach={coach} body={coach ? 'Tournaments fill in once your team is set up.' : 'Your team’s events show here once a coach adds you to a team roster.'} />
      ) : kind === 'not_found' ? (
        <EmptyState size="page" code="CH-16304" icon={SearchX} title="That event isn’t on your team" body="It may have been deleted, or the link is from another team." action={back('Back to tournaments')} />
      ) : (
        <EmptyState size="page" code="CH-16305" icon={Lock} title="Only coaches open this page" body="You can see your team’s events and your own results in Tournaments." action={back('See your tournaments')} />
      )}
    </TourMain>
  );
}
