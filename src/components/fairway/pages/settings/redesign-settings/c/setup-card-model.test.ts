import { describe, expect, it } from 'vitest';
import {
  ALERT_COLUMNS,
  ALERT_COLUMN_DEFAULTS,
  ALERT_SWITCH_COUNT,
  APPEARANCE_DEFAULTS,
  buildSetupCard,
  LOADING,
  summarizeAlerts,
  summarizeAppearance,
  summarizeGolfDetails,
  summarizeNotifications,
  summarizeReminders,
  summarizeScoring,
  tallyMarks,
  type Loadable,
  type NotificationPrefsSource,
  type PhilosophySource,
  type SetupCardInput,
  type TeamSettingsSource,
} from './setup-card-model';

const ready = <T,>(data: T): Loadable<T> => ({ status: 'ready', data });

/**
 * What getNotificationPreferences() returns for a user on the live
 * users.notification_preferences column default (164 of 173 users): the stored
 * keys over the action's own fallbacks. push_announcements is absent.
 */
const COLUMN_DEFAULT_PREFS: NotificationPrefsSource = {
  email_messages: true,
  email_pipeline_updates: true,
  email_event_reminders: true,
  email_profile_views: false,
  email_announcements: true,
  email_task_reminders: true,
  email_coachhelm: true,
  push_messages: true,
  push_events: true,
  push_task_reminders: true,
  push_coachhelm: true,
  quiet_mode: false,
};

const DEFAULT_PHILOSOPHY: PhilosophySource = {
  ...ALERT_COLUMN_DEFAULTS,
  alert_sensitivity: 'balanced',
  email_digest_enabled: true,
};

function coachInput(overrides: Partial<SetupCardInput> = {}): SetupCardInput {
  return {
    role: 'coach',
    name: 'Pat Coach',
    email: 'pat@example.edu',
    isNative: false,
    hasTeam: true,
    hasCoachId: true,
    hasPlayerId: false,
    appearance: { ...APPEARANCE_DEFAULTS },
    distanceUnits: 'yards',
    hapticsEnabled: true,
    notifications: ready(COLUMN_DEFAULT_PREFS),
    philosophy: ready(null),
    teamSettings: ready(null),
    team: ready({ name: "Men's Golf", join_code: 'ABC123' }),
    coachHelm: ready(null),
    ...overrides,
  };
}

const allRows = (input: SetupCardInput) => buildSetupCard(input).flatMap((nine) => nine.rows);

describe('buildSetupCard + tallyMarks', () => {
  it('an all-default coach on the web reads 0 of 7 (missing settings rows are defaults)', () => {
    const tally = tallyMarks(allRows(coachInput()));
    expect(tally).toEqual({ changed: 0, compared: 7, pending: 0, unknown: 0 });
  });

  it('the live digest-off philosophy row (14 of 14) marks Notifications changed, nothing else', () => {
    const rows = allRows(coachInput({ philosophy: ready({ ...DEFAULT_PHILOSOPHY, email_digest_enabled: false }) }));
    const notifications = rows.find((r) => r.id === 'notifications')!;
    expect(notifications.cell.value).toBe('Email 5/6 · Push 5/5');
    expect(notifications.cell.mark).toEqual({ kind: 'compared', changed: true });
    expect(tallyMarks(rows)).toMatchObject({ changed: 1, compared: 7 });
  });

  it('numbers only rows that have a default; no-default rows carry no mark', () => {
    const rows = allRows(coachInput());
    const unmarked = rows.filter((r) => r.cell.mark.kind === 'none').map((r) => r.id);
    expect(unmarked).toEqual(['name', 'email', 'password', 'team', 'invite']);
  });

  it('a player reads 0 of 3 on the web and 0 of 4 in the app (haptics)', () => {
    const player = coachInput({ role: 'player', hasCoachId: false, hasTeam: false, hasPlayerId: true });
    expect(tallyMarks(allRows(player))).toMatchObject({ changed: 0, compared: 3 });
    expect(tallyMarks(allRows({ ...player, isNative: true }))).toMatchObject({ changed: 0, compared: 4 });
  });

  it('a coach with no active team keeps the CoachHelm rows and explains the rest', () => {
    const nines = buildSetupCard(coachInput({ hasTeam: false }));
    const inNine = nines.find((n) => n.key === 'in')!;
    expect(inNine.rows.map((r) => r.id)).toEqual(['coachhelm', 'alerts']);
    expect(inNine.note).toBeTruthy();
    expect(tallyMarks(nines.flatMap((n) => n.rows))).toMatchObject({ compared: 5 });
  });

  it('loading rows are pending and failed rows are left out of both N and M', () => {
    const loading = tallyMarks(allRows(coachInput({ teamSettings: LOADING })));
    expect(loading).toMatchObject({ compared: 5, pending: 2 });
    const failed = tallyMarks(allRows(coachInput({ philosophy: { status: 'error' } })));
    expect(failed).toMatchObject({ changed: 0, compared: 5, unknown: 2 });
  });

  it('a coach on the web gets six rows in each nine', () => {
    const nines = buildSetupCard(coachInput());
    expect(nines.map((n) => n.rows.length)).toEqual([6, 6]);
  });
});

