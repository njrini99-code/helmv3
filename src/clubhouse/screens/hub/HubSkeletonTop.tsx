'use client';

import { useClubhouseRole } from '../../shell/context';
import { Skeleton } from '../../ui/States';

/**
 * The phone skeleton's opening and tab strip in the role's own shape (CH-10405): the shell knows who is signed in
 * before the page is read, so a coach's skeleton carries New announcement under the role chip and five tabs, and a
 * player's has no chip, no button and four tabs. The page then lands where its skeleton stood, for either role.
 */
export function HubSkeletonTop() {
  const coach = useClubhouseRole() === 'coach';
  return (
    <>
      <div className="ch-hb-h">
        <div className={coach ? undefined : 'is-player'}>
          {coach && <Skeleton width={96} height={24} radius={12} />}
          <Skeleton width={128} height={10} />
        </div>
        <HubSkeletonStrip />
        {coach && <Skeleton width="100%" height={44} radius={10} />}
      </div>
      <div className="ch-hb-tabs" aria-hidden="true">
        {(coach ? [40, 92, 44, 70, 38] : [40, 92, 44, 70]).map((w, i) => (
          <span key={i} className="ch-hb-skelm__tab">
            <Skeleton width={w} height={12} />
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * The desktop skeleton's role chip, a coach's only (a player's page has none, wave 7), with the gap under it. A player's
 * title keeps the 4px that gap holds, so the title block is the loaded page's height for either role.
 */
export function HubSkeletonChip() {
  if (useClubhouseRole() !== 'coach') return <div style={{ height: 4 }} />;
  return (
    <>
      <Skeleton width={96} height={24} radius={12} />
      <div style={{ height: 4 }} />
    </>
  );
}

/** The strip's row under the title, held at its loaded height (a line of the strip's own type) so the tabs do not move. */
export function HubSkeletonStrip() {
  return (
    <div className="ch-hb-strip ch-hb-strip--skel" aria-hidden="true">
      <Skeleton width={240} height={13} />
    </div>
  );
}

/** A coach's head action, held at the loaded button's size beside the title (a player has none). */
export function HubSkeletonAction() {
  if (useClubhouseRole() !== 'coach') return null;
  return <Skeleton width={176} height={40} radius={10} />;
}
