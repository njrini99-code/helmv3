'use client';

/**
 * ============================================================================
 * Fairway · Settings index — the front door
 * ----------------------------------------------------------------------------
 * Replaces the 2,332-line single page that stacked 39 panels with no
 * navigation. Every group of settings now lives on its own focused sub-page,
 * and this is the map.
 *
 * VALUE-FORWARD (chosen 2026-07-25): each row carries its CURRENT value on the
 * right, so the right edge of the list is a readable column of your actual
 * configuration. You can audit "what is this account set to" in one glance
 * without opening anything — which is the whole reason to prefer an index over
 * a wall, and the thing a plain link list would throw away.
 *
 * Values shown here must be CHEAP. Theme and distance units come from context
 * hooks that are already mounted; role/team/email come from the session
 * profile. Nothing on this page fires a query just to render a hint — a row
 * with no value renders without one rather than making the index slow.
 * ========================================================================== */

import Link from 'next/link';
import { useMemo } from 'react';
import { useGolfUser } from '@/contexts/golf-user-context';
import { useGolfTheme } from '@/lib/golf/theme';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import {
  SettingsStack,
  SettingsGroup,
  SettingsLinkRow,
} from '@/components/fairway/settings/settings-list';
import {
  IconUser,
  IconMail,
  IconLock,
  IconPalette,
  IconBell,
  IconRuler,
  IconGolf,
  IconSparkles,
  IconUsers,
} from '@/components/icons';

const THEME_LABEL: Record<string, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export interface FairwaySettingsIndexProps {
  /** Signed-in email, resolved server-side so the row never renders blank. */
  email?: string | null;
}

export function FairwaySettingsIndex({ email }: FairwaySettingsIndexProps) {
  const golfUser = useGolfUser();
  const { theme } = useGolfTheme();
  const { distancePref } = useDistanceUnits();

  const isCoach = golfUser.role === 'coach';

  const themeValue = THEME_LABEL[theme] ?? 'System';
  const unitsValue = distancePref === 'meters' ? 'Meters' : 'Yards';

  // Truncate long emails from the LEFT so the domain survives — "…@school.edu"
  // identifies the account better than "nicholas.rini.jr@…".
  const emailValue = useMemo(() => {
    if (!email) return undefined;
    return email.length > 26 ? `…${email.slice(-25)}` : email;
  }, [email]);

  return (
    <SettingsStack>
      <SettingsGroup title="Account">
        <SettingsLinkRow
          as={Link}
          href="/golf/dashboard/settings/profile"
          icon={<IconUser aria-hidden />}
          label="Profile"
          value={golfUser.name || undefined}
        />
        <SettingsLinkRow
          as={Link}
          href="/golf/dashboard/settings/account"
          icon={<IconMail aria-hidden />}
          label="Email"
          value={emailValue}
        />
        <SettingsLinkRow
          as={Link}
          href="/golf/dashboard/settings/security"
          icon={<IconLock aria-hidden />}
          label="Password & security"
        />
      </SettingsGroup>

      <SettingsGroup title="Preferences">
        <SettingsLinkRow
          as={Link}
          href="/golf/dashboard/settings/appearance"
          icon={<IconPalette aria-hidden />}
          label="Appearance"
          value={themeValue}
        />
        <SettingsLinkRow
          as={Link}
          href="/golf/dashboard/settings/appearance#units"
          icon={<IconRuler aria-hidden />}
          label="Distance units"
          value={unitsValue}
        />
        <SettingsLinkRow
          as={Link}
          href="/golf/dashboard/settings/notifications"
          icon={<IconBell aria-hidden />}
          label="Notifications"
        />
      </SettingsGroup>

      {isCoach ? (
        <SettingsGroup
          title="Team"
          description="Applies to everyone on your roster."
        >
          <SettingsLinkRow
            as={Link}
            href="/golf/dashboard/settings/scoring"
            icon={<IconGolf aria-hidden />}
            label="Scoring & format"
          />
          <SettingsLinkRow
            as={Link}
            href="/golf/dashboard/settings/coaching-intelligence"
            icon={<IconSparkles aria-hidden />}
            label="CoachHelm AI"
            description="Priorities, alert sensitivity and thresholds"
          />
          <SettingsLinkRow
            as={Link}
            href="/golf/dashboard/settings/team"
            icon={<IconUsers aria-hidden />}
            label="Team & invites"
            value={golfUser.teamName || undefined}
          />
        </SettingsGroup>
      ) : (
        <SettingsGroup title="Golf">
          <SettingsLinkRow
            as={Link}
            href="/golf/dashboard/settings/profile#golf"
            icon={<IconGolf aria-hidden />}
            label="Playing details"
            description="Handicap, graduation year, hometown"
          />
          <SettingsLinkRow
            as={Link}
            href="/golf/dashboard/settings/team"
            icon={<IconUsers aria-hidden />}
            label="Team"
            value={golfUser.teamName || undefined}
          />
        </SettingsGroup>
      )}
    </SettingsStack>
  );
}

export default FairwaySettingsIndex;