describe('notifications', () => {
  it('counts a key the read never returns (push_announcements) at its default, not as off', () => {
    const cell = summarizeNotifications(ready(COLUMN_DEFAULT_PREFS));
    expect(cell.value).toBe('Email 5/5 · Push 5/5');
    expect(cell.mark).toEqual({ kind: 'compared', changed: false });
  });

  it('a muted email category reads as changed', () => {
    const cell = summarizeNotifications(ready({ ...COLUMN_DEFAULT_PREFS, email_messages: false }));
    expect(cell.value).toBe('Email 4/5 · Push 5/5');
    expect(cell.mark).toEqual({ kind: 'compared', changed: true });
  });

  it('ignores the recruiting keys the golf panel hides', () => {
    const cell = summarizeNotifications(ready({ ...COLUMN_DEFAULT_PREFS, email_profile_views: true }));
    expect(cell.mark).toEqual({ kind: 'compared', changed: false });
  });

  it('quiet mode leads the value', () => {
    const cell = summarizeNotifications(ready({ ...COLUMN_DEFAULT_PREFS, quiet_mode: true }));
    expect(cell.value).toBe('Quiet mode');
    expect(cell.mark).toEqual({ kind: 'compared', changed: true });
  });

  it('a coach with no philosophy row gets the digest at its default (on)', () => {
    const cell = summarizeNotifications(ready(COLUMN_DEFAULT_PREFS), ready(null));
    expect(cell.value).toBe('Email 6/6 · Push 5/5');
    expect(cell.mark).toEqual({ kind: 'compared', changed: false });
  });
});

describe('team settings', () => {
  const row = (patch: Partial<TeamSettingsSource>): TeamSettingsSource => ({
    scoring_format: null,
    handicap_system: null,
    default_tees: null,
    timezone: null,
    event_reminders_enabled: true,
    event_reminder_early_hours: 24,
    event_reminder_late_minutes: 60,
    ...patch,
  });

  it('scoring: null columns fall back like the panel does; changes are listed', () => {
    expect(summarizeScoring(ready(row({})))).toMatchObject({
      value: 'Stroke play',
      mark: { kind: 'compared', changed: false },
    });
    expect(
      summarizeScoring(ready(row({ scoring_format: 'match_play', timezone: 'America/Chicago' }))),
    ).toMatchObject({ value: 'Match play · Central', mark: { kind: 'compared', changed: true } });
  });

  it('reminders: defaults, a changed lead, and off', () => {
    expect(summarizeReminders(ready(null))).toMatchObject({
      value: '1 day & 1 hour before',
      mark: { kind: 'compared', changed: false },
    });
    expect(summarizeReminders(ready(row({ event_reminder_early_hours: 48 })))).toMatchObject({
      value: '2 days & 1 hour before',
      mark: { kind: 'compared', changed: true },
    });
    expect(summarizeReminders(ready(row({ event_reminders_enabled: false })))).toMatchObject({
      value: 'Off',
      mark: { kind: 'compared', changed: true },
    });
  });
});

describe('CoachHelm alerts', () => {
  it('covers exactly the switches the Coaching Intelligence page counts', () => {
    expect(ALERT_COLUMNS).toHaveLength(ALERT_SWITCH_COUNT);
  });

  it('a missing row is all default: balanced, 7 of 10 on', () => {
    expect(summarizeAlerts(ready(null))).toMatchObject({
      value: 'Balanced · 7/10 on',
      mark: { kind: 'compared', changed: false },
    });
  });

  it('a switched-on default-off alert reads as changed', () => {
    const cell = summarizeAlerts(ready({ ...DEFAULT_PHILOSOPHY, alert_plateau: true }));
    expect(cell).toMatchObject({ value: 'Balanced · 8/10 on', mark: { kind: 'compared', changed: true } });
  });
});

describe('device and profile rows', () => {
  it('appearance: the theme always shows; other changes are appended', () => {
    expect(summarizeAppearance({ ...APPEARANCE_DEFAULTS })).toMatchObject({
      value: 'System',
      mark: { kind: 'compared', changed: false },
    });
    expect(summarizeAppearance({ ...APPEARANCE_DEFAULTS, displayDensity: 'compact' })).toMatchObject({
      value: 'System · Compact',
      mark: { kind: 'compared', changed: true },
    });
    expect(summarizeAppearance({ ...APPEARANCE_DEFAULTS, theme: 'dark' })).toMatchObject({
      value: 'Dark',
      mark: { kind: 'compared', changed: true },
    });
  });

  it('golf details: plus handicaps, not set, and an unreadable profile', () => {
    expect(summarizeGolfDetails({ handicap: 3, handicap_index: -1.2 }).value).toBe('Index +1.2');
    expect(summarizeGolfDetails({ handicap: 5.2, handicap_index: null }).value).toBe('Handicap 5.2');
    expect(summarizeGolfDetails({ handicap: null, handicap_index: null })).toMatchObject({
      value: 'Not set',
      tone: 'muted',
    });
    expect(summarizeGolfDetails(undefined).value).toBe('Unavailable');
  });
});
