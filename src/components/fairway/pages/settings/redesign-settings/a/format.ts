/**
 * Direction A · the right-edge values of the settings index.
 *
 * Pure module. Each function turns one read into the short value a row shows,
 * and each keeps three "no value" cases apart, because they mean different
 * things to the person reading the column:
 *
 *   read failed   → "Couldn’t load"  (we don't know; the drill-in has a retry)
 *   no row        → "Default"        (nobody configured it; defaults apply)
 *   null column   → "Not set"        (a row exists, this field is empty)
 *
 * Counts are computed over exactly what the drill-in renders, so the number on
 * the index is the number the reader finds after tapping.
 */

import {
  DELIVERY_NOTIFICATION_GROUPS,
  type DeliveryNotificationPreferences,
} from '@/lib/coachhelm/v3/notifications/types';
import {
  NOTIFICATION_CATEGORIES,
  type ChannelPref,
  type PrefsByCategory,
} from '@/lib/coachhelm/v3/notifications/router';
import { ALERT_GROUPS, type CoachPhilosophy } from '@/lib/coachhelm/types';
import {
  formatLead,
  resolveEventReminderSettings,
  type EventReminderRow,
} from '@/lib/golf/event-reminder-settings';
import { formatHandicap } from '@/components/fairway/pages/roster/roster-helpers';
import type { GolfTheme } from '@/lib/golf/theme';
import type { DistancePreference } from '@/lib/golf/distance-units';

/* ── the value token ───────────────────────────────────────────────────────── */

export interface RowValue {
  text: string;
  /** `muted` = not a configured value (default, unset, failed read). */
  muted?: boolean;
  /** Tabular figures, for values that carry counts, times or codes. */
  numeric?: boolean;
}

/** A read that failed, found no row, or returned one. Null is not zero. */
export type Read<T> = { state: 'error' } | { state: 'missing' } | { state: 'ok'; data: T };

export const COULD_NOT_LOAD: RowValue = { text: 'Couldn’t load', muted: true };
export const DEFAULT_VALUE: RowValue = { text: 'Default', muted: true };
export const NOT_SET: RowValue = { text: 'Not set', muted: true };

/* ── You ───────────────────────────────────────────────────────────────────── */

export function accountValue(email: string | null | undefined): RowValue {
  return email ? { text: email } : NOT_SET;
}

const THEME_LABEL: Record<GolfTheme, string> = { light: 'Light', dark: 'Dark', system: 'System' };
const UNITS_LABEL: Record<DistancePreference, string> = { yards: 'Yards', meters: 'Meters' };

/** Device-local (localStorage) prefs: theme and distance units. */
export function deviceValue(theme: GolfTheme, units: DistancePreference): RowValue {
  return { text: `${THEME_LABEL[theme] ?? theme} · ${UNITS_LABEL[units] ?? units}` };
}

/* ── Notifications ─────────────────────────────────────────────────────────── */

/**
 * The groups NotificationsPanel renders for golf. It drops the two
 * recruiting-only categories (FairwaySettingsGeneral GOLF_HIDDEN_NOTIFICATION_IDS,
 * not exported), so the same filter is repeated here.
 */
const GOLF_DELIVERY_GROUPS = DELIVERY_NOTIFICATION_GROUPS.filter(
  (g) => g.id !== 'pipeline' && g.id !== 'profile_views',
);

/**
 * users.notification_preferences, via getNotificationPreferences (defaults
 * merged). Counted the way the panel's switches read (`checked={prefs[key]}`),
 * so an absent key counts as off, exactly as the reader will see it.
 */
export function deliveryValue(read: Read<Partial<DeliveryNotificationPreferences>>): RowValue {
  if (read.state !== 'ok') return COULD_NOT_LOAD;
  const prefs = read.data;
  if (prefs.quiet_mode) return { text: 'Quiet mode' };
  const email = GOLF_DELIVERY_GROUPS.filter((g) => !!prefs[g.emailKey]).length;
  const pushGroups = GOLF_DELIVERY_GROUPS.filter((g) => g.pushKey);
  const push = pushGroups.filter((g) => (g.pushKey ? !!prefs[g.pushKey] : false)).length;
  return {
    text: `Email ${email}/${GOLF_DELIVERY_GROUPS.length} · Push ${push}/${pushGroups.length}`,
    numeric: true,
  };
}

