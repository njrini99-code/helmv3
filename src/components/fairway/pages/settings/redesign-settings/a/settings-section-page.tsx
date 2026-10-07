'use client';

/**
 * Direction A · one settings section, drilled into from the index.
 *
 * The panels are FairwaySettingsGeneral's own exports, reused as they are, so
 * every save model stays what it was: Appearance, Distance units, Haptics and
 * Notifications autosave; Personal information, Email, Password, Scoring &
 * format, Event reminders, Team settings and Golf details keep their explicit
 * Save buttons. Each section sits inside UnsavedChangesGuard, so leaving with
 * an unsaved Save-button panel (back link, sidebar, browser back) asks first.
 *
 * The server route has already gated the role; the check here is the same one
 * the coaching-intelligence page repeats client-side, as defence in depth.
 */

import { useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGolfUser } from '@/contexts/golf-user-context';
import { Button } from '@/components/fairway/controls/button';
import { Surface } from '@/components/fairway/surfaces';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { FeatureUnavailable } from '@/components/fairway/feedback/FeatureUnavailable';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { ReportProblemButton } from '@/components/fairway/feedback/ReportProblemButton';
import {
  SettingsGroup,
  SettingsLinkRow,
  SettingsRow,
  SettingsStack,
} from '@/components/fairway/settings/settings-list';
import { JoinTeamSection } from '@/components/golf/settings/JoinTeamSection';
import { CoachHelmToggle } from '@/components/golf/coachhelm/v2';
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
  UnsavedChangesGuard,
} from '@/components/fairway/pages/settings/FairwaySettingsGeneral';
import {
  useSettingsProfile,
  type SettingsProfile,
} from '@/components/fairway/pages/settings/use-settings-profile';
import {
  SECTION_ANCHORS,
  SETTINGS_INDEX_HREF,
  SETTINGS_SECTIONS,
  type SettingsSectionSlug,
} from './sections';
import { SettingsSectionFrame, SettingsSectionSkeleton } from './section-frame';
import { useSettleToHash } from './use-settle-to-hash';

const NOTIFICATIONS_MATRIX_HREF = '/golf/dashboard/settings/notifications';

export function SettingsSectionPage({ slug }: { slug: SettingsSectionSlug }) {
  const golfUser = useGolfUser();
  const config = SETTINGS_SECTIONS[slug];

  if (!config.roles.includes(golfUser.role)) {
    return (
      <FeatureUnavailable
        title={config.title}
        message={config.unavailable.message}
        actionHref={config.unavailable.href}
        actionLabel={config.unavailable.label}
      />
    );
  }

  if (golfUser.role === 'player' && !golfUser.playerId) {
    return (
      <FeatureUnavailable
        title={config.title}
        message="No player profile is linked to this account yet. Finish onboarding to manage your settings."
        actionHref="/golf/player"
        actionLabel="Finish onboarding"
      />
    );
  }

  return (
    <UnsavedChangesGuard>
      <SectionBody slug={slug} />
    </UnsavedChangesGuard>
  );
}

function SectionBody({ slug }: { slug: SettingsSectionSlug }) {
  switch (slug) {
    case 'account':
      return <AccountSection />;
    case 'device':
      return <DeviceSection />;
    case 'delivery':
      return <DeliverySection />;
    case 'team':
      return <TeamSection />;
    case 'golf':
      return <GolfSection />;
    case 'coachhelm':
      return <CoachHelmSection />;
    case 'help':
      return <HelpSection />;
  }
}

/* ── shared pieces ─────────────────────────────────────────────────────────── */

/** An in-page anchor target, clear of the sticky mobile header when scrolled to. */
function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-[calc(var(--golf-mobile-header-offset,0px)+1rem)]">
      {children}
    </div>
  );
}

function ProfileLoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <InlineNotice
      tone="danger"
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      Couldn’t load {what}.
    </InlineNotice>
  );
}

/* ── sections ──────────────────────────────────────────────────────────────── */

function AccountSection() {
  const config = SETTINGS_SECTIONS.account;
  const { profile, loadError, loadProfile } = useSettingsProfile();

  if (!profile) {
    return loadError ? (
      <SettingsSectionFrame title={config.title}>
        <ProfileLoadFailed what="your account" onRetry={() => void loadProfile()} />
      </SettingsSectionFrame>
    ) : (
      <SettingsSectionSkeleton config={config} />
    );
  }

  return (
    <SettingsSectionFrame title={config.title}>
      <div className="flex flex-col gap-7">
        <PersonalInfoPanel profile={profile} onUpdate={() => void loadProfile()} />
        <EmailPanel currentEmail={profile.email} />
        <PasswordPanel />
      </div>
    </SettingsSectionFrame>
  );
}

function DeviceSection() {
  return (
    <SettingsSectionFrame title={SETTINGS_SECTIONS.device.title}>
      <div className="flex flex-col gap-7">
        <AppearancePanel />
        <DistanceUnitsPanel />
        {/* Renders nothing outside the native app. */}
        <HapticsPanel />
      </div>
    </SettingsSectionFrame>
  );
}

