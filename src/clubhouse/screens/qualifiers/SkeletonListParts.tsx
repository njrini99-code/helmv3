'use client';

import { useClubhouseRole } from '../../shell/context';
import { Skeleton } from '../../ui/States';
import { listLede } from './model';

// The list skeleton's parts that depend on who reads it (the shell's role, as SkeletonCoachActions). Without a role (a
// test, the preview's coach) they draw the coach's list.

/** Create qualifier's place: a coach's head has it. A player's has none, so on the phone nothing is held for it. */
export function SkeletonListAction() {
  const player = useClubhouseRole() === 'player';
  const bar = <Skeleton width={160} height={38} radius={10} />;
  // The desktop head keeps its shape for everyone, as before; only the phone drops a player's.
  return player ? <span className="ch-qf-skel-desk">{bar}</span> : bar;
}

/** The phone lede: the reader's own sentence drawn as a bar under each of its lines, so it wraps where the page's does at any width. */
export function SkeletonLede({ mode }: { mode: 'all' | 'mine' }) {
  const coach = useClubhouseRole() !== 'player';
  return (
    <p className="ch-qf-skel-lede" aria-hidden="true">
      <span className="ch-skel">{listLede(coach, mode)}</span>
    </p>
  );
}

/** A player's own standing under a qualifier (the list's Mine line), at its loaded line's height; a coach has none. */
export function SkeletonMine() {
  if (useClubhouseRole() !== 'player') return null;
  return (
    <span className="ch-qf-held ch-qf-mine" style={{ height: 16.9 }} aria-hidden="true">
      <Skeleton width={150} height={11} />
    </span>
  );
}
