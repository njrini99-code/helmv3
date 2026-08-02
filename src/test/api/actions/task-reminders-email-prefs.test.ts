/**
 * Tests for src/app/golf/actions/task-reminders.ts — the email
 * notification preference gate.
 *
 * CONFIRMED P1 (production-readiness mission, 2026-07-09): task reminder
 * emails were sent unconditionally via a raw Resend fetch, ignoring the
 * recipient's `email_task_reminders` notification preference that every
 * other task/reminder email path (src/lib/notifications/email.ts +
 * push.ts) already honors. These tests drive the real cron entry point
 * (`processReminders`) through a due 'email' reminder and lock in that a
 * recipient who has opted out never receives the Resend call, while an
 * opted-in recipient still does.
 *
 * `RESEND_API_KEY` / `FROM_EMAIL` are captured as module-level constants at
 * import time in task-reminders.ts, so each test stubs the env THEN
 * dynamically imports the module fresh (vi.resetModules) — the same
 * pattern used by src/test/lib/notifications/push.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/notifications/types';

const getUserNotificationPreferencesMock = vi.fn(async (_userId: string) => DEFAULT_NOTIFICATION_PREFERENCES);
vi.mock('@/lib/notifications/email', () => ({
  getUserNotificationPreferences: (userId: string) => getUserNotificationPreferencesMock(userId),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn().mockResolvedValue(undefined),
}));

// `processReminders` is a wire-callable 'use server' export, so it now
// authorizes its caller: either a real (service-role) client handed over
// in-process by the cron, or a platform super-admin. The super-admin probe is
// mocked so these tests never touch the real DB-backed gate.
type SuperAdminProbeStub =
  | { allowed: true; context: { userId: string; email: string } }
  | { allowed: false; reason: 'unauthenticated' | 'forbidden' };

const checkSuperAdminAccessMock = vi.fn(
  async (): Promise<SuperAdminProbeStub> => ({ allowed: false, reason: 'unauthenticated' }),
);
vi.mock('@/lib/admin/require-super-admin', () => ({
  checkSuperAdminAccess: () => checkSuperAdminAccessMock(),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBuilder = any;

const TASK_ID = 'task-1';
const REMINDER_ID = 'reminder-1';
const PLAYER_ID = 'player-1';
const USER_ID = 'user-1';
const RECIPIENT_EMAIL = 'player1@example.com';

function makeTask() {
  return {
    id: TASK_ID,
    title: 'Practice putting',
    description: 'Work the ladder drill',
    due_date: null,
    priority: 'normal',
    assigned_by: null, // no assigning coach → keeps the recipient set to just the player
    team_id: 'team-1',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeReminder() {
  return {
    id: REMINDER_ID,
    task_id: TASK_ID,
    scheduled_for: new Date().toISOString(),
    reminder_type: 'email',
    sent: false,
    task: makeTask(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

/** Builds a fake TaskReminderClient covering exactly the tables the
 * `processReminders` → `sendReminderNotification` → `sendEmailNotification`
 * → `markReminderSent` pipeline touches for ONE due 'email' reminder with
 * ONE assigned player and no assigning coach. */
