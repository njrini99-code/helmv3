import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  insertError: null as { code?: string; message: string } | null,
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        mocks.inserted.push(row);
        return {
          select: () => ({
            single: async () =>
              mocks.insertError ? { data: null, error: mocks.insertError } : { data: { id: 'evt-1' }, error: null },
          }),
        };
      },
    }),
  }),
}));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.captureMessage }));

import {
  logLogin,
  logSignup,
  logRoundSubmitted,
  logSecurityEvent,
  logAIGeneration,
  __resetAdminLoggerAlertWindowForTests,
} from '@/lib/admin-logger';

describe('admin-logger bridge columns', () => {
  beforeEach(() => {
    mocks.inserted.length = 0;
    mocks.insertError = null;
    mocks.captureMessage.mockClear();
    __resetAdminLoggerAlertWindowForTests();
    // Writers are prod-gated by shouldPersistAdminTables(); the force-capture
    // hatch keeps these column-mapping tests exercising the real write path.
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('logRoundSubmitted tags the row golf / round_tracking — an untagged row counts against nothing', async () => {
    await logRoundSubmitted('user-1', 'a@b.c', 'round-1');
    expect(mocks.inserted[0]).toMatchObject({
      event_type: 'round_submitted',
      sport: 'golf',
      feature: 'round_tracking',
      source: 'server_action',
    });
  });

  it('logAIGeneration tags the row golf and maps the generation type to its registry feature', async () => {
    await logAIGeneration('user-1', 'a@b.c', 'round_review', true);
    expect(mocks.inserted[0]).toMatchObject({ sport: 'golf', feature: 'round_review_ai' });
    await logAIGeneration('user-1', 'a@b.c', 'something_new', false);
    expect(mocks.inserted[1]).toMatchObject({ sport: 'golf', feature: 'coachhelm_ai_engine', severity: 'warning' });
  });

  describe('a failed insert is reported, not swallowed', () => {
    it('emits the stably-grouped bridge_write_failed Sentry message (never console.error) and still returns null', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mocks.insertError = { code: '57014', message: 'canceling statement due to statement timeout' };

      await expect(logLogin('user-1', 'a@b.c')).resolves.toBeNull();

      expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
      const [name, opts] = mocks.captureMessage.mock.calls[0] as [string, { fingerprint: string[]; tags: Record<string, string> }];
      expect(name).toBe('bridge_write_failed');
      expect(opts.fingerprint).toEqual(['bridge_write_failed']);
      expect(opts.tags).toMatchObject({ table: 'admin_events', writer: 'admin-logger', event_type: 'login' });
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledTimes(1);
      consoleError.mockRestore();
      consoleWarn.mockRestore();
    });

    it('caps the alert at 5 per minute so an outage is one issue, not a fan-out', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mocks.insertError = { message: 'down' };
      for (let i = 0; i < 8; i++) await logLogin('user-1', 'a@b.c');
      expect(mocks.captureMessage).toHaveBeenCalledTimes(5);
      vi.restoreAllMocks();
    });

    it('a missing table (PGRST205) stays a one-time warning, not an alert', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mocks.insertError = { code: 'PGRST205', message: 'relation admin_events not found' };
      await logLogin('user-1', 'a@b.c');
      expect(mocks.captureMessage).not.toHaveBeenCalled();
      consoleWarn.mockRestore();
    });
  });

  it('logLogin writes source=auth and passes sport through', async () => {
    await logLogin('user-1', 'a@b.c', { sport: 'golf' });
    expect(mocks.inserted[0]).toMatchObject({
      event_type: 'login',
      source: 'auth',
      sport: 'golf',
    });
  });

  // Pure activity records — login, signup, round_submitted, security. Nothing
  // ever triages or resolves these (auto-resolve.ts and the triage UI both
  // filter event_type='error'), so they sat resolved=false forever with no
  // consumer that cared: 538 such rows cleaned by hand 2026-08-20. Born
  // resolved instead, at the single sink every one of these wrappers shares.
  describe('activity records are born resolved', () => {
    it('logLogin writes resolved=true', async () => {
      await logLogin('user-1', 'a@b.c');
      expect(mocks.inserted[0]).toMatchObject({ event_type: 'login', resolved: true });
      expect(typeof mocks.inserted[0]?.resolved_at).toBe('string');
    });

    it('logSignup writes resolved=true', async () => {
      await logSignup('user-1', 'a@b.c', 'coach');
      expect(mocks.inserted[0]).toMatchObject({ event_type: 'signup', resolved: true });
      expect(typeof mocks.inserted[0]?.resolved_at).toBe('string');
    });

    it('logRoundSubmitted writes resolved=true', async () => {
      await logRoundSubmitted('user-1', 'a@b.c', 'round-1');
      expect(mocks.inserted[0]).toMatchObject({ event_type: 'round_submitted', resolved: true });
      expect(typeof mocks.inserted[0]?.resolved_at).toBe('string');
    });

    it('logSecurityEvent writes resolved=true', async () => {
      await logSecurityEvent('Password reset requested', 'info');
      expect(mocks.inserted[0]).toMatchObject({ event_type: 'security', resolved: true });
      expect(typeof mocks.inserted[0]?.resolved_at).toBe('string');
    });

    // The control: an event type NOT in ACTIVITY_RECORD_EVENT_TYPES must keep
    // the column's own DEFAULT false untouched — proves the write is scoped
    // to the specific types, not accidentally applied to every insert.
    it('logAIGeneration (not an activity-record type) leaves resolved unset', async () => {
      await logAIGeneration('user-1', 'a@b.c', 'round_review', true);
      expect(mocks.inserted[0]).toMatchObject({ event_type: 'ai_generation' });
      expect(mocks.inserted[0]?.resolved).toBeUndefined();
      expect(mocks.inserted[0]?.resolved_at).toBeUndefined();
    });
  });
});
