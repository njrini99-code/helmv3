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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error: { message: string; code?: string } | null;
};

// `getUserNotificationPreferences` only ever reads `.from('users')`, and its
// existing tests below drive that single result directly.
let maybeSingleResult: MaybeSingleResult = { data: null, error: null };

// `getRecipientGreeting` reads up to four DIFFERENT tables in one call
// (golf_players, golf_coaches, baseball_players, baseball_coaches_public),
// each needing its own result. Calls are sequential and fully awaited before
// the next `.from(...)` starts, so tracking the most recent table name in a
// closure is race-free.
let tableResults: Record<string, MaybeSingleResult> = {};
let lastTable = '';
function resultForTable(table: string): MaybeSingleResult {
  if (table === 'users') return maybeSingleResult;
  return tableResults[table] ?? { data: null, error: null };
}

const maybeSingleSpy = vi.fn(async () => resultForTable(lastTable));
const eqSpy = vi.fn(() => ({ maybeSingle: maybeSingleSpy }));
const selectSpy = vi.fn(() => ({ eq: eqSpy }));
const fromSpy = vi.fn((table: string) => {
  lastTable = table;
  return { select: selectSpy };
});

// The service-role admin client — every real read in email.ts (both
// `getUserNotificationPreferences` and `getRecipientGreeting`) goes through
// this one.
const createAdminClientSpy = vi.fn(() => ({ from: fromSpy }));

// The cookie/session-scoped client. `email.ts` no longer imports
// `@/lib/supabase/server` at all (2026-08-27 fix — see `getRecipientGreeting`'s
// doc comment), and it must STAY that way: in the event-reminders /
// coachhelm-safety-net cron contexts this client silently authenticates as
// `anon`, which has no SELECT grant on `baseball_players` /
// `baseball_coaches_public` and returns a 42501 "permission denied" error
// PostgREST-side (not a thrown exception — supabase-js resolves errors,
// it doesn't throw them) for any baseball recipient. Throwing here turns any
// regression that reintroduces this import back into a loud, immediate test
// failure instead of a silent production greeting downgrade.
const createClientSpy = vi.fn(async () => {
  throw new Error(
    '@/lib/supabase/server createClient() must never be called from email.ts — ' +
      'it silently runs as anon in cron/background contexts and cannot read ' +
      'baseball_players / baseball_coaches_public (regression of the 2026-08-27 fix)',
  );
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientSpy,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: createAdminClientSpy,
}));

// --- Helpers --------------------------------------------------------------

let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  maybeSingleResult = { data: null, error: null };
  tableResults = {};
  lastTable = '';
  maybeSingleSpy.mockClear();
  eqSpy.mockClear();
  selectSpy.mockClear();
  fromSpy.mockClear();
  createAdminClientSpy.mockClear();
  createClientSpy.mockClear();

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

/**
 * Regression coverage for the 2026-08-27 fix: `getRecipientGreeting` used to
 * read through the cookie-based `createClient()`. That client silently runs
 * as `anon` in the `event-reminders` / `coachhelm-safety-net` cron contexts
 * (no session, but still inside a route-handler request scope so `cookies()`
 * doesn't throw). `golf_players`/`golf_coaches` grant `anon` SELECT, so the
 * first two lookups just returned zero rows there — but `baseball_players`
 * and the `baseball_coaches_public` view do NOT grant `anon`, so every
 * baseball recipient hit a hard Postgres 42501 "permission denied" response.
 * `sendEmailNotification`'s `try/catch` never saw it (supabase-js resolves
 * errors, it doesn't throw them, and the old code never checked `.error`),
 * so the failure silently degraded to the default greeting while Sentry's
 * own HTTP instrumentation kept recording the underlying 47-and-climbing
 * permission-denied responses independently of any application log.
 *
 * `getRecipientGreeting` is exported for tests via `__testables` — it is not
 * part of the module's public (production-caller-facing) API.
 */
describe('getRecipientGreeting (service-role client, not the cookie-scoped one)', () => {
  it('resolves a golf player greeting via the admin client', async () => {
    tableResults.golf_players = { data: { first_name: 'Nick' }, error: null };

    const { __testables } = await import('@/lib/notifications/email');
    const greeting = await __testables.getRecipientGreeting('user-golf-player');

    expect(greeting).toBe('Hi Nick,');
    expect(createAdminClientSpy).toHaveBeenCalled();
    expect(createClientSpy).not.toHaveBeenCalled();
  });

  it('resolves a golf coach greeting via the admin client', async () => {
    tableResults.golf_coaches = { data: { full_name: 'Jamie Rivera' }, error: null };

    const { __testables } = await import('@/lib/notifications/email');
    const greeting = await __testables.getRecipientGreeting('user-golf-coach');

    expect(greeting).toBe('Hi Coach Rivera,');
    expect(createClientSpy).not.toHaveBeenCalled();
  });

  it('resolves a baseball player greeting via the admin client (the exact table service_role holds SELECT on but anon does not)', async () => {
    tableResults.baseball_players = { data: { first_name: 'Jordan' }, error: null };

    const { __testables } = await import('@/lib/notifications/email');
    const greeting = await __testables.getRecipientGreeting('user-bb-player');

    expect(greeting).toBe('Hi Jordan,');
    // The admin client's `from` was actually asked for the baseball table —
    // proves the lookup reached step 3 rather than erroring out earlier.
    expect(fromSpy).toHaveBeenCalledWith('baseball_players');
    expect(createClientSpy).not.toHaveBeenCalled();
  });

  it('resolves a baseball coach greeting via baseball_coaches_public (never the base baseball_coaches table)', async () => {
    tableResults.baseball_coaches_public = {
      data: { full_name: 'Pat Alvarez' },
      error: null,
    };

    const { __testables } = await import('@/lib/notifications/email');
    const greeting = await __testables.getRecipientGreeting('user-bb-coach');

    expect(greeting).toBe('Hi Coach Alvarez,');
    expect(fromSpy).toHaveBeenCalledWith('baseball_coaches_public');
    expect(fromSpy).not.toHaveBeenCalledWith('baseball_coaches');
    expect(createClientSpy).not.toHaveBeenCalled();
  });

  it('falls back to the default greeting, without throwing, when a table read errors', async () => {
    // Simulates exactly the production failure this fix closes: a
    // permission-denied response instead of a row.
    tableResults.baseball_players = {
      data: null,
      error: { message: 'permission denied for table baseball_players', code: '42501' },
    };
    tableResults.baseball_coaches_public = {
      data: null,
      error: { message: 'permission denied for view baseball_coaches_public', code: '42501' },
    };

    const { __testables } = await import('@/lib/notifications/email');
    const greeting = await __testables.getRecipientGreeting('user-no-profile');

    expect(greeting).toBe('Hi there,');
    expect(createClientSpy).not.toHaveBeenCalled();
  });

  it('never falls back to the cookie-scoped server client, across every branch', async () => {
    // No table produces a row anywhere — walks all four lookups to the end.
    const { __testables } = await import('@/lib/notifications/email');
    const greeting = await __testables.getRecipientGreeting('user-nobody');

    expect(greeting).toBe('Hi there,');
    expect(fromSpy).toHaveBeenCalledWith('golf_players');
    expect(fromSpy).toHaveBeenCalledWith('golf_coaches');
    expect(fromSpy).toHaveBeenCalledWith('baseball_players');
    expect(fromSpy).toHaveBeenCalledWith('baseball_coaches_public');
    expect(createClientSpy).not.toHaveBeenCalled();
  });
});
