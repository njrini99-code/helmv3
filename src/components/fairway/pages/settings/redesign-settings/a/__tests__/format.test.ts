/**
 * Direction A's right-edge values: every "no value" case stays distinct
 * (failed read vs no row vs unset field), and every count matches what the
 * drill-in renders.
 */
import { describe, expect, it } from 'vitest';
import {
  COULD_NOT_LOAD,
  DEFAULT_VALUE,
  NOT_SET,
  alertsValue,
  categoryValue,
  dashboardsValue,
  deliveryValue,
  digestValue,
  golfDetailsValue,
  inviteValue,
  membershipValue,
  remindersValue,
  scoringValue,
  seasonValue,
  type PhilosophySummaryRow,
} from '../format';

const ERROR = { state: 'error' } as const;
const MISSING = { state: 'missing' } as const;

const ALL_ALERTS_OFF = {
  alert_scoring_decline: false,
  alert_stat_regression: false,
  alert_tournament_pressure: false,
  alert_plateau: false,
  alert_bubble_player: false,
  alert_surge_player: false,
  alert_streaks: false,
  alert_recurring_weakness: false,
  alert_closing_holes: false,
  alert_par_3_issues: false,
};

describe('delivery (users.notification_preferences)', () => {
  it('counts the five golf groups, not the recruiting-only ones', () => {
    const prefs = {
      email_messages: true,
      email_event_reminders: true,
      email_announcements: false,
      email_task_reminders: true,
      email_coachhelm: true,
      // Recruiting-only groups NotificationsPanel hides for golf: not counted.
      email_pipeline_updates: true,
      email_profile_views: true,
      push_messages: false,
      push_events: true,
      push_task_reminders: true,
      push_coachhelm: true,
      quiet_mode: false,
    };
    expect(deliveryValue({ state: 'ok', data: prefs })).toEqual({
      text: 'Email 4/5 · Push 3/5',
      numeric: true,
    });
  });

  it('counts an absent key as off, as the panel switch shows it (push_announcements)', () => {
    const value = deliveryValue({ state: 'ok', data: { push_announcements: undefined } });
    expect(value.text).toBe('Email 0/5 · Push 0/5');
  });

  it('quiet mode wins, and a failed read is not a count', () => {
    expect(deliveryValue({ state: 'ok', data: { quiet_mode: true, email_messages: true } }).text).toBe('Quiet mode');
    expect(deliveryValue(ERROR)).toBe(COULD_NOT_LOAD);
  });
});

describe('player category matrix (golf_player_notification_state)', () => {
  it('no row is Default, not zero', () => {
    expect(categoryValue(MISSING)).toBe(DEFAULT_VALUE);
    expect(categoryValue(ERROR)).toBe(COULD_NOT_LOAD);
  });

  it('counts the nine rendered categories, filling gaps with the page default (in-app only)', () => {
    const value = categoryValue({
      state: 'ok',
      data: {
        quiet_mode: false,
        prefs: {
          round_review_ready: { push: true, email: true, in_app: true },
          goal_achieved: { push: true, email: false, in_app: true },
          // weekly_digest is not rendered by the matrix, so it never counts.
          weekly_digest: { push: true, email: true, in_app: true },
        },
      },
    });
    expect(value).toEqual({ text: 'Push 2/9 · Email 1/9', numeric: true });
  });

  it('quiet mode wins', () => {
    expect(categoryValue({ state: 'ok', data: { quiet_mode: true, prefs: {} } }).text).toBe('Quiet mode');
  });
});

