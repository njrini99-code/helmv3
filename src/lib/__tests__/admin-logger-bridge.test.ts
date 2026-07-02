import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { logLogin } from '@/lib/admin-logger';

describe('admin-logger bridge columns', () => {
  beforeEach(() => { mocks.inserted.length = 0; });

  it('logLogin writes source=auth and passes sport through', async () => {
    await logLogin('user-1', 'a@b.c', { sport: 'golf' });
    expect(mocks.inserted[0]).toMatchObject({
      event_type: 'login',
      source: 'auth',
      sport: 'golf',
    });
  });
});
