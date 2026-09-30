'use client';

import { AnimatePresence, m } from 'framer-motion';
import { Bell, ChevronRight, Flag, SlidersVertical, Sparkle, UserRound, Users, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../../ui/Icon';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { CH_ROUTE } from '../../../lib/motion';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { initials } from '../../../lib/format';
import { chTrail } from '../../../lib/track';
import { PhoneTop, useBackFromMore, usePhoneStackHistory } from '../../../shell/phone-chrome';
import { SECTIONS, type ChDevice, type ChSettingsData, type ChSettingsSection, type ChSettingsWrites } from '../model';
import { useReportProblem, useSignOut } from '../hooks';
import { AccountPhone, EmailSheet, PasswordSheet, ProfileSheet } from './AccountPhone';
import { CoachHelmPhone } from './CoachHelmPhone';
import { GolfPhone } from './GolfPhone';
import { NotificationsPhone } from './NotificationsPhone';
import { PreferencesPhone } from './PreferencesPhone';
import { TeamPhone } from './TeamPhone';
import { ActionRow, Group, LinkRow, NavRow } from './ui';

const ICON: Record<ChSettingsSection, LucideIcon> = {
  account: UserRound,
  notifications: Bell,
  team: Users,
  golf: Flag,
  coachhelm: Sparkle,
  preferences: SlidersVertical,
};

/** What each row on the list says about its section (the design's short summaries). */
const SUMMARY: Record<'coach' | 'player', Partial<Record<ChSettingsSection, string>>> = {
  coach: { account: 'Profile, email', notifications: 'Email, Push', team: 'Scoring, invites', coachhelm: 'Priorities, alerts', preferences: 'Motion, haptics' },
  player: { account: 'Profile, email', golf: 'Handicap, team', notifications: 'Push, CoachHelm', preferences: 'Motion, haptics' },
};

/**
 * A section named in the URL (`?section=`) opens pushed, and so does the one an old address names
 * (`/settings/notifications`, `/settings/coaching-intelligence`: the route passes it as `initialSection`, with no query).
 * The bare page opens on the list.
 */
function sectionFromUrl(sections: ReadonlyArray<{ id: ChSettingsSection }>, initialSection: ChSettingsSection): ChSettingsSection | null {
  if (typeof window === 'undefined') return null;
  const wanted = new URLSearchParams(window.location.search).get('section') ?? (/^\/golf\/dashboard\/settings\/[^/]+/.test(window.location.pathname) ? initialSection : null);
  return sections.find((s) => s.id === wanted)?.id ?? null;
}

/**
 * The phone Settings (owner design, docs/clubhouse/phone/settings.md): a grouped list that pushes to each section, like
 * iOS Settings in Clubhouse styling. A section is a history entry (the edge swipe and Back pop it, CH-1906) and the tab
 * bar stays. Edit cards are sheets, choices are bottom sheets, and destructive choices are action sheets. It reads and
 * writes through the same data, writes and catalog as the desktop page.
 */
export function SettingsPhone({
  data,
  writes,
  device,
  initialSection,
  onDeleted,
}: {
  data: ChSettingsData;
  writes: ChSettingsWrites;
  device: ChDevice;
  initialSection: ChSettingsSection;
  onDeleted: () => void;
}) {
  const backFromMore = useBackFromMore();
  const reduced = useChReducedMotion();
  const sections = SECTIONS[data.role];
  const [section, setSection] = useState<ChSettingsSection | null>(() => sectionFromUrl(sections, initialSection));
  const [profileOpen, setProfileOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const current = sections.find((s) => s.id === section);

  // A section is a history entry, so the iOS edge swipe and the browser's back pop it (CH-1906).
  const popTo = useCallback((level: number) => {
    if (level < 1) setSection(null);
  }, []);
  usePhoneStackHistory(section ? 1 : 0, popTo);

  const open = (id: ChSettingsSection) => {
    chTrail(`settings section ${id}`);
    setSection(id);
    document.getElementById('ch-canvas')?.scrollTo({ top: 0 });
  };
  // A screen that is pushed or popped starts VoiceOver on its title.
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    document.getElementById('ch-setm-title')?.focus({ preventScroll: true });
  }, [section]);

  const profile = data.profile.error ? null : data.profile.value;

  return (
    <main className="ch-setm" aria-label="Settings">
      <PhoneTop
        back={section ? { label: 'Settings', onBack: () => setSection(null) } : { label: 'More', onBack: backFromMore }}
        // The design draws the large title in the page and nothing in the bar; the bar's is the screen's heading for VoiceOver.
        title={<span className="ch-sr-only">{current?.label ?? 'Settings'}</span>}
        titleId="ch-setm-title"
      />
      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={section ?? 'root'}
          className="ch-setm-page"
          initial={reduced ? { opacity: 0 } : CH_ROUTE.initial}
          animate={reduced ? { opacity: 1 } : CH_ROUTE.animate}
          exit={reduced ? { opacity: 0 } : CH_ROUTE.exit}
          transition={CH_ROUTE.transition}
        >
          <p className="ch-setm-title" aria-hidden="true">
            {current?.label ?? 'Settings'}
          </p>
          {section == null ? (
            <Root data={data} writes={writes} onOpen={open} onProfile={() => setProfileOpen(true)} />
          ) : (
            <SectionBoundary surface={`settings.${section}`} label={current?.label ?? 'Settings'} code="CH-8212">
              {section === 'account' && (
                <AccountPhone
                  data={data}
                  writes={writes}
                  sentTo={sentTo}
                  onProfile={() => setProfileOpen(true)}
                  onEmail={() => setEmailOpen(true)}
                  onPassword={() => setPasswordOpen(true)}
                  onDeleted={onDeleted}
                />
              )}
              {section === 'notifications' && <NotificationsPhone data={data} writes={writes} device={device} />}
              {section === 'team' && <TeamPhone data={data} writes={writes} />}
              {section === 'golf' && <GolfPhone data={data} writes={writes} />}
              {section === 'coachhelm' && <CoachHelmPhone data={data} writes={writes} />}
              {section === 'preferences' && <PreferencesPhone device={device} />}
            </SectionBoundary>
          )}
        </m.div>
      </AnimatePresence>

      {/* Hosted here, because the identity row opens Profile from the list, and Change email opens over it. */}
      {profile && <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} data={data} profile={profile} writes={writes} onChangeEmail={() => setEmailOpen(true)} />}
      <EmailSheet open={emailOpen} onClose={() => setEmailOpen(false)} email={data.email} writes={writes} onSent={setSentTo} />
      <PasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} hasEmail={!!data.email} writes={writes} />
    </main>
  );
}

