/**
 * TEMP redesign direction C (removed before ship) — the Setup card's model.
 *
 * Pure: turns the values the settings screen already reads into scorecard rows
 * (a current value plus a "changed from default" mark) and the footer tally.
 * Every default below is imported from the code that owns it where that code
 * exports it; where it doesn't, the literal is mirrored with a citation to the
 * line it mirrors so the two can be diffed.
 */

import {
  EVENT_REMINDER_DEFAULTS,
  formatLead,
  resolveEventReminderSettings,
  type EventReminderRow,
} from '@/lib/golf/event-reminder-settings';
import { DEFAULT_THEME, type GolfTheme } from '@/lib/golf/theme';
import type { DistancePreference } from '@/lib/golf/distance-units';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/notifications/types';
import {
  DELIVERY_NOTIFICATION_GROUPS,
  type DeliveryNotificationKey,
} from '@/lib/coachhelm/v3/notifications/types';
import { PHILOSOPHY_DEFAULTS } from '@/lib/coachhelm/constants';
import { ALERT_GROUPS } from '@/lib/coachhelm/types';
import { formatHandicap } from '@/components/fairway/pages/roster/roster-helpers';

/* ── defaults, each with its source ─────────────────────────────────────────── */

/**
 * Mirrors the module-private `DEFAULTS` in
 * src/hooks/golf/use-appearance-preferences.ts:18-23 (not exported).
 * The theme default is imported: DEFAULT_THEME, src/lib/golf/theme.ts:31.
 */
export const APPEARANCE_DEFAULTS = {
  theme: DEFAULT_THEME,
  displayDensity: 'comfortable',
  dateFormat: 'MM/DD/YYYY',
  showAnimations: true,
  scoreDisplay: 'to_par',
} as const;

/** Mirrors the module-private `DEFAULT` in src/hooks/golf/use-distance-units.ts:23. */
export const DISTANCE_UNITS_DEFAULT: DistancePreference = 'yards';

/** src/lib/utils/haptics-pref.ts:36 — anything but a stored 'false' reads as on. */
export const HAPTICS_DEFAULT = true;

/**
 * GolfScoringPanel's first-time values: the useState seeds at
 * FairwaySettingsGeneral.tsx:1927-1930 and the `|| fallback` applied to a
 * loaded row at :1963-1966. A team with no golf_team_settings row (5 of 10
 * live) is on all four.
 */
export const SCORING_DEFAULTS = {
  scoringFormat: 'stroke_play',
  handicapSystem: 'usga',
  defaultTees: 'blue',
  timezone: 'America/New_York',
} as const;

/**
 * CoachHelm on the coach's own dashboards: useCoachHelmSettings.ts:46
 * (DEFAULT_SETTINGS.enabled) and :59 (`row.enabled ?? true`).
 */
export const COACHHELM_ENABLED_DEFAULT = true;

/**
 * The ten alert switches have no default in application code. Neither path
 * that creates a golf_coach_philosophy row sets them, so the column defaults
 * are the defaults: supabase/migrations/20260527000000_prod_public_baseline.sql:9123-9132.
 * Sensitivity is the same in code and schema: PHILOSOPHY_DEFAULTS.alertSensitivity
 * (src/lib/coachhelm/constants.ts:7) and the column default at :9110.
 */
export const ALERT_COLUMN_DEFAULTS = {
  alert_scoring_decline: true,
  alert_stat_regression: true,
  alert_tournament_pressure: true,
  alert_plateau: false,
  alert_bubble_player: true,
  alert_surge_player: true,
  alert_streaks: true,
  alert_recurring_weakness: true,
  alert_closing_holes: false,
  alert_par_3_issues: false,
} as const;
export type AlertColumn = keyof typeof ALERT_COLUMN_DEFAULTS;
export const ALERT_COLUMNS = Object.keys(ALERT_COLUMN_DEFAULTS) as AlertColumn[];

/** Weekly coach email: column default :9136, and a missing row reads as on (FairwaySettingsGeneral.tsx:1511). */
export const COACH_DIGEST_DEFAULT = true;

