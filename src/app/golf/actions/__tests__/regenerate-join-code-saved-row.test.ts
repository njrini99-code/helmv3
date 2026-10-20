import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * regenerateJoinCode must only return a code it actually stored.
 *
 * An UPDATE that RLS (or a wrong team id) filters to zero rows comes back with
 * no error, so the action used to hand the coach a new code that was never
 * saved: they shared it, and every player who typed it was refused.
 */

const updateResult: { data: Array<{ id: string }> | null; error: unknown } = { data: [], error: null };
const updates: Array<Record<string, unknown>> = [];

function chain(table: string) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    update: (values: Record<string, unknown>) => {
      updates.push(values);
      return {
        eq: () => ({ select: async () => updateResult }),
      };
    },
    maybeSingle: async () =>
      table === 'golf_coaches' ? { data: { id: 'coach-1', organization_id: 'org-1' }, error: null } : { data: null, error: null },
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => chain(table),
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  })),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1'),
}));
const { logServerError } = vi.hoisted(() => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(),
  logServerEvent: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { regenerateJoinCode } from '../teams';

describe('regenerateJoinCode — the new code must be saved', () => {
  beforeEach(() => {
    updates.length = 0;
    updateResult.error = null;
    vi.clearAllMocks();
  });

  it('returns the code when exactly one team row was updated', async () => {
    updateResult.data = [{ id: 'team-1' }];

    const result = await regenerateJoinCode('team-1');

    expect(result.success).toBe(true);
    expect(result.data?.joinCode).toBe(updates[0]?.join_code);
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('fails, and logs, when the update saved no row', async () => {
    updateResult.data = [];

    const result = await regenerateJoinCode('team-1');

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/Failed to regenerate join code/);
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('[regenerateJoinCode] update saved 0 rows'),
      expect.objectContaining({ action: 'teams.regenerateJoinCode' }),
    );
  });

  it('fails when the update errors', async () => {
    updateResult.data = null;
    updateResult.error = { message: 'boom' };

    const result = await regenerateJoinCode('team-1');

    expect(result.success).toBe(false);
  });
});
