'use client';

import { useClubhouseRole } from '../../shell/context';
import { Skeleton } from '../../ui/States';

/**
 * The qualifier head's three coach actions held at their loaded widths (Manage selections, Edit qualifier, Close
 * qualifier), so a coach's head is as tall loading as loaded. A player's head has no actions, so nothing is held.
 * `phone`: the phone qualifier's two (Manage selections across the row, then Edit).
 */
export function SkeletonCoachActions({ phone = false }: { phone?: boolean }) {
  if (useClubhouseRole() === 'player') return null;
  if (phone) {
    return (
      <div className="ch-qfm-acts" aria-hidden="true">
        <Skeleton width="100%" height={36} radius={10} />
        <Skeleton width={74} height={36} radius={10} />
      </div>
    );
  }
  return (
    <div className="ch-qf-head__act" aria-hidden="true">
      <Skeleton width={166} height={36} radius={10} />
      <Skeleton width={127} height={36} radius={10} />
      <Skeleton width={138} height={36} radius={10} />
    </div>
  );
}