/**
 * Notification defaults are DEFAULT_NOTIFICATION_PREFERENCES
 * (src/lib/notifications/types.ts:47-60), plus quiet mode off.
 *
 * Deliberately NOT the v3 DEFAULT_DELIVERY_NOTIFICATION_PREFERENCES or the
 * server action's own fallbacks: both say push_messages / push_events are off,
 * but the live users.notification_preferences column default stores them on
 * and the delivery gate (getUserNotificationPreferences) merges these. Against
 * the v3 set, 172 of 173 users would read "changed" without touching anything;
 * against this one, 9 do.
 */
export const NOTIFICATION_DEFAULTS: Readonly<Record<DeliveryNotificationKey, boolean>> & {
  readonly quiet_mode: boolean;
} = {
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  quiet_mode: false,
};

/** The channel groups the golf panel renders (FairwaySettingsGeneral.tsx:125-128 hides the two recruiting ones). */
export const GOLF_NOTIFICATION_GROUPS = DELIVERY_NOTIFICATION_GROUPS.filter(
  (group) => group.id !== 'pipeline' && group.id !== 'profile_views',
);

/* ── shapes the card is built from ──────────────────────────────────────────── */

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T };

export const LOADING: Loadable<never> = { status: 'loading' };

/** users.notification_preferences as getNotificationPreferences() returns it. */
export type NotificationPrefsSource = Partial<
  Record<DeliveryNotificationKey | 'quiet_mode', boolean | undefined>
>;

export interface TeamSettingsSource {
  scoring_format: string | null;
  handicap_system: string | null;
  default_tees: string | null;
  timezone: string | null;
  event_reminders_enabled: boolean | null;
  event_reminder_early_hours: number | null;
  event_reminder_late_minutes: number | null;
}

export type PhilosophySource = Record<AlertColumn, boolean> & {
  alert_sensitivity: string | null;
  email_digest_enabled: boolean;
};

export interface TeamSource {
  name: string | null;
  join_code: string | null;
}

export interface CoachHelmSource {
  enabled: boolean | null;
}

export interface AppearanceValues {
  theme: GolfTheme;
  displayDensity: string;
  dateFormat: string;
  showAnimations: boolean;
  scoreDisplay: string;
}

/* ── row cells ──────────────────────────────────────────────────────────────── */

/** What a row can say about "changed from default". */
export type RowMark =
  /** The setting has no default to compare against (name, email, codes…). */
  | { kind: 'none' }
  /** It has a default; its value is still loading. */
  | { kind: 'pending' }
  /** It has a default; its value couldn't be read, so it can't be compared. */
  | { kind: 'unknown' }
  | { kind: 'compared'; changed: boolean };

export type ValueTone = 'default' | 'muted' | 'code' | 'secret';

export interface RowCell {
  status: 'ready' | 'loading' | 'error';
  /** Display text. Null only while loading. */
  value: string | null;
  tone: ValueTone;
  mark: RowMark;
}

const NO_MARK: RowMark = { kind: 'none' };
const compared = (changed: boolean): RowMark => ({ kind: 'compared', changed });

function ready(value: string, mark: RowMark, tone: ValueTone = 'default'): RowCell {
  return { status: 'ready', value, tone, mark };
}

