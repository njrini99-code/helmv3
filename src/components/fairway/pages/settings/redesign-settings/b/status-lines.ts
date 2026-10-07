/**
 * TEMP redesign direction B (removed before ship) · the words on the rail.
 *
 * One line per section, built only from values the page already holds. Null
 * is never printed as zero: a missing golf_team_settings row reads "Default
 * settings", a missing handicap index reads "Index not set", a read that
 * failed reads "Couldn't load", and Help & legal has no configuration to
 * report, so it gets no line at all.
 */

import type { SettingsProfile } from '@/components/fairway/pages/settings/use-settings-profile';
import type { GolfTheme } from '@/lib/golf/theme';
import type { DistancePreference } from '@/lib/golf/distance-units';
import type {
  CoachHelmStatus,
  Loadable,
  NotificationStatus,
  TeamStatus,
} from './use-section-status';
import type { SectionId } from './sections';

export type StatusLine =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'text'; text: string; muted?: boolean };

export interface StatusInputs {
  profile: SettingsProfile;
  team: Loadable<TeamStatus>;
  notifications: Loadable<NotificationStatus>;
  coachHelm: Loadable<CoachHelmStatus>;
  theme: GolfTheme;
  units: DistancePreference;
  /**
   * The theme and unit stores read localStorage in an effect, so their first
   * client read is the default. False until that pass has run.
   */
  deviceStoresReady: boolean;
}

const COULD_NOT_LOAD: StatusLine = { kind: 'text', text: 'Couldn’t load', muted: true };

const THEME_LABEL: Record<GolfTheme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

function sentenceCase(raw: string): string {
  const spaced = raw.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * The scoring format as the Scoring & format panel shows it. A row whose
 * column is null renders Stroke play there (the panel's first-time value), so
 * it reads the same here.
 */
function scoringLabel(format: string | null): string {
  if (!format || format === 'stroke_play') return 'Stroke play';
  if (format === 'match_play') return 'Match play';
  return sentenceCase(format);
}

/**
 * WHS indexes carry one decimal. A negative stored value keeps a real minus.
 * (The golf metric display registry has no handicap-index entry, so this is
 * formatted here rather than through formatMetric.)
 */
const ONE_DECIMAL = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatIndex(value: number): string {
  const digits = ONE_DECIMAL.format(Math.abs(value));
  return value < 0 ? `−${digits}` : digits;
}

/** "Balanced" for the rail and for the Coaching Intelligence link value. */
export function sensitivityLabel(sensitivity: string | null): string | null {
  return sensitivity ? sentenceCase(sensitivity) : null;
}

export function alertCountLabel(status: CoachHelmStatus): string | null {
  const { alerts } = status;
  if (alerts.kind === 'row') return `${alerts.on}/${alerts.total} alerts`;
  if (alerts.kind === 'default') return 'default alerts';
  return null;
}

function fromLoadable<T>(value: Loadable<T>, describe: (v: T) => string): StatusLine {
  if (value.kind === 'loading') return { kind: 'loading' };
  if (value.kind === 'error') return COULD_NOT_LOAD;
  return { kind: 'text', text: describe(value.value) };
}

export function statusLineFor(section: SectionId, input: StatusInputs): StatusLine {
  switch (section) {
    case 'team':
      return fromLoadable(input.team, (t) => {
        const reminders = `reminders ${t.remindersOn ? 'on' : 'off'}`;
        return t.hasRow
          ? `${scoringLabel(t.scoringFormat)} · ${reminders}`
          : `Default settings · ${reminders}`;
      });

    case 'notifications':
      return fromLoadable(input.notifications, (n) =>
        n.quietMode
          ? 'Quiet mode on'
          : `Email ${n.emailOn}/${n.emailTotal} · Push ${n.pushOn}/${n.pushTotal}`,
      );

    case 'coachhelm':
      return fromLoadable(input.coachHelm, (c) => {
        const alerts = alertCountLabel(c);
        const state = c.enabled ? 'On' : 'Off';
        return alerts ? `${state} · ${alerts}` : state;
      });

    case 'preferences':
      // Never print the store default before the stored choice has loaded.
      if (!input.deviceStoresReady) return { kind: 'loading' };
      return {
        kind: 'text',
        text: `${THEME_LABEL[input.theme]} theme · ${input.units === 'meters' ? 'Meters' : 'Yards'}`,
      };

    case 'account': {
      const { email, name } = input.profile;
      return { kind: 'text', text: email || name || 'Signed in' };
    }

    case 'golf': {
      const { playerData, currentTeam } = input.profile;
      // useSettingsProfile leaves playerData undefined when the golf_players
      // read failed, which must not read as "nothing set".
      if (!playerData) return { kind: 'text', text: 'Details unavailable', muted: true };
      const index =
        playerData.handicap_index == null
          ? 'Index not set'
          : `Index ${formatIndex(playerData.handicap_index)}`;
      return { kind: 'text', text: `${index} · ${currentTeam?.name ?? 'No team'}` };
    }

    case 'help':
      return { kind: 'none' };
  }
}
