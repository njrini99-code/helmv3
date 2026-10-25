'use client';

import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { Bell, ChevronRight, Flag, SlidersVertical, Sparkle, UserRound, Users, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Icon } from '../../../ui/Icon';
import { InlineNotice } from '../../../ui/Notices';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { chTween } from '../../../lib/motion';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { initials } from '../../../lib/format';
import { chTrail } from '../../../lib/track';
import { PhoneTop, usePhoneStackHistory } from '../../../shell/phone-chrome';
import { SECTIONS, type ChDevice, type ChSettingsData, type ChSettingsSection, type ChSettingsWrites } from '../model';
import { useAppVersion, useReportProblem, useSignOut } from '../hooks';
import { AccountPhone, EmailSheet, PasswordSheet, ProfileSheet } from './AccountPhone';
import { CoachHelmPhone } from './CoachHelmPhone';
import { GolfPhone } from './GolfPhone';
import { NotificationsPhone } from './NotificationsPhone';
import { PreferencesPhone } from './PreferencesPhone';
import { TeamPhone } from './TeamPhone';
import { HeldSheetsContext, type ChHeldSheet } from './sheets';
import { ActionRow, Group, InfoRow, LinkRow, NavRow } from './ui';
import { canvasScrollNow } from '../../../lib/smooth-scroll';
import { poppedByUA } from '../../../lib/ua-pop';
import { LargeTitle } from '../../../ui/LargeTitle';

const ICON: Record<ChSettingsSection, LucideIcon> = {
  account: UserRound,
  notifications: Bell,
  team: Users,
  golf: Flag,
  coachhelm: Sparkle,
  preferences: SlidersVertical,
};

/**
 * The push (CH-8609), by which way the stack moved: a section arrives from the right edge and the list fades under it; on
 * Back the section leaves the same way and the list fades back in. `0` swaps at once (reduced motion, Animations off, or
 * a pop the native back-swipe already animated).
 */
// Transform strings rather than framer's x, so the slide runs on the compositor and a section's first render can't
// stall it (motion audit 2026-10-12).
const AT = 'translateX(0%)';
const OFF = 'translateX(100%)';
const PUSH = {
  enter: (d: 1 | -1 | 0) => (d === 1 ? { transform: OFF, opacity: 1 } : d === -1 ? { transform: AT, opacity: 0 } : { transform: AT, opacity: 1 }),
  shown: { transform: AT, opacity: 1 },
  leave: (d: 1 | -1 | 0) => (d === 1 ? { transform: AT, opacity: 0 } : d === -1 ? { transform: OFF, opacity: 1 } : { transform: AT, opacity: 0, transition: { duration: 0 } }),
};

/**
 * One page of the stack (the list, or a section) in its CH-8609 move. While it leaves it is hidden from assistive tech
 * and out of the focus order, as `Swap`'s leaving copy is, so only the page arriving is read. The ref reaches the
 * element for AnimatePresence's popLayout, which lifts the leaving page out of flow.
 */
function PushPage({ ref, sub, way, reduced, children }: { ref?: Ref<HTMLDivElement>; sub: boolean; way: 1 | -1 | 0; reduced: boolean; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <m.div
      ref={ref}
      className={'ch-setm-page' + (sub ? ' is-sub' : ' is-root')}
      custom={way}
      variants={PUSH}
      initial="enter"
      animate="shown"
      exit="leave"
      transition={chTween('base', reduced)}
      aria-hidden={present ? undefined : true}
      inert={!present}
    >
      {children}
    </m.div>
  );
}

