import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

import { saveCoachingPhilosophy } from '@/app/golf/actions/coaching-philosophy';

function buildSupabase(opts: {
  coach?: { id: string } | null;
  upsertError?: { message: string; code?: string } | null;
}) {
  const { coach = { id: 'coach-1' }, upsertError = null } = opts;
  const upsertSpy = vi.fn().mockResolvedValue({ error: upsertError });
  return {
    spies: { upsertSpy },
    client: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: (table: string) => {
        if (table === 'golf_coaches') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: coach, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'golf_coach_philosophy') {
          return { upsert: upsertSpy };
        }
        return {};
      },
    },
  };
}

describe('saveCoachingPhilosophy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when auth.getUser returns no user', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => ({}),
    });
    const result = await saveCoachingPhilosophy('coach-1', { decline_threshold: 1.5 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('rejects with Forbidden when coach_id does not belong to user', async () => {
    const { client } = buildSupabase({ coach: null });
    createClientMock.mockResolvedValue(client);
    const result = await saveCoachingPhilosophy('coach-foreign', { decline_threshold: 1.5 });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
  });

  it('upserts a sanitized patch and strips unknown columns', async () => {
    const { spies, client } = buildSupabase({});
    createClientMock.mockResolvedValue(client);

    const result = await saveCoachingPhilosophy('coach-1', {
      decline_threshold: 1.5,
      alert_streaks: true,
      // Unknown / malicious keys should be silently dropped.
      arbitrary_other_column: 'evil',
      coach_id: 'coach-attacker',
    });

    expect(result.success).toBe(true);
    expect(spies.upsertSpy).toHaveBeenCalledTimes(1);
    const payload = spies.upsertSpy.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload.coach_id).toBe('coach-1');
    expect(payload.decline_threshold).toBe(1.5);
    expect(payload.alert_streaks).toBe(true);
    expect(payload).not.toHaveProperty('arbitrary_other_column');
  });

  it('returns success:true without hitting the DB when patch is empty', async () => {
    const { spies, client } = buildSupabase({});
    createClientMock.mockResolvedValue(client);

    const result = await saveCoachingPhilosophy('coach-1', { unknown: 'nope' });
    expect(result.success).toBe(true);
    expect(spies.upsertSpy).not.toHaveBeenCalled();
  });

  it('propagates upsert error as success:false', async () => {
    const { client } = buildSupabase({ upsertError: { message: 'constraint violation' } });
    createClientMock.mockResolvedValue(client);

    const result = await saveCoachingPhilosophy('coach-1', { decline_threshold: 1.5 });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed to save/i);
  });
});
