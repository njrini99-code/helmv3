'use client';

// TEMP redesign direction C (removed before ship)

/**
 * Settings, direction C: the Setup card.
 *
 * The whole configuration on one screen as a scorecard. "Out" is you (account,
 * this device, notifications), "In" is the team and CoachHelm for a coach, or
 * golf details and team for a player. Each row shows its current value and a
 * mark for whether it differs from its default; the footer totals the marks.
 * A row opens its existing panel in a Sheet, or (CoachHelm alerts, the
 * player's per-category alerts) goes to the page that already edits it.
 *
 * Rendered at /golf/dashboard/settings?__redesign=c.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGolfUser } from '@/contexts/golf-user-context';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import type { DistancePreference } from '@/lib/golf/distance-units';
import { useGolfTheme } from '@/lib/golf/theme';
import { isNativeApp } from '@/lib/utils/capacitor';
import { areHapticsEnabled } from '@/lib/utils/haptics-pref';
import { Button, EmptyState, Surface, ViewHeader } from '@/components/fairway';
import { JoinTeamSection } from '@/components/golf/settings/JoinTeamSection';
import { CoachHelmToggle } from '@/components/golf/coachhelm/v2';
import { IconRefresh, IconShield, IconWarning } from '@/components/icons';
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
  SectionCard,
  TeamSettingsPanel,
  UnsavedChangesGuard,
} from '@/components/fairway/pages/settings/FairwaySettingsGeneral';
import {
  useSettingsProfile,
  type SettingsProfile,
} from '@/components/fairway/pages/settings/use-settings-profile';
import { AccountActions } from './c/account-actions';
import { Scorecard, ScorecardSkeleton } from './c/scorecard';
import { SettingSheet } from './c/setting-sheet';
import {
  buildSetupCard,
  HAPTICS_DEFAULT,
  type AppearanceValues,
  type RowId,
} from './c/setup-card-model';
import { useSetupCardData, type SetupCardData, type SourceKey } from './c/use-setup-card-data';

/** What to re-read when a sheet that edits it closes. */
const SOURCES_BY_ROW: Partial<Record<RowId, readonly SourceKey[]>> = {
  notifications: ['notifications', 'philosophy'],
  scoring: ['teamSettings'],
  reminders: ['teamSettings'],
  team: ['team'],
  invite: ['team'],
  coachhelm: ['coachHelm'],
};

/** Haptics is device-local and native-only; both are read after mount (no SSR mismatch). */
function useDeviceHaptics() {
  const [state, setState] = useState({ isNative: false, enabled: HAPTICS_DEFAULT });
  const refresh = useCallback(() => {
    setState({ isNative: isNativeApp(), enabled: areHapticsEnabled() });
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { ...state, refresh };
}

type DeviceHaptics = ReturnType<typeof useDeviceHaptics>;

export function SettingsDirectionC() {
  const golfUser = useGolfUser();
  const { profile, loadError, loadProfile } = useSettingsProfile();

  // Mounted above the loading branch on purpose: these device-local stores
  // read localStorage in a mount effect, so they hydrate while the skeleton
  // shows and the card's first paint is already the stored value.
  const appearance = useAppearancePreferences();
  const { theme } = useGolfTheme();
  const { distancePref } = useDistanceUnits();
  const haptics = useDeviceHaptics();
  // Starts in parallel with the profile; it only needs the ids in context.
  const data = useSetupCardData({ role: golfUser.role, coachId: golfUser.coachId, teamId: golfUser.teamId });

  const appearanceValues: AppearanceValues = {
    theme,
    displayDensity: appearance.displayDensity,
    dateFormat: appearance.dateFormat,
    showAnimations: appearance.showAnimations,
    scoreDisplay: appearance.scoreDisplay,
  };

  let main: ReactNode;
  if (loadError && !profile) {
    main = <LoadFailed onRetry={() => void loadProfile()} />;
  } else if (!profile) {
    main = <ScorecardSkeleton />;
  } else {
    main = (
      <UnsavedChangesGuard>
        <SetupCard
          profile={profile}
          reloadProfile={() => void loadProfile()}
          appearance={appearanceValues}
          distancePref={distancePref}
          haptics={haptics}
          data={data}
        />
      </UnsavedChangesGuard>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 pb-24 md:px-6 md:py-8">
      <ViewHeader
        title="Settings"
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span>{golfUser.role === 'coach' ? 'Coach' : 'Player'}</span>
            {golfUser.teamName ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{golfUser.teamName}</span>
              </>
            ) : null}
          </span>
        }
      />
      {/* One column, capped so a row's label and value stay within a glance
          of each other; from xl the chores move into a rail beside the card. */}
      <div className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,42rem)_minmax(0,20rem)] xl:gap-10">
        <div className="min-w-0 max-w-2xl">{main}</div>
        <div className="min-w-0 max-w-2xl">
          <AccountActions />
        </div>
      </div>
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Surface elevation="border" padding="lg">
      <EmptyState
        icon={<IconWarning size={20} aria-hidden />}
        title="Couldn’t load settings"
        description="Something went wrong loading your account. Please try again."
        action={
          <Button variant="secondary" leftIcon={<IconRefresh size={16} aria-hidden />} onClick={onRetry}>
            Retry
          </Button>
        }
      />
    </Surface>
  );
}

function displayName(profile: SettingsProfile): string {
  if (profile.role === 'player' && profile.playerData) {
    const full = [profile.playerData.first_name, profile.playerData.last_name].filter(Boolean).join(' ');
    if (full) return full;
  }
  return profile.name;
}