/** What each row on the list says about its section (the design's short summaries). */
const SUMMARY: Record<'coach' | 'player', Partial<Record<ChSettingsSection, string>>> = {
  coach: { account: 'Profile, email', notifications: 'Email, push', team: 'Scoring, invites', coachhelm: 'Priorities, alerts', preferences: 'Motion, units' },
  player: { account: 'Profile, email', golf: 'Handicap, team', notifications: 'Push, CoachHelm', preferences: 'Motion, units' },
};

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
  opened,
  onDeleted,
}: {
  data: ChSettingsData;
  writes: ChSettingsWrites;
  device: ChDevice;
  initialSection: ChSettingsSection;
  /**
   * The address named a section (`?section=`, or an old `/settings/notifications` style path), so it opens pushed;
   * the bare page opens on the list. Decided on the server so the first client render matches the HTML.
   */
  opened: boolean;
  onDeleted: () => void;
}) {
  const reduced = useChReducedMotion();
  const sections = SECTIONS[data.role];
  const [section, setSection] = useState<ChSettingsSection | null>(() => (opened && sections.some((x) => x.id === initialSection) ? initialSection : null));
  // A new ?section= on the same page re-renders without remounting: the pushed section follows the address. Every
  // ?section= link opened Account once Settings had been open (Simulator, 2026-10-14).
  const [seenAddress, setSeenAddress] = useState({ initialSection, opened });
  if (seenAddress.initialSection !== initialSection || seenAddress.opened !== opened) {
    setSeenAddress({ initialSection, opened });
    setSection(opened && sections.some((x) => x.id === initialSection) ? initialSection : null);
  }
  const [profileOpen, setProfileOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const current = sections.find((s) => s.id === section);

  // Which way the last move went, for CH-8609: 1 a push, -1 Back, 0 no slide (a pop the native back-swipe already
  // drew). Safari 18+ marks a popstate whose back gesture it animated itself; sliding the section off again would show
  // it come back and leave a second time (the shell's CH-1908, lib/ua-pop.ts, read before the stack pops).
  const [dir, setDir] = useState<1 | -1 | 0>(1);

  // CH-8509: a Back (the iOS edge swipe, the browser's back) that would pop the section while an edit sheet holds
  // unsaved edits or a save in flight is answered by that sheet instead, with the same discard question its Cancel asks.
  // The sheets are not history entries, so the Back has already moved to the list's entry: the section's is put back
  // first, and the stack (usePhoneStackHistory) never sees the pop, so its count still matches the history. Registered
  // before that hook, in the capture phase, so it runs first.
  const heldSheets = useRef<ChHeldSheet[]>([]);
  const registerSheet = useCallback((sheet: ChHeldSheet) => {
    heldSheets.current = [...heldSheets.current, sheet];
    return () => {
      heldSheets.current = heldSheets.current.filter((x) => x !== sheet);
    };
  }, []);
  const sectionOpen = useRef(section != null);
  useEffect(() => {
    sectionOpen.current = section != null;
  }, [section]);
  // Profile, Email and Password also open over the list itself (the identity row). There a Back would leave Settings
  // before anything could ask, so a sheet over the list is a history entry of its own, like a section (owner,
  // 2026-10-17: "fix it"): Back closes it, or asks first when it holds edits.
  const sheetOverList = section == null && (profileOpen || emailOpen || passwordOpen);
  const overList = useRef(sheetOverList);
  useEffect(() => {
    overList.current = sheetOverList;
  }, [sheetOverList]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (!sectionOpen.current && !overList.current) return;
      const state = window.history.state as { chPhone?: unknown } | null;
      if (typeof state?.chPhone === 'number' && state.chPhone >= 1) return;
      const top = [...heldSheets.current].reverse().find((x) => x.held());
      if (!top) return;
      e.stopImmediatePropagation();
      window.history.pushState({ chPhone: 1 }, '');
      chTrail('settings back held by an edit sheet');
      top.requestClose();
    };
    window.addEventListener('popstate', onPop, true);
    return () => window.removeEventListener('popstate', onPop, true);
  }, []);

  // A section is a history entry, so the iOS edge swipe and the browser's back pop it (CH-1906); so is a sheet over
  // the list, which the same Back closes.
  const popTo = useCallback((level: number) => {
    if (level >= 1) return;
    if (!sectionOpen.current) {
      setProfileOpen(false);
      setEmailOpen(false);
      setPasswordOpen(false);
      return;
    }
    setDir(poppedByUA() ? 0 : -1);
    setSection(null);
  }, []);
  usePhoneStackHistory(section || sheetOverList ? 1 : 0, popTo);

  const open = (id: ChSettingsSection) => {
    chTrail(`settings section ${id}`);
    setDir(1);
    setSection(id);
    canvasScrollNow(0);
  };
  const back = () => {
    setDir(-1);
    setSection(null);
  };
  const way = reduced ? 0 : dir;
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
    <HeldSheetsContext.Provider value={registerSheet}>
      <main className="ch-setm" aria-label="Settings">
        <PhoneTop
          back={section ? { label: 'Settings', onBack: back } : null}
          start={!section}
          // The design draws the large title in the page and nothing in the bar; the bar's is the screen's heading for VoiceOver.
          title={current?.label ?? 'Settings'}
          titleId="ch-setm-title"
        />
        {/* CH-8609: a section pushes in from the right over the list, which fades under it, and Back slides it off the
            same way; base duration, instant with reduced motion or Animations off. */}
        <AnimatePresence mode="popLayout" initial={false} custom={way}>
          <PushPage key={section ?? 'root'} sub={!!section} way={way} reduced={reduced}>
            <LargeTitle as="p" hidden className="ch-setm-title">
              {current?.label ?? 'Settings'}
            </LargeTitle>
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
          </PushPage>
        </AnimatePresence>

        {/* Hosted here, because the identity row opens Profile from the list, and Change email opens over it. */}
        {profile && <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} data={data} profile={profile} writes={writes} onChangeEmail={() => setEmailOpen(true)} />}
        <EmailSheet open={emailOpen} onClose={() => setEmailOpen(false)} email={data.email} writes={writes} onSent={setSentTo} />
        <PasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} hasEmail={!!data.email} writes={writes} />
      </main>
    </HeldSheetsContext.Provider>
  );
}

