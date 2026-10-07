'use client';

import { useClubhouseRole } from '../../shell/context';
import { Skeleton } from '../../ui/States';

/**
 * The qualifier head's three coach actions held at their loaded widths (Manage selections, Edit qualifier, Close
 * qualifier), so a coach's head is as tall loading as loaded. A player's head has no actions, so nothing is held.
 */
export function SkeletonCoachActions() {
  if (useClubhouseRole() === 'player') return null;
  return (
    <div className="ch-qf-head__act" aria-hidden="true">
      <Skeleton width={166} height={36} radius={10} />
      <Skeleton width={127} height={36} radius={10} />
      <Skeleton width={138} height={36} radius={10} />
    </div>
  );
}
