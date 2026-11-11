'use client';

import { useClubhouseRole } from '../../shell/context';
import { CrhSkelCard } from '../../ui/CrhSkelCard';
import { Skeleton } from '../../ui/States';

/**
 * Home's phone hero in waiting, in the reader's own shape (the shell's role, as the Qualifiers skeleton's parts): the
 * coach's has the brief's lines above Up next, and the card's invitees and action; the player's has none, and its two keys under the card. So when the page
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
        {/* The coach's card (DayCard) goes on to who is invited and the card's action under them. */}
        {!player && (
          <>
            <span className="ch-hm-skel__bar ch-hm-skel__people" style={{ width: 200, height: 28 }} />
            <span className="ch-hm-skel__bar ch-hm-skel__act" style={{ width: '100%', height: 48 }} />
          </>
        )}
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

/** The lane's cards in waiting, in the reader's own page: a coach's three, a player's Your game with its four legs. */
export function SkeletonCrhCards() {
  const player = useClubhouseRole() === 'player';
  return (
    <div className="ch-hm-sk-crh__body">
      {player ? (
        <CrhSkelCard title="Your game" rows={4} />
      ) : (
        <>
          <CrhSkelCard title="Today" />
          {/* Team scoring in its own shape: the average, the line, then the three figures, so the card does not change form when it lands. */}
          <div className="ch-crh-skcard ch-hm-sk-form" aria-hidden="true">
            <b>Team scoring</b>
            <span className="ch-hm-sk-form__in">
            <span className="ch-hm-sk-form__top">
              <Skeleton width={96} height={34} radius={8} />
              <Skeleton width={84} height={13} />
            </span>
            <Skeleton width="100%" height={64} radius={8} />
            <span className="ch-hm-sk-form__figs">
              {[0, 1, 2].map((k) => (
                <Skeleton key={k} width={56} height={30} radius={8} />
              ))}
            </span>
            </span>
          </div>
          <CrhSkelCard title="The team’s game" rows={2} />
        </>
      )}
    </div>
  );
}