interface SetupCardProps {
  profile: SettingsProfile;
  reloadProfile: () => void;
  appearance: AppearanceValues;
  distancePref: DistancePreference;
  haptics: DeviceHaptics;
  data: SetupCardData & { reload: (keys: readonly SourceKey[]) => void };
}

function SetupCard({ profile, reloadProfile, appearance, distancePref, haptics, data }: SetupCardProps) {
  // `openRow` drives the sheet; `shownRow` keeps its content through the exit.
  const [openRow, setOpenRow] = useState<RowId | null>(null);
  const [shownRow, setShownRow] = useState<RowId | null>(null);

  const { notifications, philosophy, teamSettings, team, coachHelm, reload } = data;
  const { theme, displayDensity, dateFormat, showAnimations, scoreDisplay } = appearance;
  const { isNative, enabled: hapticsEnabled, refresh: refreshHaptics } = haptics;

  const nines = useMemo(
    () =>
      buildSetupCard({
        role: profile.role,
        name: displayName(profile),
        email: profile.email,
        isNative,
        hasTeam: Boolean(profile.teamId),
        hasCoachId: Boolean(profile.coachId),
        hasPlayerId: Boolean(profile.playerId),
        appearance: { theme, displayDensity, dateFormat, showAnimations, scoreDisplay },
        distanceUnits: distancePref,
        hapticsEnabled,
        notifications,
        philosophy,
        teamSettings,
        team,
        coachHelm,
        player: profile.playerData
          ? { handicap: profile.playerData.handicap, handicap_index: profile.playerData.handicap_index }
          : undefined,
        currentTeamName: profile.currentTeam?.name ?? profile.teamName ?? null,
      }),
    [
      profile,
      isNative,
      theme,
      displayDensity,
      dateFormat,
      showAnimations,
      scoreDisplay,
      distancePref,
      hapticsEnabled,
      notifications,
      philosophy,
      teamSettings,
      team,
      coachHelm,
    ],
  );

  const shown = useMemo(
    () => (shownRow ? nines.flatMap((nine) => nine.rows).find((row) => row.id === shownRow) : undefined),
    [nines, shownRow],
  );

  const refreshFor = useCallback(
    (id: RowId) => {
      const keys = SOURCES_BY_ROW[id];
      if (keys) reload(keys);
      if (id === 'haptics') refreshHaptics();
      if (id === 'membership') reloadProfile();
    },
    [reload, refreshHaptics, reloadProfile],
  );

  const openSheet = (id: RowId) => {
    setShownRow(id);
    setOpenRow(id);
  };

  // Re-read on close, and again once the exit finishes so a write that was
  // still in flight when "Done" was tapped is picked up. The newer read wins.
  const closeSheet = () => {
    if (openRow) refreshFor(openRow);
    setOpenRow(null);
  };
  const handleExited = () => {
    if (shownRow) refreshFor(shownRow);
    setShownRow(null);
  };

  return (
    <>
      <Scorecard nines={nines} onOpenRow={openSheet} />
      <SettingSheet
        open={openRow !== null}
        title={shown?.label ?? 'Setting'}
        guarded={shown?.action.kind === 'sheet' ? shown.action.guarded : false}
        onRequestClose={closeSheet}
        onExited={handleExited}
      >
        {shownRow ? <SheetPanel rowId={shownRow} profile={profile} reloadProfile={reloadProfile} /> : null}
      </SettingSheet>
    </>
  );
}

/** The existing panel for a row, unchanged. */
function SheetPanel({
  rowId,
  profile,
  reloadProfile,
}: {
  rowId: RowId;
  profile: SettingsProfile;
  reloadProfile: () => void;
}) {
  switch (rowId) {
    case 'name':
      return <PersonalInfoPanel profile={profile} onUpdate={reloadProfile} />;
    case 'email':
      return <EmailPanel currentEmail={profile.email} />;
    case 'password':
      return <PasswordPanel />;
    case 'appearance':
      return <AppearancePanel />;
    case 'units':
      return <DistanceUnitsPanel />;
    case 'haptics':
      return <HapticsPanel />;
    case 'notifications':
      return <NotificationsPanel coachId={profile.role === 'coach' ? profile.coachId : undefined} />;
    case 'scoring':
      return profile.teamId ? <GolfScoringPanel teamId={profile.teamId} /> : null;
    case 'reminders':
      return profile.teamId ? <EventRemindersPanel teamId={profile.teamId} /> : null;
    case 'team':
      return <TeamSettingsPanel onUpdate={reloadProfile} />;
    case 'invite':
      return <InviteSettingsPanel />;
    case 'coachhelm':
      return profile.coachId ? (
        <SectionCard
          icon={<IconShield size={18} aria-hidden />}
          title="CoachHelm on your dashboards"
          description="Show or hide CoachHelm on your own dashboards. The team-wide master switch lives in Coaching Intelligence."
        >
          <CoachHelmToggle coachId={profile.coachId} />
        </SectionCard>
      ) : null;
    case 'golf-details':
      return profile.playerId ? (
        <PlayerGolfDetailsPanel playerId={profile.playerId} playerData={profile.playerData} onUpdate={reloadProfile} />
      ) : null;
    case 'membership':
      return profile.playerId ? (
        <JoinTeamSection playerId={profile.playerId} currentTeam={profile.currentTeam} />
      ) : null;
    case 'category-alerts':
    case 'alerts':
      // Link rows: they navigate instead of opening a sheet.
      return null;
  }
}
