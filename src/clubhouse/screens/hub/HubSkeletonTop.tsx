'use client';

import { useClubhouseRole } from '../../shell/context';
import { Skeleton } from '../../ui/States';
import { LargeTitleSkeleton } from '../../ui/LargeTitle';

/**
 * The phone skeleton's opening and tab strip in the role's own shape (CH-10405): the shell knows who is signed in
 * before the page is read, so a coach's skeleton has five tabs and a player's four. Neither has a role chip (W20). The
 * page then lands where its skeleton stood, for either role.
 */
export function HubSkeletonTop() {
  const coach = useClubhouseRole() === 'coach';
  return (
    <>
      <div className="ch-hb-h">
        <div className="is-plain">
          <Skeleton width={96} height={8} />
          <LargeTitleSkeleton width={150} />
        </div>
        <HubSkeletonStrip />
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
 * The 4px over the desktop skeleton's title. The coach's role chip that once stood here is gone (W20), so both roles'
 * title blocks are the loaded page's height with this alone.
 */
export function HubSkeletonChip() {
  return <div style={{ height: 4 }} />;
}

/** The strip's row under the title, held at its loaded height (a figure over its words) so the tabs do not move. */
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
  return <Skeleton width={187} height={36} radius={10} />;
}
