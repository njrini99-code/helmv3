'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { COACH_PLAYER_VIEWS, coachBoardFor, helmViewHref, PLAYER_HELM_VIEWS, PLAYER_VOICE, type ChViewVoice, type PlayerHelmView } from '../../../data/coachhelm-views-shape';
import { useChPhone } from '../../../lib/use-phone';
import { usePageCrumbs } from '../../../shell/crumbs';
import { rebuiltHref } from '../../../shell/nav';
import { PhoneTop } from '../../../shell/phone-chrome';
import { Button } from '../../../ui/Button';
import { EmptyState } from '../../../ui/States';
import { Head } from '../parts';
import { useViewSwitch } from '../use-view-switch';
import { PlayerHelmTabs } from './PlayerHelmTabs';

/**
 * The page every view of the player's CoachHelm is drawn in: the shell's phone top bar, the sub-navigation, and the page's own
 * header (the role chip, "CoachHelm", one line), as the board has them. The sub-navigation sits above the header on the phone and
 * below it on desktop, as the coach's does. With CoachHelm off nothing is read and nothing leads anywhere, so it is not drawn
 * (CH-13304, as CH-13305 for the coach). The main landmark is labelled by the page's h1 (CH-13801).
 *
 * `voice`: a coach's view of one player (spec A) draws the player's header instead: "CoachHelm" as the eyebrow (a link back to the
 * board on desktop, with the breadcrumb CoachHelm › name), the player's name as the title and the class and newest round as the
 * line; on the phone the bar carries the name, as the screen's h1, with a back link to the board open on this player. The strip is
 * the player's three views, Deep dive first, with no Board and no Development.
 *
 * `after`: what is drawn beside the page, not in it. A pushed phone screen is fixed to the whole phone, and the page is a
 * size container (its layout containment would make that screen fixed to the page instead), so it goes here. `covered`: such a
 * screen is up, so the page under it is inert.
 */
export function PlayerHelmFrame({ view, line, off = false, covered = false, after, voice = PLAYER_VOICE, children }: { view: PlayerHelmView; line: ReactNode; off?: boolean; covered?: boolean; after?: ReactNode; voice?: ChViewVoice; children: ReactNode }) {
  const phone = useChPhone();
  const router = useRouter();
  const coach = voice.role === 'coach' ? voice : null;
  // A switch of view moves the strip at once and dims the page (aria-busy) until the next view is ready.
  const sw = useViewSwitch(view, (v) => helmViewHref(v, voice), coach ? COACH_PLAYER_VIEWS : PLAYER_HELM_VIEWS);
  // As Stats does for a coach's player: the top bar reads "CoachHelm › Jonah Okafor".
  usePageCrumbs(coach ? ['CoachHelm', coach.name] : null);
  const tabs = off ? null : <PlayerHelmTabs active={sw.shown} onGo={sw.go} coach={!!coach} />;
  const board = coach ? coachBoardFor(coach.playerId) : null;
  return (
    <>
      <main className={'ch-hl ch-hv' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hl-title" data-ch-view={view} data-canopy={phone ? undefined : ''} aria-busy={sw.pending || undefined} inert={covered || undefined}>
        {phone && (coach && board ? <PhoneTop back={{ label: 'CoachHelm', onBack: () => router.push(board) }} title={coach.name} /> : <PhoneTop start title="CoachHelm" />)}
        {phone && tabs}
        {coach && board ? (
          <Head
            phone={phone}
            aside={!phone ? tabs : undefined}
            title={coach.name}
            who={
              phone ? (
                'CoachHelm'
              ) : (
                <Link className="ch-hv-role-link" href={board}>
                  CoachHelm
                </Link>
              )
            }
          >
            <span className="ch-num">{coach.line}</span>
          </Head>
        ) : (
          <Head phone={phone} aside={!phone ? tabs : undefined}>
            {line}
          </Head>
        )}
        {children}
      </main>
      {after}
    </>
  );
}

/**
 * CoachHelm is turned off for this player (their coach, their team or GolfHelm): the board's own page, on every view (CH-13304).
 * On a coach's view of one player it is that player's team's switch, said by name, with the way to turn it back on (CH-13313).
 */
export function HelmOff({ reason, voice = PLAYER_VOICE }: { reason: string | null; voice?: ChViewVoice }) {
  if (voice.role === 'coach') {
    const settings = rebuiltHref('/golf/dashboard/settings/coaching-intelligence', 'coach');
    const first = voice.first;
    return (
      <EmptyState
        size="page"
        code="CH-13313"
        kind="restricted"
        title={`CoachHelm is off for ${first}`}
        body={`It is turned off for ${first}’s team${reason ? `: “${reason}”` : ''}. Turn it on in CoachHelm settings to read ${first}’s game.`}
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
  return (
    <EmptyState
      size="page"
      code="CH-13304"
      kind="restricted"
      title="CoachHelm is off for your team"
      body={reason ? `Your coach turned it off: “${reason}”. Ask your coach if you want it back on.` : 'CoachHelm is turned off, so no insights are being shown. Ask your coach if you want it back on.'}
    />
  );
}
