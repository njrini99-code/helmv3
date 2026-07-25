/**
 * ============================================================================
 * Per-team event reminder lead times
 * ----------------------------------------------------------------------------
 * Shared by the cron that SENDS reminders (`/api/cron/event-reminders`) and the
 * settings panel that CONFIGURES them, so the two can't drift on what's legal
 * or on how a lead time is worded.
 *
 * THE SLOT MODEL. Every event gets at most two reminders: an EARLY one and a
 * LATE one. Those two slots are identified in the database by the
 * `golf_calendar_notifications.notification_type` values
 * `'event_reminder_24h'` / `'event_reminder_1h'` — historical names that are
 * now slot identifiers, NOT literal durations. Keeping them preserves the
 * UNIQUE (event_id, user_id, notification_type) idempotency key and every
 * already-sent row. Nothing a coach or player reads renders those strings; all
 * user-facing copy is generated from the team's actual lead time.
 * ========================================================================== */

/** Defaults ARE the constants these settings replaced — see migration 20260725150000. */
export const EVENT_REMINDER_DEFAULTS = {
  enabled: true,
  /** Early reminder lead, in hours. Was `REMINDER_24H_MS`. */
  earlyHours: 24,
  /** Late reminder lead, in minutes. Was `REMINDER_1H_MS`. */
  lateMinutes: 60,
} as const;

/**
 * Must stay in step with the CHECK constraints in migration 20260725150000.
 *
 * The late MINIMUM is 60 minutes, and that is a hard constraint of the delivery
 * mechanism rather than a taste call: the cron ticks hourly, so the send window
 * (`lead + REMINDER_WINDOW_MARGIN_MS`) has to be wider than the 60-minute gap
 * between ticks or an event can pass clean through it and never be reminded.
 * 60 + 15 = 75 minutes is the narrowest window that can't miss. Offering a
 * 15-minute reminder we cannot actually deliver on time would be worse than not
 * offering it.
 */
export const EVENT_REMINDER_RANGES = {
  earlyHours: { min: 2, max: 168, step: 1 },
  lateMinutes: { min: 60, max: 720, step: 15 },
} as const;

export interface TeamEventReminderSettings {
  enabled: boolean;
  earlyHours: number;
  lateMinutes: number;
}

export const EVENT_REMINDER_FALLBACK: TeamEventReminderSettings = {
  enabled: EVENT_REMINDER_DEFAULTS.enabled,
  earlyHours: EVENT_REMINDER_DEFAULTS.earlyHours,
  lateMinutes: EVENT_REMINDER_DEFAULTS.lateMinutes,
};

/** Gap between cron invocations (`0 * * * *` in vercel.json). */
export const CRON_TICK_MS = 60 * 60 * 1000;

/**
 * Extra width on the send window beyond the configured lead.
 *
 * An event is reminded while it sits inside `(now, now + lead + MARGIN]`. Since
 * ticks are `CRON_TICK_MS` apart, the FIRST tick to see an event inside that
 * range is the one where it is between `MARGIN` and `MARGIN + CRON_TICK_MS`
 * short of the lead — so a reminder lands up to 15 minutes early, never late.
 *
 * At the default 60-minute late lead this reproduces the old `REMINDER_1H_MS`
 * constant exactly (75 minutes). At the default 24h early lead the window is
 * 24h15m where the old constant was a flat 25h, so the early reminder now lands
 * up to 45 minutes closer to the event — still "about a day before", and
 * strictly more accurate to what the setting says.
 *
 * Every legal lead keeps `lead + MARGIN > CRON_TICK_MS`; see the range
 * minimums above and the guard in event-reminder-settings.test.ts.
 */
export const REMINDER_WINDOW_MARGIN_MS = 15 * 60 * 1000;

/** Widest look-ahead any team can configure — the early range's ceiling. */
export const MAX_REMINDER_LEAD_MS =
  EVENT_REMINDER_RANGES.earlyHours.max * 60 * 60 * 1000 + REMINDER_WINDOW_MARGIN_MS;

/** Row shape as stored on `golf_team_settings`. Every column is nullable here
 *  because a team may have no settings row at all, and because this code has to
 *  survive running against a database where the migration hasn't landed yet. */
export interface EventReminderRow {
  event_reminders_enabled?: boolean | null;
  event_reminder_early_hours?: number | null;
  event_reminder_late_minutes?: number | null;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Normalise a `golf_team_settings` row into usable lead times.
 *
 * Clamps rather than rejects: an out-of-range value (hand-written SQL, a row
 * written before the CHECK landed) should still produce a reminder at the
 * nearest legal lead, not silently stop reminding a team.
 */
export function resolveEventReminderSettings(
  row: EventReminderRow | null | undefined,
): TeamEventReminderSettings {
  if (!row) return EVENT_REMINDER_FALLBACK;

  const earlyHours = clampInt(
    row.event_reminder_early_hours,
    EVENT_REMINDER_DEFAULTS.earlyHours,
    EVENT_REMINDER_RANGES.earlyHours.min,
    EVENT_REMINDER_RANGES.earlyHours.max,
  );
  const lateMinutes = clampInt(
    row.event_reminder_late_minutes,
    EVENT_REMINDER_DEFAULTS.lateMinutes,
    EVENT_REMINDER_RANGES.lateMinutes.min,
    EVENT_REMINDER_RANGES.lateMinutes.max,
  );

  return {
    // `null` (column absent / never set) means "on" — matching the DB default
    // and the pre-setting behaviour. Only an explicit `false` disables.
    enabled: row.event_reminders_enabled !== false,
    earlyHours,
    // Enforce the ordering constraint in code too. If a row somehow holds a
    // late lead at or beyond the early one, the "starting soon" reminder would
    // fire first and read as nonsense; fall back rather than send that.
    lateMinutes:
      lateMinutes < earlyHours * 60 ? lateMinutes : EVENT_REMINDER_DEFAULTS.lateMinutes,
  };
}

/**
 * Human wording for a lead time — used in reminder copy and in the settings UI
 * so both describe the same setting the same way.
 *
 * Whole days and whole hours read as such; anything else stays in its own unit.
 * "1 day" beats "24 hours" for a coach scanning a settings row, and "90 minutes"
 * beats "1.5 hours".
 */
export function formatLead(minutes: number): string {
  if (minutes % (60 * 24) === 0) {
    const days = minutes / (60 * 24);
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return `${minutes} minutes`;
}
