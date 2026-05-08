/**
 * Tests for src/lib/notifications/email.ts — `getUserNotificationPreferences`.
 *
 * Covers the .single() → .maybeSingle() swap (line 48):
 *   1. Row exists with valid notification_preferences JSON → returns parsed prefs.
 *   2. Row exists but notification_preferences is null → returns DEFAULT.
 *   3. Row missing entirely (maybeSingle returns { data: null, error: null })
 *      → returns DEFAULT and does NOT log an error.
 *   4. Database error returned → returns DEFAULT and logs the error.
 *
 * The supabase client is mocked with vitest's vi.fn() and chained
 * from/select/eq/maybeSingle methods (same pattern as
 * insight-notifier.test.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/lib/notifications/types';

// --- Module-level mock state ----------------------------------------------

type MaybeSingleResult = {
  data: { notification_preferences: unknown } | null;
  error: { message: string; code?: string } | null;
};

let maybeSingleResult: MaybeSingleResult = { data: null, error: null };

const maybeSingleSpy = vi.fn(async () => maybeSingleResult);
const eqSpy = vi.fn(() => ({ maybeSingle: maybeSingleSpy }));
const selectSpy = vi.fn(() => ({ eq: eqSpy }));
const fromSpy = vi.fn(() => ({ select: selectSpy }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: fromSpy }),
}));

// --- Helpers --------------------------------------------------------------

let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  maybeSingleResult = { data: null, error: null };
  maybeSingleSpy.mockClear();
  eqSpy.mockClear();
  selectSpy.mockClear();
  fromSpy.mockClear();

  consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

// --- Tests ----------------------------------------------------------------

describe('getUserNotificationPreferences (.maybeSingle() behaviour)', () => {
  it('returns the merged prefs when the row exists with a valid JSON object', async () => {
    const stored: Partial<NotificationPreferences> = {
      email_messages: false,
      push_messages: false,
    };
    maybeSingleResult = {
      data: { notification_preferences: stored },
      error: null,
    };

    const { getUserNotificationPreferences } = await import(
      '@/lib/notifications/email'
    );
    const result = await getUserNotificationPreferences('user-1');

    expect(result.email_messages).toBe(false);
    expect(result.push_messages).toBe(false);
    // Fields not provided in the stored row should fall back to defaults.
    expect(result.email_announcements).toBe(
      DEFAULT_NOTIFICATION_PREFERENCES.email_announcements,
    );
    expect(result.email_pipeline_updates).toBe(
      DEFAULT_NOTIFICATION_PREFERENCES.email_pipeline_updates,
    );
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('returns DEFAULTS when the row exists but notification_preferences is null', async () => {
    maybeSingleResult = {
      data: { notification_preferences: null },
      error: null,
    };

    const { getUserNotificationPreferences } = await import(
      '@/lib/notifications/email'
    );
    const result = await getUserNotificationPreferences('user-2');

    expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('returns DEFAULTS without logging when the row is missing entirely (maybeSingle => { data: null, error: null })', async () => {
    // The whole reason for the .single() → .maybeSingle() swap: a stale
    // player_id from the cron sweep whose users row no longer exists must
    // NOT log a noisy error every iteration.
    maybeSingleResult = { data: null, error: null };

    const { getUserNotificationPreferences } = await import(
      '@/lib/notifications/email'
    );
    const result = await getUserNotificationPreferences('user-deleted');

    expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('returns DEFAULTS and logs the error when the database returns an error', async () => {
    maybeSingleResult = {
      data: null,
      error: { message: 'foo', code: 'PGRST301' },
    };

    const { getUserNotificationPreferences } = await import(
      '@/lib/notifications/email'
    );
    const result = await getUserNotificationPreferences('user-3');

    expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to fetch notification preferences:',
      'foo',
    );
  });
});
