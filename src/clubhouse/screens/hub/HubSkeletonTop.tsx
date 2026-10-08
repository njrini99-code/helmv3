'use client';

import { useClubhouseRole } from '../../shell/context';
import { Skeleton } from '../../ui/States';

/**
 * The phone skeleton's opening and tab strip in the role's own shape (CH-10405): the shell knows who is signed in
 * before the page is read, so a coach's skeleton carries New announcement under the role chip and five tabs, and a
 * player's has no button and four tabs. The page then lands where its skeleton stood, for either role.
 */
export function HubSkeletonTop() {
  const coach = useClubhouseRole() === 'coach';
  return (
    <>
      <div className="ch-hb-h">
        <div>
          <Skeleton width={96} height={24} radius={12} />
          <Skeleton width={128} height={10} />
        </div>
        {coach && <Skeleton width="100%" height={36} radius={10} />}
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
