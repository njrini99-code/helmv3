'use client';

// TEMP redesign direction A (removed before ship)

/**
 * ============================================================================
 * Settings · Direction A — Index
 * ----------------------------------------------------------------------------
 * The settings kit's intended shape (settings-list.tsx, 2026-07-25): a bag tag
 * for who you are, then grouped drill-in rows whose right edge reads your live
 * configuration, so the column is an audit you can take without opening
 * anything. Every row opens /settings/[section] (the existing panels, reused),
 * except the two static routes, notifications and coaching-intelligence.
 *
 * Values are read-only here and come from columns the panels already use; see
 * ./a/format.ts for the column behind each one and how a failed read, a
 * missing row and an unset field stay distinguishable. The column holds
 * placeholders until the profile and every read settle, then fills in once.
 * ========================================================================== */

import Link from 'next/link';
import { useGolfUser } from '@/contexts/golf-user-context';
import { useGolfTheme } from '@/lib/golf/theme';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import { ViewHeader } from '@/components/fairway/view-header';
import { Button } from '@/components/fairway/controls/button';
import { Surface } from '@/components/fairway/surfaces';
import { InlineNotice } from '@/components/fairway/feedback/InlineNotice';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { SettingsGroup, SettingsStack } from '@/components/fairway/settings/settings-list';
import { IconLogout, IconTrash } from '@/components/icons';
import { useSettingsProfile } from '../use-settings-profile';
import { BagTag, type InviteStub } from './a/bag-tag';
import { ActionRow, IndexLinkRow, type IndexValue } from './a/index-rows';
import { DeleteAccountConfirm, useAccountExit, type AccountExit } from './a/account-exit';
import { useSettingsIndexValues, type IndexValues } from './a/use-index-values';
import { SETTINGS_COLUMN } from './a/section-frame';
import { SECTION_ANCHORS, sectionHref } from './a/sections';
import {
  COULD_NOT_LOAD,
  accountValue,
  alertsValue,
  categoryValue,
  dashboardsValue,
  deliveryValue,
  deviceValue,
  digestValue,
  formatHandicapIndex,
  golfDetailsValue,
  inviteValue,
  membershipValue,
  remindersValue,
  scoringValue,
  seasonValue,
  type RowValue,
} from './a/format';

const NOTIFICATIONS_MATRIX_HREF = '/golf/dashboard/settings/notifications';
const COACHING_INTELLIGENCE_HREF = '/golf/dashboard/settings/coaching-intelligence';

