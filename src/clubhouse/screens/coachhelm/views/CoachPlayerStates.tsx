'use client';

import { UserX } from 'lucide-react';
import { PLAYER_HELM_HREF } from '../../../data/coachhelm-views-shape';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Button } from '../../../ui/Button';
import { RefreshNotice } from '../../../ui/RefreshNotice';
import { EmptyState } from '../../../ui/States';

/**
 * A coach's view of one player (spec A) whose player is not in scope: not an id, not on the coach's team, or no longer active on it.
 * One page for every such id, so the page never says whether a player exists (CH-13311). The way out is the board.
 */
export function CoachPlayerNotOnTeam() {
  const phone = useChPhone();
  return (
    <main className={'ch-hl' + (phone ? ' is-phone' : '')} aria-labelledby={phone ? undefined : 'ch-hl-title'} aria-label={phone ? 'CoachHelm' : undefined}>
      {/* One h1 per screen: the phone bar's title is it on the phone, and a hidden one on desktop (the page outline, P013 D8). */}
      {phone ? <PhoneTop start title="CoachHelm" /> : <h1 id="ch-hl-title" className="ch-sr-only">CoachHelm</h1>}
      <EmptyState
        size="page"
        code="CH-13311"
        icon={UserX}
        title="That player isn’t on your team"
        body="They may have been removed, or the link is from another team."
        action={
          <Button variant="primary" href={PLAYER_HELM_HREF.board}>
            Back to the board
          </Button>
        }
      />
    </main>
  );
}

/** The scope check, or a CoachHelm gate it needs, did not load (CH-13209): never "not on your team", and Try again re-runs the page. */
export function CoachPlayerFailed() {
  const phone = useChPhone();
  return (
    <main className={'ch-hl' + (phone ? ' is-phone' : '')} aria-labelledby={phone ? undefined : 'ch-hl-title'} aria-label={phone ? 'CoachHelm' : undefined}>
      {/* One h1 per screen: the phone bar's title is it on the phone, and a hidden one on desktop (the page outline, P013 D8). */}
      {phone ? <PhoneTop start title="CoachHelm" /> : <h1 id="ch-hl-title" className="ch-sr-only">CoachHelm</h1>}
      <RefreshNotice code="CH-13209" title="This player’s page didn’t load" body="Nothing is lost. Try again in a moment." />
    </main>
  );
}
