import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Recruiting sunset (src/lib/baseball/product-modules.ts)
//
// While the module is disabled, requireRecruiting*Route redirects EVERY caller
// regardless of coach_type / program_type / player_type — the module flag is
// the outermost gate. The pre-sunset behaviour (the type gates themselves) is
// preserved, not deleted: those assertions now run under a mock-enabled
// module so the restoration path stays covered.
// ---------------------------------------------------------------------------
const moduleFlags = vi.hoisted(() => ({ recruitingEnabled: false }));

vi.mock('@/lib/baseball/product-modules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/product-modules')>();
  return { ...actual, isRecruitingEnabled: () => moduleFlags.recruitingEnabled };
});

async function withRecruitingEnabled<T>(fn: () => Promise<T>): Promise<T> {
  moduleFlags.recruitingEnabled = true;
  try {
    return await fn();
  } finally {
    moduleFlags.recruitingEnabled = false;
  }
}

afterEach(() => {
  moduleFlags.recruitingEnabled = false;
});

const mocks = vi.hoisted(() => ({
  getSessionProfile: vi.fn(),
  getActiveBaseballContext: vi.fn(),
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: mocks.getSessionProfile,
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: mocks.getActiveBaseballContext,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

import {
  requireBaseballPlayerRoute,
  requireRecruitingCoachRoute,
  requireRecruitingPlayerRoute,
  requireShowcaseOrgRoute,
} from '../server-route-guards';

/** Builds a fake Supabase client whose `.from(table).select().eq().maybeSingle()`
 * chain resolves to `{ data, error: null }` regardless of the table queried —
 * enough surface for the program-type lookups under test. */
function fakeSupabaseClient(data: unknown) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  return { from: vi.fn().mockReturnValue(query) };
}

describe('requireBaseballPlayerRoute (#410)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated users to login', async () => {
    mocks.getSessionProfile.mockResolvedValue(null);
    await expect(requireBaseballPlayerRoute()).rejects.toThrow('REDIRECT:/baseball/login');
  });

  it('redirects coaches to stats center', async () => {
    mocks.getSessionProfile.mockResolvedValue({
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'college' },
      player: null,
    });
    await expect(requireBaseballPlayerRoute()).rejects.toThrow(
      'REDIRECT:/baseball/dashboard/stats-center',
    );
  });

  it('returns session for players', async () => {
    const session = {
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'high_school' },
    };
    mocks.getSessionProfile.mockResolvedValue(session);
    await expect(requireBaseballPlayerRoute()).resolves.toEqual(session);
  });
});

describe('requireRecruitingPlayerRoute (player recruiting-hub gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated users to login (delegates to requireBaseballPlayerRoute)', async () => {
    mocks.getSessionProfile.mockResolvedValue(null);
    await expect(requireRecruitingPlayerRoute()).rejects.toThrow('REDIRECT:/baseball/login');
  });

  it('redirects coaches away (delegates to requireBaseballPlayerRoute)', async () => {
    mocks.getSessionProfile.mockResolvedValue({
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'college' },
      player: null,
    });
    await expect(requireRecruitingPlayerRoute()).rejects.toThrow(
      'REDIRECT:/baseball/dashboard/stats-center',
    );
  });

  it('honors a custom redirectTo for the coach branch', async () => {
    mocks.getSessionProfile.mockResolvedValue({
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'college' },
      player: null,
    });
    await expect(
      requireRecruitingPlayerRoute({ redirectTo: '/baseball/dashboard/command-center' }),
    ).rejects.toThrow('REDIRECT:/baseball/dashboard/command-center');
  });

  it('redirects EVERY player away while the recruiting module is sunset, not just college players', async () => {
    for (const player_type of ['college', 'high_school', 'juco', 'showcase']) {
      mocks.getSessionProfile.mockResolvedValue({
        userId: 'u1',
        role: 'player',
        coach: null,
        player: { id: 'p1', player_type },
      });

      await expect(requireRecruitingPlayerRoute(), player_type).rejects.toThrow(
        'REDIRECT:/baseball/player/today',
      );
    }
  });

  it('flags isCollegePlayer=true for a college player, WITHOUT redirecting (caller renders the honest state) — restoration path', async () => {
    const session = {
      userId: 'u1',
      role: 'player',
      coach: null,
      player: { id: 'p1', player_type: 'college' },
    };
    mocks.getSessionProfile.mockResolvedValue(session);

    await withRecruitingEnabled(async () => {
      await expect(requireRecruitingPlayerRoute()).resolves.toEqual({
        session,
        isCollegePlayer: true,
      });
    });
  });

  it('flags isCollegePlayer=false for high_school/juco/showcase players — restoration path', async () => {
    await withRecruitingEnabled(async () => {
      for (const player_type of ['high_school', 'juco', 'showcase']) {
        const session = {
          userId: 'u1',
          role: 'player',
          coach: null,
          player: { id: 'p1', player_type },
        };
        mocks.getSessionProfile.mockResolvedValue(session);

        await expect(requireRecruitingPlayerRoute()).resolves.toEqual({
          session,
          isCollegePlayer: false,
        });
      }
    });
  });
});

