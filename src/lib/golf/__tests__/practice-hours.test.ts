import { describe, expect, it } from 'vitest';
import { checkHoursAdjustment, checkHoursSettings, settingsFromRow, settingsToRow, type HoursSettings } from '../practice-hours';

/** F-03: the practice-hours settings and changes, checked as the held migration's own checks do, and read back safely. */
const base: HoursSettings = { division: 'd1', autonomy: false, weekStartsOn: 1, fall: null, spring: null, custom: { day: null, week: null, daysOff: 1 } };

describe('checkHoursSettings', () => {
  it('passes the defaults and declared seasons that do not overlap', () => {
    expect(checkHoursSettings(base, null)).toBeNull();
    expect(checkHoursSettings({ ...base, fall: { from: '2026-08-24', to: '2026-11-15' }, spring: { from: '2027-01-25', to: '2027-05-30' } }, 3)).toBeNull();
  });

  it('names the first problem and its field', () => {
    expect(checkHoursSettings({ ...base, fall: { from: '2026-08-24', to: '' } }, null)?.field).toBe('fall');
    expect(checkHoursSettings({ ...base, spring: { from: '2027-05-30', to: '2027-01-25' } }, null)?.message).toBe(
      'The spring season’s last day is before its first.',
    );
    expect(checkHoursSettings({ ...base, spring: { from: '2026-02-30', to: '2027-01-25' } }, null)?.field).toBe('spring');
    expect(checkHoursSettings({ ...base, spring: { from: '2026-01-01', to: '2027-06-01' } }, null)?.message).toBe('The spring season is longer than a year.');
    expect(checkHoursSettings({ ...base, weekStartsOn: 7 }, null)?.field).toBe('weekStartsOn');
    expect(checkHoursSettings({ ...base, division: 'custom', custom: { day: 6, week: 4, daysOff: 1 } }, null)?.message).toBe(
      'The week’s limit is less than one day’s.',
    );
    expect(checkHoursSettings({ ...base, division: 'custom', custom: { day: null, week: 170, daysOff: 1 } }, null)?.field).toBe('week');
    expect(checkHoursSettings({ ...base, division: 'custom', custom: { day: null, week: null, daysOff: 8 } }, null)?.field).toBe('daysOff');
    expect(checkHoursSettings(base, 0)?.field).toBe('untimed');
    expect(checkHoursSettings(base, 13)?.field).toBe('untimed');
    // Custom limits are only checked for Custom (another association ignores them).
    expect(checkHoursSettings({ ...base, custom: { day: 99, week: null, daysOff: 1 } }, null)).toBeNull();
  });
});

describe('checkHoursAdjustment', () => {
  it('allows 0 to 24 hours and a note of up to 280 characters', () => {
    expect(checkHoursAdjustment({ counted: true, hours: 0, note: null })).toBeNull();
    expect(checkHoursAdjustment({ counted: true, hours: 24.5, note: null })?.field).toBe('hours');
    expect(checkHoursAdjustment({ counted: false, hours: null, note: 'x'.repeat(281) })?.field).toBe('note');
  });
});

describe('the settings row', () => {
  it('round-trips, and a stored value the checks would refuse falls back to its default', () => {
    const s: HoursSettings = {
      ...base,
      division: 'custom',
      autonomy: true,
      weekStartsOn: 0,
      spring: { from: '2027-01-25', to: '2027-05-30' },
      custom: { day: 4.5, week: 18, daysOff: 2 },
    };
    const row = settingsToRow('t', s, 2.5, 'u');
    // Autonomy is Division I's alone.
    expect(row.autonomy).toBe(false);
    expect(settingsFromRow(row)).toEqual({ settings: { ...s, autonomy: false }, untimedHours: 2.5 });
    // numeric arrives as text from PostgREST.
    expect(settingsFromRow({ ...row, custom_day_hours: '4.50', untimed_hours: null }).settings.custom.day).toBe(4.5);
    expect(settingsFromRow({ ...row, division: 'ncaa', week_starts_on: 9, fall_from: '2026-09-01', fall_to: null }).settings).toMatchObject({
      division: 'd1',
      weekStartsOn: 1,
      fall: null,
    });
  });
});
