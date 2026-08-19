import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * A golf staff invite is SINGLE USE.
 *
 * The token is a bearer credential: anyone the link reaches can present it.
 * That is an accepted trade for a 72h invite, but repeatability was not — an
 * `admin` invite writes head_coach on EVERY team in the organization, and
 * `is_golf_team_coach()` is existence-only (verified against production
 * 2026-08-18), so each redemption is full roster/PII/message access plus the
 * ability to remove players and rotate the join code. A forwarded admin link
 * was therefore an org-wide grant that could be spent repeatedly.
 *
 * The guard is the primary key on golf_staff_invite_redemptions: the claiming
 * INSERT happens BEFORE any staff row is written, so a replay loses on the
 * unique constraint rather than on a read-then-write race.
 *
 * These tests drive the real verifyStaffInvite/signStaffInvite — mocking the
 * token layer would leave the thing under test untested.
 */

const claimInsert = vi.fn();
const staffInsert = vi.fn();
const fromMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: fromMock }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn() }));
vi.mock('@/lib/supabase/untyped', () => ({ fromUntyped: vi.fn() }));

import { redeemStaffInvite } from '../teams';
import { signStaffInvite } from '@/lib/golf/staff-invite';

const TEAM = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

/** Minimal admin-client surface: the nonce claim, then the coach/staff reads. */
function wireAdmin(opts: { claimError: { code?: string; message: string } | null }) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'golf_staff_invite_redemptions') {
      return { insert: (row: unknown) => (claimInsert(row), Promise.resolve({ error: opts.claimError })) };
    }
    if (table === 'golf_coaches') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: 'coach-1', organization_id: ORG }, error: null }) }),
        }),
      };
    }
    if (table === 'golf_teams') {
      return { select: () => ({ eq: async () => ({ data: [{ id: TEAM, name: 'Seahawks', gender: 'mens' }], error: null }) }) };
    }
    if (table === 'golf_team_coach_staff') {
      return {
        select: () => ({ eq: async () => ({ data: [], error: null }) }),
        insert: (rows: unknown) => (staffInsert(rows), Promise.resolve({ error: null })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe('redeemStaffInvite — single use', () => {
  const original = process.env.COACHHELM_INTERNAL_SECRET;

  beforeEach(() => {
    claimInsert.mockReset();
    staffInsert.mockReset();
    fromMock.mockReset();
    process.env.COACHHELM_INTERNAL_SECRET = 'test-secret-for-staff-invites';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.COACHHELM_INTERNAL_SECRET;
    else process.env.COACHHELM_INTERNAL_SECRET = original;
  });

  it('claims the nonce BEFORE writing a staff row', async () => {
    wireAdmin({ claimError: null });
    const token = signStaffInvite(TEAM, ORG, 'coach')!;

    const result = await redeemStaffInvite(token, 'Jane Assistant');

    expect(result.success).toBe(true);
    expect(claimInsert).toHaveBeenCalledTimes(1);
    // Ordering is the guarantee: if the staff row were written first, a crash
    // between the two writes would grant access with no replay record.
    expect(claimInsert.mock.invocationCallOrder[0]!)
      .toBeLessThan(staffInsert.mock.invocationCallOrder[0]!);
    const claimed = claimInsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(claimed.team_id).toBe(TEAM);
    expect(claimed.role).toBe('coach');
    expect(typeof claimed.nonce).toBe('string');
  });

  it('REFUSES a replay and writes no staff row', async () => {
    // 23505 = unique_violation, i.e. this nonce is already spent.
    wireAdmin({ claimError: { code: '23505', message: 'duplicate key value' } });
    const token = signStaffInvite(TEAM, ORG, 'admin')!;

    const result = await redeemStaffInvite(token, 'Replayer');

    expect(result.success).toBe(false);
    expect(result.error).toContain('already been used');
    expect(staffInsert).not.toHaveBeenCalled();
  });

  it('fails CLOSED when the replay guard itself is unavailable', async () => {
    // Not a duplicate — the guard table could not be reached. Granting staff
    // here would defeat the entire point of having it.
    wireAdmin({ claimError: { code: '08006', message: 'connection failure' } });
    const token = signStaffInvite(TEAM, ORG, 'admin')!;

    const result = await redeemStaffInvite(token, 'Outage');

    expect(result.success).toBe(false);
    expect(staffInsert).not.toHaveBeenCalled();
  });

  it('still rejects a role-tampered token before touching the guard', async () => {
    wireAdmin({ claimError: null });
    const token = signStaffInvite(TEAM, ORG, 'coach')!;
    const [payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'));
    decoded.r = 'admin';
    const forged = `${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${sig}`;

    const result = await redeemStaffInvite(forged, 'Climber');

    expect(result.success).toBe(false);
    expect(claimInsert).not.toHaveBeenCalled();
    expect(staffInsert).not.toHaveBeenCalled();
  });
});