/** The list: who you are, the sections, help and legal, and Sign out. */
function Root({ data, writes, onOpen, onProfile }: { data: ChSettingsData; writes: ChSettingsWrites; onOpen: (id: ChSettingsSection) => void; onProfile: () => void }) {
  const { report, opening } = useReportProblem();
  const { signOut, signingOut } = useSignOut(writes);
  const coach = data.role === 'coach';
  const profile = data.profile.error ? null : data.profile.value;
  const name = profile?.fullName || data.email || 'Your profile';
  const head = data.coachhelm && !data.coachhelm.error ? !!data.coachhelm.value.team?.isHeadCoach : false;
  const hcp = data.golf && !data.golf.error ? data.golf.value.handicap.trim() : '';
  const line = coach
    ? [head ? 'Head coach' : 'Coach', data.teamName].filter(Boolean).join(' · ')
    : ['Player', data.teamName, hcp ? `HCP ${hcp}` : null].filter(Boolean).join(' · ');
  return (
    <>
      {/* A profile that didn't load opens Account, where the notice and Try again are. */}
      <button type="button" className="ch-setm-id" onClick={profile ? onProfile : () => onOpen('account')}>
        <span className={'ch-setm-coin' + (coach ? '' : ' is-player')} aria-hidden="true">
          {profile?.avatarUrl ? (
            // A user-uploaded storage URL, shown as a plain image.
            <img src={profile.avatarUrl} alt="" width={56} height={56} />
          ) : (
            initials(name)
          )}
        </span>
        <span className="ch-setm-id__b">
          <b>{name}</b> <span>{line}</span>
        </span>
        <Icon icon={ChevronRight} size={18} className="ch-setm-chev" />
      </button>

      <nav className="ch-setm-group" aria-label="Settings sections">
        <div className="ch-setm-card">
          {SECTIONS[data.role].map((s) => (
            <NavRow key={s.id} label={s.label} value={SUMMARY[data.role][s.id]} icon={ICON[s.id]} dark={s.id === 'coachhelm'} onClick={() => onOpen(s.id)} />
          ))}
        </div>
      </nav>

      <Group>
        <ActionRow label="Report a problem" disabled={opening} onClick={() => void report()} />
        <LinkRow label="Privacy policy" href="/privacy" />
        <LinkRow label="Terms of service" href="/terms" />
      </Group>

      <button type="button" className="ch-setm-signout is-danger" disabled={signingOut} onClick={() => void signOut()}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </>
  );
}