export function SettingsDirectionA() {
  const golfUser = useGolfUser();
  // Theme and units hydrate from localStorage in an effect. Subscribing here,
  // while the column still holds placeholders, means "This device" is final
  // by the time the values fill in.
  const { theme } = useGolfTheme();
  const { distancePref } = useDistanceUnits();
  const { profile, loadError, loadProfile } = useSettingsProfile();
  const { values, failed, reload } = useSettingsIndexValues(golfUser);
  const exit = useAccountExit();

  const isCoach = golfUser.role === 'coach';

  // useSettingsProfile never resolves for a player account with no
  // golf_players row; say so instead of holding placeholders forever.
  if (!isCoach && !golfUser.playerId) {
    return <UnlinkedPlayer exit={exit} />;
  }

  const ready = values !== null && (profile !== null || loadError);

  /** A row's value once everything has settled; a placeholder until then. */
  const value = (compute: (settled: IndexValues) => RowValue): IndexValue =>
    ready && values ? compute(values) : 'loading';

  /** For values that come from the settings profile rather than an index read. */
  const fromProfile = (compute: (p: NonNullable<typeof profile>) => RowValue): IndexValue =>
    value(() => (profile ? compute(profile) : COULD_NOT_LOAD));

  const invite: InviteStub | undefined =
    isCoach && golfUser.teamId
      ? !ready || !values?.team
        ? { state: 'loading' }
        : values.team.state === 'ok'
          ? { state: 'ok', code: values.team.data.join_code }
          : { state: 'error' }
      : undefined;

  const handicapIndex =
    !isCoach && ready && profile?.playerData?.handicap_index != null
      ? formatHandicapIndex(profile.playerData.handicap_index)
      : null;

  return (
    <div className={SETTINGS_COLUMN}>
      <ViewHeader title="Settings" disableAnimation />

      <div className="mt-6 flex flex-col gap-8" aria-busy={!ready || undefined}>
        <BagTag
          name={golfUser.name}
          avatarUrl={profile?.avatarUrl ?? golfUser.avatarUrl ?? null}
          role={golfUser.role}
          teamName={isCoach ? golfUser.teamName : (profile?.currentTeam?.name ?? golfUser.teamName)}
          invite={invite}
          handicapIndex={handicapIndex}
        />

        {ready && (failed || loadError) ? (
          <InlineNotice
            tone="warning"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  reload();
                  void loadProfile();
                }}
              >
                Retry
              </Button>
            }
          >
            Some values couldn’t load. Each section still opens and has its own retry.
          </InlineNotice>
        ) : null}

        <SettingsStack>
          <SettingsGroup title="You">
            <IndexLinkRow
              href={sectionHref('account')}
              label="Account"
              value={fromProfile((p) => accountValue(p.email))}
            />
            <IndexLinkRow
              href={sectionHref('device')}
              label="This device"
              value={value(() => deviceValue(theme, distancePref))}
            />
          </SettingsGroup>

          <SettingsGroup title="Notifications">
            <IndexLinkRow
              href={sectionHref('delivery')}
              label="Email & push"
              value={value((v) => deliveryValue(v.delivery))}
            />
            {isCoach && golfUser.coachId ? (
              <IndexLinkRow
                href={sectionHref('delivery')}
                label="Weekly team email"
                value={value((v) => (v.philosophy ? digestValue(v.philosophy) : COULD_NOT_LOAD))}
              />
            ) : null}
            {!isCoach ? (
              <IndexLinkRow
                href={NOTIFICATIONS_MATRIX_HREF}
                label="Rounds, goals & insights"
                value={value((v) => (v.categoryState ? categoryValue(v.categoryState) : COULD_NOT_LOAD))}
              />
            ) : null}
          </SettingsGroup>

          {isCoach && golfUser.teamId ? (
            <SettingsGroup title="Team">
              <IndexLinkRow
                href={sectionHref('team', SECTION_ANCHORS.scoring)}
                label="Scoring & format"
                value={value((v) => (v.teamSettings ? scoringValue(v.teamSettings) : COULD_NOT_LOAD))}
              />
              <IndexLinkRow
                href={sectionHref('team', SECTION_ANCHORS.reminders)}
                label="Event reminders"
                value={value((v) => (v.teamSettings ? remindersValue(v.teamSettings) : COULD_NOT_LOAD))}
              />
              <IndexLinkRow
                href={sectionHref('team', SECTION_ANCHORS.organization)}
                label="Team & organization"
                value={value((v) => (v.team ? seasonValue(v.team) : COULD_NOT_LOAD))}
              />
              <IndexLinkRow
                href={sectionHref('team', SECTION_ANCHORS.invite)}
                label="Invite code"
                value={value((v) => (v.team ? inviteValue(v.team) : COULD_NOT_LOAD))}
              />
            </SettingsGroup>
          ) : null}

          {!isCoach ? (
            <SettingsGroup title="Golf">
              <IndexLinkRow
                href={sectionHref('golf', SECTION_ANCHORS.details)}
                label="Golf details"
                value={fromProfile((p) => golfDetailsValue(p.playerData))}
              />
              <IndexLinkRow
                href={sectionHref('golf', SECTION_ANCHORS.membership)}
                label="Team membership"
                value={fromProfile((p) =>
                  membershipValue(p.currentTeam?.name ?? p.teamName, Boolean(golfUser.teamId)),
                )}
              />
            </SettingsGroup>
          ) : null}

          {isCoach && golfUser.coachId ? (
            <SettingsGroup title="CoachHelm">
              <IndexLinkRow
                href={COACHING_INTELLIGENCE_HREF}
                label="Alerts"
                value={value((v) => (v.philosophy ? alertsValue(v.philosophy) : COULD_NOT_LOAD))}
              />
              <IndexLinkRow
                href={sectionHref('coachhelm')}
                label="On my dashboards"
                value={value((v) => (v.coachHelm ? dashboardsValue(v.coachHelm) : COULD_NOT_LOAD))}
              />
            </SettingsGroup>
          ) : null}

          <SettingsGroup title="Help & legal">
            <IndexLinkRow href={sectionHref('help')} label="Report a problem" />
            <IndexLinkRow href="/privacy" label="Privacy policy" />
            <IndexLinkRow href="/terms" label="Terms of service" />
          </SettingsGroup>

          <AccountActions exit={exit} />
        </SettingsStack>
      </div>

      <DeleteAccountConfirm exit={exit} />
    </div>
  );
}

function AccountActions({ exit }: { exit: AccountExit }) {
  return (
    <SettingsGroup>
      <ActionRow
        label="Sign out"
        icon={<IconLogout size={18} />}
        onClick={exit.signOut}
        busy={exit.signingOut}
      />
      <ActionRow
        label="Delete account"
        icon={<IconTrash size={18} />}
        tone="danger"
        onClick={exit.requestDelete}
        busy={exit.deletingAccount}
      />
    </SettingsGroup>
  );
}

/** A player account with no golf_players row yet: nothing to configure, but a way out. */
function UnlinkedPlayer({ exit }: { exit: AccountExit }) {
  return (
    <div className={SETTINGS_COLUMN}>
      <ViewHeader title="Settings" disableAnimation />
      <div className="mt-8 flex flex-col gap-7">
        <Surface elevation="border" padding="lg">
          <EmptyState
            title="No player profile yet"
            description="This account isn’t linked to a player profile, so there is nothing to set up here yet."
            action={
              <Button asChild variant="primary">
                <Link href="/golf/player">Finish onboarding</Link>
              </Button>
            }
          />
        </Surface>
        <AccountActions exit={exit} />
      </div>
      <DeleteAccountConfirm exit={exit} />
    </div>
  );
}
