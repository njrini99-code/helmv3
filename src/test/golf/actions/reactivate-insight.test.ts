/**
 * Swap audit CH13-14 — Undo after Dismiss puts the insight back as it was.
 * Dismiss never clears `acknowledged_at`, so undoing a dismissal of an
 * acknowledged insight returns it to 'acknowledged' with its stamp; undoing
 * an acknowledgement (the default) still clears it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerException: vi.fn(),
  logServerEvent: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/verify-player-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/verify-player-access')>()),
  verifyInsightAccess: vi.fn().mockResolvedValue({ allowed: true, teamId: 't1' }),
}));

let sb: ReturnType<typeof createFakeSupabase>;
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sb }));

import { reactivateInsight } from '@/app/golf/actions/insights';

const STAMP = '2026-09-30T10:00:00.000Z';

function seed(acknowledged: boolean) {
  sb = createFakeSupabase({
    tables: {
      golf_coach_insights: [
        {
          id: 'i1',
          team_id: 't1',
          status: 'dismissed',
          dismissed: true,
          dismissed_at: STAMP,
          acknowledged_at: acknowledged ? STAMP : null,
          lifecycle_state: 'archived',
        },
      ],
    },
    user: { id: 'u1' },
  });
}

async function row() {
  const { data, error } = await sb.from('golf_coach_insights').select('*').eq('id', 'i1').maybeSingle();
  if (error) throw new Error(`read failed: ${String(error)}`);
  return data as Record<string, unknown>;
}

describe('reactivateInsight (CH13-14)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('undoing a dismissal keeps an earlier acknowledgement', async () => {
    seed(true);
    const r = await reactivateInsight('i1', 'addressed', 'dismiss');
    expect(r).toEqual({ success: true });
    expect(await row()).toMatchObject({
      status: 'acknowledged',
      acknowledged_at: STAMP,
      dismissed: false,
      dismissed_at: null,
      lifecycle_state: 'addressed',
    });
  });

  it('undoing a dismissal of an unacknowledged insight makes it active', async () => {
    seed(false);
    expect(await reactivateInsight('i1', 'detected', 'dismiss')).toEqual({ success: true });
    expect(await row()).toMatchObject({ status: 'active', acknowledged_at: null, dismissed: false });
  });

  it('the default (undo an acknowledgement) still clears the stamp', async () => {
    seed(true);
    expect(await reactivateInsight('i1', 'detected')).toEqual({ success: true });
    expect(await row()).toMatchObject({ status: 'active', acknowledged_at: null });
  });
});
