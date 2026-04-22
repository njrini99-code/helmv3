import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// We'll toggle the verifyPlayerAccess helper per-test.
const verifyPlayerAccessMock = vi.fn();
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => verifyPlayerAccessMock(...args),
  verifyTeamAccess: vi.fn().mockResolvedValue({ allowed: true, reason: 'coach' }),
}));

const createClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => createClientMock(),
}));

import {
  validatePattern,
  dismissPattern,
  markPatternAddressed,
  resolvePattern,
  updatePatternNotes,
  createFocusAreaFromPattern,
} from '@/app/golf/actions/pattern-management';

function buildSupabase(opts: {
  pattern?: { player_id: string } | null;
  coach?: { id: string } | null;
  updateError?: { message: string; code?: string } | null;
  insertResult?: { data: { id: string } | null; error: { message: string } | null };
}) {
  const {
    pattern = { player_id: 'player-1' },
    coach = { id: 'coach-1' },
    updateError = null,
    insertResult = { data: { id: 'fa-1' }, error: null },
  } = opts;

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table: string) => {
      if (table === 'golf_patterns_v2') {
        return {
          select: (cols?: string) => {
            if (cols === 'player_id') {
              return {
                eq: () => ({
                  maybeSingle: async () => ({ data: pattern, error: null }),
                }),
              };
            }
            // full row select (used by createFocusAreaFromPatternInternal)
            return {
              eq: () => ({
                single: async () => ({
                  data: {
                    player_id: 'player-1',
                    pattern_type: 'putting_miss',
                    conditions: [{ field: 'putts' }],
                    stroke_impact: 1.5,
                    metadata: { description: 'Test desc', recommendation: 'Test rec' },
                  },
                  error: null,
                }),
              }),
            };
          },
          update: () => ({
            eq: async () => ({ error: updateError }),
          }),
        };
      }
      if (table === 'golf_coaches') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: coach, error: null }),
              maybeSingle: async () => ({ data: coach, error: null }),
            }),
          }),
        };
      }
      if (table === 'golf_player_focus_areas') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => insertResult,
            }),
          }),
        };
      }
      return {};
    },
  };
}

describe('pattern-management — ownership guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const { name, run } of [
    {
      name: 'validatePattern',
      run: () => validatePattern('pattern-1', { isAccurate: true, severity: 'high' }),
    },
    {
      name: 'dismissPattern',
      run: () => dismissPattern('pattern-1', 'nope'),
    },
    {
      name: 'markPatternAddressed',
      run: () => markPatternAddressed('pattern-1'),
    },
    {
      name: 'resolvePattern',
      run: () => resolvePattern('pattern-1'),
    },
    {
      name: 'updatePatternNotes',
      run: () => updatePatternNotes('pattern-1', 'notes'),
    },
    {
      name: 'createFocusAreaFromPattern',
      run: () => createFocusAreaFromPattern('pattern-1', 'player-1'),
    },
  ]) {
    it(`${name} rejects when coach does not own the pattern player`, async () => {
      verifyPlayerAccessMock.mockResolvedValue({ allowed: false, reason: 'denied' });
      createClientMock.mockResolvedValue(buildSupabase({}));
      const result = await run();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/forbidden/i);
    });

    it(`${name} allows when coach owns the pattern player`, async () => {
      verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'coach' });
      createClientMock.mockResolvedValue(buildSupabase({}));
      const result = await run();
      expect(result.success).toBe(true);
    });
  }
});
