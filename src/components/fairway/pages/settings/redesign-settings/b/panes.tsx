'use client';

/**
 * TEMP redesign direction B (removed before ship) · what each section holds.
 *
 * Every control is an existing, tested panel from FairwaySettingsGeneral (or
 * JoinTeamSection / CoachHelmToggle / ReportProblemButton), mounted as-is so
 * each keeps its own save model (explicit Save, instant autosave, device-local
 * storage). This file only decides which panels share a section and adds the
 * few lines of context the old page lacked: who a Team change reaches, and
 * value-forward link rows for the two settings that live on other routes.
 */

import Link from 'next/link';
import {
  AppearancePanel,
  DistanceUnitsPanel,
  EmailPanel,
  EventRemindersPanel,
  GolfScoringPanel,
  HapticsPanel,
  InviteSettingsPanel,
  NotificationsPanel,
  PasswordPanel,
  PersonalInfoPanel,
  PlayerGolfDetailsPanel,
  TeamSettingsPanel,
} from '@/components/fairway/pages/settings/FairwaySettingsGeneral';
import type { SettingsProfile } from '@/components/fairway/pages/settings/use-settings-profile';
import { JoinTeamSection } from '@/components/golf/settings/JoinTeamSection';
import { CoachHelmToggle } from '@/components/golf/coachhelm/v2';
import { ReportProblemButton } from '@/components/fairway';
import {
  SettingsGroup,
  SettingsLinkRow,
  SettingsRow,
} from '@/components/fairway/settings/settings-list';
import { AccountExit } from './account-exit';
import type { SectionId } from './sections';
import type { CoachHelmStatus, Loadable } from './use-section-status';
import { alertCountLabel, sensitivityLabel } from './status-lines';

export interface SectionPaneProps {
  id: SectionId;
  profile: SettingsProfile;
  loadProfile: () => void;
  coachHelm: Loadable<CoachHelmStatus>;
  onCoachHelmToggle: (enabled: boolean) => void;
}

/** Header for a block that is not a SectionCard, in the same type roles. */
function BlockHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="px-1">
      <h2 className="font-fw-sans text-body-sm font-semibold text-text-primary">{title}</h2>
      {description ? (
        <p className="mt-1 font-fw-sans text-caption text-text-secondary">{description}</p>
      ) : null}
    </div>
  );
}

function TeamPane({ profile, loadProfile }: { profile: SettingsProfile; loadProfile: () => void }) {
  if (!profile.teamId) return null;
  return (
    <>
      {/* Every panel below writes team-wide rows, which the old page never
          said. One line of scope before the first control. */}
      <p className="px-1 font-fw-sans text-caption text-text-secondary">
        Changes here apply to everyone on{' '}
        <span className="font-medium text-text-primary">{profile.teamName || 'your team'}</span>.
      </p>
      <GolfScoringPanel teamId={profile.teamId} />
      <EventRemindersPanel teamId={profile.teamId} />
      <TeamSettingsPanel onUpdate={loadProfile} />
      <InviteSettingsPanel />
    </>
  );
}

function CoachHelmPane({
  coachId,
  coachHelm,
  onToggle,
}: {
  coachId: string;
  coachHelm: Loadable<CoachHelmStatus>;
  onToggle: (enabled: boolean) => void;
}) {
  // The value column of the link row: the sensitivity and alert count the
  // Coaching Intelligence route will open on. Nothing while unknown.
  let value: string | undefined;
  if (coachHelm.kind === 'ready') {
    const parts = [
      coachHelm.value.alerts.kind === 'row'
        ? sensitivityLabel(coachHelm.value.alerts.sensitivity)
        : null,
      alertCountLabel(coachHelm.value),
    ].filter((part): part is string => Boolean(part));
    const joined = parts.join(' · ');
    value = joined ? joined.charAt(0).toUpperCase() + joined.slice(1) : undefined;
  }

  return (
    <>
      {/* No SectionCard here: CoachHelmToggle draws its own card, and wrapping
          it made the old page's card-in-card. */}
      <section className="flex flex-col gap-2.5">
        <BlockHeading
          title="CoachHelm on your dashboards"
          description="Your own view only. The team-wide switch is in Coaching Intelligence."
        />
        <CoachHelmToggle coachId={coachId} onToggle={onToggle} />
      </section>

      <SettingsGroup>
        <SettingsLinkRow
          as={Link}
          href="/golf/dashboard/settings/coaching-intelligence"
          label="Coaching Intelligence"
          description="Sensitivity, alerts, priorities and thresholds"
          value={value}
          numericValue
        />
      </SettingsGroup>
    </>
  );
}

function NotificationsPane({ profile }: { profile: SettingsProfile }) {
  return (
    <>
      <NotificationsPanel coachId={profile.role === 'coach' ? profile.coachId : undefined} />
      {profile.role === 'player' ? (
        <SettingsGroup>
          <SettingsLinkRow
            as={Link}
            href="/golf/dashboard/settings/notifications"
            label="Rounds, goals and insights"
            description="Push, email and in-app, per category"
          />
        </SettingsGroup>
      ) : null}
    </>
  );
}

function AccountPane({ profile, loadProfile }: { profile: SettingsProfile; loadProfile: () => void }) {
  return (
    <>
      <PersonalInfoPanel profile={profile} onUpdate={loadProfile} />
      <EmailPanel currentEmail={profile.email} />
      <PasswordPanel />
      <AccountExit email={profile.email} />
    </>
  );
}

function GolfPane({ profile, loadProfile }: { profile: SettingsProfile; loadProfile: () => void }) {
  if (!profile.playerId) return null;
  return (
    <>
      <PlayerGolfDetailsPanel
        playerId={profile.playerId}
        playerData={profile.playerData}
        onUpdate={loadProfile}
      />
      <JoinTeamSection playerId={profile.playerId} currentTeam={profile.currentTeam} />
    </>
  );
}

function HelpPane() {
  return (
    <>
      <SettingsGroup>
        <SettingsLinkRow as={Link} href="/privacy" label="Privacy policy" />
        <SettingsLinkRow as={Link} href="/terms" label="Terms of service" />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow
          label="Support"
          description="Send us what happened, right from here."
          control={<ReportProblemButton size="sm" />}
        />
      </SettingsGroup>
      <p className="px-1 font-fw-sans text-caption text-text-tertiary">
        GolfHelm {'·'} {'©'} 2026 Helm Sports Labs
      </p>
    </>
  );
}

export function SectionPane({
  id,
  profile,
  loadProfile,
  coachHelm,
  onCoachHelmToggle,
}: SectionPaneProps) {
  switch (id) {
    case 'team':
      return <TeamPane profile={profile} loadProfile={loadProfile} />;
    case 'coachhelm':
      return profile.coachId ? (
        <CoachHelmPane coachId={profile.coachId} coachHelm={coachHelm} onToggle={onCoachHelmToggle} />
      ) : null;
    case 'notifications':
      return <NotificationsPane profile={profile} />;
    case 'preferences':
      return (
        <>
          <AppearancePanel />
          <DistanceUnitsPanel />
          {/* Renders nothing outside the native app. */}
          <HapticsPanel />
        </>
      );
    case 'account':
      return <AccountPane profile={profile} loadProfile={loadProfile} />;
    case 'golf':
      return <GolfPane profile={profile} loadProfile={loadProfile} />;
    case 'help':
      return <HelpPane />;
  }
}
