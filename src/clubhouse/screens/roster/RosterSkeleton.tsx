'use client';

import { Skeleton } from '../../ui/States';
import { LargeTitle } from '../../ui/LargeTitle';
import { useClubhouseRole } from '../../shell/context';
import '../../styles/roster.css';

/**
 * Route loading for Roster: the page in its final slots, the coach's or the player's; on a phone, the list's rows (switched
 * in CSS, since this renders on the server). Join requests are drawn only when there are some, so the skeleton leaves them
 * out and they push the table down when they come.
 */
export function RosterSkeleton() {
  // Both desktop pages are the lane's (Roster.tsx, TeamRoster.tsx); a player's has no actions, leaders or panel.
  const role = useClubhouseRole();
  return (
    <main className="ch-rs ch-rsx ch-rsd" aria-busy="true" aria-label="Loading roster" data-ch-code="CH-3401" data-ch-crh="on">
      {role !== 'player' ? <RosterDeskSkeletonCrh /> : <TeamDeskSkeletonCrh />}
      {/* The phone page's own classes, so the eyebrow, the title, the sort and each row land where the loaded page puts them. */}
      <RosterPhoneSkeletonCrh />
    </main>
  );
}

/** The player's desktop page in waiting (TeamRoster): the head, the green season card across the page, the toolbar and the table. */
function TeamDeskSkeletonCrh() {
  return (
    <div className="ch-rs-skel-desk">
      <header className="ch-rs-head">
        <div>
          <Skeleton width={180} height={14} />
          <Skeleton width={150} height={40} radius={10} />
          <Skeleton width={200} height={15} />
        </div>
      </header>
      <div className="ch-rs-top" aria-hidden="true">
        <div className="ch-rs-tcard ch-rs-tcard--skel">
          <Skeleton width={150} height={14} />
          <Skeleton width="100%" height={10} />
          <Skeleton width={70} height={12} />
          <Skeleton width={320} height={12} />
        </div>
      </div>
      {/* The coaches' line: a team has a coach, so its slot is held. */}
      <div className="ch-rs-staff" aria-hidden="true">
        <Skeleton width={420} height={28} radius={14} />
      </div>
      <div className="ch-rs-bar">
        <Skeleton width={320} height={36} radius={10} />
        <Skeleton width={300} height={34} radius={12} />
      </div>
      <div className="ch-rs-list ch-rs-list--team" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="ch-rs-sk-row">
            <Skeleton width={40} height={40} radius={20} />
            <Skeleton width={130} height={15} />
            <Skeleton width={170} height={26} radius={13} />
            <Skeleton width={34} height={14} />
          </div>
        ))}
      </div>
    </div>
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
      {/* What is already known stays: the title is the real word, and the list is named. Only the figures wait. */}
      <div className="ch-rsm-head" aria-hidden="true">
        <LargeTitle as="p" hidden>Roster</LargeTitle>
        <Skeleton width={150} height={15} />
      </div>
      <div className="ch-rs-tcard ch-rs-tcard--skel" aria-hidden="true">
        <Skeleton width="44%" height={14} />
        <Skeleton width="30%" height={12} />
        <Skeleton width="100%" height={10} />
        <Skeleton width="70%" height={12} />
      </div>
      {/* The sort, at its loaded height, then the Active card under its title. */}
      <div className="ch-rsx-sort ch-rsx-sort--skel" aria-hidden="true">
        <Skeleton width="100%" height={44} radius={12} />
      </div>
      <div className="ch-rsx-sec is-tight">
        <div className="ch-surface ch-surface--card" aria-hidden="true">
          <div className="ch-surface__head">
            <h2 className="ch-surface__title">Active</h2>
          </div>
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