/** Loading / error cell for a row whose value comes from a remote source. */
function unresolved(status: 'loading' | 'error', hasDefault: boolean): RowCell {
  return status === 'loading'
    ? { status, value: null, tone: 'default', mark: hasDefault ? { kind: 'pending' } : NO_MARK }
    : { status, value: 'Couldn’t load', tone: 'muted', mark: hasDefault ? { kind: 'unknown' } : NO_MARK };
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const humanize = (s: string) => capitalize(s.replace(/_/g, ' '));

/* ── per-row summaries ──────────────────────────────────────────────────────── */

const THEME_LABEL: Record<GolfTheme, string> = { light: 'Light', dark: 'Dark', system: 'System' };

export function summarizeAppearance(v: AppearanceValues): RowCell {
  const d = APPEARANCE_DEFAULTS;
  // The theme always leads; anything else only shows when it differs, so a
  // filled mark is never left unexplained by the value beside it.
  const parts = [THEME_LABEL[v.theme] ?? capitalize(v.theme)];
  if (v.displayDensity !== d.displayDensity) parts.push(capitalize(v.displayDensity));
  if (v.dateFormat !== d.dateFormat) parts.push(v.dateFormat);
  if (v.scoreDisplay !== d.scoreDisplay) parts.push(v.scoreDisplay === 'raw' ? 'Raw scores' : 'Score to par');
  if (v.showAnimations !== d.showAnimations) parts.push(v.showAnimations ? 'Animations on' : 'Animations off');
  const changed = v.theme !== d.theme || parts.length > 1;
  return ready(parts.join(' · '), compared(changed));
}

export function summarizeDistanceUnits(pref: DistancePreference): RowCell {
  return ready(pref === 'meters' ? 'Meters' : 'Yards', compared(pref !== DISTANCE_UNITS_DEFAULT));
}

export function summarizeHaptics(enabled: boolean): RowCell {
  return ready(enabled ? 'On' : 'Off', compared(enabled !== HAPTICS_DEFAULT));
}

/**
 * Current value of one delivery key. A key the read didn't return (every live
 * row lacks push_announcements, and getNotificationPreferences never adds it)
 * was never stored, so it is at its default, not off.
 */
function channelValue(prefs: NotificationPrefsSource, key: DeliveryNotificationKey): boolean {
  const stored = prefs[key];
  return typeof stored === 'boolean' ? stored : NOTIFICATION_DEFAULTS[key];
}

export function summarizeNotifications(
  prefs: Loadable<NotificationPrefsSource>,
  /** Coach only: the golf_coach_philosophy row that holds the weekly email switch. */
  digest?: Loadable<PhilosophySource | null>,
): RowCell {
  if (prefs.status !== 'ready') return unresolved(prefs.status, true);
  if (digest && digest.status !== 'ready') return unresolved(digest.status, true);

  let emailOn = 0;
  let emailTotal = 0;
  let pushOn = 0;
  let pushTotal = 0;
  let changed = false;
  for (const group of GOLF_NOTIFICATION_GROUPS) {
    const email = channelValue(prefs.data, group.emailKey);
    emailTotal += 1;
    if (email) emailOn += 1;
    if (email !== NOTIFICATION_DEFAULTS[group.emailKey]) changed = true;
    if (group.pushKey) {
      const push = channelValue(prefs.data, group.pushKey);
      pushTotal += 1;
      if (push) pushOn += 1;
      if (push !== NOTIFICATION_DEFAULTS[group.pushKey]) changed = true;
    }
  }
  if (digest?.status === 'ready') {
    const digestOn = digest.data ? digest.data.email_digest_enabled !== false : COACH_DIGEST_DEFAULT;
    emailTotal += 1;
    if (digestOn) emailOn += 1;
    if (digestOn !== COACH_DIGEST_DEFAULT) changed = true;
  }
  const quiet = prefs.data.quiet_mode === true;
  if (quiet !== NOTIFICATION_DEFAULTS.quiet_mode) changed = true;

  const value = quiet ? 'Quiet mode' : `Email ${emailOn}/${emailTotal} · Push ${pushOn}/${pushTotal}`;
  return ready(value, compared(changed));
}

const FORMAT_LABEL: Record<string, string> = { stroke_play: 'Stroke play', match_play: 'Match play' };
const HANDICAP_LABEL: Record<string, string> = { usga: 'USGA', world: 'WHS', none: 'No handicap' };
const TIMEZONE_LABEL: Record<string, string> = {
  'America/New_York': 'Eastern',
  'America/Chicago': 'Central',
  'America/Denver': 'Mountain',
  'America/Los_Angeles': 'Pacific',
  'America/Anchorage': 'Alaska',
  'Pacific/Honolulu': 'Hawaii',
};

/** The four values exactly as GolfScoringPanel resolves them (`|| fallback`). */
export function resolveScoring(row: TeamSettingsSource | null) {
  return {
    scoringFormat: row?.scoring_format || SCORING_DEFAULTS.scoringFormat,
    handicapSystem: row?.handicap_system || SCORING_DEFAULTS.handicapSystem,
    defaultTees: row?.default_tees || SCORING_DEFAULTS.defaultTees,
    timezone: row?.timezone || SCORING_DEFAULTS.timezone,
  };
}

export function summarizeScoring(source: Loadable<TeamSettingsSource | null>): RowCell {
  if (source.status !== 'ready') return unresolved(source.status, true);
  const v = resolveScoring(source.data);
  const d = SCORING_DEFAULTS;
  const parts = [FORMAT_LABEL[v.scoringFormat] ?? humanize(v.scoringFormat)];
  if (v.handicapSystem !== d.handicapSystem) parts.push(HANDICAP_LABEL[v.handicapSystem] ?? humanize(v.handicapSystem));
  if (v.defaultTees !== d.defaultTees) parts.push(`${capitalize(v.defaultTees)} tees`);
  if (v.timezone !== d.timezone) parts.push(TIMEZONE_LABEL[v.timezone] ?? v.timezone);
  return ready(parts.join(' · '), compared(parts.length > 1 || v.scoringFormat !== d.scoringFormat));
}

export function summarizeReminders(source: Loadable<TeamSettingsSource | null>): RowCell {
  if (source.status !== 'ready') return unresolved(source.status, true);
  // The same normaliser the panel and the cron use, so the row shows what
  // actually gets sent (clamped, ordering-checked), not the raw columns.
  const row: EventReminderRow | null = source.data;
  const s = resolveEventReminderSettings(row);
  const d = EVENT_REMINDER_DEFAULTS;
  const changed =
    s.enabled !== d.enabled || s.earlyHours !== d.earlyHours || s.lateMinutes !== d.lateMinutes;
  const value = s.enabled ? `${formatLead(s.earlyHours * 60)} & ${formatLead(s.lateMinutes)} before` : 'Off';
  return ready(value, compared(changed));
}

export function summarizeCoachHelm(source: Loadable<CoachHelmSource | null>): RowCell {
  if (source.status !== 'ready') return unresolved(source.status, true);
  const enabled = source.data?.enabled ?? COACHHELM_ENABLED_DEFAULT;
  return ready(enabled ? 'On' : 'Off', compared(enabled !== COACHHELM_ENABLED_DEFAULT));
}

const SENSITIVITY_LABEL: Record<string, string> = {
  aggressive: 'Aggressive',
  balanced: 'Balanced',
  conservative: 'Conservative',
};

/** Sensitivity + the ten alert switches. Priorities and thresholds are left out on purpose. */
export function summarizeAlerts(source: Loadable<PhilosophySource | null>): RowCell {
  if (source.status !== 'ready') return unresolved(source.status, true);
  const row = source.data;
  const sensitivity = row?.alert_sensitivity ?? PHILOSOPHY_DEFAULTS.alertSensitivity;
  let on = 0;
  let changed = sensitivity !== PHILOSOPHY_DEFAULTS.alertSensitivity;
  for (const column of ALERT_COLUMNS) {
    const value = row ? row[column] : ALERT_COLUMN_DEFAULTS[column];
    if (value) on += 1;
    if (value !== ALERT_COLUMN_DEFAULTS[column]) changed = true;
  }
  const label = SENSITIVITY_LABEL[sensitivity] ?? capitalize(sensitivity);
  return ready(`${label} · ${on}/${ALERT_COLUMNS.length} on`, compared(changed));
}

/** Rows with no default: plain values, "Not set" when empty. */
export function plainValue(value: string | null | undefined, emptyLabel = 'Not set'): RowCell {
  const trimmed = value?.trim();
  return trimmed ? ready(trimmed, NO_MARK) : ready(emptyLabel, NO_MARK, 'muted');
}

export function summarizeTeamField(
  source: Loadable<TeamSource | null>,
  pick: (team: TeamSource) => string | null,
  tone: ValueTone = 'default',
): RowCell {
  if (source.status !== 'ready') return unresolved(source.status, false);
  const value = source.data ? pick(source.data)?.trim() : null;
  return value ? ready(value, NO_MARK, tone) : ready('Not set', NO_MARK, 'muted');
}

export function summarizeGolfDetails(
  player: { handicap: number | null; handicap_index: number | null } | undefined,
): RowCell {
  // useSettingsProfile leaves playerData undefined when the read failed or the
  // row is missing, so this can't be told apart from an empty profile.
  if (!player) return ready('Unavailable', NO_MARK, 'muted');
  if (player.handicap_index != null) return ready(`Index ${formatHandicap(player.handicap_index)}`, NO_MARK);
  if (player.handicap != null) return ready(`Handicap ${formatHandicap(player.handicap)}`, NO_MARK);
  return ready('Not set', NO_MARK, 'muted');
}

/* ── the card ───────────────────────────────────────────────────────────────── */

export type RowId =
  | 'name'
  | 'email'
  | 'password'
  | 'appearance'
  | 'units'
  | 'haptics'
  | 'notifications'
  | 'category-alerts'
  | 'scoring'
  | 'reminders'
  | 'team'
  | 'invite'
  | 'coachhelm'
  | 'alerts'
  | 'golf-details'
  | 'membership';

export type RowAction =
  /** Opens a Sheet holding the row's panel. `guarded` = the panel has an explicit Save. */
  | { kind: 'sheet'; guarded: boolean }
  /** A full page elsewhere (its editor isn't a panel). */
  | { kind: 'link'; href: string; destination: string };

export interface ScorecardRow {
  id: RowId;
  label: string;
  cell: RowCell;
  action: RowAction;
}

export interface ScorecardNine {
  key: 'out' | 'in';
  label: 'Out' | 'In';
  descriptor: string;
  rows: ScorecardRow[];
  /** Shown in place of rows that can't exist yet (a coach with no active team). */
  note?: string;
}

export interface SetupCardInput {
  role: 'coach' | 'player';
  name: string;
  email: string;
  isNative: boolean;
  hasTeam: boolean;
  hasCoachId: boolean;
  hasPlayerId: boolean;
  appearance: AppearanceValues;
  distanceUnits: DistancePreference;
  hapticsEnabled: boolean;
  notifications: Loadable<NotificationPrefsSource>;
  philosophy: Loadable<PhilosophySource | null>;
  teamSettings: Loadable<TeamSettingsSource | null>;
  team: Loadable<TeamSource | null>;
  coachHelm: Loadable<CoachHelmSource | null>;
  player?: { handicap: number | null; handicap_index: number | null };
  /** Player: the team they're on, or null. */
  currentTeamName?: string | null;
}

const sheet = (guarded: boolean): RowAction => ({ kind: 'sheet', guarded });

export const COACHING_INTELLIGENCE_HREF = '/golf/dashboard/settings/coaching-intelligence';
export const PLAYER_CATEGORY_NOTIFICATIONS_HREF = '/golf/dashboard/settings/notifications';

export function buildSetupCard(input: SetupCardInput): ScorecardNine[] {
  const isCoach = input.role === 'coach';

  const out: ScorecardRow[] = [
    { id: 'name', label: 'Name & photo', cell: plainValue(input.name), action: sheet(true) },
    { id: 'email', label: 'Email', cell: plainValue(input.email), action: sheet(true) },
    { id: 'password', label: 'Password', cell: ready('Hidden', NO_MARK, 'secret'), action: sheet(true) },
    { id: 'appearance', label: 'Appearance', cell: summarizeAppearance(input.appearance), action: sheet(false) },
    { id: 'units', label: 'Distance units', cell: summarizeDistanceUnits(input.distanceUnits), action: sheet(false) },
  ];
  // HapticsPanel renders nothing off-device, so the row only exists in the app.
  if (input.isNative) {
    out.push({ id: 'haptics', label: 'Haptics', cell: summarizeHaptics(input.hapticsEnabled), action: sheet(false) });
  }
  out.push({
    id: 'notifications',
    label: 'Notifications',
    cell: summarizeNotifications(input.notifications, isCoach && input.hasCoachId ? input.philosophy : undefined),
    action: sheet(false),
  });
  if (!isCoach) {
    // golf_player_notification_state has its own page and its own defaults
    // (brief B1/B2), so this row links out and carries no mark.
    // No value: that page's state isn't read here, and a description in the
    // value column would break the rule that the right edge is configuration.
    out.push({
      id: 'category-alerts',
      label: 'Insight & goal alerts',
      cell: ready('', NO_MARK),
      action: { kind: 'link', href: PLAYER_CATEGORY_NOTIFICATIONS_HREF, destination: 'per-category notifications' },
    });
  }

  const inRows: ScorecardRow[] = [];
  let note: string | undefined;
  if (isCoach) {
    if (input.hasTeam) {
      inRows.push(
        { id: 'scoring', label: 'Scoring & format', cell: summarizeScoring(input.teamSettings), action: sheet(true) },
        { id: 'reminders', label: 'Event reminders', cell: summarizeReminders(input.teamSettings), action: sheet(true) },
        {
          id: 'team',
          label: 'Team & organization',
          cell: summarizeTeamField(input.team, (t) => t.name),
          action: sheet(true),
        },
        {
          id: 'invite',
          label: 'Invite code',
          cell: summarizeTeamField(input.team, (t) => t.join_code, 'code'),
          action: sheet(false),
        },
      );
    } else {
      note = 'Team settings appear once you have an active team.';
    }
    if (input.hasCoachId) {
      inRows.push(
        { id: 'coachhelm', label: 'CoachHelm on dashboards', cell: summarizeCoachHelm(input.coachHelm), action: sheet(false) },
        {
          id: 'alerts',
          label: 'CoachHelm alerts',
          cell: summarizeAlerts(input.philosophy),
          action: { kind: 'link', href: COACHING_INTELLIGENCE_HREF, destination: 'Coaching Intelligence' },
        },
      );
    }
  } else if (input.hasPlayerId) {
    inRows.push(
      { id: 'golf-details', label: 'Golf details', cell: summarizeGolfDetails(input.player), action: sheet(true) },
      {
        id: 'membership',
        label: 'Team membership',
        cell: input.currentTeamName ? plainValue(input.currentTeamName) : ready('No team', NO_MARK, 'muted'),
        action: sheet(false),
      },
    );
  }

  return [
    { key: 'out', label: 'Out', descriptor: 'You', rows: out },
    {
      key: 'in',
      label: 'In',
      descriptor: isCoach ? 'Team & CoachHelm' : 'Golf & team',
      rows: inRows,
      note,
    },
  ];
}

/* ── the total ──────────────────────────────────────────────────────────────── */

export interface MarkTally {
  /** N: rows whose current value differs from their default. */
  changed: number;
  /** M: rows that have a default AND whose value is known. */
  compared: number;
  /** Rows with a default whose value is still loading. */
  pending: number;
  /** Rows with a default whose value couldn't be read (left out of N and M). */
  unknown: number;
}

export function tallyMarks(rows: readonly { cell: RowCell }[]): MarkTally {
  const tally: MarkTally = { changed: 0, compared: 0, pending: 0, unknown: 0 };
  for (const { cell } of rows) {
    switch (cell.mark.kind) {
      case 'compared':
        tally.compared += 1;
        if (cell.mark.changed) tally.changed += 1;
        break;
      case 'pending':
        tally.pending += 1;
        break;
      case 'unknown':
        tally.unknown += 1;
        break;
      default:
        break;
    }
  }
  return tally;
}

/** The ten alert switches the Coaching Intelligence page counts ("7/10 on"). */
export const ALERT_SWITCH_COUNT = ALERT_GROUPS.reduce((n, group) => n + group.alerts.length, 0);
