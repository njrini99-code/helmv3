'use client';

import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PlayerHelmView } from '../../../data/coachhelm-views-shape';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { EmptyState } from '../../../ui/States';
import { Head } from '../parts';
import { PlayerHelmTabs } from './PlayerHelmTabs';

/**
 * The page every view of the player's CoachHelm is drawn in: the shell's phone top bar, the sub-navigation, and the page's own
 * header (the role chip, "CoachHelm", one line), as the board has them. The sub-navigation sits above the header on the phone and
 * below it on desktop, as the coach's does. With CoachHelm off nothing is read and nothing leads anywhere, so it is not drawn
 * (CH-13304, as CH-13305 for the coach). The main landmark is labelled by the page's h1 (CH-13801).
 *
 * `after`: what is drawn beside the page, not in it. A pushed phone screen is fixed to the whole phone, and the page is a
 * size container (its layout containment would make that screen fixed to the page instead), so it goes here. `covered`: such a
 * screen is up, so the page under it is inert.
 */
export function PlayerHelmFrame({ view, line, off = false, covered = false, after, children }: { view: PlayerHelmView; line: ReactNode; off?: boolean; covered?: boolean; after?: ReactNode; children: ReactNode }) {
  const phone = useChPhone();
  const tabs = off ? null : <PlayerHelmTabs active={view} />;
  return (
    <>
      <main className={'ch-hl ch-hv' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hl-title" data-ch-view={view} inert={covered || undefined}>
        {phone && <PhoneTop start title="CoachHelm" />}
        {phone && tabs}
        <Head who="Player">{line}</Head>
        {!phone && tabs}
        {children}
      </main>
      {after}
    </>
  );
}

/** CoachHelm is turned off for this player (their coach, their team or GolfHelm): the board's own page, on every view (CH-13304). */
export function HelmOff({ reason }: { reason: string | null }) {
  return (
    <EmptyState
      size="page"
      code="CH-13304"
      icon={Sparkles}
      title="CoachHelm is off for your team"
      body={reason ? `Your coach turned it off: “${reason}”. Ask your coach if you want it back on.` : 'CoachHelm is turned off, so no insights are being shown. Ask your coach if you want it back on.'}
    />
  );
}
