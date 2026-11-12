'use client';

import type { ChCoachHelmData } from '../../data/coachhelm-shape';
import { rebuiltHref } from '../../shell/nav';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';

/** CoachHelm's settings, when that page is rebuilt for a coach; a target that isn't is not drawn (nav.rebuiltHref), never a dead button. */
const settingsHref = () => rebuiltHref('/golf/dashboard/settings/coaching-intelligence', 'coach');

/** CH-13305: CoachHelm turned off (globally, for the team or by this coach), said as the Team page's one notice. */
export function CoachHelmOffNotice({ off }: { off: NonNullable<ChCoachHelmData['off']> }) {
  const settings = off.by !== 'global' ? settingsHref() : null;
  return (
    <EmptyState
      size="page"
      code="CH-13305"
      {...(off.by === 'global' ? { kind: 'restricted' as const } : { shape: 'rows' as const })}
      title="CoachHelm is off"
      body={
        off.by === 'global'
          ? 'CoachHelm is turned off for GolfHelm right now, so no insights are being shown.'
          : `${off.by === 'team' ? 'Your team has' : 'You have'} turned CoachHelm off${off.reason ? `: “${off.reason}”` : ''}. Turn it back on in Settings to see signals again.`
      }
      action={
        settings ? (
          <Button variant="primary" href={settings}>
            Open CoachHelm settings
          </Button>
        ) : undefined
      }
    />
  );
}