describe('getActiveProgramType team_type fallback (Discover redirect-guard fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveBaseballContext.mockResolvedValue({ activeTeamId: 'team-1' });
  });

  it('requireRecruitingCoachRoute redirects a college coach while the module is sunset, even though the program-type gate would pass', async () => {
    const session = {
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'college' },
      player: null,
    };
    mocks.getSessionProfile.mockResolvedValue(session);
    mocks.createClient.mockResolvedValue(
      fakeSupabaseClient({ program_type: null, team_type: 'college' }),
    );

    await expect(requireRecruitingCoachRoute()).rejects.toThrow(
      'REDIRECT:/baseball/dashboard/command-center',
    );
  });

  it('requireRecruitingCoachRoute allows a college coach when program_type is unset but team_type is set (the exact "left unset" scenario documented in nav-context.ts) — restoration path', async () => {
    const session = {
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'college' },
      player: null,
    };
    mocks.getSessionProfile.mockResolvedValue(session);
    mocks.createClient.mockResolvedValue(
      fakeSupabaseClient({ program_type: null, team_type: 'college' }),
    );

    await withRecruitingEnabled(async () => {
      await expect(requireRecruitingCoachRoute()).resolves.toEqual(session);
    });
  });

  it('requireShowcaseOrgRoute falls back to team_type so a coach whose coach_type alone would NOT satisfy the gate is still let through via the resolved program type', async () => {
    // coach_type is 'juco' — not in requireShowcaseOrgRoute's allowedCoachTypes
    // (['showcase']) — so this ONLY passes if the program-type half of the OR
    // resolves via the team_type fallback (program_type left null, team_type
    // set to an allowed showcase-family value).
    const session = {
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'juco' },
      player: null,
    };
    mocks.getSessionProfile.mockResolvedValue(session);
    mocks.createClient.mockResolvedValue(
      fakeSupabaseClient({ program_type: null, team_type: 'academy' }),
    );

    await expect(requireShowcaseOrgRoute()).resolves.toEqual(session);
  });

  it('requireShowcaseOrgRoute still redirects when neither coach_type nor the (fallback-resolved) program_type is allowed', async () => {
    const session = {
      userId: 'u1',
      role: 'coach',
      coach: { id: 'c1', coach_type: 'juco' },
      player: null,
    };
    mocks.getSessionProfile.mockResolvedValue(session);
    mocks.createClient.mockResolvedValue(
      fakeSupabaseClient({ program_type: null, team_type: 'college' }),
    );

    await expect(requireShowcaseOrgRoute()).rejects.toThrow(
      'REDIRECT:/baseball/dashboard/command-center',
    );
  });
});
