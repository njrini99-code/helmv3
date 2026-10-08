'use client';

import { useClubhouseRole } from '../../shell/context';
import { Skeleton } from '../../ui/States';

/**
 * Home's phone hero in waiting, in the reader's own shape (the shell's role, as the Qualifiers skeleton's parts): the
 * coach's has the brief's lines above Up next; the player's has none, and its two keys under the card. So when the page
 * lands, Up next and the keys are where their bars were. Without a role (a test, a coach) it draws the coach's.
 */
export function SkeletonPhoneHero() {
  const player = useClubhouseRole() === 'player';
  return (
    <div className={'ch-hm-skel__hero' + (player ? ' is-player' : '')}>
      <span className="ch-hm-skel__date">
        <Skeleton width={150} height={11} />
      </span>
      <span className="ch-hm-skel__h1">
        <Skeleton width={240} height={28} radius={8} />
      </span>
      {!player && (
        <>
          <span className="ch-hm-skel__line">
            <Skeleton width="90%" height={14} />
          </span>
          <span className="ch-hm-skel__line">
            <Skeleton width="84%" height={14} />
          </span>
          <span className="ch-hm-skel__line">
            <Skeleton width="52%" height={14} />
          </span>
        </>
      )}
      <span className="ch-hm-skel__card">
        <span className="ch-hm-skel__bar" style={{ width: 120, height: 12 }} />
        <span className="ch-hm-skel__bar" style={{ width: 210, height: 23 }} />
        <span className="ch-hm-skel__bar" style={{ width: 170, height: 14 }} />
      </span>
      {player && (
        <span className="ch-hm-skel__keys">
          <Skeleton width="100%" height={44} radius={12} />
          <Skeleton width="100%" height={44} radius={12} />
        </span>
      )}
    </div>
  );
}