/** CH-8214: every read Settings made failed, so the list would stand silent over sections that each hold only a notice. */
export function everyReadFailed(data: ChSettingsData): boolean {
  const reads = [data.profile, data.delivery, data.playerRouting, data.digest, data.scoring, data.reminders, data.team, data.joinCode, data.golf, data.membership, data.coachhelm];
  return reads.every((r) => !r || r.error);
}

/** The list: who you are, the sections, help and legal, and Sign out. */
function Root({ data, writes, onOpen, onProfile }: { data: ChSettingsData; writes: ChSettingsWrites; onOpen: (id: ChSettingsSection) => void; onProfile: () => void }) {
  const { report, opening } = useReportProblem();
  const { signOut, signingOut } = useSignOut(writes);
  const version = useAppVersion();
  const coach = data.role === 'coach';
  const profile = data.profile.error ? null : data.profile.value;
  const name = profile?.fullName || data.email || 'Your profile';
  // A photo that doesn't load falls back to the initials.
  const [broken, setBroken] = useState<string | null>(null);
  const photo = profile?.avatarUrl && profile.avatarUrl !== broken ? profile.avatarUrl : null;
  const head = data.coachhelm && !data.coachhelm.error ? !!data.coachhelm.value.team?.isHeadCoach : false;
  // The handicap the roster shows (data/season.ts displayHandicap): the index when set, else the handicap.
  const hcp = data.golf && !data.golf.error ? data.golf.value.handicapIndex.trim() || data.golf.value.handicap.trim() : '';
  const line = coach
    ? [head ? 'Head coach' : 'Coach', data.teamName].filter(Boolean).join(' · ')
    : ['Player', data.teamName, hcp ? `HCP ${hcp}` : null].filter(Boolean).join(' · ');
  return (
    <>
      {everyReadFailed(data) && <InlineNotice code="CH-8214" title="Settings didn’t load" body="Nothing was changed. Try again." onRetry={writes.refresh} />}
      {/* A profile that didn't load opens Account, where the notice and Try again are. */}
      <button type="button" className="ch-setm-id" onClick={profile ? onProfile : () => onOpen('account')}>
        <span className={'ch-setm-coin' + (coach ? '' : ' is-player')} aria-hidden="true">
          {photo ? (
            // A user-uploaded storage URL, shown as a plain image.
            <img src={photo} alt="" width={56} height={56} onError={() => setBroken(photo)} />
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

      <Group title="Help and legal">
        <ActionRow label="Report a problem" disabled={opening} onClick={() => void report()} />
        <LinkRow label="Privacy policy" href="/privacy" />
        <LinkRow label="Terms of service" href="/terms" />
        {/* About: which GolfHelm this is, for a problem report or support. */}
        <InfoRow label="Version" value={<span className="ch-num">{version}</span>} />
      </Group>

      <div className="ch-setm-group is-end">
        <button type="button" className="ch-setm-signout" disabled={signingOut} onClick={() => void signOut()}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </>
  );
}