function DeliverySection() {
  const golfUser = useGolfUser();
  const isCoach = golfUser.role === 'coach';
  return (
    <SettingsSectionFrame title={SETTINGS_SECTIONS.delivery.title}>
      <SettingsStack>
        {/* Coach: also carries the weekly team email switch (golf_coach_philosophy). */}
        <NotificationsPanel coachId={isCoach ? golfUser.coachId : undefined} />
        {!isCoach ? (
          <SettingsGroup>
            <SettingsLinkRow
              as={Link}
              href={NOTIFICATIONS_MATRIX_HREF}
              label="Rounds, goals & insights"
              description="Push, email and in-app, per kind of update."
            />
          </SettingsGroup>
        ) : null}
      </SettingsStack>
    </SettingsSectionFrame>
  );
}

function TeamSection() {
  const golfUser = useGolfUser();
  const config = SETTINGS_SECTIONS.team;

  if (!golfUser.teamId) {
    return (
      <SettingsSectionFrame title={config.title}>
        <Surface elevation="border" padding="lg">
          <EmptyState
            title="No team yet"
            description="Scoring, reminders and the invite code belong to a team. They appear here once you coach one."
            action={
              <Button asChild variant="secondary">
                <Link href={SETTINGS_INDEX_HREF}>Back to Settings</Link>
              </Button>
            }
          />
        </Surface>
      </SettingsSectionFrame>
    );
  }

  return (
    <SettingsSectionFrame title={config.title} description={golfUser.teamName}>
      <TeamPanels teamId={golfUser.teamId} />
    </SettingsSectionFrame>
  );
}

function TeamPanels({ teamId }: { teamId: string }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  useSettleToHash(containerRef);

  return (
    <div ref={containerRef} className="flex flex-col gap-7">
      <Anchor id={SECTION_ANCHORS.scoring}>
        <GolfScoringPanel teamId={teamId} />
      </Anchor>
      <Anchor id={SECTION_ANCHORS.reminders}>
        <EventRemindersPanel teamId={teamId} />
      </Anchor>
      <Anchor id={SECTION_ANCHORS.organization}>
        {/* Refreshes server-rendered chrome after a save. It does NOT update
            the team name this page's heading and the index tag read:
            GolfUserProvider memoizes its value without teamName, so a rename
            shows there after a full reload (G has the same gap). */}
        <TeamSettingsPanel onUpdate={() => router.refresh()} />
      </Anchor>
      <Anchor id={SECTION_ANCHORS.invite}>
        <InviteSettingsPanel />
      </Anchor>
    </div>
  );
}

function GolfSection() {
  const config = SETTINGS_SECTIONS.golf;
  const { profile, loadError, loadProfile } = useSettingsProfile();

  if (!profile) {
    return loadError ? (
      <SettingsSectionFrame title={config.title}>
        <ProfileLoadFailed what="your golf profile" onRetry={() => void loadProfile()} />
      </SettingsSectionFrame>
    ) : (
      <SettingsSectionSkeleton config={config} />
    );
  }

  return (
    <SettingsSectionFrame title={config.title}>
      <GolfPanels profile={profile} onReload={() => void loadProfile()} />
    </SettingsSectionFrame>
  );
}

function GolfPanels({ profile, onReload }: { profile: SettingsProfile; onReload: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useSettleToHash(containerRef);
  const playerId = profile.playerId;
  if (!playerId) return null;

  return (
    <div ref={containerRef} className="flex flex-col gap-7">
      <Anchor id={SECTION_ANCHORS.details}>
        {/* `playerData` is undefined only when the golf_players read failed.
            The form would open blank, and Save would write those blanks over
            a profile that was fine, so it waits for a successful read. */}
        {profile.playerData ? (
          <PlayerGolfDetailsPanel playerId={playerId} playerData={profile.playerData} onUpdate={onReload} />
        ) : (
          <ProfileLoadFailed what="your golf details" onRetry={onReload} />
        )}
      </Anchor>
      <Anchor id={SECTION_ANCHORS.membership}>
        <JoinTeamSection playerId={playerId} currentTeam={profile.currentTeam} />
      </Anchor>
    </div>
  );
}

function CoachHelmSection() {
  const golfUser = useGolfUser();
  const config = SETTINGS_SECTIONS.coachhelm;
  return (
    <SettingsSectionFrame title={config.title} description={config.description}>
      {golfUser.coachId ? (
        <CoachHelmToggle coachId={golfUser.coachId} />
      ) : (
        <ProfileLoadFailed what="your coach profile" onRetry={() => window.location.reload()} />
      )}
    </SettingsSectionFrame>
  );
}

function HelpSection() {
  return (
    <SettingsSectionFrame title={SETTINGS_SECTIONS.help.title}>
      <SettingsStack>
        <SettingsGroup title="Support">
          <SettingsRow
            stacked
            label="Something not working?"
            description="Send a report to Helm Sports Labs. If the form can’t open, your email app opens instead."
            control={<ReportProblemButton variant="primary" fullWidth className="sm:w-auto sm:self-start" />}
          />
        </SettingsGroup>
        <SettingsGroup title="Legal">
          <SettingsLinkRow as={Link} href="/privacy" label="Privacy policy" />
          <SettingsLinkRow as={Link} href="/terms" label="Terms of service" />
        </SettingsGroup>
        <p className="px-1 font-fw-sans text-caption text-text-tertiary">GolfHelm · © 2026 Helm Sports Labs</p>
      </SettingsStack>
    </SettingsSectionFrame>
  );
}
