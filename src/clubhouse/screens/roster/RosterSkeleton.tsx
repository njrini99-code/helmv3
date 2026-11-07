'use client';

import { SkelLine, Skeleton } from '../../ui/States';
import { useClubhouseRole } from '../../shell/context';
import '../../styles/roster.css';
import { LargeTitleSkeleton } from '../../ui/LargeTitle';

/**
 * Route loading for Roster: header with its two actions, where the team sits, the toolbar and six face cards in their
 * final slots; on a phone, the list's rows (switched in CSS, since this renders on the server). Join requests and Needs a
 * look are drawn only when there are some, so the skeleton leaves them out and they push the grid down when they come.
 */
export function RosterSkeleton() {
  // The coach's desktop page in the lane is its own shape (Roster.tsx); a player's keeps the face cards.
  const role = useClubhouseRole();
  const coachCrh = role !== 'player';
  return (
    <main className={'ch-rs' + ' ch-rsx' + (coachCrh ? ' ch-rsd' : '')} data-canopy={coachCrh ? undefined : ''} aria-busy="true" aria-label="Loading roster" data-ch-code="CH-3401" data-ch-crh="on">
      {coachCrh ? <RosterDeskSkeletonCrh /> : <div className="ch-rs-skel-desk">
        <header className="ch-rs-head" data-canopy-head="tight" data-canopy-tight-always="">
          <div>
            <Skeleton width={180} height={30} radius={15} />
            <Skeleton width={280} height={40} radius={10} />
            <Skeleton width={340} height={15} />
          </div>
          {/* Export and Invite players, at their loaded widths. */}
          <div className="ch-rs-head__act">
            <Skeleton width={92} height={36} radius={10} />
            <Skeleton width={130} height={36} radius={10} />
          </div>
        </header>
        {/* Where the team sits (RosterSpread) in its own frame: the heading's two lines and a one-lane plot with its axis. */}
        <section className="ch-rs-sp" aria-hidden="true">
          <div className="ch-rs-sp__h">
            <SkelLine line={22.8} bar={17} width={190} />
            <SkelLine line={19.6} bar={12} width={460} />
          </div>
          <div className="ch-rs-sp__plot" style={{ display: 'flex', alignItems: 'flex-end', height: 104 }}>
            <Skeleton width="100%" height={12} />
          </div>
        </section>
        <div className="ch-rs-bar">
          <Skeleton width={320} height={36} radius={10} />
          <Skeleton width={360} height={34} radius={12} />
        </div>
        <div className="ch-rs-faces">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="ch-rs-face" style={{ cursor: 'default' }}>
              <Skeleton width={76} height={76} radius={38} />
              <Skeleton width={120} height={16} />
              <Skeleton width={140} height={12} />
              <Skeleton width={150} height={30} radius={8} />
              <Skeleton width="100%" height={48} radius={10} />
            </div>
          ))}
        </div>
      </div>}
      {/* The phone page's own classes, so the eyebrow, the title, the sort and each row land where the loaded page puts them. */}
      <RosterPhoneSkeletonCrh />
    </main>
  );
}

/** The lane's desktop page in waiting: the head, the green team card and three leaders, the toolbar, the table beside the player. */
function RosterDeskSkeletonCrh() {
  return (
    <div className="ch-rs-skel-desk">
      <header className="ch-rs-head">
        <div>
          <Skeleton width={180} height={14} />
          <Skeleton width={150} height={40} radius={10} />
          <Skeleton width={340} height={15} />
        </div>
        <div className="ch-rs-head__act">
          <Skeleton width={92} height={36} radius={10} />
          <Skeleton width={130} height={36} radius={10} />
        </div>
      </header>
      <div className="ch-rs-top" aria-hidden="true">
        <div className="ch-rs-tcard ch-rs-tcard--skel">
          <Skeleton width="44%" height={14} />
          <Skeleton width="30%" height={12} />
          <Skeleton width="100%" height={10} />
          <Skeleton width="70%" height={12} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="ch-rs-ldr" style={{ width: 'auto', cursor: 'default' }}>
            <Skeleton width={90} height={13} />
            <Skeleton width={72} height={30} radius={8} />
            <Skeleton width={130} height={16} />
            <Skeleton width={52} height={20} />
          </div>
        ))}
      </div>
      <div className="ch-rs-bar">
        <Skeleton width={320} height={36} radius={10} />
        <Skeleton width={360} height={34} radius={12} />
      </div>
      <div className="ch-rs-body has-peek" aria-hidden="true">
        <div className="ch-rs-list">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="ch-rs-sk-row">
              <Skeleton width={40} height={40} radius={20} />
              <span className="ch-rs-sk-row__b">
                <Skeleton width={130} height={15} />
                <Skeleton width={110} height={12} />
              </span>
              <Skeleton width={84} height={20} />
              <Skeleton width={120} height={14} />
            </div>
          ))}
        </div>
        <div className="ch-rs-peek ch-rs-sk-peek">
          <Skeleton width={84} height={84} radius={42} />
          <Skeleton width={170} height={20} />
          <Skeleton width={150} height={26} radius={13} />
          <Skeleton width="100%" height={72} radius={12} />
        </div>
      </div>
    </div>
  );
}

/** Behind the lane's flag (06 7.8): a green block with ivory bars for the team card, then the Active card's rows. No spinner, no sweep. */
function RosterPhoneSkeletonCrh() {
  return (
    <div className="ch-rsm-skel ch-rsm-page">
      <div className="ch-rsm-head">
        <LargeTitleSkeleton width={128} />
        <Skeleton width={150} height={15} />
      </div>
      <div className="ch-rs-tcard ch-rs-tcard--skel" aria-hidden="true">
        <Skeleton width="44%" height={14} />
        <Skeleton width="30%" height={12} />
        <Skeleton width="100%" height={10} />
        <Skeleton width="70%" height={12} />
      </div>
      <div className="ch-rsx-sec">
        <div className="ch-surface ch-surface--card" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="ch-group__row" data-two-line="">
              <Skeleton width={32} height={32} radius={16} />
              <span className="ch-rsx-row__b">
                <Skeleton width={`${52 - i * 5}%`} height={13} />
                <Skeleton width={`${70 - i * 7}%`} height={11} />
              </span>
              <Skeleton width={34} height={16} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
