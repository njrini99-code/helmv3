'use client';

import { useSearchParams } from 'next/navigation';
import { Skeleton } from '../../ui/States';
import '../../styles/settings.css';
import { LargeTitleSkeleton } from '../../ui/LargeTitle';
import { useClubhouseRole } from '../../shell/context';
import { parseSection, SECTIONS, type ChSettingsSection } from './model';

/** Each section's cards, as rows per card, so a section's skeleton holds about the room the section takes. */
const SHAPE: Record<ChSettingsSection, number[]> = {
  account: [4, 2, 2],
  notifications: [2, 4],
  team: [3, 3],
  golf: [4, 1],
  coachhelm: [3, 4],
  preferences: [5],
};

/**
 * The route's loading.tsx. `?section=` (or the route's own section: Notifications, a coach's CoachHelm) decides which
 * section the skeleton draws: marked on the desktop's rail with its cards, and on a phone pushed open, as Settings opens a
 * section the address names, instead of the list (GAP-S-17).
 */
export function SettingsRouteSkeleton({ section }: { section?: ChSettingsSection } = {}) {
  const role = useClubhouseRole() === 'player' ? 'player' : 'coach';
  const query = useSearchParams().get('section');
  const asked = section ?? query;
  const parsed = parseSection(asked, role);
  return <SettingsSkeleton role={role} section={parsed} opened={asked === parsed} />;
}

/**
 * Route skeleton: the header, the rail and the section's cards, in the page's own geometry. On a phone, the list's
 * title, identity row and rows, or the section the address opened (switched in CSS, since this renders on the server).
 */
export function SettingsSkeleton({ role = 'coach', section = 'account', opened = false }: { role?: 'coach' | 'player'; section?: ChSettingsSection; opened?: boolean } = {}) {
  const rail = SECTIONS[role];
  const cards = SHAPE[section];
  return (
    <main className="ch-set" data-canopy="" aria-busy="true" aria-label="Loading settings" data-ch-code="CH-8401" data-section={section}>
      <div className="ch-set-skel-desk">
        <header className="ch-set-head" data-canopy-head="tight">
          <Skeleton width={170} height={40} radius={10} />
          <Skeleton width={260} height={13} />
        </header>
        <div className="ch-set-layout">
          <div className="ch-set-rail ch-set-skel-rail" aria-hidden>
            {rail.map((s) => (
              <div key={s.id} className={'ch-set-rail__i' + (s.id === section ? ' is-on' : '')}>
                <Skeleton width={16} height={16} radius={5} />
                <span style={{ display: 'grid', gap: 6, flex: 1 }}>
                  <Skeleton width="60%" height={13} />
                  <Skeleton width="85%" height={10} />
                </span>
              </div>
            ))}
          </div>
          <div className="ch-set-stack" aria-hidden>
            {cards.map((rows, i) => (
              <div key={i} className="ch-surface">
                <div className="ch-surface__head">
                  <div style={{ display: 'grid', gap: 8 }}>
                    <Skeleton width={140} height={15} />
                    <Skeleton width={280} height={11} />
                  </div>
                </div>
                <div className="ch-surface__body ch-set-stackbody">
                  {Array.from({ length: rows }, (_, r) => (
                    <div key={r} className="ch-set-row">
                      <div className="ch-set-row__txt" style={{ display: 'grid', gap: 6 }}>
                        <Skeleton width={150} height={12} />
                        <Skeleton width={230} height={10} />
                      </div>
                      <Skeleton width={40} height={23} radius={999} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* The phone's list in the live page's own classes (SettingsPhone): the title under its double rule, who you are,
          and the sections on their seams, so nothing moves when the list arrives. */}
      <div className="ch-setm-skel" aria-hidden data-opened={opened ? '' : undefined}>
        {opened ? (
          // The section the address opened, pushed as Settings pushes it: its title, then its groups' rows.
          <div className="ch-setm-page">
            <LargeTitleSkeleton width={150} className="ch-setm-title" />
            {cards.map((rows, g) => (
              <div key={g} className="ch-setm-group">
                <div className="ch-setm-card">
                  {Array.from({ length: rows }, (_, i) => (
                    <div key={i} className="ch-setm-row" style={{ cursor: 'default' }}>
                      <span className="ch-setm-row__l">
                        <Skeleton width={130} height={14} />
                      </span>
                      <Skeleton width={60} height={12} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="ch-setm-page">
          <LargeTitleSkeleton width={150} className="ch-setm-title" />
          <div className="ch-setm-id" style={{ cursor: 'default' }}>
            <Skeleton width={56} height={56} radius={28} />
            <span className="ch-setm-id__b">
              <Skeleton width={140} height={16} />
              <Skeleton width={190} height={12} />
            </span>
          </div>
          <div className="ch-setm-group">
            <div className="ch-setm-card">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="ch-setm-row has-tile" style={{ cursor: 'default' }}>
                  <Skeleton width={30} height={30} radius={8} />
                  <span className="ch-setm-row__l">
                    <Skeleton width={110} height={14} />
                  </span>
                  <Skeleton width={70} height={12} />
                </div>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>
    </main>
  );
}