/**
 * golf_coach_philosophy.email_digest_enabled. No row reads as on: the weekly
 * coach email and NotificationsPanel both treat a missing row as enabled.
 */
export function digestValue(read: Read<{ email_digest_enabled: boolean }>): RowValue {
  if (read.state === 'error') return COULD_NOT_LOAD;
  if (read.state === 'missing') return { text: 'On' };
  return { text: read.data.email_digest_enabled ? 'On' : 'Off' };
}

/**
 * The categories FairwaySettingsNotifications renders (its CATEGORY_GROUPS
 * leave out weekly_digest) and the channel default it shows for a category
 * with no stored pref. Neither is exported there, so both are mirrored here.
 */
const PLAYER_MATRIX_CATEGORIES = NOTIFICATION_CATEGORIES.filter((c) => c !== 'weekly_digest');
const PLAYER_MATRIX_DEFAULT: ChannelPref = { push: false, email: false, in_app: true };

/** golf_player_notification_state (prefs, quiet_mode). No row = nothing chosen yet. */
export function categoryValue(read: Read<{ prefs: PrefsByCategory; quiet_mode: boolean }>): RowValue {
  if (read.state === 'error') return COULD_NOT_LOAD;
  if (read.state === 'missing') return DEFAULT_VALUE;
  if (read.data.quiet_mode) return { text: 'Quiet mode' };
  const prefs = read.data.prefs ?? {};
  const cell = (c: (typeof PLAYER_MATRIX_CATEGORIES)[number]) => prefs[c] ?? PLAYER_MATRIX_DEFAULT;
  const total = PLAYER_MATRIX_CATEGORIES.length;
  const push = PLAYER_MATRIX_CATEGORIES.filter((c) => cell(c).push).length;
  const email = PLAYER_MATRIX_CATEGORIES.filter((c) => cell(c).email).length;
  return { text: `Push ${push}/${total} · Email ${email}/${total}`, numeric: true };
}

/* ── Team (coach) ──────────────────────────────────────────────────────────── */

export interface TeamSettingsSummaryRow extends EventReminderRow {
  scoring_format: string | null;
  handicap_system: string | null;
}

const FORMAT_LABEL: Record<string, string> = { stroke_play: 'Stroke play', match_play: 'Match play' };
const HANDICAP_LABEL: Record<string, string> = { usga: 'USGA', world: 'WHS', none: 'No handicap' };