describe('team settings (golf_team_settings)', () => {
  const row = {
    scoring_format: 'match_play',
    handicap_system: 'world',
    event_reminders_enabled: true,
    event_reminder_early_hours: 24,
    event_reminder_late_minutes: 60,
  };

  it('a missing row is Default for both scoring and reminders', () => {
    expect(scoringValue(MISSING)).toBe(DEFAULT_VALUE);
    expect(remindersValue(MISSING)).toBe(DEFAULT_VALUE);
  });

  it('labels format and handicap system, and says Not set only when both are empty', () => {
    expect(scoringValue({ state: 'ok', data: row }).text).toBe('Match play · WHS');
    expect(scoringValue({ state: 'ok', data: { ...row, handicap_system: null } }).text).toBe('Match play');
    expect(scoringValue({ state: 'ok', data: { ...row, scoring_format: null, handicap_system: null } })).toBe(NOT_SET);
  });

  it('words reminders with the panel’s own formatLead, and Off when disabled', () => {
    expect(remindersValue({ state: 'ok', data: row }).text).toBe('1 day · 1 hour');
    expect(
      remindersValue({ state: 'ok', data: { ...row, event_reminder_early_hours: 48, event_reminder_late_minutes: 90 } }).text,
    ).toBe('2 days · 90 minutes');
    expect(remindersValue({ state: 'ok', data: { ...row, event_reminders_enabled: false } }).text).toBe('Off');
    expect(remindersValue(ERROR)).toBe(COULD_NOT_LOAD);
  });
});

describe('team row (golf_teams)', () => {
  it('shows the season as typed and the join code', () => {
    const team = { state: 'ok' as const, data: { join_code: 'K7Q2MX', season: '2025-26', } };
    expect(seasonValue(team).text).toBe('2025-26');
    expect(inviteValue(team).text).toBe('K7Q2MX');
  });

  it('an empty season is Not set; a failed read is Couldn’t load', () => {
    expect(seasonValue({ state: 'ok', data: { season: '  ' } })).toBe(NOT_SET);
    expect(seasonValue(ERROR)).toBe(COULD_NOT_LOAD);
    expect(inviteValue(ERROR)).toBe(COULD_NOT_LOAD);
  });
});

describe('CoachHelm (golf_coach_philosophy, golf_coachhelm_settings)', () => {
  const philosophy: PhilosophySummaryRow = {
    ...ALL_ALERTS_OFF,
    alert_scoring_decline: true,
    alert_plateau: true,
    alert_par_3_issues: true,
    alert_sensitivity: 'balanced',
    email_digest_enabled: false,
  };

  it('counts the ten ALERT_GROUPS keys and names the preset', () => {
    expect(alertsValue({ state: 'ok', data: philosophy }).text).toBe('3/10 on · Balanced');
    expect(alertsValue({ state: 'ok', data: { ...philosophy, alert_sensitivity: null } }).text).toBe('3/10 on');
  });

  it('no philosophy row: alerts are Default, the weekly email is On (the cron treats it as enabled)', () => {
    expect(alertsValue(MISSING)).toBe(DEFAULT_VALUE);
    expect(digestValue(MISSING).text).toBe('On');
    expect(digestValue({ state: 'ok', data: philosophy }).text).toBe('Off');
  });

  it('dashboards: no row and a null column are On (gate resolves enabled ?? true)', () => {
    expect(dashboardsValue(MISSING).text).toBe('On');
    expect(dashboardsValue({ state: 'ok', data: { enabled: null } }).text).toBe('On');
    expect(dashboardsValue({ state: 'ok', data: { enabled: false } }).text).toBe('Off');
    expect(dashboardsValue(ERROR)).toBe(COULD_NOT_LOAD);
  });
});

describe('player golf profile (golf_players)', () => {
  it('a failed player read is not an unset index', () => {
    expect(golfDetailsValue(undefined)).toBe(COULD_NOT_LOAD);
    expect(golfDetailsValue({ handicap_index: null })).toEqual({ text: 'Index not set', muted: true });
  });

  it('formats a plus index with a leading + and zero as Scratch', () => {
    expect(golfDetailsValue({ handicap_index: 4.8 }).text).toBe('Index 4.8');
    expect(golfDetailsValue({ handicap_index: -1.2 }).text).toBe('Index +1.2');
    expect(golfDetailsValue({ handicap_index: 0 }).text).toBe('Scratch');
  });

  it('a failed team read is not "No team"', () => {
    expect(membershipValue('Stanford Men’s Golf', true).text).toBe('Stanford Men’s Golf');
    expect(membershipValue(null, true)).toBe(COULD_NOT_LOAD);
    expect(membershipValue(null, false)).toEqual({ text: 'No team', muted: true });
  });
});