function buildClient() {
  let dueRemindersCallDone = false;

  function makeDueRemindersBuilder(): AnyBuilder {
    const builder: AnyBuilder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => Promise.resolve({ data: [makeReminder()], error: null })),
    };
    return builder;
  }

  function makeUpdateReminderBuilder(): AnyBuilder {
    const builder: AnyBuilder = {
      update: vi.fn(() => builder),
      eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    return builder;
  }

  function makeSelectTaskIdBuilder(): AnyBuilder {
    const builder: AnyBuilder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: { task_id: TASK_ID }, error: null })),
    };
    return builder;
  }

  function makeAssignmentsBuilder(): AnyBuilder {
    const builder: AnyBuilder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => Promise.resolve({ data: [{ player_id: PLAYER_ID }], error: null })),
    };
    return builder;
  }

  function makePlayersBuilder(): AnyBuilder {
    const builder: AnyBuilder = {
      select: vi.fn(() => builder),
      in: vi.fn(() => Promise.resolve({ data: [{ user_id: USER_ID }], error: null })),
    };
    return builder;
  }

  function makeUsersBuilder(): AnyBuilder {
    const builder: AnyBuilder = {
      select: vi.fn(() => builder),
      in: vi.fn(() => Promise.resolve({ data: [{ id: USER_ID, email: RECIPIENT_EMAIL }], error: null })),
    };
    return builder;
  }

  function makeTasksUpdateBuilder(): AnyBuilder {
    const builder: AnyBuilder = {
      update: vi.fn(() => builder),
      eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    return builder;
  }

  // golf_task_reminders is used 3 ways per reminder processed: the initial
  // due-fetch (once, overall), then per-reminder an update + a select('task_id').
  let taskReminderCallsAfterFetch = 0;

  return {
    // `from` / `rpc` / `auth.getUser` must all be live functions: that shape is
    // what task-reminders.ts treats as proof of an in-process (cron)
    // service-role client, since functions can't cross the server-action wire.
    rpc: vi.fn(),
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    from: vi.fn((table: string): AnyBuilder => {
      if (table === 'golf_task_reminders') {
        if (!dueRemindersCallDone) {
          dueRemindersCallDone = true;
          return makeDueRemindersBuilder();
        }
        taskReminderCallsAfterFetch += 1;
        return taskReminderCallsAfterFetch % 2 === 1 ? makeUpdateReminderBuilder() : makeSelectTaskIdBuilder();
      }
      if (table === 'golf_task_assignments') return makeAssignmentsBuilder();
      if (table === 'golf_players') return makePlayersBuilder();
      if (table === 'users') return makeUsersBuilder();
      if (table === 'golf_tasks') return makeTasksUpdateBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('task-reminders.ts — email_task_reminders preference gate', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    getUserNotificationPreferencesMock.mockClear();
    checkSuperAdminAccessMock.mockClear();
    checkSuperAdminAccessMock.mockResolvedValue({ allowed: false, reason: 'unauthenticated' });
    getUserNotificationPreferencesMock.mockImplementation(async () => DEFAULT_NOTIFICATION_PREFERENCES);
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' } as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does NOT call Resend when the recipient has opted out of email_task_reminders', async () => {
    getUserNotificationPreferencesMock.mockResolvedValue({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      email_task_reminders: false,
    });

    const { processReminders } = await import('@/app/golf/actions/task-reminders');
    const results = await processReminders(buildClient());

    expect(getUserNotificationPreferencesMock).toHaveBeenCalledWith(USER_ID);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(results.sent).toBe(1); // the reminder is still marked processed (in-app path unaffected)
    expect(results.failed).toBe(0);
  });

  it('DOES call Resend when the recipient is opted in (default preference)', async () => {
    getUserNotificationPreferencesMock.mockResolvedValue(DEFAULT_NOTIFICATION_PREFERENCES);

    const { processReminders } = await import('@/app/golf/actions/task-reminders');
    const results = await processReminders(buildClient());

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(init.body as string) as { to: string };
    expect(body.to).toBe(RECIPIENT_EMAIL);
    expect(results.sent).toBe(1);
    expect(results.failed).toBe(0);
  });
});

describe('task-reminders.ts — processReminders authorization gate', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    checkSuperAdminAccessMock.mockClear();
    checkSuperAdminAccessMock.mockResolvedValue({ allowed: false, reason: 'forbidden' });
    getUserNotificationPreferencesMock.mockClear();
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '' } as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses a wire caller who passes no client and is not a super-admin', async () => {
    const { processReminders } = await import('@/app/golf/actions/task-reminders');
    const results = await processReminders();

    expect(checkSuperAdminAccessMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual({ sent: 0, failed: 0, errors: ['Unauthorized'] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses a forged client-shaped payload ({} used to slip past `!client`)', async () => {
    const { processReminders } = await import('@/app/golf/actions/task-reminders');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await processReminders({} as any);

    expect(checkSuperAdminAccessMock).toHaveBeenCalledTimes(1);
    expect(results).toEqual({ sent: 0, failed: 0, errors: ['Unauthorized'] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('lets the cron through on the strength of its service-role client alone', async () => {
    const { processReminders } = await import('@/app/golf/actions/task-reminders');
    const results = await processReminders(buildClient());

    // No super-admin probe: the live client is itself the proof of an
    // in-process caller, so the cron never needs a user session.
    expect(checkSuperAdminAccessMock).not.toHaveBeenCalled();
    expect(results.sent).toBe(1);
    expect(results.failed).toBe(0);
  });
});
