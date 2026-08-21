import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        mocks.inserted.push(row);
        return {
          select: () => ({ single: async () => ({ data: { id: 'evt-1' }, error: null }) }),
        };
      },
    }),
  }),
}));

import { logLogin, logSignup, logRoundSubmitted, logSecurityEvent, logAIGeneration } from '@/lib/admin-logger';

describe('admin-logger bridge columns', () => {
  beforeEach(() => {
    mocks.inserted.length = 0;
    // Writers are prod-gated by shouldPersistAdminTables(); the force-capture
    // hatch keeps these column-mapping tests exercising the real write path.
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

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
