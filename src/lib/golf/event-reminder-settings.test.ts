import { describe, expect, it } from 'vitest';
import {
  resolveEventReminderSettings,
  formatLead,
  EVENT_REMINDER_DEFAULTS,
  EVENT_REMINDER_RANGES,
  EVENT_REMINDER_FALLBACK,
  MAX_REMINDER_LEAD_MS,
  REMINDER_WINDOW_MARGIN_MS,
  CRON_TICK_MS,
} from './event-reminder-settings';

/**
 * These settings drive real email and push. The guard that matters is that
 * nothing a database row can contain — missing, null, out of range, out of
 * order — can turn into a lead time that either spams a roster or silently
 * stops reminding them.
 */
describe('resolveEventReminderSettings', () => {
  it('falls back to the pre-setting constants for a missing row', () => {
    expect(resolveEventReminderSettings(null)).toEqual(EVENT_REMINDER_FALLBACK);
    expect(resolveEventReminderSettings(undefined)).toEqual(EVENT_REMINDER_FALLBACK);
    expect(resolveEventReminderSettings({})).toEqual(EVENT_REMINDER_FALLBACK);
  });

  it('treats null columns as "not migrated yet", not as "disabled"', () => {
    // A database where migration 20260725150000 has not landed returns nulls.
    // Reading that as "reminders off" would silently stop every reminder on
    // the platform between deploy and migration.
    expect(
      resolveEventReminderSettings({
        event_reminders_enabled: null,
        event_reminder_early_hours: null,
        event_reminder_late_minutes: null,
      }),
    ).toEqual(EVENT_REMINDER_FALLBACK);
  });

  it('only an explicit false disables', () => {
    expect(resolveEventReminderSettings({ event_reminders_enabled: false }).enabled).toBe(false);
    expect(resolveEventReminderSettings({ event_reminders_enabled: true }).enabled).toBe(true);
  });

  it('honours in-range values', () => {
    const s = resolveEventReminderSettings({
      event_reminders_enabled: true,
      event_reminder_early_hours: 72,
      event_reminder_late_minutes: 120,
    });
    expect(s).toEqual({ enabled: true, earlyHours: 72, lateMinutes: 120 });
  });

  it('clamps out-of-range values to the nearest legal lead rather than dropping them', () => {
    const high = resolveEventReminderSettings({
      event_reminder_early_hours: 10_000,
      event_reminder_late_minutes: 10_000,
    });
    expect(high.earlyHours).toBe(EVENT_REMINDER_RANGES.earlyHours.max);
    expect(high.lateMinutes).toBe(EVENT_REMINDER_RANGES.lateMinutes.max);

    // A 1-minute late lead is not deliverable on an hourly cron — clamp it up
    // to the narrowest window that can't miss, rather than promising it.
    const low = resolveEventReminderSettings({
      event_reminder_early_hours: 0,
      event_reminder_late_minutes: 1,
    });
    expect(low.earlyHours).toBe(EVENT_REMINDER_RANGES.earlyHours.min);
    expect(low.lateMinutes).toBe(EVENT_REMINDER_RANGES.lateMinutes.min);
  });

  it('rejects a late lead that would fire before the early one', () => {
    // 2h early / 300min (5h) late would deliver "Starting soon" three hours
    // before "In 2 hours". Fall back rather than send that.
    const s = resolveEventReminderSettings({
      event_reminder_early_hours: 2,
      event_reminder_late_minutes: 300,
    });
    expect(s.earlyHours).toBe(2);
    expect(s.lateMinutes).toBe(EVENT_REMINDER_DEFAULTS.lateMinutes);
    expect(s.lateMinutes).toBeLessThan(s.earlyHours * 60);
  });

  it('ignores unusable values', () => {
    const s = resolveEventReminderSettings({
      event_reminder_early_hours: Number.NaN,
      event_reminder_late_minutes: Number.POSITIVE_INFINITY,
    });
    expect(s.earlyHours).toBe(EVENT_REMINDER_DEFAULTS.earlyHours);
    expect(s.lateMinutes).toBe(EVENT_REMINDER_DEFAULTS.lateMinutes);
  });
});

describe('reminder window sizing', () => {
  /**
   * THE INVARIANT THAT MATTERS. An event is reminded while it is inside
   * `(now, now + lead + MARGIN]`. Ticks are CRON_TICK_MS apart, so if that
   * window is ever narrower than one tick, an event can pass straight through
   * it between two invocations and get no reminder at all — silently, with
   * nothing in the logs to explain it. Every legal lead must clear the tick.
   */
  it('the narrowest legal window is still wider than one cron tick', () => {
    const narrowestLate = EVENT_REMINDER_RANGES.lateMinutes.min * 60 * 1000;
    expect(narrowestLate + REMINDER_WINDOW_MARGIN_MS).toBeGreaterThan(CRON_TICK_MS);

    const narrowestEarly = EVENT_REMINDER_RANGES.earlyHours.min * 60 * 60 * 1000;
    expect(narrowestEarly + REMINDER_WINDOW_MARGIN_MS).toBeGreaterThan(CRON_TICK_MS);
  });

  it('reproduces the old 1h window exactly at the default late lead', () => {
    // The pre-setting constant was REMINDER_1H_MS = 75 minutes.
    const defaultLate = EVENT_REMINDER_DEFAULTS.lateMinutes * 60 * 1000;
    expect(defaultLate + REMINDER_WINDOW_MARGIN_MS).toBe(75 * 60 * 1000);
  });

  it('the shared look-ahead covers the widest configurable lead', () => {
    const widest = EVENT_REMINDER_RANGES.earlyHours.max * 60 * 60 * 1000;
    expect(MAX_REMINDER_LEAD_MS).toBeGreaterThan(widest);
  });
});

describe('formatLead', () => {
  it('prefers days, then hours, then minutes', () => {
    expect(formatLead(24 * 60)).toBe('1 day');
    expect(formatLead(72 * 60)).toBe('3 days');
    expect(formatLead(60)).toBe('1 hour');
    expect(formatLead(6 * 60)).toBe('6 hours');
    expect(formatLead(90)).toBe('90 minutes');
    expect(formatLead(15)).toBe('15 minutes');
  });
});