function humanize(raw: string): string {
  const words = raw.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** golf_team_settings.scoring_format + handicap_system. 5 of 10 live teams have no row. */
export function scoringValue(read: Read<TeamSettingsSummaryRow>): RowValue {
  if (read.state === 'error') return COULD_NOT_LOAD;
  if (read.state === 'missing') return DEFAULT_VALUE;
  const { scoring_format: format, handicap_system: handicap } = read.data;
  const parts = [
    format ? (FORMAT_LABEL[format] ?? humanize(format)) : null,
    handicap ? (HANDICAP_LABEL[handicap] ?? humanize(handicap)) : null,
  ].filter((p): p is string => !!p);
  return parts.length ? { text: parts.join(' · ') } : NOT_SET;
}

/**
 * golf_team_settings.event_reminder_*. Normalised with the same resolver the
 * reminder cron and EventRemindersPanel use, and worded with the same
 * formatLead, so "1 day · 1 hour" here is what the panel describes.
 */
export function remindersValue(read: Read<TeamSettingsSummaryRow>): RowValue {
  if (read.state === 'error') return COULD_NOT_LOAD;
  if (read.state === 'missing') return DEFAULT_VALUE;
  const resolved = resolveEventReminderSettings(read.data);
  if (!resolved.enabled) return { text: 'Off' };
  return { text: `${formatLead(resolved.earlyHours * 60)} · ${formatLead(resolved.lateMinutes)}`, numeric: true };
}

/** golf_teams.season (free text; five spellings live, so it is shown as typed). */
export function seasonValue(read: Read<{ season: string | null }>): RowValue {
  if (read.state === 'error') return COULD_NOT_LOAD;
  if (read.state === 'missing') return NOT_SET;
  const season = read.data.season?.trim();
  return season ? { text: season, numeric: true } : NOT_SET;
}

/** golf_teams.join_code (NOT NULL). */
export function inviteValue(read: Read<{ join_code: string }>): RowValue {
  if (read.state !== 'ok') return read.state === 'error' ? COULD_NOT_LOAD : NOT_SET;
  return read.data.join_code ? { text: read.data.join_code, numeric: true } : NOT_SET;
}

/* ── CoachHelm (coach) ─────────────────────────────────────────────────────── */

/** CoachPhilosophy alert key → golf_coach_philosophy column (useCoachPhilosophy's tsToDb). */
export const ALERT_COLUMNS = {
  alertScoringDecline: 'alert_scoring_decline',
  alertStatRegression: 'alert_stat_regression',
  alertTournamentPressure: 'alert_tournament_pressure',
  alertPlateau: 'alert_plateau',
  alertBubblePlayer: 'alert_bubble_player',
  alertSurgePlayer: 'alert_surge_player',
  alertStreaks: 'alert_streaks',
  alertRecurringWeakness: 'alert_recurring_weakness',
  alertClosingHoles: 'alert_closing_holes',
  alertPar3Issues: 'alert_par_3_issues',
} as const satisfies Partial<Record<keyof CoachPhilosophy, string>>;

type AlertColumn = (typeof ALERT_COLUMNS)[keyof typeof ALERT_COLUMNS];

export type PhilosophySummaryRow = Record<AlertColumn, boolean> & {
  alert_sensitivity: string | null;
  email_digest_enabled: boolean;
};

const SENSITIVITY_LABEL: Record<string, string> = {
  aggressive: 'Aggressive',
  balanced: 'Balanced',
  conservative: 'Conservative',
};

/**
 * The Active alerts count Coaching Intelligence shows ("7/10 on"), over the
 * same ALERT_GROUPS keys, plus the sensitivity preset when one is stored.
 * No row → "Default": 8 of 22 coaches have never had one.
 */
export function alertsValue(read: Read<PhilosophySummaryRow>): RowValue {
  if (read.state === 'error') return COULD_NOT_LOAD;
  if (read.state === 'missing') return DEFAULT_VALUE;
  const keys = ALERT_GROUPS.flatMap((g) => g.alerts.map((a) => a.key));
  const on = keys.filter((key) => {
    const column = (ALERT_COLUMNS as Partial<Record<keyof CoachPhilosophy, AlertColumn>>)[key];
    return column ? read.data[column] === true : false;
  }).length;
  const sensitivity = read.data.alert_sensitivity;
  const preset = sensitivity ? (SENSITIVITY_LABEL[sensitivity] ?? humanize(sensitivity)) : null;
  return { text: preset ? `${on}/${keys.length} on · ${preset}` : `${on}/${keys.length} on`, numeric: true };
}

/**
 * golf_coachhelm_settings.enabled. No row (6 of 22 coaches) and a null column
 * both read as on: the CoachHelm gate resolves `enabled ?? true`.
 */
export function dashboardsValue(read: Read<{ enabled: boolean | null }>): RowValue {
  if (read.state === 'error') return COULD_NOT_LOAD;
  if (read.state === 'missing') return { text: 'On' };
  return { text: read.data.enabled === false ? 'Off' : 'On' };
}

/* ── Golf (player) ─────────────────────────────────────────────────────────── */

/** golf_players.handicap_index for display: "scratch" at 0, "+1.2" for a plus index. */
export function formatHandicapIndex(index: number): string {
  const formatted = formatHandicap(index);
  return formatted === 'scratch' ? 'Scratch' : formatted;
}

/**
 * `playerData` undefined means the golf_players read failed (the settings
 * profile swallows that error), which is not the same as an unset index.
 */
export function golfDetailsValue(
  playerData: { handicap_index: number | null } | undefined,
): RowValue {
  if (!playerData) return COULD_NOT_LOAD;
  if (playerData.handicap_index == null) return { text: 'Index not set', muted: true };
  const formatted = formatHandicapIndex(playerData.handicap_index);
  return formatted === 'Scratch' ? { text: formatted } : { text: `Index ${formatted}`, numeric: true };
}

/** The player's team, from the settings profile; a failed team read is not "no team". */
export function membershipValue(teamName: string | null | undefined, hasTeamId: boolean): RowValue {
  if (teamName) return { text: teamName };
  return hasTeamId ? COULD_NOT_LOAD : { text: 'No team', muted: true };
}
